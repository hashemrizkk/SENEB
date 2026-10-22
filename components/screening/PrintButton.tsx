"use client";
export default function PrintButton({label}:{label:string}) { return <button className="screening-no-print" type="button" onClick={()=>window.print()}>{label}</button>; }
