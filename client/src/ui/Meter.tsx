export function Meter({label, value}:{label:string; value:string|number}){
return <div className="row" style={{justifyContent:'space-between'}}><span className="muted">{label}</span><b>{value}</b></div>;
}
