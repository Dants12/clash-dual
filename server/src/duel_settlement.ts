import { Bet, Side } from './types.js';

export interface DuelSettlementResult {
  burned: number;
  roundPayouts: number;
  payouts: { uid: string; amount: number }[];
}

export function calculateDuelSettlement(bets: Bet[], winner?: Side): DuelSettlementResult {
  const burned = bets.reduce((sum, bet) => sum + bet.amount, 0);
  const winners = winner ? bets.filter((bet) => bet.side === winner) : [];
  const totalWinnerStake = winners.reduce((sum, bet) => sum + bet.amount, 0);
  const winPool = burned * 0.98;

  const payouts: { uid: string; amount: number }[] = [];
  let roundPayouts = 0;

  if (totalWinnerStake > 0) {
    for (const bet of winners) {
      const payout = (bet.amount / totalWinnerStake) * winPool;
      payouts.push({ uid: bet.uid, amount: payout });
      roundPayouts += payout;
    }
  }

  return { burned, roundPayouts, payouts };
}
