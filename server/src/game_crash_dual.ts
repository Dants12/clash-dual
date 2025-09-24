import { CrashRound, Bet, CrashFairInfo } from './types.js';
import { now } from './utils.js';
import { smoothMultiplier, jumpyMultiplier } from './math.js';
import { v4 as uuid } from 'uuid';

export interface CrashRoundInit {
  targetA: number;
  targetB: number;
  fair: CrashFairInfo;
}

export function newCrashRound(init: CrashRoundInit): CrashRound {
  const start = now();
  return {
    id: uuid(),
    phase: 'betting',
    startedAt: start,
    endsAt: start + 4000,
    targetA: init.targetA,
    targetB: init.targetB,
    mA: 1,
    mB: 1,
    betsA: [],
    betsB: [],
    burned: 0,
    payouts: 0,
    seenBetIds: new Set(),
    fair: { ...init.fair }
  };
}

export function tickCrash(r: CrashRound) {
  const t = Math.max(0, (now() - (r.startedAt + 4000)) / 1000);
  if (r.phase === 'running') {
    r.mA = smoothMultiplier(t, 1.0);
    r.mB = jumpyMultiplier(t);
    if (r.mA >= r.targetA || r.mB >= r.targetB) {
      r.phase = 'crash';
      r.endsAt = now() + 1000;
    }
  }
}

export function transitionCrash(r: CrashRound) {
  const tNow = now();
  if (tNow >= r.endsAt) {
    if (r.phase === 'betting') {
      r.phase = 'running';
      r.startedAt = now();
      r.endsAt = r.startedAt + 25000;
    } else if (r.phase === 'crash') {
      r.phase = 'intermission';
      r.endsAt = now() + 1000;
    }
  }
}

export function canBet(r: CrashRound) { return r.phase === 'betting'; }
export function canCashout(r: CrashRound) { return r.phase === 'running'; }

export function addBetCrash(r: CrashRound, side: 'A' | 'B', bet: Bet): boolean {
  if (r.seenBetIds.has(bet.id)) {
    return false;
  }
  r.seenBetIds.add(bet.id);
  (side === 'A' ? r.betsA : r.betsB).push(bet);
  return true;
}
