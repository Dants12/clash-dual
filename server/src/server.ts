import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { GameMode, ClientMsg, ServerMsg, Snapshot, Bet, CrashRound, DuelRound, Side } from './types.js';
import { newCrashRound, tickCrash, transitionCrash, addBetCrash, canBet as canBetCrash } from './game_crash_dual.js';
import { newDuelRound, addBetDuel, transitionDuel } from './game_duel_ab.js';
import { calculateDuelSettlement } from './duel_settlement.js';
import { ClientMsgSchema } from './schema.js';
import { randomSeed, roundCrash, roundDuel, sha256 } from './fair.js';

const DEFAULT_PORT = 8081;
const HEARTBEAT_INTERVAL_MS = 15000;
const RATE_LIMIT_TOKENS = 20;
const RATE_LIMIT_INTERVAL_MS = 10000;
const PONG_MSG = JSON.stringify({ t: 'pong' });
const RATE_LIMIT_MESSAGE = JSON.stringify({ t: 'error', message: 'rate_limit' });

function resolvePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  console.warn(`[WS] Invalid PORT environment value "${raw}", falling back to :${fallback}`);
  return fallback;
}

const PORT = resolvePort(process.env.PORT, DEFAULT_PORT);
const INITIAL_BANKROLL = 100000;
const DEFAULT_CLIENT_SEED = 'clash-dual-client';
const HISTORY_LIMIT = 200;

interface CrashHistoryEntry {
  nonce: number;
  roundId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
}

interface DuelHistoryEntry {
  nonce: number;
  roundId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  winner: Side;
  roll: number;
  pA: number;
  pB: number;
}

let mode: GameMode = 'crash_dual';
let bankroll = INITIAL_BANKROLL;
let jackpot = 0;
let rtpAvg = 0;
let rounds = 0;
let rtpSum = 0;
let rtpRounds = 0;
let crashRounds = 0;
let duelRounds = 0;
let totalWageredAll = 0;
let totalPayoutsAll = 0;

const crashFairState = { serverSeed: randomSeed(), nonce: 0 };
const duelFairState = { serverSeed: randomSeed(), nonce: 0 };
let clientSeed = DEFAULT_CLIENT_SEED;

const crashHistory = new Map<number, CrashHistoryEntry>();
const duelHistory = new Map<number, DuelHistoryEntry>();
const crashHistoryOrder: number[] = [];
const duelHistoryOrder: number[] = [];

function storeCrashHistory(entry: CrashHistoryEntry) {
  crashHistory.set(entry.nonce, entry);
  crashHistoryOrder.push(entry.nonce);
  if (crashHistoryOrder.length > HISTORY_LIMIT) {
    const oldest = crashHistoryOrder.shift();
    if (oldest !== undefined) {
      crashHistory.delete(oldest);
    }
  }
}

function storeDuelHistory(entry: DuelHistoryEntry) {
  duelHistory.set(entry.nonce, entry);
  duelHistoryOrder.push(entry.nonce);
  if (duelHistoryOrder.length > HISTORY_LIMIT) {
    const oldest = duelHistoryOrder.shift();
    if (oldest !== undefined) {
      duelHistory.delete(oldest);
    }
  }
}

function latestCrashNonce(): number | undefined {
  if (crashHistoryOrder.length > 0) {
    return crashHistoryOrder[crashHistoryOrder.length - 1];
  }
  return undefined;
}

function latestDuelNonce(): number | undefined {
  if (duelHistoryOrder.length > 0) {
    return duelHistoryOrder[duelHistoryOrder.length - 1];
  }
  return undefined;
}

