export type WS = ReturnType<typeof createWS>;

export const UID_STORAGE_KEY = 'clash-dual-uid';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getStoredUid(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(UID_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistUid(value: string) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(UID_STORAGE_KEY, value);
  } catch {
    // ignore write errors (e.g., storage disabled)
  }
}

function resolveWSUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:8081/ws';
  }

  const envUrl = import.meta.env?.VITE_WS_URL;
  if (envUrl) {
    return envUrl;
  }

  const { hostname, host, protocol } = window.location;

  if (import.meta.env?.DEV) {
    return `ws://${hostname || 'localhost'}:8081/ws`;
  }

  const scheme = protocol === 'https:' ? 'wss:' : 'ws:';
  const effectiveHost = host || hostname || 'localhost';
  return `${scheme}//${effectiveHost}/ws`;
}

export function createWS(onMsg: (m:any)=>void) {
  const ws = new WebSocket(resolveWSUrl());
  ws.onopen = () => ws.send(JSON.stringify({ t: 'auth' }));
  ws.onmessage = (ev) => onMsg(JSON.parse(ev.data));
  return ws;
}
