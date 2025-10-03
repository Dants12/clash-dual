import { MetricRow, MutedText } from './MetricRow';

export function Meter({ label, value }: { label: string; value: string | number }) {
  return <MetricRow align="start" label={<MutedText>{label}</MutedText>} value={value} />;
}
