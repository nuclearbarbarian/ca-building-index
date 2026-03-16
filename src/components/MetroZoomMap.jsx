import React from 'react';
import { NB, METROS, TIERS, clamp, scoreColor } from '../lib/constants.js';
import { BlueprintGrid } from './DesignPrimitives.jsx';

export default function MetroZoomMap({ metroKey, cityScores, geoBounds, selectedCity, onCityClick, onClose }) {
  const metro = METROS[metroKey];
  if (!metro) return null;
  const [latMin,latMax,lonMin,lonMax] = metro.bounds;
  const W=420, H=360, PAD=28;
  const refLat = (latMin+latMax)/2;
  const cosLat = Math.cos(refLat * Math.PI/180);
  const lonSpan = lonMax-lonMin, latSpan = latMax-latMin;
  const xScale = (W-PAD*2) / lonSpan;
  const yScale = (H-PAD*2) / latSpan;
  const scale = Math.min(xScale / cosLat, yScale);
  const drawW = lonSpan * scale * cosLat;
  const drawH = latSpan * scale;
  const xOff = PAD + (W-PAD*2-drawW)/2;
  const yOff = PAD + (H-PAD*2-drawH)/2;
  const toSvg=(lat,lon)=>({
    x: xOff + (lon-lonMin)/lonSpan * drawW,
    y: yOff + (latMax-lat)/latSpan * drawH,
  });
  const cities = Object.values(cityScores).filter(c=>c.lat>=latMin&&c.lat<=latMax&&c.lon>=lonMin&&c.lon<=lonMax);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(245,242,232,0.97)', display:'flex',
      alignItems:'center', justifyContent:'center', zIndex:200, backdropFilter:'blur(6px)' }}>
      <div style={{ background:NB.shadow, border:`1px solid ${NB.ember}60`,
        width:'min(660px,96vw)', maxHeight:'94vh', display:'flex', flexDirection:'column', gap:0, overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:NB.reactor, borderBottom:`2px solid ${NB.reactor}`,
          padding:'0.875rem 1.25rem', display:'flex', justifyContent:'space-between', alignItems:'center', position:'relative' }}>
          <BlueprintGrid />
          <div style={{ position:'relative' }}>
            <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem', letterSpacing:'0.25em',
              color:NB.oxide, textTransform:'uppercase', marginBottom:3 }}>Field Report · Metro Zone</div>
            <h2 style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
              fontSize:'1.4rem', fontWeight:700, color:NB.shadow, margin:0 }}>
              {metroKey}
            </h2>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:`1px solid ${NB.fuel}`,
            color:NB.void, fontSize:'0.8rem', cursor:'pointer', padding:'0.3rem 0.6rem',
            fontFamily:"'IBM Plex Mono','Consolas',monospace" }}>✕ CLOSE</button>
        </div>

        {/* Blueprint map */}
        <div style={{ padding:'1rem', position:'relative', background:NB.void }}>
          <BlueprintGrid />
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', display:'block', position:'relative' }}>
            {/* County watermarks */}
            {metro.counties.map(county=>{
              const cs=cities.filter(c=>c.county===county);
              if(!cs.length)return null;
              const xs=cs.map(c=>toSvg(c.lat,c.lon).x), ys=cs.map(c=>toSvg(c.lat,c.lon).y);
              const cx=xs.reduce((a,b)=>a+b,0)/xs.length, cy=ys.reduce((a,b)=>a+b,0)/ys.length;
              return <text key={county} x={cx} y={cy} fill={`${NB.electric}40`} fontSize="11"
                textAnchor="middle" fontFamily="'Source Serif 4','Charter',Georgia,serif" letterSpacing="2" fontWeight="600">
                {county.toUpperCase()}
              </text>;
            })}
            {/* City dots */}
            {cities.sort((a,b)=>a.population-b.population).map(city=>{
              const pt=toSvg(city.lat,city.lon);
              const r=clamp(Math.pow(city.population,0.27),5,20);
              const s=city.composite||0;
              const col=scoreColor(s);
              const isSelected=selectedCity===city.name;
              return (
                <g key={city.name} style={{cursor:'pointer'}} onClick={()=>onCityClick(city.name)}>
                  {isSelected&&<circle cx={pt.x} cy={pt.y} r={r+5} fill="none" stroke={NB.reactor} strokeWidth="1.5"/>}
                  <circle cx={pt.x} cy={pt.y} r={r} fill={col}
                    fillOpacity={city.hasFeeData?0.88:0.35}
                    stroke={city.hasFeeData?col:NB.fog} strokeWidth={city.hasFeeData?1:0.6}/>
                  {city.hasFeeData&&r>8&&<text x={pt.x} y={pt.y+1} textAnchor="middle" dominantBaseline="middle"
                    fill="#FDFCF9" fontSize={r>12?"9":"7"} fontWeight="700"
                    fontFamily="'IBM Plex Mono','Consolas',monospace">{Math.round(s*100)}</text>}
                  <text x={pt.x} y={pt.y+r+9} textAnchor="middle"
                    fill={isSelected?NB.reactor:NB.oxide} fontSize={isSelected?8:7}
                    fontFamily="'Source Serif 4','Charter',Georgia,serif" letterSpacing="1" fontWeight="600">
                    {city.name.toUpperCase().split(' ')[0]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Tier legend */}
        <div style={{ padding:'0.75rem 1.25rem', background:NB.shadow,
          borderTop:`1px solid ${NB.fog}`, display:'flex', gap:'1rem', flexWrap:'wrap' }}>
          {TIERS.slice().reverse().map(t=>(
            <div key={t.label} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:8, height:8, background:t.color, borderRadius:2 }} />
              <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
                letterSpacing:'0.1em', color:NB.oxide, textTransform:'uppercase' }}>{t.label}</span>
            </div>
          ))}
          <span style={{ marginLeft:'auto', fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.65rem', color:NB.fog }}>
            {cities.filter(c=>c.hasFeeData).length} scraped · {cities.length} total
          </span>
        </div>
      </div>
    </div>
  );
}
