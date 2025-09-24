import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();
register.setDefaultLabels({ app: 'clash-dual-server' });
collectDefaultMetrics({ register });

export const activeClientsGauge = new Gauge({
  name: 'clash_active_clients',
  help: 'Number of active WebSocket clients connected to the server',
  registers: [register]
});

export const eventsCounter = new Counter({
  name: 'clash_events_total',
  help: 'Count of client and server events processed by the WebSocket server',
  labelNames: ['direction', 'event'],
  registers: [register]
});

const multiplierBuckets = [1, 1.5, 2, 3, 5, 10, 20, 50];
export const multiplierHistogram = new Histogram({
  name: 'clash_round_multiplier',
  help: 'Distribution of final round multipliers grouped by game mode and side',
  labelNames: ['mode', 'side'],
  buckets: multiplierBuckets,
  registers: [register]
});

const rtpBuckets = [0, 50, 75, 90, 100, 110, 125, 150, 200, 300];
export const rtpHistogram = new Histogram({
  name: 'clash_round_rtp_percent',
  help: 'Return-to-player percentage observed for each round',
  labelNames: ['mode'],
  buckets: rtpBuckets,
  registers: [register]
});

const profitBuckets = [0, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 50000, 100000];
export const profitLossHistogram = new Histogram({
  name: 'clash_round_profit',
  help: 'Operator profit (or loss) per round grouped by game mode and outcome',
  labelNames: ['mode', 'outcome'],
  buckets: profitBuckets,
  registers: [register]
});

export const metricsContentType = register.contentType;

export async function collectMetrics(): Promise<string> {
  return register.metrics();
}
