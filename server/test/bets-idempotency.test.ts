import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

import { newCrashRound, addBetCrash } from '../src/game_crash_dual.js';
import { newDuelRound, addBetDuel } from '../src/game_duel_ab.js';
import type { Bet, CrashRound, DuelRound, ServerMsg } from '../src/types.js';

const PORT = 19085;

type Predicate = (msg: ServerMsg) => boolean;

interface MessageWaiter {
  predicate: Predicate;
  resolve: (msg: ServerMsg) => void;
  timer: NodeJS.Timeout;
}

function createMessageQueue(ws: WebSocket) {
  const queue: ServerMsg[] = [];
  const waiters = new Set<MessageWaiter>();

  ws.on('message', (data) => {
    const msg: ServerMsg = JSON.parse(data.toString());
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

  function waitFor(predicate: Predicate, timeout = 5000): Promise<ServerMsg> {
    for (let i = 0; i < queue.length; i += 1) {
      const msg = queue[i];
      if (predicate(msg)) {
        queue.splice(i, 1);
        return Promise.resolve(msg);
      }
    }

    return new Promise<ServerMsg>((resolve, reject) => {
      const waiter: MessageWaiter = {
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

  function pull(predicate: Predicate): ServerMsg | undefined {
    for (let i = 0; i < queue.length; i += 1) {
      const msg = queue[i];
      if (predicate(msg)) {
        queue.splice(i, 1);
        return msg;
      }
    }
    return undefined;
  }

  return { waitFor, pull };
}

function crashBetCount(round: CrashRound | undefined, uid: string) {
  if (!round) return 0;
  return round.betsA.filter((bet) => bet.uid === uid).length + round.betsB.filter((bet) => bet.uid === uid).length;
}

function duelBetCount(round: DuelRound | undefined, uid: string) {
  if (!round) return 0;
  return round.bets.filter((bet) => bet.uid === uid).length;
}

test('game rounds keep seen bet ids per round', () => {
  const crash = newCrashRound();
  const betCrash: Bet = { id: 'bet-crash', uid: 'u1', amount: 10 };
  assert.equal(addBetCrash(crash, 'A', betCrash), true);
  assert.equal(addBetCrash(crash, 'A', { ...betCrash }), false);
  assert.equal(crash.betsA.length, 1);

  const nextCrash = newCrashRound();
  assert.equal(addBetCrash(nextCrash, 'B', { ...betCrash, side: 'B' }), true);

  const duel = newDuelRound();
  const duelBet: Bet = { id: 'bet-duel', uid: 'u2', amount: 15, side: 'A' };
  assert.equal(addBetDuel(duel, 'A', duelBet), true);
  assert.equal(addBetDuel(duel, 'A', { ...duelBet }), false);
  assert.equal(duel.bets.length, 1);

  const nextDuel = newDuelRound();
  assert.equal(addBetDuel(nextDuel, 'A', { ...duelBet }), true);
});

test('server rejects duplicate bet ids and preserves balances', async (t) => {
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

  try {
    ws.send(JSON.stringify({ t: 'auth' }));
    const hello = await messages.waitFor((msg) => msg.t === 'hello');
    assert.ok(typeof hello.uid === 'string' && hello.uid.length > 0);
    let expectedBalance = hello.wallet.balance;
    const drainWalletQueue = () => {
      let pending: ServerMsg | undefined;
      while ((pending = messages.pull((msg) => msg.t === 'wallet'))) {
        expectedBalance = pending.wallet.balance;
      }
    };

    const crashBetId = randomUUID();
    const crashBetAmount = 50;
    ws.send(JSON.stringify({ t: 'bet', amount: crashBetAmount, side: 'A', betId: crashBetId }));
    const firstWallet = await messages.waitFor((msg) => msg.t === 'wallet');
    expectedBalance -= crashBetAmount;
    assert.equal(firstWallet.wallet.balance, expectedBalance);
    expectedBalance = firstWallet.wallet.balance;

    await messages.waitFor((msg) => msg.t === 'snapshot' && crashBetCount(msg.snapshot.crash, hello.uid) === 1);

    ws.send(JSON.stringify({ t: 'bet', amount: crashBetAmount, side: 'A', betId: crashBetId }));
    const duplicateError = await messages.waitFor((msg) => msg.t === 'error' && msg.message === 'duplicate_bet');
    assert.equal(duplicateError.message, 'duplicate_bet');

    await assert.rejects(
      messages.waitFor((msg) => msg.t === 'wallet', 500),
      /Timed out/
    );

    await messages.waitFor((msg) => msg.t === 'snapshot' && crashBetCount(msg.snapshot.crash, hello.uid) === 1);

    ws.send(JSON.stringify({ t: 'switch_mode', mode: 'duel_ab' }));
    const initialDuelSnapshot = await messages.waitFor(
      (msg) => msg.t === 'snapshot' && msg.snapshot.mode === 'duel_ab' && msg.snapshot.duel?.phase === 'betting'
    );
    const duelRoundId = initialDuelSnapshot.snapshot.duel?.id;
    assert.ok(duelRoundId);
    drainWalletQueue();

    const duelBetId = randomUUID();
    const duelBetAmount = 75;
    ws.send(JSON.stringify({ t: 'bet', amount: duelBetAmount, side: 'A', betId: duelBetId }));
    const duelWallet = await messages.waitFor((msg) => msg.t === 'wallet');
    expectedBalance -= duelBetAmount;
    assert.equal(duelWallet.wallet.balance, expectedBalance);
    expectedBalance = duelWallet.wallet.balance;

    await messages.waitFor((msg) =>
      msg.t === 'snapshot' && msg.snapshot.mode === 'duel_ab' && duelBetCount(msg.snapshot.duel, hello.uid) === 1
    );

    ws.send(JSON.stringify({ t: 'bet', amount: duelBetAmount, side: 'A', betId: duelBetId }));
    const duelDuplicate = await messages.waitFor((msg) => msg.t === 'error' && msg.message === 'duplicate_bet');
    assert.equal(duelDuplicate.message, 'duplicate_bet');

    await assert.rejects(
      messages.waitFor((msg) => msg.t === 'wallet', 500),
      /Timed out/
    );

    await messages.waitFor((msg) =>
      msg.t === 'snapshot' && msg.snapshot.mode === 'duel_ab' && duelBetCount(msg.snapshot.duel, hello.uid) === 1
    );

    const nextBettableSnapshot = await messages.waitFor(
      (msg) =>
        msg.t === 'snapshot' &&
        msg.snapshot.mode === 'duel_ab' &&
        msg.snapshot.duel?.phase === 'betting' &&
        msg.snapshot.duel.id !== duelRoundId,
      20000
    );
    drainWalletQueue();

    ws.send(JSON.stringify({ t: 'bet', amount: duelBetAmount, side: 'A', betId: duelBetId }));
    const reusedWallet = await messages.waitFor((msg) => msg.t === 'wallet');
    expectedBalance -= duelBetAmount;
    assert.equal(reusedWallet.wallet.balance, expectedBalance);
    expectedBalance = reusedWallet.wallet.balance;

    await messages.waitFor((msg) =>
      msg.t === 'snapshot' &&
      msg.snapshot.mode === 'duel_ab' &&
      duelBetCount(msg.snapshot.duel, hello.uid) === 1 &&
      msg.snapshot.duel?.id === nextBettableSnapshot.snapshot.duel?.id
    );
  } catch (error) {
    console.error('duplicate bet test failure', error);
    throw error;
  }
});
