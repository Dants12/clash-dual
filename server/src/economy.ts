import { Bet } from './types.js';
import { Amount, RAKE_BPS, applyBps, multiplyAmount } from './money.js';

export function settleCrashSide(sideBets: Bet[], finalMult: number, rakeBps: Amount = RAKE_BPS) {
  let burned: Amount = 0n;
  let payouts: Amount = 0n;
  for (const b of sideBets) {
    if (b.cashedOut && b.cashoutAt && b.cashoutAt < finalMult) {
      const win = multiplyAmount(b.amount, b.cashoutAt);
      const fee = applyBps(win, rakeBps);
      payouts += win - fee;
    } else {
      burned += b.amount;
    }
  }
  return { burned, payouts };
}
