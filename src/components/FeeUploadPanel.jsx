import React, { useState, useRef } from 'react';
import { NB } from '../lib/constants.js';
import { BlueprintGrid } from './DesignPrimitives.jsx';

export default function FeeUploadPanel({ onLoad, onClose }) {
  const [text,setText]=useState(''); const [error,setError]=useState('');
  const fileRef=useRef(null);
  const parse=(raw)=>{
    try{
      const p=JSON.parse(raw); const arr=Array.isArray(p)?p:p.records||Object.values(p);
      if(!arr.length)throw new Error('Empty'); onLoad(arr);
    }catch(e){setError(`Parse error: ${e.message}`);}
  };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(245,242,232,0.97)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, backdropFilter:'blur(6px)' }}>
      <div style={{ background:NB.shadow, border:`1px solid ${NB.ember}70`, width:'min(500px,94vw)' }}>
        <div style={{ background:NB.reactor, borderBottom:`2px solid ${NB.reactor}`,
          padding:'0.875rem 1.25rem', display:'flex', justifyContent:'space-between', alignItems:'center', position:'relative' }}>
          <BlueprintGrid />
          <div style={{ position:'relative' }}>
            <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
              letterSpacing:'0.25em', color:NB.electric, textTransform:'uppercase', marginBottom:3 }}>
              Intelligence Upload
            </div>
            <h3 style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
              fontSize:'1.2rem', fontWeight:700, color:NB.shadow, margin:0 }}>
              Load Fee Scraper Data
            </h3>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:`1px solid ${NB.fuel}`,
            color:NB.void, fontSize:'0.8rem', cursor:'pointer', padding:'0.25rem 0.5rem',
            fontFamily:"'IBM Plex Mono','Consolas',monospace" }}>✕</button>
        </div>
        <div style={{ padding:'1.25rem' }}>
          <div onClick={()=>fileRef.current?.click()} style={{ background:NB.void,
            border:`2px dashed ${NB.mist}`, padding:'1.25rem', textAlign:'center',
            cursor:'pointer', marginBottom:'0.75rem' }}>
            <div style={{ fontSize:'1.5rem', marginBottom:4 }}>📂</div>
            <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.7rem',
              letterSpacing:'0.15em', color:NB.electric, textTransform:'uppercase' }}>
              Upload results.json
            </div>
            <input ref={fileRef} type="file" accept=".json" style={{ display:'none' }} onChange={e=>{
              const f=e.target.files[0]; if(!f)return;
              const r=new FileReader(); r.onload=ev=>parse(ev.target.result); r.readAsText(f);
            }}/>
          </div>
          <textarea value={text} onChange={e=>{setText(e.target.value);setError('');}}
            placeholder='[{"name":"Palo Alto","county":"Santa Clara","status":"success","fees":{"estimatedTotalNewSFR":142000,...}}]'
            style={{ width:'100%', height:80, background:NB.void, border:`1px solid ${NB.fog}`,
              padding:'0.5rem', color:NB.fuel, fontSize:'0.75rem',
              fontFamily:"'IBM Plex Mono','Consolas',monospace", resize:'vertical', boxSizing:'border-box' }}/>
          {error&&<div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem',
            color:NB.blood, marginTop:4 }}>{error}</div>}
          <div style={{ display:'flex', gap:8, marginTop:'0.75rem' }}>
            <button onClick={()=>parse(text)} disabled={!text.trim()}
              style={{ flex:1, padding:'0.6rem', background:text.trim()?NB.void:'transparent',
                border:`1px solid ${text.trim()?NB.ember:NB.fog}`,
                color:text.trim()?NB.ember:NB.fog,
                fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.7rem',
                letterSpacing:'0.2em', textTransform:'uppercase', cursor:text.trim()?'pointer':'not-allowed' }}>
              Load Data
            </button>
            <button onClick={onClose} style={{ padding:'0.6rem 1rem', background:'none',
              border:`1px solid ${NB.fog}`, color:NB.oxide,
              fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.7rem',
              letterSpacing:'0.15em', textTransform:'uppercase', cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
