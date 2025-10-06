import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';

const PORT = 19084;

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

  async function waitFor(predicate, timeout = 12000) {
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

test('duel bankroll change equals stakes minus payouts', async (t) => {
  const server = spawn('node', ['dist/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => {
    server.kill('SIGTERM');
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
  assert.ok(typeof hello.uid === 'string' && hello.uid.length > 0, 'should receive uid');

  const initialBankroll = hello.snapshot?.bankroll;
  assert.equal(typeof initialBankroll, 'number', 'should receive initial bankroll');

  ws.send(JSON.stringify({ t: 'switch_mode', mode: 'duel_ab' }));
  await messages.waitFor((msg) => msg.t === 'snapshot' && msg.snapshot.mode === 'duel_ab');

  const betA = 120;
  ws.send(JSON.stringify({ t: 'bet', amount: betA, side: 'A' }));
  await messages.waitFor((msg) => msg.t === 'wallet' && msg.wallet.balance === hello.wallet.balance - betA);

  const betB = 80;
  ws.send(JSON.stringify({ t: 'bet', amount: betB, side: 'B' }));
  await messages.waitFor((msg) => msg.t === 'wallet' && msg.wallet.balance === hello.wallet.balance - betA - betB);

  const resolveSnapshot = await messages.waitFor((msg) => {
    if (msg.t !== 'snapshot') return false;
    const duel = msg.snapshot?.duel;
    if (!duel) return false;
    return duel.phase === 'resolve' && typeof duel.winner === 'string' && duel.bets?.length >= 2;
  }, 36000);

  const duelState = resolveSnapshot.snapshot.duel;
  const stakes = duelState.bets.reduce((sum, bet) => sum + bet.amount, 0);
  const winners = duelState.bets.filter((bet) => bet.side === duelState.winner);
  const winPool = stakes * 0.98;
  const totalWinnerStakes = winners.reduce((sum, bet) => sum + bet.amount, 0);
  let totalPayout = 0;
  if (totalWinnerStakes > 0) {
    for (const bet of winners) {
      totalPayout += (bet.amount / totalWinnerStakes) * winPool;
    }
  }

  const finalSnapshot = await messages.waitFor((msg) => {
    if (msg.t !== 'snapshot') return false;
    const duel = msg.snapshot?.duel;
    return duel?.phase === 'betting' && duel?.id !== duelState.id;
  }, 36000);

  const finalBankroll = finalSnapshot.snapshot?.bankroll;
  const expectedBankroll = initialBankroll + stakes - totalPayout;

  assert.ok(Math.abs(finalBankroll - expectedBankroll) < 1e-6, `expected bankroll ${expectedBankroll}, got ${finalBankroll}`);
});
