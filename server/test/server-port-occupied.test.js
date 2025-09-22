import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 19084;

test('logs an error and exits when the port is already in use', async (t) => {
  const blocker = createServer();
  blocker.listen(PORT, '127.0.0.1');
  await once(blocker, 'listening');

  t.after(async () => {
    blocker.close();
    await once(blocker, 'close');
  });

  const server = spawn('node', ['dist/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  t.after(async () => {
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await once(server, 'exit');
    }
  });

  let stderr = '';
  server.stderr.setEncoding('utf8');
  server.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const [code, signal] = await once(server, 'exit');
  assert.equal(signal, null, 'expected process to exit without a signal');
  assert.equal(code, 1, 'expected exit code 1 when port is unavailable');

  if (!stderr) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.match(
    stderr,
    /WebSocket server error/,
    `expected WebSocket server error to be logged, got: ${stderr}`
  );
  assert.match(
    stderr,
    /EADDRINUSE/,
    `expected bind failure reason (EADDRINUSE) to be logged, got: ${stderr}`
  );
});
