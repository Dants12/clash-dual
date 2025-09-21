import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CrashDualCanvas from './games/CrashDualCanvas';
import DuelABPanel from './games/DuelABPanel';
import { createWS } from './ws';
import type { GameMode, Side, Snapshot } from './types';
import { Card } from './ui/Card';
import { Badge, type BadgeTone } from './ui/Badge';
import { MetricRow } from './ui/MetricRow';

interface EventEntry {
  id: string;
  text: string;
  ts: number;
}

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const formatCurrency = (value: number) => currencyFormatter.format(Number.isFinite(value) ? value : 0);
const formatSeconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
const formatMultiplier = (value: number) => `${(Number.isFinite(value) ? value : 0).toFixed(2)}x`;
const shortId = (value?: string) => (value ? value.slice(0, 8).toUpperCase() : '—');
const formatMode = (mode: GameMode) => (mode === 'crash_dual' ? 'Crash Dual' : 'A/B Duel');
const eventId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const phaseToneMap: Record<string, BadgeTone> = {
  betting: 'info',
  running: 'success',
  resolve: 'warning',
  crash: 'danger',
  intermission: 'neutral'
};

export default function App() {
  const [ws, setWS] = useState<WebSocket | null>(null);
  const uid = useRef<string>('');
  const [wallet, setWallet] = useState(0);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [amount, setAmount] = useState(50);
  const [side, setSide] = useState<Side>('A');
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [microStep, setMicroStep] = useState(1);

  const pushEvent = useCallback((text: string) => {
    setEvents((prev) => [{ id: eventId(), text, ts: Date.now() }, ...prev].slice(0, 30));
  }, []);

  const handleSnapshot = useCallback(
    (incoming: Snapshot) => {
      setSnap((prev) => {
        if (prev) {
          if (prev.mode !== incoming.mode) {
            pushEvent(`Mode switched to ${formatMode(incoming.mode)}`);
          }

          if (incoming.mode === 'crash_dual' && incoming.crash) {
            if (prev.crash?.id !== incoming.crash.id) {
              pushEvent('New crash round started');
            } else if (prev.crash?.phase !== incoming.crash.phase) {
              pushEvent(`Crash phase → ${incoming.crash.phase}`);
            }
          }

          if (incoming.mode === 'duel_ab' && incoming.duel) {
            if (prev.duel?.id !== incoming.duel.id) {
              pushEvent('New duel round started');
            } else if (prev.duel?.phase !== incoming.duel.phase) {
              pushEvent(`Duel phase → ${incoming.duel.phase}`);
            }

            if (incoming.duel.winner && prev.duel?.winner !== incoming.duel.winner) {
              pushEvent(`Duel winner · ${incoming.duel.winner}`);
            }
          }
        }

        return incoming;
      });
    },
    [pushEvent]
  );

  useEffect(() => {
    const socket = createWS((message: any) => {
      if (message.t === 'hello') {
        uid.current = typeof message.uid === 'string' ? message.uid : '';
        setWallet(Number(message.wallet?.balance ?? 0));
        handleSnapshot(message.snapshot as Snapshot);
        pushEvent(`Connected as ${uid.current || 'guest'}`);
      } else if (message.t === 'wallet') {
        const balance = Number(message.wallet?.balance ?? 0);
        setWallet(balance);
        pushEvent(`Wallet updated · ${formatCurrency(balance)}`);
      } else if (message.t === 'snapshot') {
        handleSnapshot(message.snapshot as Snapshot);
      } else if (message.t === 'event') {
        const text = typeof message.payload?.message === 'string' ? message.payload.message : message.kind;
        if (text) pushEvent(text);
      } else if (message.t === 'error') {
        pushEvent(`Error: ${message.message}`);
      }
    });

    const onClose = () => pushEvent('Connection closed');
    socket.addEventListener('close', onClose);

    setWS(socket);

    return () => {
      socket.removeEventListener('close', onClose);
      socket.close();
    };
  }, [handleSnapshot, pushEvent]);

  const send = useCallback(
    (payload: any) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    },
    [ws]
  );

  const readyState = ws?.readyState ?? WebSocket.CLOSED;
  const isLive = readyState === WebSocket.OPEN;
  const connectionLabel = readyState === WebSocket.OPEN ? 'Live' : readyState === WebSocket.CONNECTING ? 'Connecting' : 'Offline';
  const connectionTone: BadgeTone = readyState === WebSocket.OPEN ? 'success' : readyState === WebSocket.CONNECTING ? 'warning' : 'danger';

  const mode: GameMode = snap?.mode ?? 'crash_dual';
  const crashRound = snap?.crash;
  const duelRound = snap?.duel;

  const now = Date.now();
  const crashTimeLeft = crashRound ? Math.max(0, crashRound.endsAt - now) : 0;
  const duelTimeLeft = duelRound ? Math.max(0, duelRound.endsAt - now) : 0;

  const crashTotals = useMemo(() => {
    if (!crashRound) {
      return { totalA: 0, totalB: 0, countA: 0, countB: 0 };
    }
    const totalA = crashRound.betsA?.reduce((sum, bet) => sum + (bet.amount ?? 0), 0) ?? 0;
    const totalB = crashRound.betsB?.reduce((sum, bet) => sum + (bet.amount ?? 0), 0) ?? 0;
    return { totalA, totalB, countA: crashRound.betsA?.length ?? 0, countB: crashRound.betsB?.length ?? 0 };
  }, [crashRound]);

  const duelTotals = useMemo(() => {
    if (!duelRound) {
      return { total: 0, totalA: 0, totalB: 0, countA: 0, countB: 0 };
    }
    let totalA = 0;
    let totalB = 0;
    let countA = 0;
    let countB = 0;
    for (const bet of duelRound.bets ?? []) {
      const amount = bet.amount ?? 0;
      if (bet.side === 'A') {
        totalA += amount;
        countA += 1;
      } else if (bet.side === 'B') {
        totalB += amount;
        countB += 1;
      }
    }
    return { total: totalA + totalB, totalA, totalB, countA, countB };
  }, [duelRound]);

  const activePhase = mode === 'crash_dual' ? crashRound?.phase : duelRound?.phase;
  const phaseTone = activePhase ? phaseToneMap[activePhase] ?? 'neutral' : 'neutral';
  const modeLabel = formatMode(mode);

  const sanitizedAmount = Number.isFinite(amount) ? amount : 0;
  const canPlaceBet =
    isLive &&
    sanitizedAmount > 0 &&
    sanitizedAmount <= wallet &&
    ((mode === 'crash_dual' && crashRound?.phase === 'betting') || (mode === 'duel_ab' && duelRound?.phase === 'betting'));
  const canCashout = isLive && mode === 'crash_dual' && crashRound?.phase === 'running';
  const canAdjustMicro = isLive && mode === 'duel_ab';

  const placeBet = useCallback(() => {
    const value = Number.isFinite(amount) ? amount : 0;
    const phaseOk = (mode === 'crash_dual' && crashRound?.phase === 'betting') || (mode === 'duel_ab' && duelRound?.phase === 'betting');
    if (!isLive || !phaseOk || value <= 0 || value > wallet) return;
    const payload = { t: 'bet', amount: Math.max(1, Math.floor(value)), side };
    send(payload);
    pushEvent(`Bet placed · ${formatCurrency(payload.amount)} on side ${side}`);
  }, [amount, crashRound?.phase, duelRound?.phase, isLive, mode, pushEvent, send, side, wallet]);

  const cashout = useCallback(() => {
    if (!isLive || mode !== 'crash_dual' || crashRound?.phase !== 'running') return;
    send({ t: 'cashout' });
    pushEvent('Cashout requested');
  }, [crashRound?.phase, isLive, mode, pushEvent, send]);

  const switchMode = useCallback(
    (nextMode: GameMode) => {
      if (!isLive || nextMode === mode) return;
      send({ t: 'switch_mode', mode: nextMode });
      pushEvent(`Switching to ${formatMode(nextMode)}…`);
    },
    [isLive, mode, pushEvent, send]
  );

  const adjustMicro = useCallback(
    (targetSide: Side, stat: 'speed' | 'defense', delta: number) => {
      if (!isLive || mode !== 'duel_ab' || delta === 0) return;
      send({ t: 'micro', side: targetSide, what: stat, value: delta });
      pushEvent(`Adjusted ${stat} ${targetSide} by ${delta > 0 ? '+' : ''}${delta}`);
    },
    [isLive, mode, pushEvent, send]
  );

  const parameterMetrics: Array<{ label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode }> = mode === 'crash_dual'
    ? crashRound
      ? [
          { label: 'Round ID', value: shortId(crashRound.id) },
          { label: 'Phase', value: crashRound.phase },
          { label: 'Time left', value: formatSeconds(crashTimeLeft) },
          { label: 'A multiplier', value: formatMultiplier(crashRound.mA), hint: `Target ${formatMultiplier(crashRound.targetA)}` },
          { label: 'B multiplier', value: formatMultiplier(crashRound.mB), hint: `Target ${formatMultiplier(crashRound.targetB)}` },
          { label: 'Burned', value: formatCurrency(crashRound.burned) },
          { label: 'Payouts', value: formatCurrency(crashRound.payouts) }
        ]
      : []
    : duelRound
      ? [
          { label: 'Round ID', value: shortId(duelRound.id) },
          { label: 'Phase', value: duelRound.phase },
          { label: 'Time left', value: formatSeconds(duelTimeLeft) },
          { label: 'Pot size', value: formatCurrency(duelTotals.total) },
          { label: 'A speed', value: duelRound.micro.A.speed },
          { label: 'A defense', value: duelRound.micro.A.defense },
          { label: 'B speed', value: duelRound.micro.B.speed },
          { label: 'B defense', value: duelRound.micro.B.defense },
          { label: 'Winner', value: duelRound.winner ?? '—' }
        ]
      : [];

  const eventTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__title">
          <h1>Clash Demo</h1>
          <span className="muted">Realtime crash &amp; duel playground</span>
        </div>
        <div className="app-header__badges">
          <Badge tone={connectionTone}>Connection · {connectionLabel}</Badge>
          <Badge tone="info">Mode · {modeLabel}</Badge>
          <Badge tone={phaseTone}>Phase · {activePhase ?? '—'}</Badge>
          <Badge tone="neutral">Rounds · {snap?.rounds ?? 0}</Badge>
        </div>
        <div className="app-header__controls">
          <div className="segmented">
            <button
              type="button"
              data-active={mode === 'crash_dual'}
              onClick={() => switchMode('crash_dual')}
              disabled={!isLive || mode === 'crash_dual'}
            >
              Crash
            </button>
            <button
              type="button"
              data-active={mode === 'duel_ab'}
              onClick={() => switchMode('duel_ab')}
              disabled={!isLive || mode === 'duel_ab'}
            >
              A/B Duel
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="layout">
          <div className="column column-left">
            <Card title="Wallet &amp; Mode" subtitle="Session overview">
              <MetricRow label="UID" value={uid.current || '—'} />
              <MetricRow label="Balance" value={formatCurrency(wallet)} />
              <MetricRow label="Active mode" value={modeLabel} hint={`Phase ${activePhase ?? '—'}`} />
              <MetricRow label="Connection" value={connectionLabel} />
            </Card>

            <Card title="Main bet" subtitle="Place wagers on the active game">
              <div className="control-group">
                <label htmlFor="bet-amount">Bet amount</label>
                <input
                  id="bet-amount"
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setAmount(Number.isFinite(next) ? Math.max(0, next) : 0);
                  }}
                />
              </div>
              <div className="segmented segmented--spread">
                <button type="button" data-active={side === 'A'} onClick={() => setSide('A')}>
                  Side A
                </button>
                <button type="button" data-active={side === 'B'} onClick={() => setSide('B')}>
                  Side B
                </button>
              </div>
              <div className="button-row">
                <button type="button" onClick={placeBet} disabled={!canPlaceBet}>
                  Place bet
                </button>
                {mode === 'crash_dual' && (
                  <button type="button" onClick={cashout} disabled={!canCashout}>
                    Cash out
                  </button>
                )}
              </div>
              <span className="muted">Betting is available during the betting phase.</span>
            </Card>

            <Card title="Micro-bets" subtitle="Fine-tune duel combatants">
              <div className="control-group">
                <label htmlFor="micro-step">Adjustment step</label>
                <input
                  id="micro-step"
                  type="number"
                  min={1}
                  value={microStep}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setMicroStep(Number.isFinite(next) ? Math.max(1, Math.min(50, Math.floor(next))) : 1);
                  }}
                />
              </div>
              {!canAdjustMicro && <Badge tone="warning">Switch to duel mode to adjust stats</Badge>}
              <div className="micro-grid">
                {(['A', 'B'] as const).map((target) => (
                  <div key={target} className="micro-side">
                    <div className="micro-side-header">
                      <Badge tone="info">Side {target}</Badge>
                    </div>
                    <div className="micro-stat">
                      <MetricRow label="Speed" value={duelRound?.micro?.[target]?.speed ?? 0} />
                      <div className="micro-controls">
                        <button
                          type="button"
                          onClick={() => adjustMicro(target, 'speed', microStep)}
                          disabled={!canAdjustMicro}
                        >
                          +{microStep}
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustMicro(target, 'speed', -microStep)}
                          disabled={!canAdjustMicro}
                        >
                          -{microStep}
                        </button>
                      </div>
                    </div>
                    <div className="micro-stat">
                      <MetricRow label="Defense" value={duelRound?.micro?.[target]?.defense ?? 0} />
                      <div className="micro-controls">
                        <button
                          type="button"
                          onClick={() => adjustMicro(target, 'defense', microStep)}
                          disabled={!canAdjustMicro}
                        >
                          +{microStep}
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustMicro(target, 'defense', -microStep)}
                          disabled={!canAdjustMicro}
                        >
                          -{microStep}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="column column-center">
            <Card title="Game arena" subtitle={modeLabel} bodyClassName="arena-body">
              <div className="arena-grid">
                <div className="arena-stage">
                  {mode === 'crash_dual' && crashRound && (
                    <CrashDualCanvas
                      mA={crashRound.mA}
                      mB={crashRound.mB}
                      targetA={crashRound.targetA}
                      targetB={crashRound.targetB}
                      phase={crashRound.phase}
                    />
                  )}
                  {mode === 'duel_ab' && duelRound && (
                    <DuelABPanel micro={duelRound.micro} phase={duelRound.phase} winner={duelRound.winner} />
                  )}
                  {!((mode === 'crash_dual' && crashRound) || (mode === 'duel_ab' && duelRound)) && (
                    <div className="arena-empty">No round data yet</div>
                  )}
                </div>
                <aside className="arena-sidebar">
                  <div className="arena-sidebar-title">Round parameters</div>
                  <div className="arena-parameters">
                    {parameterMetrics.length === 0 && <span className="muted">Waiting for round data…</span>}
                    {parameterMetrics.map((metric) => (
                      <MetricRow key={metric.label as string} label={metric.label} value={metric.value} hint={metric.hint} />
                    ))}
                  </div>
                </aside>
              </div>
            </Card>
          </div>

          <div className="column column-right">
            <Card title="Investor panel" subtitle="House overview">
              <MetricRow label="Bankroll" value={formatCurrency(snap?.bankroll ?? 0)} />
              <MetricRow label="Jackpot" value={formatCurrency(snap?.jackpot ?? 0)} />
              <MetricRow label="RTP average" value={`${(snap?.rtpAvg ?? 0).toFixed(2)}%`} />
              <MetricRow label="Total rounds" value={snap?.rounds ?? 0} />
            </Card>

            <Card title="Round totals" subtitle={`${modeLabel} pools`}>
              {mode === 'crash_dual' && crashRound && (
                <>
                  <MetricRow label="Total pool" value={formatCurrency(crashTotals.totalA + crashTotals.totalB)} />
                  <MetricRow label="Side A" value={formatCurrency(crashTotals.totalA)} hint={`${crashTotals.countA} bets`} />
                  <MetricRow label="Side B" value={formatCurrency(crashTotals.totalB)} hint={`${crashTotals.countB} bets`} />
                  <MetricRow label="Burned" value={formatCurrency(crashRound.burned)} />
                  <MetricRow label="Payouts" value={formatCurrency(crashRound.payouts)} />
                </>
              )}
              {mode === 'duel_ab' && duelRound && (
                <>
                  <MetricRow label="Total pot" value={formatCurrency(duelTotals.total)} />
                  <MetricRow label="Side A" value={formatCurrency(duelTotals.totalA)} hint={`${duelTotals.countA} bets`} />
                  <MetricRow label="Side B" value={formatCurrency(duelTotals.totalB)} hint={`${duelTotals.countB} bets`} />
                  <MetricRow label="Winner" value={duelRound.winner ?? '—'} />
                </>
              )}
              {!((mode === 'crash_dual' && crashRound) || (mode === 'duel_ab' && duelRound)) && (
                <span className="muted">Totals will appear when a round begins.</span>
              )}
            </Card>

            <Card title="Events" subtitle="Latest activity">
              {events.length === 0 ? (
                <span className="muted">No events yet. Place a bet to get started.</span>
              ) : (
                <ul className="event-list">
                  {events.map((entry) => (
                    <li key={entry.id} className="event-item">
                      <span className="event-time">{eventTime(entry.ts)}</span>
                      <span className="event-text">{entry.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
