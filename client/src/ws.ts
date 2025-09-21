export type WS = ReturnType<typeof createWS>;


export function createWS(onMsg: (m:any)=>void) {
const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host.replace(/:\d+$/,'') + ':8081';
const ws = new WebSocket(url);
ws.onopen = () => ws.send(JSON.stringify({ t: 'auth' }));
ws.onmessage = (ev) => onMsg(JSON.parse(ev.data));
return ws;
}
