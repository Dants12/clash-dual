# Clash Dual Client

## WebSocket configuration

- `VITE_WS_URL` — optional WebSocket endpoint for the frontend.
  - Takes precedence over the inferred URL from `window.location`.
  - Set it in `.env` or your deployment environment, for example `VITE_WS_URL=wss://example.com/ws`.
  - When not provided, the client connects to the same origin. During local development it falls back to `ws://<hostname>:8081/ws`.

## Scripts

```bash
npm run dev      # start Vite dev server
npm run build    # type-check and build for production
npm run preview  # locally preview the production build
npm run lint     # run ESLint with the shared configuration
```
