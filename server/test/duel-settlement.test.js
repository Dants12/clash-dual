import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDuelSettlement } from '../dist/duel_settlement.js';

const nearlyEqual = (a, b, epsilon = 1e-9) => Math.abs(a - b) < epsilon;

test('distributes duel pool to the winning side while preserving rake accounting', () => {
  const bets = [
    { uid: 'winner-1', amount: 150, side: 'A' },
    { uid: 'winner-2', amount: 50, side: 'A' },
    { uid: 'loser', amount: 100, side: 'B' }
  ];

  const { burned, roundPayouts, payouts } = calculateDuelSettlement(bets, 'A');

  assert.equal(burned, 300);
  assert.ok(nearlyEqual(roundPayouts, 294));
  assert.equal(payouts.length, 2);
  const payoutMap = new Map(payouts.map((p) => [p.uid, p.amount]));
  assert.ok(nearlyEqual(payoutMap.get('winner-1') ?? 0, 220.5));
  assert.ok(nearlyEqual(payoutMap.get('winner-2') ?? 0, 73.5));
  assert.ok(nearlyEqual(burned - roundPayouts, 6));
});

test('handles rounds with no winners without distributing payouts', () => {
  const bets = [
    { uid: 'loser-1', amount: 75, side: 'A' },
    { uid: 'loser-2', amount: 25, side: 'A' }
  ];

  const { burned, roundPayouts, payouts } = calculateDuelSettlement(bets, 'B');

  assert.equal(burned, 100);
  assert.equal(roundPayouts, 0);
  assert.deepEqual(payouts, []);
  assert.equal(burned - roundPayouts, 100);
});
