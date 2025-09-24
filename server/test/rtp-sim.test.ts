import { test } from 'node:test';
import assert from 'node:assert/strict';

import { roundCrash, roundDuel, sha256 } from '../src/fair.js';

test('crash multipliers have stable distribution between sides', () => {
  const clientSeed = 'rtp-client';
  const rounds = 2000;
  let sumA = 0;
  let sumB = 0;
  let minA = Number.POSITIVE_INFINITY;
  let minB = Number.POSITIVE_INFINITY;
  let maxA = 0;
  let maxB = 0;
  for (let i = 0; i < rounds; i += 1) {
    const serverSeed = sha256(`crash-seed-${i}`);
    const result = roundCrash({ serverSeed, clientSeed, nonce: i });
    sumA += result.targetA;
    sumB += result.targetB;
    minA = Math.min(minA, result.targetA);
    minB = Math.min(minB, result.targetB);
    maxA = Math.max(maxA, result.targetA);
    maxB = Math.max(maxB, result.targetB);
  }
  const avgA = sumA / rounds;
  const avgB = sumB / rounds;
  assert.ok(avgA > 1.3 && avgA < 15, `avgA out of range: ${avgA}`);
  assert.ok(avgB > avgA, `avgB should exceed avgA (avgA=${avgA}, avgB=${avgB})`);
  assert.ok(minA >= 1.2);
  assert.ok(minB >= 1.1);
  assert.ok(maxB >= maxA);
});

test('duel rolls are uniform and fair at baseline', () => {
  const clientSeed = 'rtp-client';
  const rounds = 5000;
  let winsA = 0;
  for (let i = 0; i < rounds; i += 1) {
    const serverSeed = sha256(`duel-seed-${i}`);
    const duel = roundDuel({ serverSeed, clientSeed, nonce: i });
    if (duel.roll < 0.5) winsA += 1;
  }
  const ratio = winsA / rounds;
  assert.ok(Math.abs(ratio - 0.5) < 0.03, `ratio out of bounds: ${ratio}`);
});