function buildCrashFairResponse(nonce?: number): ServerMsg | null {
  let targetNonce = nonce;
  if (targetNonce === undefined) {
    targetNonce = latestCrashNonce();
    if (targetNonce === undefined) {
      targetNonce = crash.fair.nonce;
    }
  }
  if (targetNonce === undefined) {
    return null;
  }
  if (targetNonce === crash.fair.nonce) {
    const base = {
      t: 'fair' as const,
      mode: 'crash_dual' as const,
      nonce: crash.fair.nonce,
      roundId: crash.id,
      clientSeed: crash.fair.clientSeed,
      serverSeedHash: crash.fair.serverSeedHash,
      serverSeed: crash.fair.serverSeed
    };
    if (crash.fair.serverSeed) {
      const { targetA, targetB } = roundCrash({
        serverSeed: crash.fair.serverSeed,
        clientSeed: crash.fair.clientSeed,
        nonce: crash.fair.nonce
      });
      return { ...base, crash: { targetA, targetB } };
    }
    return base;
  }
  const entry = crashHistory.get(targetNonce);
  if (!entry) {
    return null;
  }
  const { targetA, targetB } = roundCrash({
    serverSeed: entry.serverSeed,
    clientSeed: entry.clientSeed,
    nonce: entry.nonce
  });
  return {
    t: 'fair',
    mode: 'crash_dual',
    nonce: entry.nonce,
    roundId: entry.roundId,
    clientSeed: entry.clientSeed,
    serverSeedHash: entry.serverSeedHash,
    serverSeed: entry.serverSeed,
    crash: { targetA, targetB }
  };
}

function buildDuelFairResponse(nonce?: number): ServerMsg | null {
  let targetNonce = nonce;
  if (targetNonce === undefined) {
    targetNonce = latestDuelNonce();
    if (targetNonce === undefined) {
      targetNonce = duel.fair.nonce;
    }
  }
  if (targetNonce === undefined) {
    return null;
  }
  if (targetNonce === duel.fair.nonce) {
    const base = {
      t: 'fair' as const,
      mode: 'duel_ab' as const,
      nonce: duel.fair.nonce,
      roundId: duel.id,
      clientSeed: duel.fair.clientSeed,
      serverSeedHash: duel.fair.serverSeedHash,
      serverSeed: duel.fair.serverSeed
    };
    if (duel.fair.serverSeed && duel.winner) {
      return {
        ...base,
        duel: {
          roll: duel.fair.roll,
          pA: duel.fair.pA,
          pB: duel.fair.pB,
          winner: duel.winner
        }
      };
    }
    return base;
  }
  const entry = duelHistory.get(targetNonce);
  if (!entry) {
    return null;
  }
  return {
    t: 'fair',
    mode: 'duel_ab',
    nonce: entry.nonce,
    roundId: entry.roundId,
    clientSeed: entry.clientSeed,
    serverSeedHash: entry.serverSeedHash,
    serverSeed: entry.serverSeed,
    duel: {
      roll: entry.roll,
      pA: entry.pA,
      pB: entry.pB,
      winner: entry.winner
    }
  };
}

function makeCrashRound(): CrashRound {
  const { targetA, targetB } = roundCrash({
    serverSeed: crashFairState.serverSeed,
    clientSeed,
    nonce: crashFairState.nonce
  });
  return newCrashRound({
    targetA,
    targetB,
    fair: {
      serverSeedHash: sha256(crashFairState.serverSeed),
      clientSeed,
      nonce: crashFairState.nonce
    }
  });
}

function makeDuelRound(): DuelRound {
  const { durationExtraMs, roll } = roundDuel({
    serverSeed: duelFairState.serverSeed,
    clientSeed,
    nonce: duelFairState.nonce
  });
  return newDuelRound({
    fair: {
      serverSeedHash: sha256(duelFairState.serverSeed),
      clientSeed,
      nonce: duelFairState.nonce
    },
    runtimeExtraMs: durationExtraMs,
    roll
  });
}

let crash = makeCrashRound();
let duel = makeDuelRound();

const wallets = new Map<string, number>();
const sockets = new Map<string, WebSocket>();
const heartbeatTimers = new Set<ReturnType<typeof setInterval>>();
const rateLimitBuckets = new Map<string, number>();

const rateLimitReset = setInterval(() => {
  rateLimitBuckets.clear();
}, RATE_LIMIT_INTERVAL_MS);

function consumeRateLimitToken(key: string): boolean {
  const tokens = rateLimitBuckets.get(key) ?? RATE_LIMIT_TOKENS;
  if (tokens <= 0) {
    return false;
  }
  rateLimitBuckets.set(key, tokens - 1);
  return true;
}

