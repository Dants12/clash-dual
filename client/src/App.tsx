import React, { useEffect, useRef, useState } from 'react';
import Panel from './ui/Panel';
import { Meter } from './ui/Meter';
import CrashDualCanvas from './games/CrashDualCanvas';
import DuelABPanel from './games/DuelABPanel';
import { createWS } from './ws';


export default function App(){
const [ws, setWS] = useState<WebSocket|null>(null);
const uid = useRef<string>('');
const [wallet, setWallet] = useState(0);
const [snap, setSnap] = useState<any>(null);
const [amount, setAmount] = useState(50);
const [side, setSide] = useState<'A'|'B'>('A');


useEffect(() => {
const socket = createWS((m:any) => {
if (m.t === 'hello') { uid.current = m.uid; setWallet(m.wallet.balance); setSnap(m.snapshot); }
else if (m.t === 'snapshot') { setSnap(m.snapshot); }
});
setWS(socket);
return () => socket.close();
},[]);


const send = (o:any) => ws?.readyState===1 && ws.send(JSON.stringify(o));
const bet = () => send({ t:'bet', amount, side });
const cashout = () => send({ t:'cashout' });
const switchMode = (mode:'crash_dual'|'duel_ab') => send({ t:'switch_mode', mode });


const mode = snap?.mode ?? 'crash_dual';
const crash = snap?.crash; const duel = snap?.duel;


return (
<div className="wrap">
<div className="card">
<div className="title">Clash Demo</div>
<div className="space" />


<Panel title="Wallet & Mode">
<Meter label="Balance" value={`$${wallet.toFixed(2)}`} />
<div className="space" />
<div className="row">
<button onClick={()=>switchMode('crash_dual')}>Crash</button>
<button onClick={()=>switchMode('duel_ab')}>A/B Duel</button>
</div>
</Panel>


<div className="space" />
<Panel title="Main bet">
<div className="row">
<input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))}/>
<button onClick={()=>setSide('A')} style={{opacity: side==='A'?1:0.6}}>Side A</button>
<button onClick={()=>setSide('B')} style={{opacity: side==='B'?1:0.6}}>Side B</button>
</div>
<div className="space" />
<div className="row">
<button onClick={bet}>Bet</button>
{mode==='crash_dual' && <button onClick={cashout}>Cashout</button>}
</div>
</Panel>
</div>


<div className="card" style={{gridColumn:'span 1 / span 1'}}>
<div className="title">Dual Crash · Arena</div>
<div className="space" />
{mode==='crash_dual' && crash && (
<CrashDualCanvas mA={crash.mA} mB={crash.mB} targetA={crash.targetA} targetB={crash.targetB} phase={crash.phase}/>
)}
{mode==='duel_ab' && duel && (
<DuelABPanel micro={duel.micro} phase={duel.phase} winner={duel.winner} />
)}
</div>


<div className="card">
<div className="title">Round totals</div>
<div className="space" />
<Meter label="Mode" value={snap?.mode || '-'} />
<Meter label="Bankroll" value={`$${(snap?.bankroll??0).toFixed(0)}`} />
<Meter label="Jackpot" value={`$${(snap?.jackpot??0).toFixed(0)}`} />
<Meter label="Rounds" value={snap?.rounds ?? 0} />
</div>
</div>
);
}
