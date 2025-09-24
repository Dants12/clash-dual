import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 19085;

function runCurl(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-sf', url], { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        const err = new Error(`curl failed: ${stderr || error.message}`);
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

test('exposes Prometheus metrics on /metrics', async (t) => {
  const server = spawn('node', ['dist/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  t.after(async () => {
    server.kill('SIGTERM');
    await once(server, 'exit');
  });

  server.stdout.setEncoding('utf8');

  const [startupChunk] = await once(server.stdout, 'data');
  const startupLog = startupChunk.toString();
  assert.match(
    startupLog,
    new RegExp(`:${PORT}`),
    `expected startup log to mention bound port ${PORT}, got: ${startupLog}`
  );

  const metrics = await runCurl(`http://127.0.0.1:${PORT}/metrics`);
  assert.match(metrics, /clash_active_clients/, 'expected active clients metric to be present');
  assert.match(metrics, /clash_events_total/, 'expected events counter metric to be present');
});
