import React from 'react';
import Panel from '../ui/Panel';


export default function DuelABPanel({micro, winner, phase}:{micro:any; winner?:'A'|'B'; phase:string}){
return (
<Panel title="Duel A vs B">
<div className="row" style={{gap:16}}>
<div style={{flex:1}}>
<b>A</b>
<div className="muted">Speed: {micro?.A?.speed||0}</div>
<div className="muted">Defense: {micro?.A?.defense||0}</div>
</div>
<div style={{flex:1}}>
<b>B</b>
<div className="muted">Speed: {micro?.B?.speed||0}</div>
<div className="muted">Defense: {micro?.B?.defense||0}</div>
</div>
</div>
<div className="space" />
<div className="muted">Phase: {phase} {winner?`• Winner: ${winner}`:''}</div>
</Panel>
);
}
