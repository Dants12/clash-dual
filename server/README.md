# Clash Dual Server

- `PORT` env (default 8081)
- In-memory state
- Modes: `crash_dual`, `duel_ab`

## Logging

Server logs are emitted via [Pino](https://getpino.io/).

- `LOG_LEVEL` controls the minimum log level (defaults to `info`).
- Informational logs are written to `stdout`; warnings and errors are routed to `stderr` so existing tests and log collectors continue to work as before.
- Output is JSON-formatted by default.

## Metrics

Prometheus-compatible metrics are exported via [`prom-client`](https://github.com/siimon/prom-client) on `http://<host>:<PORT>/metrics`.

Available instruments include:

- `clash_active_clients` &mdash; gauge tracking WebSocket clients.
- `clash_events_total` &mdash; counter of inbound/outbound events by type.
- `clash_round_multiplier`, `clash_round_rtp_percent`, `clash_round_profit` &mdash; histograms for multipliers, return-to-player percentages and operator profit/loss.

### Smoke test

Run a simple curl request against a running server to verify metrics exposure:

```bash
curl -sf http://127.0.0.1:8081/metrics | head
```

## Development

- Run `npm test` to compile the TypeScript sources (creating `dist/`) and execute the Node test suite in `test/*.test.js`.
