import React, { useEffect, useRef } from 'react';


export default function CrashDualCanvas({ mA, mB, targetA, targetB, phase }:{ mA:number; mB:number; targetA:number; targetB:number; phase:string }){
const ref = useRef<HTMLCanvasElement>(null);
useEffect(() => {
const c = ref.current!; const ctx = c.getContext('2d')!;
let raf = 0;
function draw(){
ctx.clearRect(0,0,c.width,c.height);
// Grid
ctx.globalAlpha = 0.2; ctx.strokeStyle = '#2a3a63';
for(let x=0;x<c.width;x+=50){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,c.height); ctx.stroke(); }
for(let y=0;y<c.height;y+=40){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(c.width,y); ctx.stroke(); }
ctx.globalAlpha = 1;


const toY = (m:number) => c.height - Math.min(c.height-10, Math.log(m)*70);


// A smooth — path
ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = '#8fd1ff';
const yA = toY(mA);
ctx.moveTo(20,c.height-10); ctx.lineTo(c.width-20,yA); ctx.stroke();


// B jumpy
ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = '#ff8fbd';
const yB = toY(mB);
ctx.moveTo(20,c.height-10); ctx.lineTo(c.width-20,yB); ctx.stroke();


// Targets
ctx.setLineDash([6,6]);
ctx.strokeStyle = '#7c89b6';
ctx.beginPath(); ctx.moveTo(20,toY(targetA)); ctx.lineTo(c.width-20,toY(targetA)); ctx.stroke();
ctx.beginPath(); ctx.moveTo(20,toY(targetB)); ctx.lineTo(c.width-20,toY(targetB)); ctx.stroke();
ctx.setLineDash([]);


// Labels
ctx.fillStyle = '#9bb1ff';
ctx.fillText(`A ${mA.toFixed(2)}x → ${targetA.toFixed(2)}x`, 24, 18);
ctx.fillStyle = '#ffb1cf';
ctx.fillText(`B ${mB.toFixed(2)}x → ${targetB.toFixed(2)}x`, 24, 36);
ctx.fillStyle = '#7992d4';
ctx.fillText(`Phase: ${phase}`, 24, 54);


raf = requestAnimationFrame(draw);
}
raf = requestAnimationFrame(draw);
return () => cancelAnimationFrame(raf);
}, [mA,mB,targetA,targetB,phase]);


return <canvas ref={ref} width={900} height={460} />;
}
