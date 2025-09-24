import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';

const PORT = 19083;

function createMessageQueue(ws) {
  const queue = [];
  const waiters = new Set();

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    for (const waiter of waiters) {
      if (waiter.predicate(msg)) {
        waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
        return;
      }
    }
    queue.push(msg);
  });

  async function waitFor(predicate, timeout = 5000) {
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i];
      if (predicate(msg)) {
        queue.splice(i, 1);
        return msg;
      }
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error('Timed out waiting for message'));
        }, timeout)
      };
      waiters.add(waiter);
    });
  }

  return { waitFor };
}

test('rejects duel bets without a side without charging the wallet', async (t) => {
  const server = spawn('node', ['dist/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    server.kill('SIGTERM');
    await once(server, 'exit');
  });

  await once(server.stdout, 'data');

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  t.after(() => {
    ws.close();
  });

  await once(ws, 'open');
  const messages = createMessageQueue(ws);

  ws.send(JSON.stringify({ t: 'auth' }));
  const hello = await messages.waitFor((msg) => msg.t === 'hello');
  assert.equal(hello.wallet.balance, 1000);

  ws.send(JSON.stringify({ t: 'switch_mode', mode: 'duel_ab' }));
  await messages.waitFor((msg) => msg.t === 'snapshot' && msg.snapshot.mode === 'duel_ab');

  ws.send(JSON.stringify({ t: 'bet', amount: 100, betId: 'bet-duel-1' }));
  await assert.rejects(
    messages.waitFor((msg) => msg.t === 'wallet', 1000),
    /Timed out/
  );

  ws.send(JSON.stringify({ t: 'bet', amount: 100, side: 'A', betId: 'bet-duel-2' }));
  const walletUpdate = await messages.waitFor((msg) => msg.t === 'wallet');
  assert.equal(walletUpdate.wallet.balance, hello.wallet.balance - 100);

  const betSnapshot = await messages.waitFor((msg) => {
    if (msg.t !== 'snapshot' || msg.snapshot.mode !== 'duel_ab') return false;
    const duel = msg.snapshot.duel;
    return duel?.bets?.some((b) => b.uid === hello.uid && b.amount === 100 && b.side === 'A');
  }, 8000);
  assert.ok(betSnapshot, 'bet should appear once a side is provided');
});
