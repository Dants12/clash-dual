import Decimal from 'decimal.js';

const DecimalCtor = Decimal as unknown as any;
DecimalCtor.set({ precision: 40, rounding: DecimalCtor.ROUND_DOWN });

export type Amount = bigint;

export const ZERO_AMOUNT: Amount = 0n;
export const BASIS_POINTS: Amount = 10_000n;
export const RAKE_BPS: Amount = 200n; // 2%
export const JACKPOT_BPS: Amount = 100n; // 1%

export function toAmount(value: number | bigint): Amount {
  if (typeof value === 'bigint') {
    return value;
  }
  if (!Number.isFinite(value)) {
    throw new Error('Invalid amount');
  }
  return BigInt(Math.trunc(value));
}

export function sanitizePositiveAmount(value: number): Amount {
  if (!Number.isFinite(value)) {
    throw new Error('Invalid amount');
  }
  const normalized = Math.max(0, Math.floor(value));
  return BigInt(normalized);
}

export function amountToNumber(value: Amount): number {
  return Number(value);
}

export function applyBps(value: Amount, bps: Amount): Amount {
  if (value === 0n || bps === 0n) {
    return 0n;
  }
  return (value * bps) / BASIS_POINTS;
}

export function subtractBps(value: Amount, bps: Amount): Amount {
  return value - applyBps(value, bps);
}

export function multiplyAmount(amount: Amount, multiplier: number): Amount {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return 0n;
  }
  const product = new DecimalCtor(amount.toString()).mul(multiplier);
  return BigInt(product.toFixed(0, DecimalCtor.ROUND_DOWN));
}

export function percentage(value: Amount, total: Amount): number {
  if (total === 0n) {
    return 0;
  }
  const ratio = new DecimalCtor(value.toString()).div(total.toString()).mul(100);
  return Number(ratio.toNumber());
}
