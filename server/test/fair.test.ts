import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

import { sha256, hmacHex, roundCrash, roundDuel } from '../src/fair.js';
import type { ServerMsg } from '../src/types.js';

const PORT = 19121;

interface MessageQueue {
  waitFor<T extends ServerMsg>(predicate: (msg: ServerMsg) => msg is T, timeout?: number): Promise<T>;
  pull<T extends ServerMsg>(predicate: (msg: ServerMsg) => msg is T): T | undefined;
}

function createQueue(ws: WebSocket): MessageQueue {
  const queue: ServerMsg[] = [];
  const waiters = new Set<{
    predicate: (msg: ServerMsg) => boolean;
    resolve: (msg: ServerMsg) => void;
    timer: NodeJS.Timeout;
  }>();

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

  function waitFor<T extends ServerMsg>(predicate: (msg: ServerMsg) => msg is T, timeout = 10000): Promise<T> {
    for (let i = 0; i < queue.length; i += 1) {
      const msg = queue[i];
      if (predicate(msg)) {
        queue.splice(i, 1);
        return Promise.resolve(msg);
      }
    }

    return new Promise<T>((resolve, reject) => {
      const waiter = {
        predicate: (msg: ServerMsg) => {
          if (predicate(msg)) {
            resolve(msg as T);
            return true;
          }
          return false;
        },
        resolve: (msg: ServerMsg) => resolve(msg as T),
        timer: setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error('Timed out waiting for message'));
        }, timeout)
      };
      waiters.add(waiter);
    });
  }

  function pull<T extends ServerMsg>(predicate: (msg: ServerMsg) => msg is T): T | undefined {
    for (let i = 0; i < queue.length; i += 1) {
      const msg = queue[i];
      if (predicate(msg)) {
        queue.splice(i, 1);
        return msg as T;
      }
    }
    return undefined;
  }

  return { waitFor, pull };
}

test('fair helpers are deterministic', () => {
  const hash = sha256('hello-world');
  assert.equal(hash, sha256('hello-world'));
  const hmac = hmacHex('server', 'client:0');
  assert.equal(hmac, hmacHex('server', 'client:0'));

  const crashOne = roundCrash({ serverSeed: 'seed-1', clientSeed: 'client', nonce: 42 });
  const crashTwo = roundCrash({ serverSeed: 'seed-1', clientSeed: 'client', nonce: 42 });
  assert.deepEqual(crashOne, crashTwo);
  assert.ok(crashOne.targetA >= 1.2);
  assert.ok(crashOne.targetB >= 1.1);

  const duelOne = roundDuel({ serverSeed: 'seed-1', clientSeed: 'client', nonce: 7 });
  const duelTwo = roundDuel({ serverSeed: 'seed-1', clientSeed: 'client', nonce: 7 });
  assert.deepEqual(duelOne, duelTwo);
  assert.ok(duelOne.roll >= 0 && duelOne.roll < 1);
});

test('fair websocket api reveals seeds after round resolution', async (t) => {
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
  const queue = createQueue(ws);

  ws.send(JSON.stringify({ t: 'auth' }));
  const hello = await queue.waitFor((msg): msg is Extract<ServerMsg, { t: 'hello' }> => msg.t === 'hello');
  const crashFair = hello.snapshot.crash?.fair;
  assert.ok(crashFair);

  ws.send(JSON.stringify({ t: 'fair', mode: 'crash_dual', nonce: crashFair.nonce }));
  const initialFair = await queue.waitFor(
    (msg): msg is Extract<ServerMsg, { t: 'fair'; mode: 'crash_dual' }>
      => msg.t === 'fair' && msg.mode === 'crash_dual'
  );
  assert.equal(initialFair.serverSeedHash, crashFair.serverSeedHash);
  assert.equal(initialFair.roundId, hello.snapshot.crash?.id);
  assert.equal(initialFair.serverSeed, undefined);
  assert.equal(initialFair.crash, undefined);

  ws.send(JSON.stringify({ t: 'switch_mode', mode: 'duel_ab' }));
  const initialDuel = await queue.waitFor(
    (msg): msg is Extract<ServerMsg, { t: 'snapshot' }>
      => msg.t === 'snapshot' && msg.snapshot.mode === 'duel_ab'
  );
  let resolvedFair: Extract<ServerMsg, { t: 'fair'; mode: 'duel_ab' }> | undefined;
  let duelRoundId = initialDuel.snapshot.duel?.id;
  const deadline = Date.now() + 25000;
  while (!resolvedFair && Date.now() < deadline) {
    const snapshot = queue.pull(
      (msg): msg is Extract<ServerMsg, { t: 'snapshot' }>
        => msg.t === 'snapshot' && msg.snapshot.mode === 'duel_ab'
    ) ?? await queue.waitFor(
      (msg): msg is Extract<ServerMsg, { t: 'snapshot' }>
        => msg.t === 'snapshot' && msg.snapshot.mode === 'duel_ab'
    );
    duelRoundId = snapshot.snapshot.duel?.id ?? duelRoundId;
    if (snapshot.snapshot.duel?.fair.serverSeed && snapshot.snapshot.duel.phase === 'resolve') {
      ws.send(JSON.stringify({ t: 'fair', mode: 'duel_ab', nonce: snapshot.snapshot.duel.fair.nonce }));
      resolvedFair = await queue.waitFor(
        (msg): msg is Extract<ServerMsg, { t: 'fair'; mode: 'duel_ab' }>
          => msg.t === 'fair' && msg.mode === 'duel_ab' && msg.serverSeed
      );
      break;
    }
    await delay(100);
  }

  assert.ok(resolvedFair, 'expected resolved fair message');
  assert.ok(resolvedFair!.serverSeed);
  assert.equal(resolvedFair!.roundId, duelRoundId);
  const duelInfo = resolvedFair!.duel;
  assert.ok(duelInfo && typeof duelInfo.winner === 'string');

  const recomputed = roundDuel({
    serverSeed: resolvedFair!.serverSeed!,
    clientSeed: resolvedFair!.clientSeed,
    nonce: resolvedFair!.nonce
  });
  assert.ok(Math.abs(recomputed.roll - (duelInfo.roll ?? 0)) < 1e-12);
  assert.equal(sha256(resolvedFair!.serverSeed!), resolvedFair!.serverSeedHash);
  if (duelInfo.pA !== undefined) {
    if (duelInfo.winner === 'A') {
      assert.ok((duelInfo.roll ?? 0) < duelInfo.pA);
    } else {
      assert.ok((duelInfo.roll ?? 0) >= (duelInfo.pA ?? 0));
    }
  }
});