function snapshot(): Snapshot {
  const operatorProfit = totalWageredAll - totalPayoutsAll;
  const operatorEdge = totalWageredAll > 0 ? (operatorProfit / totalWageredAll) * 100 : 0;
  return {
    mode,
    crash,
    duel,
    bankroll,
    jackpot,
    rtpAvg,
    rounds,
    stats: {
      totalRounds: rounds,
      crashRounds,
      duelRounds,
      totalWagered: totalWageredAll,
      totalPayouts: totalPayoutsAll,
      operatorProfit,
      operatorEdge,
      operatorEdgeTarget: 4
    }
  };
}

function hello(ws: WebSocket, uid?: string): string {
  const id = uid ?? uuid();
  if (!wallets.has(id)) wallets.set(id, 1000);
  sockets.set(id, ws);
  const msg: ServerMsg = { t: 'hello', uid: id, wallet: { balance: wallets.get(id)! }, snapshot: snapshot() };
  ws.send(JSON.stringify(msg));
  return id;
}

function broadcast(msg: ServerMsg) {
  const s = JSON.stringify(msg);
  for (const ws of sockets.values()) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    try { ws.send(s); } catch {}
  }
}

function sendTo(uid: string, msg: ServerMsg) {
  const ws = sockets.get(uid);
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(msg)); } catch {}
}

function pay(uid: string, delta: number) {
  const cur = wallets.get(uid) ?? 0;
  const balance = cur + delta;
  wallets.set(uid, balance);
  sendTo(uid, { t: 'wallet', wallet: { balance } });
}

function tryCashoutCrash(uid: string) {
  if (mode !== 'crash_dual' || crash.phase !== 'running') return false;
  let done = false;
  const mA = crash.mA, mB = crash.mB;
  for (const list of [crash.betsA, crash.betsB]) {
    for (const b of list) {
      if (b.uid === uid && !b.cashedOut) {
        b.cashedOut = true;
        b.cashoutAt = list === crash.betsA ? mA : mB;
        const win = b.amount * b.cashoutAt;
        const rake = win * 0.02;
        pay(uid, win - rake);
        done = true;
      }
    }
  }
  return done;
}

type BetPlacementResult = { success: true } | { success: false; error?: 'duplicate_bet' };

function placeBet(uid: string, amount: number, betId: string, side?: 'A' | 'B'): BetPlacementResult {
  if ((wallets.get(uid) ?? 0) < amount) return { success: false };

  if (mode === 'crash_dual') {
    if (!canBetCrash(crash)) return { success: false };
    if (crash.seenBetIds.has(betId)) {
      return { success: false, error: 'duplicate_bet' };
    }
    const bet: Bet = { id: betId, uid, amount };
    if (!addBetCrash(crash, side ?? 'A', bet)) {
      return { success: false, error: 'duplicate_bet' };
    }
    pay(uid, -amount);
    return { success: true };
  } else {
    if (duel.phase !== 'betting' || !side) return { success: false };
    if (duel.seenBetIds.has(betId)) {
      return { success: false, error: 'duplicate_bet' };
    }
    const bet: Bet = { id: betId, uid, amount, side };
    if (!addBetDuel(duel, side, bet)) {
      return { success: false, error: 'duplicate_bet' };
    }
    pay(uid, -amount);
    return { success: true };
  }
}

