export function Meter({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-row metric-row--start">
      <span className="text-muted">{label}</span>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}
