import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { GameMode, ClientMsg, ServerMsg, Snapshot, Bet } from './types.js';
import { newCrashRound, tickCrash, transitionCrash, addBetCrash, canBet as canBetCrash } from './game_crash_dual.js';
import { newDuelRound, addBetDuel, transitionDuel } from './game_duel_ab.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8081;

let mode: GameMode = 'crash_dual';
let bankroll = 100000;
let jackpot = 0;
let rtpAvg = 0;
let rounds = 0;

let crash = newCrashRound();
let duel = newDuelRound();

const wallets = new Map<string, number>();
const sockets = new Map<string, WebSocket>();

function snapshot(): Snapshot {
  return { mode, crash, duel, bankroll, jackpot, rtpAvg, rounds };
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
  for (const ws of sockets.values()) try { ws.send(s); } catch {}
}

function sendTo(uid: string, msg: ServerMsg) {
  const ws = sockets.get(uid);
  if (!ws) return;
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
        bankroll -= (win - rake);
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
setInterval(() => {
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
      bankroll += burned - payouts;
      jackpot += Math.max(0, burned * 0.01);
      rounds += 1;
      crash = newCrashRound();
    }
  } else {
    transitionDuel(duel);
    if (duel.phase === 'intermission') {
      const burned = duel.bets.reduce((s,b)=> s + b.amount, 0);
      const winners = duel.bets.filter(b => b.side === duel.winner);
      const winPool = burned * 0.98;
      const tot = winners.reduce((s,b)=> s + b.amount, 0) || 1;
      for (const b of winners) {
        const payout = (b.amount / tot) * winPool;
        pay(b.uid, payout);
        bankroll -= payout;
      }
      jackpot += burned * 0.01;
      rounds += 1;
      duel = newDuelRound();
    }
  }
  broadcast({ t: 'snapshot', snapshot: snapshot() });
}, 100);

// WS server
const wss = new WebSocketServer({ port: PORT });
console.log(`[WS] running on :${PORT}`);

wss.on('connection', (ws) => {
  let uid: string | undefined;
  ws.on('message', (buf) => {
    try {
      const msg = JSON.parse(buf.toString()) as ClientMsg;
      if (msg.t === 'auth') {
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
      }
    } catch (e) {
      ws.send(JSON.stringify({ t: 'error', message: (e as Error).message }));
    }
  });
});
