import { DuelRound, Bet, Side, DuelFairInfo } from './types.js';
import { now } from './utils.js';
import { v4 as uuid } from 'uuid';

const secretRolls = new WeakMap<DuelRound, number>();

export interface DuelRoundInit {
  fair: DuelFairInfo;
  runtimeExtraMs: number;
  roll: number;
}

export function newDuelRound(init: DuelRoundInit): DuelRound {
  const start = now();
  const round: DuelRound = {
    id: uuid(),
    phase: 'betting',
    startedAt: start,
    endsAt: start + 5000,
    micro: { A: { speed: 0, defense: 0 }, B: { speed: 0, defense: 0 } },
    bets: [],
    seenBetIds: new Set(),
    runtimeExtraMs: init.runtimeExtraMs,
    fair: { ...init.fair }
  };
  secretRolls.set(round, init.roll);
  return round;
}

export interface DuelResolution {
  roll: number;
  pA: number;
  pB: number;
}

export function resolveDuel(r: DuelRound): DuelResolution {
  const roll = secretRolls.get(r);
  if (roll === undefined) {
    throw new Error('missing duel fairness roll');
  }
  secretRolls.delete(r);
  const wA = 1 + Math.max(-0.8, Math.min(0.8, (r.micro.A.speed - r.micro.B.defense) * 0.05));
  const wB = 1 + Math.max(-0.8, Math.min(0.8, (r.micro.B.speed - r.micro.A.defense) * 0.05));
  const pA = wA / (wA + wB);
  r.winner = roll < pA ? 'A' : 'B';
  return { roll, pA, pB: 1 - pA };
}

export function transitionDuel(r: DuelRound) {
  const t = now();
  if (t >= r.endsAt) {
    if (r.phase === 'betting') {
      r.phase = 'running';
      r.startedAt = t;
      r.endsAt = t + 6000 + r.runtimeExtraMs;
    } else if (r.phase === 'running') {
      r.phase = 'resolve';
      const { roll, pA, pB } = resolveDuel(r);
      r.fair.roll = roll;
      r.fair.pA = pA;
      r.fair.pB = pB;
      r.endsAt = t + 1000;
    } else if (r.phase === 'resolve') {
      r.phase = 'intermission';
      r.endsAt = t + 1000;
    }
  }
}

export function addBetDuel(r: DuelRound, side: Side, bet: Bet): boolean {
  if (r.seenBetIds.has(bet.id)) {
    return false;
  }
  r.seenBetIds.add(bet.id);
  bet.side = side;
  r.bets.push(bet);
  return true;
}
