import type { ReactNode } from 'react';
import styled from 'styled-components';

const MetricRowContainer = styled.div<{ $align: 'start' | 'end' }>`
  display: flex;
  justify-content: space-between;
  gap: var(--gap-sm);
  align-items: ${({ $align }) => ($align === 'start' ? 'center' : 'flex-start')};
`;

export const MetricLabel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-muted);
`;

export const MetricValue = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: var(--color-heading);
  text-align: right;
`;

export const MetricHint = styled.span`
  font-size: 12px;
  color: var(--color-faint);
  text-transform: none;
  letter-spacing: normal;
`;

export const MutedText = styled.span`
  color: var(--color-muted);
`;

export interface MetricRowProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

export function MetricRow({ label, value, hint, align = 'end', className }: MetricRowProps) {
  return (
    <MetricRowContainer className={className} $align={align}>
      <MetricLabel>
        {label}
        {hint && <MetricHint>{hint}</MetricHint>}
      </MetricLabel>
      <MetricValue>{value}</MetricValue>
    </MetricRowContainer>
  );
}

export default MetricRow;
