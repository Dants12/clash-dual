import { test } from 'node:test';
import assert from 'node:assert/strict';

import { roundCrash, sha256 } from '../src/fair.js';
import { RAKE_BPS } from '../src/money.js';

const RAKE = Number(RAKE_BPS) / 10_000;

function simulateRtp(rounds: number, cashout: number, selector: (targets: { targetA: number; targetB: number }) => number) {
  const clientSeed = 'rtp-sim-client';
  let payouts = 0;

  for (let i = 0; i < rounds; i += 1) {
    const serverSeed = sha256(`rtp-server-${i}`);
    const result = roundCrash({ serverSeed, clientSeed, nonce: i });
    const target = selector(result);
    if (target > cashout) {
      payouts += cashout * (1 - RAKE);
    }
  }

  return payouts / rounds;
}

test('simulated crash RTP stays within expected range', () => {
  const rounds = 120_000;
  const cashoutA = 2.0;
  const cashoutB = 3.0;

  const rtpA = simulateRtp(rounds, cashoutA, ({ targetA }) => targetA);
  const rtpB = simulateRtp(rounds, cashoutB, ({ targetB }) => targetB);

  assert.ok(rtpA > 0.94 && rtpA < 0.96, `expected A RTP in [0.94, 0.96], got ${rtpA.toFixed(4)}`);
  assert.ok(rtpB > 0.96 && rtpB < 0.97, `expected B RTP in [0.96, 0.97], got ${rtpB.toFixed(4)}`);
});
