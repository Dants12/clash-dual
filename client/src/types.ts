export type GameMode = 'crash_dual' | 'duel_ab';
export type Side = 'A' | 'B';

export interface Bet {
  uid: string;
  amount: number;
  side?: Side;
  cashedOut?: boolean;
  cashoutAt?: number;
}

export interface CrashRound {
  id: string;
  phase: 'betting' | 'running' | 'crash' | 'intermission';
  startedAt: number;
  endsAt: number;
  targetA: number;
  targetB: number;
  mA: number;
  mB: number;
  betsA: Bet[];
  betsB: Bet[];
  burned: number;
  payouts: number;
}

export interface DuelRound {
  id: string;
  phase: 'betting' | 'running' | 'resolve' | 'intermission';
  startedAt: number;
  endsAt: number;
  micro: { A: { speed: number; defense: number }; B: { speed: number; defense: number } };
  bets: Bet[];
  winner?: Side;
}

export interface Snapshot {
  mode: GameMode;
  crash?: CrashRound;
  duel?: DuelRound;
  bankroll: number;
  jackpot: number;
  rtpAvg: number;
  rounds: number;
}
