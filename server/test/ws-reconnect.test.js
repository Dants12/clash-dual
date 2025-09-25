import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';

const PORT = 19082;

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

async function waitForCondition(check, { timeout = 2000, interval = 25 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('Condition not met within timeout');
}

test('cleans up sockets after disconnects and keeps streaming snapshots', async (t) => {
  process.env.PORT = String(PORT);
  const server = await import('../dist/server.js');
  assert.equal(typeof server.getSocketCount, 'function');
  assert.equal(typeof server.shutdown, 'function');

  t.after(async () => {
    delete process.env.PORT;
    await server.shutdown();
  });

  for (let i = 0; i < 10; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await once(ws, 'open');
    const messages = createMessageQueue(ws);

    ws.send(JSON.stringify({ t: 'auth' }));
    const hello = await messages.waitFor((msg) => msg.t === 'hello');
    assert.ok(hello.uid, 'expected hello message with uid');
    await messages.waitFor((msg) => msg.t === 'snapshot');

    ws.close();
    await once(ws, 'close');
    await waitForCondition(() => server.getSocketCount() === 0, {
      timeout: 2000,
      interval: 50
    });
  }

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await once(ws, 'open');
  const messages = createMessageQueue(ws);
  ws.send(JSON.stringify({ t: 'auth' }));
  await messages.waitFor((msg) => msg.t === 'hello');
  const snapshot = await messages.waitFor((msg) => msg.t === 'snapshot');
  assert.equal(snapshot.t, 'snapshot');
  ws.close();
  await once(ws, 'close');
  await waitForCondition(() => server.getSocketCount() === 0, {
    timeout: 2000,
    interval: 50
  });
});
