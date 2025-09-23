export type GameMode = 'crash_dual' | 'duel_ab';
export type Side = 'A' | 'B';

export interface ClientAuth { uid: string; }
export interface Wallet { balance: number; }

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
  micro: { A: { speed: number; defense: number }, B: { speed: number; defense: number } };
  bets: Bet[];
  winner?: Side;
}

export interface RoundStats {
  totalRounds: number;
  crashRounds: number;
  duelRounds: number;
  totalWagered: number;
  totalPayouts: number;
  operatorProfit: number;
  operatorEdge: number;
  operatorEdgeTarget: number;
}

export interface Snapshot {
  mode: GameMode;
  crash?: CrashRound;
  duel?: DuelRound;
  bankroll: number;
  jackpot: number;
  rtpAvg: number;
  rounds: number;
  stats: RoundStats;
}

export type ClientMsg =
  | { t: 'auth'; uid?: string }
  | { t: 'switch_mode'; mode: GameMode }
  | { t: 'bet'; amount: number; side?: Side }
  | { t: 'cashout' }
  | { t: 'micro'; what: 'speed' | 'defense'; side: Side; value: number }
  | { t: 'topup'; amount: number }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'hello'; uid: string; wallet: Wallet; snapshot: Snapshot }
  | { t: 'wallet'; wallet: Wallet }
  | { t: 'snapshot'; snapshot: Snapshot }
  | { t: 'event'; kind: string; payload?: any }
  | { t: 'error'; message: string };
