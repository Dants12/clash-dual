import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

import { newCrashRound, addBetCrash } from '../src/game_crash_dual.js';
import { newDuelRound, addBetDuel } from '../src/game_duel_ab.js';
import type { Bet, CrashFairInfo, DuelFairInfo, ServerMsg } from '../src/types.js';

const PORT = 19105;

type Predicate<T> = (value: T) => boolean;
type Guard<T extends ServerMsg> = (value: ServerMsg) => value is T;

type Waiter = {
  predicate: Predicate<ServerMsg>;
  resolve: (value: ServerMsg) => void;
  timer: NodeJS.Timeout;
};

type HelloMsg = Extract<ServerMsg, { t: 'hello' }>;
type SnapshotMsg = Extract<ServerMsg, { t: 'snapshot' }>;
type ErrorMsg = Extract<ServerMsg, { t: 'error' }>;

type CrashSnapshot = NonNullable<SnapshotMsg['snapshot']['crash']>;

type Queue = {
  waitFor<T extends ServerMsg>(predicate: Guard<T>, timeout?: number): Promise<T>;
  waitFor(predicate: Predicate<ServerMsg>, timeout?: number): Promise<ServerMsg>;
};

function makeFair(nonce: number): CrashFairInfo {
  return { clientSeed: 'test-client', serverSeedHash: `hash-${nonce}`, nonce };
}

function makeDuelFair(nonce: number): DuelFairInfo {
  return { clientSeed: 'test-client', serverSeedHash: `hash-${nonce}`, nonce };
}

function createMessageQueue(ws: WebSocket): Queue {
  const queue: ServerMsg[] = [];
  const waiters = new Set<Waiter>();

  ws.on('message', (raw) => {
    const msg: ServerMsg = JSON.parse(raw.toString());
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

  function waitFor(predicate: Predicate<ServerMsg>, timeout = 5000): Promise<ServerMsg> {
    for (let i = 0; i < queue.length; i += 1) {
      const msg = queue[i];
      if (predicate(msg)) {
        queue.splice(i, 1);
        return Promise.resolve(msg);
      }
    }

    return new Promise<ServerMsg>((resolve, reject) => {
      const waiter: Waiter = {
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

  return { waitFor } as Queue;
}

test('crash and duel rounds record seen bet ids', () => {
  const crashRound = newCrashRound({ targetA: 1.5, targetB: 1.7, fair: makeFair(1) });
  const bet: Bet = { id: 'crash-1', uid: 'player-1', amount: 50n };
  assert.equal(addBetCrash(crashRound, 'A', bet), true);
  assert.equal(addBetCrash(crashRound, 'A', { ...bet }), false);

  const duelRound = newDuelRound({ fair: makeDuelFair(2), runtimeExtraMs: 0, roll: 0.4 });
  const duelBet: Bet = { id: 'duel-1', uid: 'player-2', amount: 75n, side: 'A' };
  assert.equal(addBetDuel(duelRound, 'A', duelBet), true);
  assert.equal(addBetDuel(duelRound, 'A', { ...duelBet }), false);
});

test('server rejects duplicate bet ids from the same player', async (t) => {
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
  t.after(() => ws.close());
  await once(ws, 'open');
  const queue = createMessageQueue(ws);

  ws.send(JSON.stringify({ t: 'auth' }));
  const hello = await queue.waitFor((msg): msg is HelloMsg => msg.t === 'hello');
  assert.ok(typeof hello.uid === 'string' && hello.uid.length > 0);

  const betId = randomUUID();
  const betAmount = 50;
  ws.send(JSON.stringify({ t: 'bet', amount: betAmount, side: 'A', betId }));
  await queue.waitFor((msg) => msg.t === 'wallet');
  await queue.waitFor(
    (msg): msg is SnapshotMsg =>
      msg.t === 'snapshot' &&
      msg.snapshot.mode === 'crash_dual' &&
      Boolean((msg.snapshot.crash as CrashSnapshot | undefined)?.betsA.some((b) => b.uid === hello.uid))
  );

  ws.send(JSON.stringify({ t: 'bet', amount: betAmount, side: 'A', betId }));
  const duplicate = await queue.waitFor((msg): msg is ErrorMsg => msg.t === 'error' && msg.message === 'duplicate_bet');
  assert.equal(duplicate.message, 'duplicate_bet');

  await assert.rejects(
    queue.waitFor((msg) => msg.t === 'wallet', 500),
    /Timed out/
  );
});
