import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { GameMode, ClientMsg, ServerMsg, Snapshot, Bet, CrashRound } from './types.js';
import { newCrashRound, tickCrash, transitionCrash, addBetCrash, canBet as canBetCrash } from './game_crash_dual.js';
import { newDuelRound, addBetDuel, transitionDuel } from './game_duel_ab.js';
import { calculateDuelSettlement } from './duel_settlement.js';

const DEFAULT_PORT = 8081;
const HEARTBEAT_INTERVAL_MS = 15000;
const PONG_MSG = JSON.stringify({ t: 'pong' });

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

let crash = newCrashRound();
let duel = newDuelRound();

const wallets = new Map<string, number>();
const sockets = new Map<string, WebSocket>();
const heartbeatTimers = new Set<ReturnType<typeof setInterval>>();

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

function placeBet(uid: string, amount: number, side?: 'A'|'B') {
  if ((wallets.get(uid) ?? 0) < amount) return false;

  if (mode === 'crash_dual') {
    if (!canBetCrash(crash)) return false;
    const bet: Bet = { uid, amount };
    pay(uid, -amount);
    addBetCrash(crash, side ?? 'A', bet);
    return true;
  } else {
    if (duel.phase !== 'betting' || !side) return false;
    pay(uid, -amount);
    addBetDuel(duel, side, { uid, amount, side });
    return true;
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
      nextCrash = newCrashRound();
    }
  } else {
    transitionDuel(duel);
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
      duel = newDuelRound();
    }
  }
  broadcast({ t: 'snapshot', snapshot: snapshot() });
  if (nextCrash) crash = nextCrash;
}, 100);

// WS server
let fatalErrorHandled = false;
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

wss.on('connection', (ws) => {
  let uid: string | undefined;
  let alive = true;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

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

  ws.on('message', (buf) => {
    try {
      const msg = JSON.parse(buf.toString()) as ClientMsg;
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
        placeBet(uid, Math.max(1, Math.floor(msg.amount)), msg.side as any);
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
      }
    } catch (e) {
      ws.send(JSON.stringify({ t: 'error', message: (e as Error).message }));
    }
  });
});

export function getSocketCount(): number {
  return sockets.size;
}

export async function shutdown() {
  clearInterval(loop);
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
