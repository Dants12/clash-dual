import React from 'react';
import { Badge, type BadgeTone } from '../ui/Badge';
import { MetricRow } from '../ui/MetricRow';

const phaseTone: Record<string, BadgeTone> = {
  betting: 'primary',
  running: 'success',
  resolve: 'warning',
  crash: 'danger',
  intermission: 'muted'
};

interface DuelABPanelProps {
  micro: { A: { speed: number; defense: number }; B: { speed: number; defense: number } };
  winner?: 'A' | 'B';
  phase: string;
}

export default function DuelABPanel({ micro, winner, phase }: DuelABPanelProps) {
  return (
    <div className="duel-arena">
      <div className="duel-arena-row">
        {(['A', 'B'] as const).map((side) => (
          <div key={side} className="duel-arena-side">
            <Badge tone="secondary">Side {side}</Badge>
            <MetricRow label="Speed" value={micro?.[side]?.speed ?? 0} />
            <MetricRow label="Defense" value={micro?.[side]?.defense ?? 0} />
          </div>
        ))}
      </div>
      <div className="duel-arena-status">
        <Badge tone={phaseTone[phase] ?? 'muted'}>Phase: {phase}</Badge>
        {winner ? (
          <Badge tone="success">Winner: {winner}</Badge>
        ) : (
          <Badge tone="muted">Awaiting result</Badge>
        )}
      </div>
    </div>
  );
}
