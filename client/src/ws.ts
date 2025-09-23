export type WS = ReturnType<typeof createWS>;

export const UID_STORAGE_KEY = 'clash-dual-uid';

const HEARTBEAT_INTERVAL_MS = 15000;
const WATCHDOG_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS;
const PING_MSG = JSON.stringify({ t: 'ping' });
const PONG_MSG = JSON.stringify({ t: 'pong' });

type ListenerArgs = Parameters<WebSocket['addEventListener']>;

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

  const { protocol, host, hostname } = window.location;
  const proto = protocol === 'https:' ? 'wss:' : 'ws:';
  if (host) {
    return `${proto}//${host}/ws`;
  }

  if (hostname) {
    return `${proto}//${hostname}/ws`;
  }

  return `${proto}//localhost/ws`;
}

export function createWS(onMsg: (m: any) => void) {
  if (typeof window === 'undefined') {
    throw new Error('createWS can only be used in a browser environment');
  }

  const listeners: ListenerArgs[] = [];
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let shouldReconnect = true;
  let reconnectAttempts = 0;

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer !== null) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const stopWatchdog = () => {
    if (watchdogTimer !== null) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  };

  const armWatchdog = () => {
    stopWatchdog();
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    watchdogTimer = setTimeout(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.close();
      } catch {}
    }, WATCHDOG_TIMEOUT_MS);
  };

  const sendHeartbeat = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(PING_MSG);
      armWatchdog();
    } catch {}
  };

  const startHeartbeat = () => {
    const tick = () => {
      heartbeatTimer = setTimeout(() => {
        sendHeartbeat();
        tick();
      }, HEARTBEAT_INTERVAL_MS);
    };
    stopHeartbeat();
    armWatchdog();
    tick();
  };

  const attachExternalListeners = (target: WebSocket) => {
    for (const args of listeners) {
      if (!args[1]) continue;
      target.addEventListener(args[0], args[1], args[2]);
    }
  };

  const scheduleReconnect = () => {
    if (!shouldReconnect || reconnectTimer !== null) return;
    const delay = Math.min(15000, 1000 * 2 ** reconnectAttempts);
    reconnectAttempts = Math.min(reconnectAttempts + 1, 10);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const handleOpen = () => {
    reconnectAttempts = 0;
    clearReconnectTimer();
    const storedUid = getStoredUid();
    const payload: Record<string, unknown> = { t: 'auth' };
    if (storedUid) {
      payload.uid = storedUid;
    }
    try {
      socket?.send(JSON.stringify(payload));
    } catch {}
    startHeartbeat();
  };

  const handleClose = () => {
    stopHeartbeat();
    stopWatchdog();
    socket = null;
    scheduleReconnect();
  };

  const handleError = () => {
    if (!socket) return;
    try {
      socket.close();
    } catch {}
  };

  const handleMessage = (ev: MessageEvent) => {
    armWatchdog();
    const { data } = ev;
    if (typeof data !== 'string') return;
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    if (parsed?.t === 'pong') {
      return;
    }

    if (parsed?.t === 'ping') {
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(PONG_MSG);
        } catch {}
      }
      return;
    }

    onMsg(parsed);
  };

  const connect = () => {
    stopHeartbeat();
    stopWatchdog();
    try {
      socket = new WebSocket(resolveWSUrl());
    } catch {
      socket = null;
      scheduleReconnect();
      return;
    }
    socket.addEventListener('open', handleOpen);
    socket.addEventListener('close', handleClose);
    socket.addEventListener('error', handleError);
    socket.addEventListener('message', handleMessage);
    attachExternalListeners(socket);
  };

  const wsProxy: Record<string | symbol, unknown> = {};

  Object.defineProperties(wsProxy, {
    readyState: {
      get() {
        return socket?.readyState ?? WebSocket.CLOSED;
      }
    },
    close: {
      value(code?: number, reason?: string) {
        shouldReconnect = false;
        stopHeartbeat();
        stopWatchdog();
        clearReconnectTimer();
        if (socket) {
          try {
            socket.close(code, reason);
          } catch {}
        }
      }
    },
    send: {
      value(data: Parameters<WebSocket['send']>[0]) {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(data);
        }
      }
    },
    addEventListener: {
      value(type: ListenerArgs[0], listener: ListenerArgs[1], options?: ListenerArgs[2]) {
        if (!listener) return;
        listeners.push([type, listener, options]);
        if (socket) {
          socket.addEventListener(type, listener, options);
        }
      }
    },
    removeEventListener: {
      value(type: ListenerArgs[0], listener: ListenerArgs[1], options?: ListenerArgs[2]) {
        if (!listener) return;
        for (let i = listeners.length - 1; i >= 0; i -= 1) {
          const entry = listeners[i];
          if (entry[0] === type && entry[1] === listener && entry[2] === options) {
            listeners.splice(i, 1);
          }
        }
        if (socket) {
          socket.removeEventListener(type, listener, options);
        }
      }
    }
  });

  connect();

  return wsProxy as unknown as WebSocket;
}
