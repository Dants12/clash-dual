export type WS = ReturnType<typeof createWS>;


export function createWS(onMsg: (m:any)=>void) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = location.host;
  const ws = new WebSocket(`${protocol}//${host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'auth' }));
  ws.onmessage = (ev) => onMsg(JSON.parse(ev.data));
  return ws;
}

