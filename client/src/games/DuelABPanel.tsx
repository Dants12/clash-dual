import styled from 'styled-components';
import { Badge, type BadgeTone } from '../ui/Badge';
import { MetricRow } from '../ui/MetricRow';

const DuelArena = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
`;

const DuelArenaRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--gap-md);
`;

const DuelArenaSide = styled.div`
  background: var(--color-panel-alt);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-panel-border-strong);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
`;

const DuelArenaStatus = styled.div`
  display: flex;
  gap: var(--gap-sm);
  flex-wrap: wrap;
  justify-content: center;
`;

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
    <DuelArena>
      <DuelArenaRow>
        {(['A', 'B'] as const).map((side) => (
          <DuelArenaSide key={side}>
            <Badge tone="secondary">Side {side}</Badge>
            <MetricRow label="Speed" value={micro?.[side]?.speed ?? 0} />
            <MetricRow label="Defense" value={micro?.[side]?.defense ?? 0} />
          </DuelArenaSide>
        ))}
      </DuelArenaRow>
      <DuelArenaStatus>
        <Badge tone={phaseTone[phase] ?? 'muted'}>Phase: {phase}</Badge>
        {winner ? (
          <Badge tone="success">Winner: {winner}</Badge>
        ) : (
          <Badge tone="muted">Awaiting result</Badge>
        )}
      </DuelArenaStatus>
    </DuelArena>
  );
}
