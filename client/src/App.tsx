import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CrashDualCanvas from './games/CrashDualCanvas';
import DuelABPanel from './games/DuelABPanel';
import { createWS, persistUid } from './ws';
import type { GameMode, RoundStats, Side, Snapshot } from './types';
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
const formatMultiplierDelta = (value: number) => `${value >= 0 ? '+' : ''}${(Number.isFinite(value) ? value : 0).toFixed(2)}x`;
const formatPercent = (value: number) => `${(Number.isFinite(value) ? value : 0).toFixed(2)}%`;
const shortId = (value?: string) => (value ? value.slice(0, 8).toUpperCase() : '—');
const formatMode = (mode: GameMode) => (mode === 'crash_dual' ? 'Crash Dual' : 'A/B Duel');
const eventId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const phaseToneMap: Record<string, BadgeTone> = {
  betting: 'primary',
  running: 'success',
  resolve: 'warning',
  crash: 'danger',
  intermission: 'muted'
};

const QUICK_TOPUPS = [5, 10, 25, 50, 100, 250];
const BET_PRESETS = [5, 10, 25, 50, 100, 250, 500];

export default function App() {
  const [ws, setWS] = useState<WebSocket | null>(null);
  const uid = useRef<string>('');
  const [wallet, setWallet] = useState(0);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [amount, setAmount] = useState(50);
  const [side, setSide] = useState<Side>('A');
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [microStep, setMicroStep] = useState(1);
  const [targetInputs, setTargetInputs] = useState<Record<Side, string>>({ A: '', B: '' });
  const [targetRoundId, setTargetRoundId] = useState<string | null>(null);
  const commit = import.meta.env.VITE_COMMIT as string | undefined;

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
        if (uid.current) {
          persistUid(uid.current);
        }
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
  const roundStats: RoundStats | undefined = snap?.stats;

  const now = Date.now();
  const crashTimeLeft = crashRound ? Math.max(0, crashRound.endsAt - now) : 0;
  const duelTimeLeft = duelRound ? Math.max(0, duelRound.endsAt - now) : 0;

  useEffect(() => {
    if (!crashRound) {
      if (mode !== 'crash_dual' && targetRoundId !== null) {
        setTargetRoundId(null);
      }
      return;
    }

    if (targetRoundId === crashRound.id) {
      return;
    }

    setTargetInputs({ A: crashRound.targetA.toFixed(2), B: crashRound.targetB.toFixed(2) });
    setTargetRoundId(crashRound.id);
  }, [crashRound, mode, targetRoundId]);

  const targetPlans = useMemo<Record<Side, number | null>>(() => {
    const parse = (value: string) => {
      const next = Number.parseFloat(value);
      return Number.isFinite(next) ? next : null;
    };
    return { A: parse(targetInputs.A), B: parse(targetInputs.B) };
  }, [targetInputs.A, targetInputs.B]);

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
  const phaseTone = activePhase ? phaseToneMap[activePhase] ?? 'muted' : 'muted';
  const modeLabel = formatMode(mode);

  const riskProfile = useMemo(
    () => {
      if (!snap) {
        return { tone: 'muted' as BadgeTone, label: 'Unknown', hint: 'Awaiting data' };
      }

      if (wallet <= 0) {
        return { tone: 'danger' as BadgeTone, label: 'Critical', hint: 'Balance depleted' };
      }

      const rtp = Number.isFinite(snap.rtpAvg) ? snap.rtpAvg : 0;

      if (wallet < 150) {
        return { tone: 'warning' as BadgeTone, label: 'High risk', hint: 'Low balance reserves' };
      }

      if (rtp < 96) {
        return { tone: 'warning' as BadgeTone, label: 'Volatile', hint: 'RTP trending low' };
      }

      if (rtp > 103) {
        return { tone: 'success' as BadgeTone, label: 'Advantage', hint: 'Payouts above expectation' };
      }

      return { tone: 'secondary' as BadgeTone, label: 'Balanced', hint: 'Within comfort zone' };
    },
    [snap, wallet]
  );

  const sanitizedAmount = Number.isFinite(amount) ? amount : 0;
  const canPlaceBet =
    isLive &&
    sanitizedAmount > 0 &&
    sanitizedAmount <= wallet &&
    ((mode === 'crash_dual' && crashRound?.phase === 'betting') || (mode === 'duel_ab' && duelRound?.phase === 'betting'));
  const canCashout = isLive && mode === 'crash_dual' && crashRound?.phase === 'running';
  const canAdjustMicro = isLive && mode === 'duel_ab';
  const sliderMax = useMemo(() => Math.max(100, wallet, sanitizedAmount), [sanitizedAmount, wallet]);
  const sliderStep = sliderMax > 500 ? 25 : sliderMax > 200 ? 10 : 5;
  const sliderDisabled = wallet <= 0 && sanitizedAmount <= 0;
  const canEditTargets = mode === 'crash_dual' && !!crashRound;

  const adjustAmount = useCallback(
    (delta: number) => {
      setAmount((prev) => {
        const base = Number.isFinite(prev) ? prev : 0;
        const next = base + delta;
        const rounded = Math.max(0, Math.round(next));
        if (wallet > 0) {
          return Math.min(rounded, wallet);
        }
        return rounded;
      });
    },
    [wallet]
  );

  const toggleSide = useCallback(() => {
    setSide((prev) => (prev === 'A' ? 'B' : 'A'));
  }, []);

  const requestTopUp = useCallback(
    (value: number) => {
      if (value <= 0) return;
      if (!isLive) {
        pushEvent('Top-up unavailable while offline');
        return;
      }
      const amountToSend = Math.max(1, Math.floor(value));
      send({ t: 'topup', amount: amountToSend });
      pushEvent(`Top-up requested · ${formatCurrency(amountToSend)}`);
    },
    [isLive, pushEvent, send]
  );

  const resetTargetsToRound = useCallback(() => {
    if (!crashRound) {
      setTargetInputs({ A: '', B: '' });
      setTargetRoundId(null);
      return;
    }
    setTargetInputs({ A: crashRound.targetA.toFixed(2), B: crashRound.targetB.toFixed(2) });
    setTargetRoundId(crashRound.id);
  }, [crashRound]);

  const targetOffsets = useMemo(
    () => ({
      A: crashRound && targetPlans.A != null ? targetPlans.A - crashRound.targetA : null,
      B: crashRound && targetPlans.B != null ? targetPlans.B - crashRound.targetB : null
    }),
    [crashRound, targetPlans]
  );
  const activeTargetPlan = targetPlans[side];

  const placeBet = useCallback(() => {
    const value = Number.isFinite(amount) ? amount : 0;
    const phaseOk = (mode === 'crash_dual' && crashRound?.phase === 'betting') || (mode === 'duel_ab' && duelRound?.phase === 'betting');
    if (!isLive || !phaseOk || value <= 0 || value > wallet) return;
    const payload = { t: 'bet', amount: Math.max(1, Math.floor(value)), side };
    send(payload);
    const plannedTarget = targetPlans[side];
    const planSuffix = mode === 'crash_dual' && plannedTarget != null ? ` (target ${formatMultiplier(plannedTarget)})` : '';
    pushEvent(`Bet placed · ${formatCurrency(payload.amount)} on side ${side}${planSuffix}`);
  }, [amount, crashRound?.phase, duelRound?.phase, isLive, mode, pushEvent, send, side, targetPlans, wallet]);

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
          <span className="text-muted">Realtime crash &amp; duel playground</span>
        </div>
        <div className="app-header__badges">
          <Badge tone={connectionTone}>Connection · {connectionLabel}</Badge>
          <Badge tone="primary">Mode · {modeLabel}</Badge>
          <Badge tone={phaseTone}>Phase · {activePhase ?? '—'}</Badge>
          <Badge tone="muted">Rounds · {snap?.rounds ?? 0}</Badge>
        </div>
        <div className="app-header__controls">
          <div className="segmented">
            <button
              className="button button--muted"
              type="button"
              data-active={mode === 'crash_dual'}
              onClick={() => switchMode('crash_dual')}
              disabled={!isLive || mode === 'crash_dual'}
            >
              Crash
            </button>
            <button
              className="button button--muted"
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
              <div className="wallet-balance">
                <span className="wallet-balance__label">Balance</span>
                <div className="wallet-balance__value">{formatCurrency(wallet)}</div>
                <div className="wallet-balance__tags">
                  <Badge tone={connectionTone}>Connection · {connectionLabel}</Badge>
                  <Badge tone={riskProfile.tone}>Risk · {riskProfile.label}</Badge>
                </div>
              </div>

              <div className="wallet-topups">
                {QUICK_TOPUPS.map((value) => (
                  <button
                    key={value}
                    className="button button--secondary button--compact"
                    type="button"
                    onClick={() => requestTopUp(value)}
                    disabled={!isLive}
                  >
                    +{formatCurrency(value)}
                  </button>
                ))}
              </div>
              <span className="wallet-topups__hint text-muted">Quick top-ups add funds instantly while connected.</span>

              <div className="wallet-targets">
                <div className="wallet-targets__header">
                  <span>Target multipliers</span>
                  <button
                    className="button button--muted button--compact"
                    type="button"
                    onClick={resetTargetsToRound}
                    disabled={!crashRound}
                  >
                    Reset to round
                  </button>
                </div>
                <div className="wallet-targets__inputs">
                  <div className="wallet-targets__input">
                    <label htmlFor="target-a">Side A</label>
                    <input
                      id="target-a"
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step={0.01}
                      value={targetInputs.A}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setTargetInputs((prev) => ({ ...prev, A: raw }));
                      }}
                      onBlur={(event) => {
                        const parsed = Number.parseFloat(event.target.value);
                        setTargetInputs((prev) => ({
                          ...prev,
                          A: Number.isFinite(parsed) ? Math.max(1, parsed).toFixed(2) : ''
                        }));
                      }}
                      disabled={!canEditTargets}
                    />
                  </div>
                  <div className="wallet-targets__input">
                    <label htmlFor="target-b">Side B</label>
                    <input
                      id="target-b"
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step={0.01}
                      value={targetInputs.B}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setTargetInputs((prev) => ({ ...prev, B: raw }));
                      }}
                      onBlur={(event) => {
                        const parsed = Number.parseFloat(event.target.value);
                        setTargetInputs((prev) => ({
                          ...prev,
                          B: Number.isFinite(parsed) ? Math.max(1, parsed).toFixed(2) : ''
                        }));
                      }}
                      disabled={!canEditTargets}
                    />
                  </div>
                </div>
                <div className="wallet-targets__foot">
                  {crashRound ? (
                    <>
                      <span className="wallet-targets__round">
                        Round · A {formatMultiplier(crashRound.targetA)} · B {formatMultiplier(crashRound.targetB)}
                      </span>
                      <span className="wallet-targets__delta">
                        Plan offset:&nbsp;
                        <strong>A {targetOffsets.A != null ? formatMultiplierDelta(targetOffsets.A) : '—'}</strong>
                        <span className="wallet-targets__divider">·</span>
                        <strong>B {targetOffsets.B != null ? formatMultiplierDelta(targetOffsets.B) : '—'}</strong>
                      </span>
                    </>
                  ) : (
                    <Badge tone="muted">Targets available in Crash Dual mode</Badge>
                  )}
                </div>
              </div>

              <div className="wallet-metrics">
                <MetricRow label="UID" value={uid.current || '—'} align="start" />
                <MetricRow label="Active mode" value={<Badge tone="primary">{modeLabel}</Badge>} hint={`Phase ${activePhase ?? '—'}`} align="start" />
                <MetricRow label="Connection" value={<Badge tone={connectionTone}>{connectionLabel}</Badge>} align="start" />
                <MetricRow label="RTP (avg)" value={`${(snap?.rtpAvg ?? 0).toFixed(2)}%`} hint="House rolling average" />
                <MetricRow label="Risk status" value={<Badge tone={riskProfile.tone}>{riskProfile.label}</Badge>} hint={riskProfile.hint} align="start" />
                <MetricRow label="Rounds played" value={snap?.rounds ?? 0} />
              </div>
            </Card>

            <Card title="Main bet" subtitle="Place wagers on the active game">
              <div className="control-group">
                <label htmlFor="bet-amount">Bet amount</label>
                <input
                  id="bet-amount"
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setAmount(Number.isFinite(next) ? Math.max(0, next) : 0);
                  }}
                />
              </div>

              <div className="bet-stepper">
                <button
                  className="button button--muted button--compact"
                  type="button"
                  onClick={() => adjustAmount(-sliderStep)}
                  disabled={sanitizedAmount <= 0}
                >
                  −{sliderStep}
                </button>
                <span className="bet-stepper__value">{formatCurrency(sanitizedAmount)}</span>
                <button
                  className="button button--secondary button--compact"
                  type="button"
                  onClick={() => adjustAmount(sliderStep)}
                  disabled={wallet <= 0}
                >
                  +{sliderStep}
                </button>
              </div>

              <div className="bet-presets">
                {BET_PRESETS.map((value) => (
                  <button
                    key={value}
                    className="button button--muted button--compact"
                    type="button"
                    data-active={sanitizedAmount === Math.min(value, wallet > 0 ? wallet : value)}
                    onClick={() => setAmount(wallet > 0 ? Math.min(value, wallet) : value)}
                  >
                    {formatCurrency(value)}
                  </button>
                ))}
              </div>

              <div className="bet-slider">
                <label htmlFor="bet-slider">Quick adjust</label>
                <input
                  id="bet-slider"
                  type="range"
                  min={0}
                  max={sliderMax}
                  step={sliderStep}
                  value={sanitizedAmount}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (!Number.isFinite(next)) return;
                    const normalized = Math.max(0, Math.round(next));
                    setAmount(wallet > 0 ? Math.min(normalized, wallet) : normalized);
                  }}
                  disabled={sliderDisabled}
                />
                <div className="bet-slider__scale">
                  <span>0</span>
                  <span>{formatCurrency(sliderMax)}</span>
                </div>
              </div>

              <div className="bet-side-overview">
                <div className="bet-side-chip" data-side={side}>
                  <span className="bet-side-chip__label">Selected</span>
                  <span className="bet-side-chip__value">Side {side}</span>
                  {mode === 'crash_dual' && (
                    <span className="bet-side-chip__plan">
                      Target · {activeTargetPlan != null ? formatMultiplier(activeTargetPlan) : '—'}
                    </span>
                  )}
                </div>
                <div className="bet-side-actions">
                  <button
                    className="button button--muted button--compact"
                    type="button"
                    data-active={side === 'A'}
                    onClick={() => setSide('A')}
                  >
                    A
                  </button>
                  <button
                    className="button button--muted button--compact"
                    type="button"
                    data-active={side === 'B'}
                    onClick={() => setSide('B')}
                  >
                    B
                  </button>
                  <button className="button button--secondary button--compact" type="button" onClick={toggleSide}>
                    Swap
                  </button>
                </div>
              </div>

              <div className="button-row">
                <button
                  className="button button--primary"
                  type="button"
                  onClick={placeBet}
                  disabled={!canPlaceBet}
                >
                  Place bet
                </button>
                {mode === 'crash_dual' && (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={cashout}
                    disabled={!canCashout}
                  >
                    Cash out
                  </button>
                )}
              </div>
              <span className="text-muted">Betting is available during the betting phase.</span>
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
                      <Badge tone="secondary">Side {target}</Badge>
                    </div>
                    <div className="micro-stat">
                      <MetricRow label="Speed" value={duelRound?.micro?.[target]?.speed ?? 0} />
                      <div className="micro-controls">
                        <button
                          className="button button--secondary"
                          type="button"
                          onClick={() => adjustMicro(target, 'speed', microStep)}
                          disabled={!canAdjustMicro}
                        >
                          +{microStep}
                        </button>
                        <button
                          className="button button--muted"
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
                          className="button button--secondary"
                          type="button"
                          onClick={() => adjustMicro(target, 'defense', microStep)}
                          disabled={!canAdjustMicro}
                        >
                          +{microStep}
                        </button>
                        <button
                          className="button button--muted"
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
                    {parameterMetrics.length === 0 && <span className="text-muted">Waiting for round data…</span>}
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
              <MetricRow
                label="Connection"
                value={<Badge tone={connectionTone}>{connectionLabel}</Badge>}
                hint={isLive ? 'Realtime updates active' : 'Reconnect to resume updates'}
              />
              <MetricRow label="Bankroll" value={formatCurrency(snap?.bankroll ?? 0)} />
              <MetricRow label="Jackpot" value={formatCurrency(snap?.jackpot ?? 0)} />
              <MetricRow label="RTP average" value={`${(snap?.rtpAvg ?? 0).toFixed(2)}%`} />
              <MetricRow label="Total rounds" value={snap?.rounds ?? 0} />
            </Card>

            <Card title="Round statistics" subtitle="Performance snapshot">
              <MetricRow label="Completed rounds" value={roundStats?.totalRounds ?? snap?.rounds ?? 0} />
              <MetricRow label="Crash rounds" value={roundStats?.crashRounds ?? 0} />
              <MetricRow label="Duel rounds" value={roundStats?.duelRounds ?? 0} />
              <MetricRow label="Total wagers" value={formatCurrency(roundStats?.totalWagered ?? 0)} />
              <MetricRow label="Operator profit" value={formatCurrency(roundStats?.operatorProfit ?? 0)} />
              <MetricRow
                label="Operator edge"
                value={formatPercent(roundStats?.operatorEdge ?? 0)}
                hint={`Target ${formatPercent(roundStats?.operatorEdgeTarget ?? 4)}`}
              />
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
                <span className="text-muted">Totals will appear when a round begins.</span>
              )}
            </Card>

            <Card title="Events" subtitle="Latest activity">
              {events.length === 0 ? (
                <span className="text-muted">No events yet. Place a bet to get started.</span>
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
      <div style={{ position: 'fixed', right: 8, bottom: 8, opacity: 0.6, fontSize: 12 }}>
        build: {commit ?? 'unknown'}
      </div>
    </div>
  );
}