// Game loop
const loop = setInterval(() => {
  let nextCrash: CrashRound | null = null;
  if (mode === 'crash_dual') {
    transitionCrash(crash);
    if (crash.phase === 'running') tickCrash(crash);
    if (crash.phase === 'intermission') {
      const endA = crash.targetA;
      const endB = crash.targetB;
      let burned = 0, payouts = 0;
      for (const [list, final] of [[crash.betsA, endA],[crash.betsB, endB]] as const) {
        for (const b of list) {
          if (b.cashedOut && b.cashoutAt && b.cashoutAt < final) {
            const win = b.amount * b.cashoutAt;
            const rake = win * 0.02;
            payouts += win - rake;
          } else {
            burned += b.amount;
          }
        }
      }
      const roundWagered =
        crash.betsA.reduce((sum, bet) => sum + bet.amount, 0) +
        crash.betsB.reduce((sum, bet) => sum + bet.amount, 0);
      crash.burned = burned;
      crash.payouts = payouts;
      bankroll += roundWagered - payouts;
      jackpot += Math.max(0, burned * 0.01);
      const roundRtp = roundWagered > 0 ? (payouts / roundWagered) * 100 : 0;
      if (roundWagered > 0) {
        rtpSum += roundRtp;
        rtpRounds += 1;
        rtpAvg = rtpSum / rtpRounds;
      }
      rounds += 1;
      crashRounds += 1;
      totalWageredAll += roundWagered;
      totalPayoutsAll += payouts;
      crash.fair.serverSeed = crashFairState.serverSeed;
      storeCrashHistory({
        nonce: crash.fair.nonce,
        roundId: crash.id,
        serverSeed: crashFairState.serverSeed,
        serverSeedHash: crash.fair.serverSeedHash,
        clientSeed: crash.fair.clientSeed
      });
      crashFairState.nonce += 1;
      crashFairState.serverSeed = randomSeed();
      nextCrash = makeCrashRound();
    }
  } else {
    transitionDuel(duel);
    if (duel.phase === 'resolve' && duel.fair.serverSeed === undefined) {
      duel.fair.serverSeed = duelFairState.serverSeed;
    }
    if (duel.phase === 'intermission') {
      const { burned, roundPayouts, payouts } = calculateDuelSettlement(duel.bets, duel.winner);
      for (const { uid, amount } of payouts) {
        pay(uid, amount);
      }
      bankroll += burned - roundPayouts;
      jackpot += burned * 0.01;
      const roundRtp = burned > 0 ? (roundPayouts / burned) * 100 : 0;
      if (burned > 0) {
        rtpSum += roundRtp;
        rtpRounds += 1;
        rtpAvg = rtpSum / rtpRounds;
      }
      rounds += 1;
      duelRounds += 1;
      totalWageredAll += burned;
      totalPayoutsAll += roundPayouts;
      if (duel.fair.serverSeed && duel.winner) {
        const roll = duel.fair.roll ?? 0;
        const pA = duel.fair.pA ?? 0;
        const pB = duel.fair.pB ?? 0;
        storeDuelHistory({
          nonce: duel.fair.nonce,
          roundId: duel.id,
          serverSeed: duel.fair.serverSeed,
          serverSeedHash: duel.fair.serverSeedHash,
          clientSeed: duel.fair.clientSeed,
          winner: duel.winner,
          roll,
          pA,
          pB
        });
      }
      duelFairState.nonce += 1;
      duelFairState.serverSeed = randomSeed();
      duel = makeDuelRound();
    }
  }
  broadcast({ t: 'snapshot', snapshot: snapshot() });
  if (nextCrash) crash = nextCrash;
}, 100);

// WS server
let fatalErrorHandled = false;
const INVALID_PAYLOAD_MESSAGE = JSON.stringify({ t: 'error', message: 'invalid_payload' });

