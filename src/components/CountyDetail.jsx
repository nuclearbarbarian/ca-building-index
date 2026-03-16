import React, { useState } from 'react';
import { NB, LAYERS, getTier } from '../lib/constants.js';
import { SectionLabel, DataVal, TierStamp, BlueprintGrid, LivePip } from './DesignPrimitives.jsx';

const HE_TOOLTIP = 'Every California jurisdiction must adopt a state-certified Housing Element — a detailed plan showing where and how it will accommodate its RHNA housing quota. Non-compliant cities have failed this review, meaning their zoning is legally inadequate and they lose certain discretionary protections against housing appeals. Compliance is the minimum bar; many "compliant" cities still obstruct building in practice.';

function HETooltipLabel() {
  const [show, setShow] = useState(false);
  const [pos,  setPos]  = useState({ x:0, y:0 });
  return (
    <span style={{ position:'relative', display:'inline-block' }}
      onMouseEnter={e=>{ setShow(true); setPos({ x:e.clientX, y:e.clientY }); }}
      onMouseMove={e=>setPos({ x:e.clientX, y:e.clientY })}
      onMouseLeave={()=>setShow(false)}>
      <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
        letterSpacing:'0.15em', color:NB.oxide, textTransform:'uppercase',
        cursor:'help', borderBottom:`1px dotted ${NB.fog}` }}>
        HE Status{' '}
      </span>
      {show && (
        <div style={{
          position:'fixed',
          left: Math.min(pos.x, (typeof window!=='undefined'?window.innerWidth:800) - 300),
          top:  pos.y + 14,
          zIndex:9999,
          width:280,
          background:NB.void,
          border:`1px solid ${NB.mist}`,
          borderLeft:`3px solid ${NB.electric}`,
          padding:'0.65rem 0.8rem',
          pointerEvents:'none',
          boxShadow:`0 8px 32px rgba(44,36,22,.14), 0 0 0 1px ${NB.fog}`,
          animation:'fadeUp .12s ease',
        }}>
          <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
            letterSpacing:'0.2em', color:NB.electric, textTransform:'uppercase',
            fontWeight:600, marginBottom:'0.35rem' }}>
            Housing Element Status
          </div>
          <p style={{ fontFamily:"'Source Serif 4',Georgia,serif", fontSize:'0.76rem',
            color:NB.fuel, lineHeight:1.65, margin:0 }}>
            {HE_TOOLTIP}
          </p>
        </div>
      )}
    </span>
  );
}

export default function CountyDetail({ county, data, liveFlags, citiesInCounty, onCityClick, onLoadScraper }) {
  const tier = getTier(data.composite);
  return (
    <div style={{ background:NB.shadow, border:`1px solid ${NB.mist}`, borderTop:`2px solid ${NB.reactor}` }}>
      <div style={{ padding:'1rem', borderBottom:`1px solid ${NB.fog}` }}>
        <BlueprintGrid />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative' }}>
          <div>
            <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
              letterSpacing:'0.08em', color:NB.fuel, fontVariant:'small-caps', marginBottom:3 }}>
              County · California
            </div>
            <h2 style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
              fontWeight:700, fontSize:'1.6rem', color:NB.reactor, margin:'0 0 2px', lineHeight:1 }}>
              {county}
            </h2>
            <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem', color:NB.oxide }}>
              Pop. {data.population?.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
              fontSize:'3rem', fontWeight:700, color:tier.color, lineHeight:1 }}>
              {Math.round(data.composite*100)}
            </div>
            <TierStamp tier={tier} />
          </div>
        </div>
      </div>

      <div style={{ padding:'0.75rem 1rem' }}>
        <SectionLabel>Factor Analysis</SectionLabel>
        <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:'0.75rem' }}>
          {Object.entries(LAYERS).filter(([k])=>k!=='composite').map(([key,cfg])=>{
            const val=data[key];
            const bar=cfg.categorical?(val==='subject'?80:20):(data.normalized?.[key]||0)*100;
            const isLive=liveFlags.has(key);
            return (
              <div key={key} style={{ display:'grid', gridTemplateColumns:'80px 1fr 45px 12px', gap:5, alignItems:'center' }}>
                <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
                  letterSpacing:'0.1em', color:NB.oxide, textTransform:'uppercase', overflow:'hidden',
                  textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cfg.label}</span>
                <div style={{ height:3, background:NB.fog }}>
                  <div style={{ height:'100%', background:cfg.color, width:`${bar}%`, transition:'width .3s' }}/>
                </div>
                <DataVal color={cfg.color} size="0.78rem">{cfg.format?cfg.format(val):val}</DataVal>
                {isLive&&<LivePip/>}
              </div>
            );
          })}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem',
          padding:'0.6rem 0', borderTop:`1px solid ${NB.fog}`, marginBottom:'0.6rem' }}>
          <div style={{ position:'relative' }}>
            <HETooltipLabel />
            <DataVal color={data.heCompliance==='compliant'?NB.electric:NB.blood} size="0.75rem">
              {data.heCompliance==='compliant'?'COMPLIANT':'NON-COMPLIANT'}
            </DataVal>
          </div>
          <div>
            <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
              letterSpacing:'0.15em', color:NB.oxide, textTransform:'uppercase' }}>Median </span>
            <DataVal size="0.75rem">${(data.medianHomePrice/1000).toFixed(0)}K</DataVal>
          </div>
        </div>

        {/* City grid */}
        {citiesInCounty.length>0&&(
          <div>
            <SectionLabel>Cities in Territory ({citiesInCounty.length})</SectionLabel>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3,
              maxHeight:170, overflowY:'auto' }}>
              {citiesInCounty.sort((a,b)=>(b.composite||0)-(a.composite||0)).map(city=>{
                const t=getTier(city.composite||0);
                return (
                  <button key={city.name} onClick={()=>onCityClick(city.name)}
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 6px',
                      background:NB.void, border:`1px solid ${NB.fog}`,
                      cursor:'pointer', textAlign:'left', transition:'border-color .1s' }}>
                    <div style={{ width:4, height:4, background:t.color, flexShrink:0 }}/>
                    <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.65rem',
                      letterSpacing:'0.05em', color:NB.fuel, flex:1, overflow:'hidden',
                      textOverflow:'ellipsis', whiteSpace:'nowrap', textTransform:'uppercase' }}>
                      {city.name}
                    </span>
                    {city.hasFeeData&&<span style={{ fontSize:'0.55rem', color:NB.electric }}>⚡</span>}
                    <DataVal color={t.color} size="0.7rem">{Math.round((city.composite||0)*100)}</DataVal>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!citiesInCounty.some(c=>c.hasFeeData)&&(
          <button onClick={onLoadScraper}
            style={{ marginTop:'0.6rem', width:'100%', padding:'0.5rem',
              background:NB.void, border:`1px dashed ${NB.electric}40`,
              color:NB.electric, fontFamily:"'Source Serif 4','Charter',Georgia,serif",
              fontSize:'0.6rem', letterSpacing:'0.2em', textTransform:'uppercase', cursor:'pointer' }}>
            📂 Load Fee Scraper Data
          </button>
        )}
      </div>
    </div>
  );
}
