import React from 'react';
export default function Panel({title, children}:{title:string; children:React.ReactNode}){
return (
<div className="card">
<div className="title">{title}</div>
<div className="space" />
{children}
</div>
);
}
