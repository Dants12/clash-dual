import { Bet, Side } from './types.js';
import { Amount, RAKE_BPS, subtractBps } from './money.js';

export interface DuelSettlementResult {
  burned: Amount;
  roundPayouts: Amount;
  payouts: { uid: string; amount: Amount }[];
}

export function calculateDuelSettlement(bets: Bet[], winner?: Side): DuelSettlementResult {
  const burned = bets.reduce<Amount>((sum, bet) => sum + bet.amount, 0n);
  const winners = winner ? bets.filter((bet) => bet.side === winner) : [];
  const totalWinnerStake = winners.reduce<Amount>((sum, bet) => sum + bet.amount, 0n);
  const winPool = subtractBps(burned, RAKE_BPS);

  const payouts: { uid: string; amount: Amount }[] = [];
  let roundPayouts: Amount = 0n;

  if (totalWinnerStake > 0n && winPool > 0n) {
    let remainingPool = winPool;
    let remainingStake = totalWinnerStake;
    for (let i = 0; i < winners.length; i += 1) {
      const bet = winners[i];
      let payout: Amount;
      if (i === winners.length - 1) {
        payout = remainingPool;
      } else {
        payout = remainingStake > 0n ? (bet.amount * remainingPool) / remainingStake : 0n;
      }
      payouts.push({ uid: bet.uid, amount: payout });
      roundPayouts += payout;
      remainingPool -= payout;
      remainingStake -= bet.amount;
    }
  }

  return { burned, roundPayouts, payouts };
}
