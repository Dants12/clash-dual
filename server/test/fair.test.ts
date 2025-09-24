import { test } from 'node:test';
import assert from 'node:assert/strict';

import { roundCrash, sha256 } from '../src/fair.js';

test('roundCrash is deterministic for identical inputs', () => {
  const baseConfig = { serverSeed: 'determinism-seed', clientSeed: 'client-123', nonce: 42 };
  const first = roundCrash(baseConfig);

  for (let i = 0; i < 10; i += 1) {
    const repeat = roundCrash({ ...baseConfig });
    assert.deepEqual(repeat, first, `repeat ${i} diverged`);
  }

  const variations = [
    { serverSeed: sha256('determinism-seed'), clientSeed: 'client-123', nonce: 42 },
    { serverSeed: 'determinism-seed', clientSeed: 'client-456', nonce: 42 },
    { serverSeed: 'determinism-seed', clientSeed: 'client-123', nonce: 99 }
  ];

  for (const config of variations) {
    const result = roundCrash(config);
    assert.notDeepEqual(result, first, 'changing any input should change the outcome');
  }

  assert.ok(first.targetA >= 1.2, 'side A minimum multiplier should be respected');
  assert.ok(first.targetB >= 1.1, 'side B minimum multiplier should be respected');
});
