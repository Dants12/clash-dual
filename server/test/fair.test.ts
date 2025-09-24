import { test } from 'node:test';
import assert from 'node:assert/strict';

import { roundCrash, sha256, crashBSampler, type RoundConfig } from '../src/fair.js';
import { newCrashRound, tickCrash } from '../src/game_crash_dual.js';
import { multiplyAmount } from '../src/money.js';
import type { CrashFairInfo } from '../src/types.js';

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

function simulateSideB(config: RoundConfig, steps: number) {
  const { targetA, targetB } = roundCrash(config);
  const sampler = crashBSampler(config);
  const fair: CrashFairInfo = {
    serverSeedHash: sha256(config.serverSeed),
    clientSeed: config.clientSeed,
    nonce: config.nonce,
    bStream: { steps: 0, valuesUsed: 0 }
  };
  const round = newCrashRound({ targetA, targetB, fair, streamB: { sampler } });
  round.phase = 'running';
  const runningStart = 1_000_000;
  round.startedAt = runningStart;
  round.endsAt = runningStart + 25000;

  const originalNow = Date.now;
  const multipliers: number[] = [];
  try {
    for (let i = 0; i < steps; i += 1) {
      const ts = runningStart + 4000 + (i + 1) * 250;
      Date.now = () => ts;
      tickCrash(round);
      multipliers.push(round.mB);
      if (round.phase !== 'running') {
        break;
      }
    }
  } finally {
    Date.now = originalNow;
  }

  return { multipliers, bStream: { ...round.fair.bStream } };
}

test('side B path and cashout stay deterministic for identical seeds', () => {
  const config: RoundConfig = { serverSeed: 'determinism-side-b', clientSeed: 'client-abc', nonce: 7 };
  const steps = 8;
  const first = simulateSideB(config, steps);
  const second = simulateSideB(config, steps);

  assert.deepEqual(second.multipliers, first.multipliers, 'trajectory should match when seeds match');
  assert.deepEqual(second.bStream, first.bStream, 'stream info should match when seeds match');
  assert.equal(first.multipliers.length, first.bStream.steps, 'recorded multipliers should match steps');
  assert.equal(second.multipliers.length, second.bStream.steps, 'recorded multipliers should match steps');
  assert.equal(first.bStream.valuesUsed, first.bStream.steps * 2, 'stream should record uniform draws used');

  const cashoutStep = 5; // steps are 1-indexed in multipliers array
  const amount = 275n;
  const firstMultiplier = first.multipliers[Math.min(cashoutStep, first.multipliers.length) - 1];
  const secondMultiplier = second.multipliers[Math.min(cashoutStep, second.multipliers.length) - 1];
  const expectedPayout = multiplyAmount(amount, firstMultiplier);
  const repeatedPayout = multiplyAmount(amount, secondMultiplier);
  assert.equal(repeatedPayout, expectedPayout, 'cashout payout should be reproducible');
});