const wss = new WebSocketServer({ port: PORT });
wss.on('error', (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[WS] WebSocket server error on :${PORT}: ${message}`, error);
  if (fatalErrorHandled) return;
  fatalErrorHandled = true;
  if (process.exitCode === undefined || process.exitCode === 0) {
    process.exitCode = 1;
  }
  void shutdown().catch((shutdownError) => {
    const shutdownMessage = shutdownError instanceof Error ? shutdownError.message : String(shutdownError);
    console.error(`[WS] error while shutting down after failure: ${shutdownMessage}`, shutdownError);
  });
  setImmediate(() => {
    try {
      process.exit(1);
    } catch {}
  });
});
console.log(`[WS] running on :${PORT}`);

wss.on('connection', (ws, request) => {
  let uid: string | undefined;
  let alive = true;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const ip = request?.socket?.remoteAddress ?? 'unknown';

  const cleanup = () => {
    if (heartbeat !== null) {
      const timer = heartbeat;
      heartbeat = null;
      clearInterval(timer);
      heartbeatTimers.delete(timer);
    }
    if (!uid) return;
    const current = sockets.get(uid);
    if (current === ws) sockets.delete(uid);
    uid = undefined;
  };

  const ensureHeartbeat = () => {
    alive = true;
    if (heartbeat !== null) return;
    const timer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        cleanup();
        return;
      }
      if (!alive) {
        cleanup();
        try { ws.terminate(); } catch {}
        return;
      }
      alive = false;
      try { ws.send(PONG_MSG); } catch {}
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat = timer;
    heartbeatTimers.add(timer);
  };

  ensureHeartbeat();

  ws.on('close', cleanup);
  ws.on('error', cleanup);

  const sendInvalidPayload = () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(INVALID_PAYLOAD_MESSAGE);
    } catch {}
  };

  const rejectInvalidPayload = (reason: string) => {
    const formatted = typeof reason === 'string' && reason.length > 0 ? reason : 'unknown reason';
    console.warn(`[WS] invalid payload from ip=${ip} uid=${uid ?? 'unknown'}: ${formatted}`);
    sendInvalidPayload();
  };

  ws.on('message', (buf) => {
    let raw: unknown;
    try {
      raw = JSON.parse(buf.toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rejectInvalidPayload(message);
      return;
    }

    const parsed = ClientMsgSchema.safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
          return `${path}: ${issue.message}`;
        })
        .join('; ') || parsed.error.message;
      rejectInvalidPayload(message);
      return;
    }

    const msg: ClientMsg = parsed.data;
    const rateLimitKey = uid ?? ip;
    if (!consumeRateLimitToken(rateLimitKey)) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(RATE_LIMIT_MESSAGE); } catch {}
      }
      return;
    }
    try {
      if (msg.t === 'ping') {
        ensureHeartbeat();
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(PONG_MSG); } catch {}
        }
      } else if (msg.t === 'auth') {
        uid = hello(ws, msg.uid);
      } else if (msg.t === 'switch_mode') {
        mode = msg.mode;
      } else if (msg.t === 'bet') {
        if (!uid) return;
        const result = placeBet(uid, Math.max(1, Math.floor(msg.amount)), msg.betId, msg.side);
        if (!result.success && result.error) {
          sendTo(uid, { t: 'error', message: result.error });
        }
      } else if (msg.t === 'cashout') {
        if (!uid) return;
        tryCashoutCrash(uid);
      } else if (msg.t === 'micro') {
        if (mode === 'duel_ab') {
          const g = duel.micro[msg.side];
          if (msg.what === 'speed') g.speed += msg.value;
          else g.defense += msg.value;
        }
      } else if (msg.t === 'topup') {
        if (!uid) return;
        const amount = Math.max(1, Math.floor(Number(msg.amount ?? 0)));
        if (amount > 0) {
          pay(uid, amount);
        }
      } else if (msg.t === 'fair') {
        const fairResponse = msg.mode === 'crash_dual' ? buildCrashFairResponse(msg.nonce) : buildDuelFairResponse(msg.nonce);
        if (ws.readyState === WebSocket.OPEN) {
          if (fairResponse) {
            try { ws.send(JSON.stringify(fairResponse)); } catch {}
          } else {
            try { ws.send(JSON.stringify({ t: 'error', message: 'fair_not_found' })); } catch {}
          }
        }
      }
    } catch (e) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ t: 'error', message: (e as Error).message }));
        } catch {}
      }
    }
  });
});

export function getSocketCount(): number {
  return sockets.size;
}

export async function shutdown() {
  clearInterval(loop);
  clearInterval(rateLimitReset);
  rateLimitBuckets.clear();
  for (const timer of heartbeatTimers) {
    clearInterval(timer);
  }
  heartbeatTimers.clear();
  for (const [id, ws] of sockets) {
    sockets.delete(id);
    try { ws.terminate(); } catch {}
  }
  await new Promise<void>((resolve, reject) => {
    wss.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
