import { CrashRound, Bet, CrashFairInfo, CrashRoundStream } from './types.js';
import { now } from './utils.js';
import { smoothMultiplier, jumpyMultiplier } from './math.js';
import { v4 as uuid } from 'uuid';

export interface CrashRoundInit {
  targetA: number;
  targetB: number;
  fair: CrashFairInfo;
  streamB: Pick<CrashRoundStream, 'sampler'>;
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
    burned: 0n,
    payouts: 0n,
    seenBetIds: new Set(),
    fair: { ...init.fair },
    streamB: { sampler: init.streamB.sampler, steps: 0, valuesUsed: 0 }
  };
}

export function tickCrash(r: CrashRound) {
  const t = Math.max(0, (now() - (r.startedAt + 4000)) / 1000);
  if (r.phase === 'running') {
    r.mA = smoothMultiplier(t, 1.0);
    const steps = Math.floor(t * 4);
    r.mB = jumpyMultiplier(steps, r.streamB.sampler);
    r.streamB.steps = steps;
    r.streamB.valuesUsed = steps * 2;
    r.fair.bStream.steps = steps;
    r.fair.bStream.valuesUsed = r.streamB.valuesUsed;
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
