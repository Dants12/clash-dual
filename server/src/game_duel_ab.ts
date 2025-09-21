import { DuelRound, Bet, Side } from './types.js';
import { now } from './utils.js';
import { v4 as uuid } from 'uuid';

export function newDuelRound(): DuelRound {
  const start = now();
  return {
    id: uuid(),
    phase: 'betting',
    startedAt: start,
    endsAt: start + 5000,
    micro: { A: { speed: 0, defense: 0 }, B: { speed: 0, defense: 0 } },
    bets: []
  };
}

export function resolveDuel(r: DuelRound) {
  const wA = 1 + Math.max(-0.8, Math.min(0.8, (r.micro.A.speed - r.micro.B.defense) * 0.05));
  const wB = 1 + Math.max(-0.8, Math.min(0.8, (r.micro.B.speed - r.micro.A.defense) * 0.05));
  const pA = wA / (wA + wB);
  r.winner = Math.random() < pA ? 'A' : 'B';
}

export function transitionDuel(r: DuelRound) {
  const t = now();
  if (t >= r.endsAt) {
    if (r.phase === 'betting') {
      r.phase = 'running';
      r.startedAt = t;
      r.endsAt = t + 6000 + Math.floor(Math.random()*4000);
    } else if (r.phase === 'running') {
      r.phase = 'resolve';
      resolveDuel(r);
      r.endsAt = t + 1000;
    } else if (r.phase === 'resolve') {
      r.phase = 'intermission';
      r.endsAt = t + 1000;
    }
  }
}

export function addBetDuel(r: DuelRound, side: Side, bet: Bet) {
  bet.side = side;
  r.bets.push(bet);
}
