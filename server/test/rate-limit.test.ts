import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

import type { ServerMsg } from '../src/types.js';

const PORT = 19090;

type WsMessage = ServerMsg | { t: 'pong' };

type Predicate = (msg: WsMessage) => boolean;

interface MessageWaiter {
  predicate: Predicate;
  resolve: (msg: WsMessage) => void;
  timer: NodeJS.Timeout;
}

function createMessageQueue(ws: WebSocket) {
  const queue: WsMessage[] = [];
  const waiters = new Set<MessageWaiter>();

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString()) as WsMessage;
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

  function waitFor(predicate: Predicate, timeout = 5000): Promise<WsMessage> {
    for (let i = 0; i < queue.length; i += 1) {
      const msg = queue[i];
      if (predicate(msg)) {
        queue.splice(i, 1);
        return Promise.resolve(msg);
      }
    }

    return new Promise<WsMessage>((resolve, reject) => {
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

  return { waitFor };
}

test('enforces per-user rate limits and resets tokens after interval', async (t) => {
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
  await messages.waitFor((msg) => msg.t === 'hello');

  const pingMessage = JSON.stringify({ t: 'ping' });

  for (let i = 0; i < 20; i += 1) {
    ws.send(pingMessage);
    const response = await messages.waitFor((msg) => msg.t === 'pong');
    assert.equal(response.t, 'pong');
  }

  ws.send(pingMessage);
  const rateLimit = await messages.waitFor((msg) => msg.t === 'error' && msg.message === 'rate_limit');
  assert.equal(rateLimit.t, 'error');
  assert.equal(rateLimit.message, 'rate_limit');

  await assert.rejects(
    messages.waitFor((msg) => msg.t === 'pong', 200),
    /Timed out/
  );

  await delay(11000);

  ws.send(pingMessage);
  const pongAfterReset = await messages.waitFor((msg) => msg.t === 'pong');
  assert.equal(pongAfterReset.t, 'pong');
});
