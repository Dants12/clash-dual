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

export function createWS(onMsg: (m:any)=>void) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = location.host;
  const ws = new WebSocket(`${protocol}//${host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'auth' }));
  ws.onmessage = (ev) => onMsg(JSON.parse(ev.data));
  return ws;
}
