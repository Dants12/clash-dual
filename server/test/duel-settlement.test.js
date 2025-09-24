import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDuelSettlement } from '../dist/duel_settlement.js';

test('distributes duel pool to the winning side while preserving rake accounting', () => {
  const bets = [
    { uid: 'winner-1', amount: 150n, side: 'A' },
    { uid: 'winner-2', amount: 50n, side: 'A' },
    { uid: 'loser', amount: 100n, side: 'B' }
  ];

  const { burned, roundPayouts, payouts } = calculateDuelSettlement(bets, 'A');

  assert.equal(burned, 300n);
  assert.equal(roundPayouts, 294n);
  assert.equal(payouts.length, 2);
  const payoutMap = new Map(payouts.map((p) => [p.uid, p.amount]));
  assert.equal(payoutMap.get('winner-1'), 220n);
  assert.equal(payoutMap.get('winner-2'), 74n);
  assert.equal(burned - roundPayouts, 6n);
});

test('handles rounds with no winners without distributing payouts', () => {
  const bets = [
    { uid: 'loser-1', amount: 75n, side: 'A' },
    { uid: 'loser-2', amount: 25n, side: 'A' }
  ];

  const { burned, roundPayouts, payouts } = calculateDuelSettlement(bets, 'B');

  assert.equal(burned, 100n);
  assert.equal(roundPayouts, 0n);
  assert.deepEqual(payouts, []);
  assert.equal(burned - roundPayouts, 100n);
});
