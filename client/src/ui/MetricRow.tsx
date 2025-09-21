import type { ReactNode } from 'react';

interface MetricRowProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  align?: 'start' | 'end';
}

export function MetricRow({ label, value, hint, align = 'end' }: MetricRowProps) {
  return (
    <div className={`metric-row metric-row--${align}`}>
      <div className="metric-label">
        <span>{label}</span>
        {hint && <span className="metric-hint">{hint}</span>}
      </div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

export default MetricRow;
