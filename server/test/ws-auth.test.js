import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';

const PORT = 19081;

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

function getCrashBet(snapshot, uid) {
  const crash = snapshot?.crash;
  if (!crash) return undefined;
  for (const list of [crash.betsA ?? [], crash.betsB ?? []]) {
    const bet = list.find((b) => b.uid === uid);
    if (bet) return bet;
  }
  return undefined;
}

test('allows betting and cashing out on the same authenticated socket', async (t) => {
  const server = spawn('node', ['dist/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    server.kill('SIGTERM');
    await once(server, 'exit');
  });

  await once(server.stdout, 'data');

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  t.after(() => {
    ws.close();
  });

  await once(ws, 'open');
  const messages = createMessageQueue(ws);

  ws.send(JSON.stringify({ t: 'auth' }));
  const hello = await messages.waitFor((msg) => msg.t === 'hello');
  assert.ok(typeof hello.uid === 'string' && hello.uid.length > 0);

  ws.send(JSON.stringify({ t: 'bet', amount: 50, side: 'A', betId: 'bet-auth-1' }));
  const betSnapshot = await messages.waitFor((msg) => {
    if (msg.t !== 'snapshot') return false;
    const bet = getCrashBet(msg.snapshot, hello.uid);
    return !!bet;
  }, 8000);
  const placedBet = getCrashBet(betSnapshot.snapshot, hello.uid);
  assert.ok(placedBet, 'bet should be present in crash snapshot');
  assert.equal(placedBet.amount, 50);

  await messages.waitFor((msg) => msg.t === 'snapshot' && msg.snapshot.crash?.phase === 'running', 12000);

  ws.send(JSON.stringify({ t: 'cashout' }));
  const cashedSnapshot = await messages.waitFor((msg) => {
    if (msg.t !== 'snapshot') return false;
    const bet = getCrashBet(msg.snapshot, hello.uid);
    return !!bet && bet.cashedOut === true;
  }, 12000);
  const cashedBet = getCrashBet(cashedSnapshot.snapshot, hello.uid);
  assert.ok(cashedBet?.cashedOut, 'bet should be marked cashed out');
  assert.ok(typeof cashedBet.cashoutAt === 'number' && cashedBet.cashoutAt >= 1);
});
