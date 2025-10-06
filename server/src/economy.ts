import { Bet } from './types.js';


export function settleCrashSide(
sideBets: Bet[],
finalMult: number,
rake = 0.02
) {
let burned = 0, payouts = 0;
for (const b of sideBets) {
if (b.cashedOut && b.cashoutAt && b.cashoutAt < finalMult) {
const win = b.amount * b.cashoutAt;
const fee = win * rake;
payouts += win - fee;
} else {
burned += b.amount;
}
}
return { burned, payouts };
}
