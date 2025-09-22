import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';

const FALLBACK_PORT = 8081;

test('uses fallback port when PORT env var is invalid', async (t) => {
  const server = spawn('node', ['dist/server.js'], {
    env: { ...process.env, PORT: 'abc' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  t.after(async () => {
    server.kill('SIGTERM');
    await once(server, 'exit');
  });

  let warningLog = '';
  server.stderr.on('data', (chunk) => {
    warningLog += chunk.toString();
  });

  const [startupChunk] = await once(server.stdout, 'data');
  const startupLog = startupChunk.toString();
  assert.ok(
    startupLog.includes(`:${FALLBACK_PORT}`),
    `Expected startup log to reference fallback port ${FALLBACK_PORT}, got: ${startupLog}`
  );

  const ws = new WebSocket(`ws://127.0.0.1:${FALLBACK_PORT}`);
  t.after(() => {
    ws.close();
  });

  await once(ws, 'open');
  assert.equal(ws.readyState, WebSocket.OPEN);
  assert.equal(server.exitCode, null);

  if (!warningLog) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.match(
    warningLog,
    /Invalid PORT environment value "abc"/,
    `Expected warning about invalid PORT env var, got: ${warningLog}`
  );
});
