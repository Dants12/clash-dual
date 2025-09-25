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

test('rejects invalid payloads with an error and logs origin', async (t) => {
  const server = spawn('node', ['dist/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    server.kill('SIGTERM');
    await once(server, 'exit');
  });

  await once(server.stdout, 'data');

  let stderrOutput = '';
  server.stderr.on('data', (chunk) => {
    stderrOutput += chunk.toString();
  });

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  t.after(() => {
    ws.close();
  });

  await once(ws, 'open');
  const messages = createMessageQueue(ws);

  ws.send(JSON.stringify({ t: 'bet', amount: '100' }));
  const invalidBet = await messages.waitFor((msg) => msg.t === 'error' && msg.message === 'invalid_payload');
  assert.equal(invalidBet.message, 'invalid_payload');

  ws.send(JSON.stringify({ t: 'auth' }));
  const hello = await messages.waitFor((msg) => msg.t === 'hello');
  assert.ok(typeof hello.uid === 'string' && hello.uid.length > 0);

  ws.send(JSON.stringify({ t: 'topup', amount: 'oops' }));
  const invalidTopup = await messages.waitFor((msg) => msg.t === 'error' && msg.message === 'invalid_payload');
  assert.equal(invalidTopup.message, 'invalid_payload');

  await assert.rejects(
    messages.waitFor((msg) => msg.t === 'wallet', 200),
    /Timed out/
  );

  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.match(stderrOutput, /invalid payload/);
  assert.match(stderrOutput, /ip=/);
  assert.match(stderrOutput, /uid=unknown/);
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedUid = escapeRegex(hello.uid);
  assert.match(stderrOutput, new RegExp(`uid=${escapedUid}`));
});
