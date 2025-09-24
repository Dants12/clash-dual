export type GameMode = 'crash_dual' | 'duel_ab';
export type Side = 'A' | 'B';

export interface ClientAuth { uid: string; }
export type Amount = bigint;

export interface Wallet {
  balance: Amount;
}

export interface Bet {
  id: string;
  uid: string;
  amount: Amount;
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
  burned: Amount;
  payouts: Amount;
  seenBetIds: Set<string>;
  fair: CrashFairInfo;
}

export interface DuelRound {
  id: string;
  phase: 'betting' | 'running' | 'resolve' | 'intermission';
  startedAt: number;
  endsAt: number;
  micro: { A: { speed: number; defense: number }, B: { speed: number; defense: number } };
  bets: Bet[];
  winner?: Side;
  seenBetIds: Set<string>;
  runtimeExtraMs: number;
  fair: DuelFairInfo;
}

export interface BaseFairInfo {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  serverSeed?: string;
}

export type CrashFairInfo = BaseFairInfo;

export interface DuelFairInfo extends BaseFairInfo {
  roll?: number;
  pA?: number;
  pB?: number;
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

export interface BetSnapshot extends Omit<Bet, 'amount'> {
  amount: number;
}

export interface CrashRoundSnapshot extends Omit<CrashRound, 'betsA' | 'betsB' | 'burned' | 'payouts' | 'seenBetIds'> {
  betsA: BetSnapshot[];
  betsB: BetSnapshot[];
  burned: number;
  payouts: number;
}

export interface DuelRoundSnapshot extends Omit<DuelRound, 'bets' | 'seenBetIds'> {
  bets: BetSnapshot[];
}

export interface Snapshot {
  mode: GameMode;
  crash?: CrashRoundSnapshot;
  duel?: DuelRoundSnapshot;
  bankroll: number;
  jackpot: number;
  rtpAvg: number;
  rounds: number;
  stats: RoundStats;
}

export type ClientMsg =
  | { t: 'auth'; uid?: string }
  | { t: 'switch_mode'; mode: GameMode }
  | { t: 'bet'; amount: number; side?: Side; betId: string }
  | { t: 'cashout' }
  | { t: 'micro'; what: 'speed' | 'defense'; side: Side; value: number }
  | { t: 'topup'; amount: number }
  | { t: 'ping' }
  | { t: 'fair'; mode: GameMode; nonce?: number };

export type ServerMsg =
  | { t: 'hello'; uid: string; wallet: WalletSnapshot; snapshot: Snapshot }
  | { t: 'wallet'; wallet: WalletSnapshot }
  | { t: 'snapshot'; snapshot: Snapshot }
  | { t: 'event'; kind: string; payload?: any }
  | { t: 'error'; message: string }
  | FairServerMsg;

export interface WalletSnapshot {
  balance: number;
}

export type FairServerMsg =
  | {
      t: 'fair';
      mode: 'crash_dual';
      nonce: number;
      roundId: string;
      clientSeed: string;
      serverSeedHash: string;
      serverSeed?: string;
      crash?: { targetA: number; targetB: number };
    }
  | {
      t: 'fair';
      mode: 'duel_ab';
      nonce: number;
      roundId: string;
      clientSeed: string;
      serverSeedHash: string;
      serverSeed?: string;
      duel?: { roll?: number; pA?: number; pB?: number; winner?: Side };
    };
