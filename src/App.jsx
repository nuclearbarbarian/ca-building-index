import React, { useState, useMemo, useCallback, useEffect } from 'react';
import defaultFeeData from './data/feeData.json';
import {
  NB, TIERS, getTier, scoreColor,
  LAYERS, BASELINE, COUNTY_SHAPES,
  METROS, CITY_GEO, CITY_LOOKUP,
  normCounty, normCity, clamp, fmtK,
} from './lib/constants.js';
import { scoreMetrics, buildCityRecord } from './lib/scoring.js';
import { useCountyGeoJSON, useHCDData } from './lib/hooks.js';
import { SectionLabel, DataVal, TierStamp, BlueprintGrid, LivePip } from './components/DesignPrimitives.jsx';
import MetroZoomMap from './components/MetroZoomMap.jsx';
import CityDetail from './components/CityDetail.jsx';
import CountyDetail from './components/CountyDetail.jsx';
import FeeUploadPanel from './components/FeeUploadPanel.jsx';
import CompareView from './components/CompareView.jsx';
import { exportCitiesCSV, exportCountiesCSV, encodeShareURL, decodeShareURL } from './lib/export.js';


export default function CaliforniaBuildingIndex() {
  const { fetchStatus, countyLive, cityLive, sources, lastFetched, refresh } = useHCDData();
  const { paths:geoPaths, bounds:geoBounds, status:geoStatus } = useCountyGeoJSON();

  const [activeLayer,    setActiveLayer]    = useState('composite');
  const [hoveredLayer,   setHoveredLayer]   = useState(null);
  const [tooltipPos,     setTooltipPos]     = useState({ x:0, y:0 });
  const [hoveredCounty,  setHoveredCounty]  = useState(null);
  const [selectedCounty, setSelectedCounty] = useState(null);
  const [selectedCity,   setSelectedCity]   = useState(null);
  const [showSources,    setShowSources]    = useState(false);
  const [showUpload,     setShowUpload]     = useState(false);
  const [activeMetro,    setActiveMetro]    = useState(null);
  const [scraperRecords, setScraperRecords] = useState(()=>{
    try { const s=localStorage.getItem('ca-fee-data'); return s?JSON.parse(s):defaultFeeData; } catch{return defaultFeeData;}
  });
  const [rankTab,        setRankTab]        = useState('county');
  const [showCompare,    setShowCompare]    = useState(false);
  const [toast,          setToast]          = useState(null);
  const [showFAI,        setShowFAI]        = useState(false);

  // Read URL hash on mount for shareable links
  useEffect(()=>{
    const shared = decodeShareURL();
    if (!shared) return;
    if (shared.layer && LAYERS[shared.layer])  setActiveLayer(shared.layer);
    if (shared.county) setSelectedCounty(shared.county);
    if (shared.city)   setSelectedCity(shared.city);
  },[]);

  // Scraper lookup
  const scraperByCity = useMemo(()=>{
    if(!scraperRecords)return {};
    const map={};
    for(const r of scraperRecords){
      const k1=`${normCity(r.name)}|${normCounty(r.county||'').toLowerCase()}`;
      map[k1]=r; map[normCity(r.name)]=r;
    }
    return map;
  },[scraperRecords]);

  // County metrics
  const countyMetrics = useMemo(()=>{
    const merged={};
    for(const[county,base]of Object.entries(BASELINE)){
      const hcd=countyLive[county]||{};
      let feesOverride=null;
      if(scraperRecords){
        const valid=scraperRecords.filter(r=>normCounty(r.county||'')===county&&r.status==='success'&&r.fees?.estimatedTotalNewSFR>0);
        if(valid.length>0){
          const tp=valid.reduce((s,r)=>s+(r.population||1),0);
          feesOverride=Math.round(valid.reduce((s,r)=>s+(r.fees.estimatedTotalNewSFR||0)*(r.population||1),0)/tp);
        }
      }
      merged[county]={...base,...hcd,...(feesOverride?{feesPerUnit:feesOverride}:{})};
    }
    return merged;
  },[countyLive,scraperRecords]);

  const countyScores = useMemo(()=>{
    const out={};
    for(const[c,d]of Object.entries(countyMetrics))out[c]=scoreMetrics(d);
    return out;
  },[countyMetrics]);

  const cityScores = useMemo(()=>{
    const out={};
    for(const[,geoEntry]of Object.entries(CITY_LOOKUP)){
      if(!geoEntry||out[geoEntry.name])continue;
      const county=normCounty(geoEntry.county);
      const sKey1=`${normCity(geoEntry.name)}|${county.toLowerCase()}`;
      const scraperRec=scraperByCity[sKey1]||scraperByCity[normCity(geoEntry.name)];
      const hcdCity=cityLive[sKey1]||cityLive[normCity(geoEntry.name)];
      const countyBase=countyMetrics[county]||{};
      out[geoEntry.name]=scoreMetrics(buildCityRecord(geoEntry,scraperRec,hcdCity,countyBase));
    }
    return out;
  },[scraperByCity,cityLive,countyMetrics]);

  const citiesByCounty = useMemo(()=>{
    const map={};
    for(const city of Object.values(cityScores)){
      const c=normCounty(city.county);
      if(!map[c])map[c]=[];
      map[c].push(city);
    }
    return map;
  },[cityScores]);

  const rankedCounties = useMemo(()=>Object.entries(countyScores).sort((a,b)=>b[1].composite-a[1].composite),[countyScores]);
  const rankedCities   = useMemo(()=>Object.values(cityScores).filter(c=>c.hasFeeData).sort((a,b)=>(b.composite||0)-(a.composite||0)),[cityScores]);

  // Continuous red gradient for county fills: NB.void → rose → NB.ember → NB.blood
  const countyGradient = useCallback((t)=>{
    // 3-stop interpolation: void(245,242,232) → ember(139,43,43) → blood(107,31,31)
    const c = clamp(t,0,1);
    let r,g,b;
    if(c<0.5){
      const p=c/0.5;
      r=Math.round(245+(139-245)*p);
      g=Math.round(242+(43-242)*p);
      b=Math.round(232+(43-232)*p);
    } else {
      const p=(c-0.5)/0.5;
      r=Math.round(139+(107-139)*p);
      g=Math.round(43+(31-43)*p);
      b=Math.round(43+(31-43)*p);
    }
    return `rgb(${r},${g},${b})`;
  },[]);

  const getCountyFill = useCallback((county)=>{
    const d=countyScores[county]; if(!d)return NB.void;
    let intensity = activeLayer==='composite' ? d.composite
      : LAYERS[activeLayer]?.categorical ? (d[activeLayer]==='subject'?0.8:0.2)
      : (d.normalized[activeLayer]||0);
    return countyGradient(intensity);
  },[activeLayer,countyScores,countyGradient]);

  const activeCounty = hoveredCounty||selectedCounty;
  const liveFlags    = activeCounty ? new Set(Object.keys(countyLive[activeCounty]||{})) : new Set();
  const activeCity   = selectedCity ? cityScores[selectedCity] : null;
  const hcdOk        = fetchStatus==='success'||fetchStatus==='partial';
  const scraperCities = rankedCities.length;

  const statusCfg = {
    idle:    { color:NB.fog,      label:'INITIALIZING' },
    fetching:{ color:NB.electric, label:'CONNECTING TO HCD' },
    partial: { color:NB.fuel,     label:`PARTIAL · ${Object.keys(countyLive).length} COUNTIES` },
    success: { color:NB.electric, label:`LIVE · ${Object.keys(countyLive).length} COUNTIES` },
    error:   { color:NB.blood,    label:'OFFLINE · BASELINE ESTIMATES' },
  }[fetchStatus]||{ color:NB.fog, label:'…' };

  return (
    <div style={{ minHeight:'100vh', background:NB.void, color:NB.reactor,
      fontFamily:"'Source Serif 4',Georgia,serif" }}>
      <style>{`
        ${NB.fonts}
        @keyframes pip{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(1.5)}}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;}
        .cp{cursor:pointer;transition:background .1s}.cp:hover{background:rgba(26,26,26,.04)}
        .nb-btn{transition:all .12s;cursor:pointer}.nb-btn:hover{opacity:.8}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:${NB.void}}
        ::-webkit-scrollbar-thumb{background:${NB.mist}}
        select,input{font-family:'Source Serif 4',Georgia,serif}
        button{border-radius:0!important}
      `}</style>

      {toast&&<div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
        zIndex:999, background:NB.reactor, color:NB.shadow, padding:'8px 20px',
        fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem',
        letterSpacing:'0.1em', border:`1px solid ${NB.electric}`,
        animation:'fadeUp .2s ease' }}>{toast}</div>}
      {showUpload&&<FeeUploadPanel onLoad={r=>{try{localStorage.setItem('ca-fee-data',JSON.stringify(r));}catch{}setScraperRecords(r);setShowUpload(false);}} onClose={()=>setShowUpload(false)}/>}
      {showCompare&&<CompareView cityScores={cityScores} onClose={()=>setShowCompare(false)}/>}
      {activeMetro&&<MetroZoomMap metroKey={activeMetro} cityScores={cityScores}
        geoBounds={geoBounds}
        selectedCity={selectedCity} onCityClick={n=>{setSelectedCity(n);setActiveMetro(null);}} onClose={()=>setActiveMetro(null)}/>}

      {/* ── MASTHEAD ── */}
      <div style={{ background:NB.reactor, borderBottom:`2px solid ${NB.reactor}`,
        padding:'1.25rem 1.5rem 1.5rem', textAlign:'center' }}>
        <div style={{ maxWidth:1200, margin:'0 auto' }}>
          {/* Top row: FAI logo + SOURCES */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.75rem' }}>
            <div style={{ position:'relative', paddingBottom:6 }}
              onMouseEnter={()=>setShowFAI(true)} onMouseLeave={()=>setShowFAI(false)}>
              <svg viewBox="0 0 1910 1003" width="91" height="48" style={{ display:'block', cursor:'pointer' }}>
                <path d="M426.01.6l407.96,500.92-407.96,500.92V.6h0Z" fill={NB.shadow}/>
                <path d="M0,.6l407.96,500.92L0,1002.43V.59h0Z" fill={NB.shadow}/>
                <path d="M1111.6,998.9v-472.9h147.97v-119.65h-147.97V131.44h167.88V1.82h-334.35v997.09h166.47Z" fill={NB.shadow}/>
                <path d="M1355.54,1.81l-106.71,997.09h149.39l27.03-273.49h99.6l25.61,273.49h156.5L1597.41,1.81h-241.87ZM1476.48,199.8l36.99,401.69h-76.83l39.84-401.69h0Z" fill={NB.shadow}/>
                <path d="M1739.27.38v998.51h170.73V.38h-170.73Z" fill={NB.shadow}/>
              </svg>
              {showFAI&&(
                <div style={{ position:'absolute', top:'100%', left:0, zIndex:999, width:280,
                  background:NB.shadow, border:`1px solid ${NB.mist}`, padding:'0.75rem 1rem',
                  animation:'fadeUp .15s ease' }}>
                  <p style={{ fontFamily:"'Source Serif 4',Georgia,serif", fontSize:'0.78rem',
                    color:NB.fuel, lineHeight:1.6, margin:0 }}>
                    This is a Foundation for American Innovation project. Support this project
                    and others like it{' '}
                    <a href="https://www.thefai.org/donate" target="_blank" rel="noreferrer"
                      style={{ color:NB.electric, textDecoration:'underline' }}>here</a>.
                  </p>
                </div>
              )}
            </div>
            <div style={{ position:'relative' }}
              onMouseEnter={()=>setShowSources(true)}
              onMouseLeave={()=>setShowSources(false)}>
              <button className="nb-btn"
                style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.65rem',
                  letterSpacing:'0.15em', color:NB.mist, background:'none',
                  border:`1px solid ${NB.mist}80`, padding:'4px 10px',
                  textTransform:'uppercase', cursor:'pointer' }}>
                Sources
              </button>
              {showSources&&(
                <div style={{ position:'absolute', top:'100%', right:0, zIndex:999, width:380,
                  background:NB.shadow, border:`1px solid ${NB.mist}`, padding:'1rem 1.25rem',
                  animation:'fadeUp .15s ease', maxHeight:'80vh', overflowY:'auto' }}>
                  <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
                    letterSpacing:'0.25em', color:NB.electric, textTransform:'uppercase',
                    fontWeight:600, marginBottom:'0.5rem', paddingBottom:'0.4rem',
                    borderBottom:`1px solid ${NB.fog}` }}>Data Sources</div>
                  {[
                    ['HCD Annual Progress Reports','CA Dept of Housing & Community Development · data.ca.gov',
                      'Permit counts & housing production by jurisdiction'],
                    ['Housing Element / SB 35 Status','CA Dept of Housing & Community Development · data.ca.gov',
                      'Housing element compliance & SB 35 eligibility determinations'],
                    ['RHNA Progress Report','CA Dept of Housing & Community Development · data.ca.gov',
                      'Regional Housing Needs Allocation fulfillment by jurisdiction'],
                    ['CA County Boundaries','CA State GIS Open Data · gis.data.ca.gov',
                      'GeoJSON county boundaries for the interactive map'],
                    ['Baseline Jurisdiction Estimates','Compiled · state & local sources',
                      'Permit timelines, CEQA risk, coastal/fire zone coverage, approval rates'],
                    ['CEQA Environmental Review','CEQAnet / Office of Planning & Research · ceqanet.opr.ca.gov',
                      'EIR rates, categorical exemptions, average review days for 121 jurisdictions'],
                    ['Municipal Development Fee Schedules','City websites (scraped)',
                      'Impact fees for 120+ cities: transportation, park, water, sewer, affordable housing in-lieu'],
                    ['Carrying Cost Estimator','Methodology · industry benchmarks',
                      'Land at 20% of median home price; $35K/unit pre-dev soft costs; 8.5% construction loan rate; holding period = county permit timeline'],
                  ].map(([title,source,desc])=>(
                    <div key={title} style={{ padding:'0.5rem 0', borderBottom:`1px solid ${NB.fog}30` }}>
                      <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
                        fontSize:'0.75rem', fontWeight:700, color:NB.reactor, marginBottom:2 }}>{title}</div>
                      <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
                        fontSize:'0.55rem', color:NB.electric, marginBottom:2 }}>{source}</div>
                      <div style={{ fontFamily:"'Source Serif 4',Georgia,serif",
                        fontSize:'0.7rem', fontStyle:'italic', color:NB.oxide, lineHeight:1.5 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.72rem',
            letterSpacing:'0.1em', color:NB.oxide, textTransform:'uppercase', marginBottom:'0.5rem' }}>
            California Housing Policy &bull; All 58 Counties &bull; 120+ Cities
          </div>
          <h1 style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
            fontWeight:700, fontSize:'clamp(1.6rem,4vw,2.4rem)', color:NB.shadow,
            margin:'0 0 0.75rem', lineHeight:1.1, letterSpacing:'0.05em', textTransform:'uppercase' }}>
            Building Difficulty Index
          </h1>
          <p style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.9rem',
            fontStyle:'italic', color:'#B8B8B8', maxWidth:580, lineHeight:1.6,
            margin:'0 auto' }}>
            Composite scoring of regulatory friction, fee burden, and permitting obstruction
            across California jurisdictions.
          </p>
          <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.62rem',
            letterSpacing:'0.12em', color:NB.fog, textTransform:'uppercase', marginTop:'0.5rem' }}>
            Last Updated: {lastFetched ? lastFetched.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : 'March 15, 2026'}
          </div>
        </div>
      </div>

      {/* ── STATUS BARS ── */}
      <div style={{ maxWidth:1200, margin:'0 auto', padding:'0.75rem 1.5rem 0',
        display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}>
        {/* HCD */}
        <div style={{ background:NB.shadow, border:`1px solid ${NB.fog}`,
          padding:'0.5rem 0.875rem', display:'flex', alignItems:'center', gap:10 }}>
          <LivePip color={statusCfg.color} active={fetchStatus==='success'||fetchStatus==='partial'||fetchStatus==='fetching'}/>
          <span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.68rem',
            letterSpacing:'0.1em', color:statusCfg.color, flex:1 }}>
            HCD DATASTORE · {statusCfg.label}
          </span>
          {lastFetched&&<span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
            fontSize:'0.6rem', color:NB.fog }}>{lastFetched.toLocaleTimeString()}</span>}
          <button onClick={refresh} disabled={fetchStatus==='fetching'} className="nb-btn"
            style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem',
              color:fetchStatus==='fetching'?NB.fog:NB.electric, background:'none',
              border:`1px solid ${fetchStatus==='fetching'?NB.fog:NB.electric}40`,
              padding:'2px 8px', cursor:'pointer' }}>↻</button>
        </div>
        {/* Fee scraper */}
        <div onClick={()=>setShowUpload(true)} className="nb-btn"
          style={{ background:NB.shadow, border:`1px solid ${scraperRecords?NB.electric:NB.fog}`,
            padding:'0.5rem 0.875rem', display:'flex', alignItems:'center', gap:8,
            cursor:'pointer', minWidth:195 }}>
          {scraperRecords?(
            <>
              <LivePip color={NB.electric}/>
              <div>
                <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.68rem',
                  letterSpacing:'0.1em', color:NB.electric }}>
                  FEE DATA · {scraperCities} CITIES
                </div>
                <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.58rem', color:NB.fog }}>
                  {scraperRecords.length} records loaded
                </div>
              </div>
            </>
          ):(
            <>
              <span style={{ fontSize:'0.9rem' }}>📂</span>
              <div>
                <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.65rem',
                  letterSpacing:'0.15em', color:NB.oxide, textTransform:'uppercase' }}>Load Fee Data</div>
                <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.58rem', color:NB.fog }}>
                  results.json from scraper
                </div>
              </div>
              <span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem', color:NB.fog }}>→</span>
            </>
          )}
        </div>
      </div>


      {/* ── LAYER CONTROLS ── */}
      <div style={{ maxWidth:1200, margin:'0.75rem auto 0', padding:'0 1.5rem', position:'relative' }}>
        {hoveredLayer && LAYERS[hoveredLayer] && (
          <div style={{
            position:'fixed',
            left: Math.min(tooltipPos.x, window.innerWidth - 340),
            top:  tooltipPos.y + 14,
            zIndex:999,
            width:320,
            background:NB.void,
            border:`1px solid ${LAYERS[hoveredLayer].color}60`,
            borderLeft:`3px solid ${LAYERS[hoveredLayer].color}`,
            padding:'0.75rem 0.875rem',
            pointerEvents:'none',
            boxShadow:`0 2px 8px rgba(26,26,26,.12)`,
            animation:'fadeUp .12s ease',
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'0.4rem' }}>
              <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.65rem',
                letterSpacing:'0.2em', color:LAYERS[hoveredLayer].color, textTransform:'uppercase', fontWeight:600 }}>
                {LAYERS[hoveredLayer].label}
              </span>
              {LAYERS[hoveredLayer].weight && (
                <span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.6rem', color:NB.fog }}>
                  {Math.round(LAYERS[hoveredLayer].weight * 100)}% weight
                </span>
              )}
            </div>
            <p style={{ fontFamily:"'Source Serif 4',Georgia,serif", fontSize:'0.78rem',
              color:NB.fuel, lineHeight:1.65, margin:0 }}>
              {LAYERS[hoveredLayer].description}
            </p>
          </div>
        )}
        <div style={{ background:NB.shadow, border:`1px solid ${NB.fog}`,
          borderBottom:'none', display:'flex', flexWrap:'wrap', gap:0 }}>
          {Object.entries(LAYERS).map(([key,cfg])=>{
            const isActive=key===activeLayer;
            return (
              <button key={key} onClick={()=>setActiveLayer(key)} className="nb-btn"
                onMouseEnter={e=>{ setHoveredLayer(key); setTooltipPos({ x:e.clientX, y:e.clientY }); }}
                onMouseMove={e=>setTooltipPos({ x:e.clientX, y:e.clientY })}
                onMouseLeave={()=>setHoveredLayer(null)}
                style={{ padding:'0.55rem 0.9rem', background:isActive?NB.fog:'transparent',
                  border:'none', borderRight:`1px solid ${NB.fog}`,
                  borderBottom:isActive?`2px solid ${NB.reactor}`:'2px solid transparent',
                  color:isActive?NB.reactor:NB.oxide, cursor:'pointer',
                  fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.65rem',
                  letterSpacing:'0.15em', textTransform:'uppercase', fontWeight:isActive?600:400,
                  display:'flex', alignItems:'center', gap:4 }}>
                {cfg.label}
                {key==='feesPerUnit'&&<span style={{ fontSize:'0.55rem',
                  color:isActive&&scraperRecords?NB.electric:NB.fog }}>
                  {scraperRecords?'⚡':'≈'}
                </span>}
                {['rhnaProgress','sb35Status'].includes(key)&&hcdOk&&(
                  <LivePip color={isActive?NB.electric:NB.fog} active={true}/>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── METRO SHORTCUTS ── */}
      <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 1.5rem 0.5rem' }}>
        <div style={{ background:NB.shadow, border:`1px solid ${NB.fog}`,
          borderTop:`1px solid ${NB.mist}`, padding:'0.4rem 0.75rem',
          display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
          <button onClick={()=>setShowCompare(true)} className="nb-btn"
            style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.62rem',
              letterSpacing:'0.1em', textTransform:'uppercase',
              background:'none', border:`1px solid ${NB.electric}`, padding:'2px 8px',
              color:NB.electric, cursor:'pointer' }}>
            ⇔ Compare
          </button>
          <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.55rem',
            letterSpacing:'0.25em', color:NB.fog, textTransform:'uppercase' }}>Metro:</span>
          {Object.entries(METROS).map(([key])=>{
            const m=METROS[key];
            const n=Object.values(cityScores).filter(c=>
              c.lat>=m.bounds[0]&&c.lat<=m.bounds[1]&&c.lon>=m.bounds[2]&&c.lon<=m.bounds[3]&&c.hasFeeData
            ).length;
            return (
              <button key={key} onClick={()=>setActiveMetro(key)} className="nb-btn"
                style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.62rem',
                  letterSpacing:'0.1em', textTransform:'uppercase',
                  background:'none', border:`1px solid ${NB.mist}`, padding:'2px 8px',
                  color:NB.fuel, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                {key}
                {n>0&&<span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.6rem',
                  color:NB.electric, background:`${NB.electric}18`, padding:'0 4px' }}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 1.5rem 3rem',
        display:'flex', flexDirection:'column', gap:14 }} className="main-row">
        <style>{`@media(min-width:1024px){.main-row{flex-direction:row!important}}`}</style>

        {/* ── MAP ── */}
        <div style={{ flex:1, background:NB.void, border:`1px solid ${NB.mist}`,
          borderTop:`2px solid ${NB.reactor}`, position:'relative', overflow:'hidden', minWidth:0 }}>
          <BlueprintGrid />
          {geoStatus==='loading'&&(
            <div style={{ position:'absolute', top:8, left:8, zIndex:10,
              fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.6rem',
              color:NB.electric, letterSpacing:'0.1em', background:NB.void,
              padding:'2px 6px', border:`1px solid ${NB.fog}` }}>
              Loading GIS boundaries…
            </div>
          )}
          <svg viewBox="-8 -8 570 656" style={{ width:'100%', height:'auto', maxHeight:'74vh',
            display:'block', position:'relative' }}>
            {/* Counties */}
            {(geoPaths ? Object.entries(geoPaths) : Object.entries(COUNTY_SHAPES).map(([c,pts])=>[c,null]))
              .map(([county, geoD])=>{
              const isActive=county===hoveredCounty||county===selectedCounty;
              const hasScraper=!!(scraperRecords?.some(r=>normCounty(r.county||'')===county&&r.status==='success'));
              const d = geoD || (COUNTY_SHAPES[county]
                ? `M ${COUNTY_SHAPES[county].map(p=>p.join(',')).join(' L ')} Z`
                : null);
              if (!d) return null;
              return (
                <path key={county} className="cp"
                  d={d}
                  fill={getCountyFill(county)}
                  stroke={isActive?NB.electric:`${NB.mist}90`}
                  strokeWidth={isActive?1.2:0.5}
                  onMouseEnter={()=>setHoveredCounty(county)}
                  onMouseLeave={()=>setHoveredCounty(null)}
                  onClick={()=>{ setSelectedCounty(c=>c===county?null:county); setSelectedCity(null); }}
                />
              );
            })}
            {/* County name labels */}
            {geoStatus==='ok' && geoBounds && Object.entries(geoBounds).map(([county,bb])=>{
              const isActive=county===hoveredCounty||county===selectedCounty;
              const w=bb.maxX-bb.minX, h=bb.maxY-bb.minY;
              if(w<22||h<12) return null;
              return (
                <text key={`lbl-${county}`}
                  x={bb.cx} y={bb.cy}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={w>80?8.5:w>45?7:6}
                  fontFamily="'IBM Plex Mono','Consolas',monospace"
                  fontWeight="400"
                  fill={isActive?NB.reactor:`${NB.reactor}55`}
                  style={{ pointerEvents:'none', userSelect:'none' }}>
                  {county.length>14?county.replace(' County','').split(' ').map(w=>w[0]).join(''):county}
                </text>
              );
            })}
            {/* City dots */}
            {Object.values(cityScores)
              .filter(c=>c.hasFeeData||c.hasHCDData)
              .sort((a,b)=>a.population-b.population)
              .map(city=>{
                if(city.svgX<-5||city.svgX>560||city.svgY<-5||city.svgY>645)return null;
                const r=clamp(Math.pow(city.population,0.22),2.5,7);
                const col=scoreColor(city.composite||0);
                const isSel=selectedCity===city.name;
                return (
                  <g key={city.name} style={{ cursor:'pointer' }}
                    onMouseEnter={()=>setHoveredCounty(city.county)}
                    onClick={()=>{ setSelectedCity(n=>n===city.name?null:city.name); setSelectedCounty(null); }}>
                    {isSel&&<circle cx={city.svgX} cy={city.svgY} r={r+5} fill="none"
                      stroke={NB.reactor} strokeWidth="1.5"/>}
                    <circle cx={city.svgX} cy={city.svgY} r={r}
                      fill={col} fillOpacity={city.hasFeeData?0.92:0.35}
                      stroke={city.hasFeeData?col:`${NB.fog}60`} strokeWidth=".7"/>
                  </g>
                );
              })}
            {/* Gradient legend */}
            <g transform="translate(10,570)">
              <text x="0" y="0" fill={NB.fog} fontSize="7.5"
                fontFamily="'Source Serif 4','Charter',Georgia,serif" letterSpacing="2" fontWeight="600">
                {LAYERS[activeLayer].label.toUpperCase()}
              </text>
              <defs>
                <linearGradient id="nbGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={NB.void}/>
                  <stop offset="50%" stopColor={NB.ember}/>
                  <stop offset="100%" stopColor={NB.blood}/>
                </linearGradient>
              </defs>
              <rect x="0" y="7" width="105" height="5" fill="url(#nbGrad)"/>
              <text x="0" y="20" fill={NB.fog} fontSize="6"
                fontFamily="'IBM Plex Mono','Consolas',monospace">LOW</text>
              <text x="105" y="20" fill={NB.fog} fontSize="6" textAnchor="end"
                fontFamily="'IBM Plex Mono','Consolas',monospace">EXTREME</text>
            </g>
            <g transform="translate(10,622)">
              <circle cx="4" cy="4" r="4" fill={scoreColor(0.7,0.9)}/>
              <text x="12" y="8" fill={NB.fog} fontSize="7" fontFamily="'IBM Plex Mono','Consolas',monospace">scraped fee data</text>
              <circle cx="4" cy="16" r="4" fill={scoreColor(0.4,0.3)}/>
              <text x="12" y="20" fill={NB.fog} fontSize="7" fontFamily="'IBM Plex Mono','Consolas',monospace">HCD only</text>
            </g>
          </svg>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ width:'100%', maxWidth:380, display:'flex', flexDirection:'column', gap:10 }}>
          {/* Active layer descriptor */}
          <div style={{ background:NB.shadow, border:`1px solid ${NB.mist}`, borderTop:`2px solid ${NB.reactor}`, padding:'0.75rem 1rem' }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:3 }}>
              <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
                fontSize:'1rem', fontWeight:700, color:NB.reactor }}>
                {LAYERS[activeLayer].label}
              </span>
              {LAYERS[activeLayer].weight&&(
                <DataVal size="0.65rem" color={NB.fog}>
                  {Math.round(LAYERS[activeLayer].weight*100)}% weight
                </DataVal>
              )}
            </div>
            <p style={{ fontSize:'0.78rem', color:NB.oxide, margin:0, lineHeight:1.6,
              fontFamily:"'Source Serif 4',Georgia,serif" }}>
              {LAYERS[activeLayer].description ||
                (activeLayer==='feesPerUnit'&&!scraperRecords
                  ? 'Load fee scraper data for city-level actuals vs. county estimates'
                  : '')}
            </p>
          </div>

          {/* Detail — city > county */}
          {activeCity?(
            <CityDetail city={activeCity} onBack={()=>setSelectedCity(null)}/>
          ):activeCounty?(
            <CountyDetail
              county={activeCounty} data={countyScores[activeCounty]}
              liveFlags={liveFlags}
              citiesInCounty={citiesByCounty[activeCounty]||[]}
              onCityClick={n=>setSelectedCity(n)}
              onLoadScraper={()=>setShowUpload(true)}
            />
          ):(
            <div style={{ background:NB.shadow, border:`1px solid ${NB.fog}`,
              padding:'2rem 1rem', textAlign:'center',
              fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.82rem', fontStyle:'italic', color:NB.oxide }}>
              — Select a county or city dot —
            </div>
          )}

          {/* Rankings */}
          <div style={{ background:NB.shadow, border:`1px solid ${NB.mist}`, borderTop:`2px solid ${NB.reactor}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'0.6rem 0.875rem', borderBottom:`2px solid ${NB.fog}` }}>
              <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
                fontSize:'0.9rem', fontWeight:700, color:NB.reactor }}>Rankings</span>
              <div style={{ display:'flex', gap:0 }}>
                {['county','city'].map(t=>(
                  <button key={t} onClick={()=>setRankTab(t)} className="nb-btn"
                    style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
                      letterSpacing:'0.15em', textTransform:'uppercase', padding:'3px 9px',
                      background:rankTab===t?NB.fog:'none',
                      border:`1px solid ${rankTab===t?NB.reactor:NB.fog}`,
                      color:rankTab===t?NB.reactor:NB.oxide, cursor:'pointer' }}>
                    {t}{t==='city'&&scraperCities>0?` (${scraperCities})`:''}
                  </button>
                ))}
              </div>
            </div>

            {rankTab==='city'&&rankedCities.length===0?(
              <div style={{ padding:'1rem', textAlign:'center',
                fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem', color:NB.fog }}>
                Load scraper data to unlock city rankings
              </div>
            ):(
              <div style={{ maxHeight:240, overflowY:'auto' }}>
                {(rankTab==='county'?rankedCounties.slice(0,15).map(([name,data])=>({
                    key:name, label:name.toUpperCase(), score:data.composite,
                    sub:null, hasFee:!!(scraperRecords?.some(r=>normCounty(r.county||'')===name&&r.status==='success')),
                    onClick:()=>{ setSelectedCounty(name); setSelectedCity(null); }
                  })):rankedCities.slice(0,15).map(city=>({
                    key:city.name, label:city.name.toUpperCase(), score:city.composite||0,
                    sub:city.county, hasFee:city.hasFeeData,
                    onClick:()=>{ setSelectedCity(city.name); setSelectedCounty(null); }
                  }))
                ).map((item,i)=>{
                  const tier=getTier(item.score);
                  return (
                    <div key={item.key} onClick={item.onClick}
                      style={{ display:'grid', gridTemplateColumns:'26px 1fr auto auto',
                        alignItems:'center', gap:6, padding:'5px 0.875rem',
                        borderBottom:`1px solid ${NB.fog}20`, cursor:'pointer',
                        transition:'background .1s' }}
                      onMouseEnter={e=>e.currentTarget.style.background=NB.fog+'90'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <DataVal size="0.7rem" color={i<3?NB.ember:i<10?NB.oxide:NB.fog}>
                        {String(i+1).padStart(2,'0')}
                      </DataVal>
                      <div>
                        <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.68rem',
                          letterSpacing:'0.05em', color:NB.fuel, overflow:'hidden',
                          textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.label}</div>
                        {item.sub&&<div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
                          fontSize:'0.58rem', color:NB.fog }}>{item.sub}</div>}
                      </div>
                      {item.hasFee&&<span style={{ fontSize:'0.6rem', color:NB.electric }}>⚡</span>}
                      <DataVal color={tier.color} size="0.85rem">
                        {Math.round(item.score*100)}
                      </DataVal>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scraper loaded card */}
          {scraperRecords&&(
            <div style={{ background:NB.shadow, border:`1px solid ${NB.mist}`, borderLeft:`3px solid ${NB.electric}`,
              padding:'0.75rem 1rem', animation:'fadeUp .3s ease' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <SectionLabel accent={NB.electric}>Field Intelligence</SectionLabel>
                <button onClick={()=>{try{localStorage.removeItem('ca-fee-data');}catch{}setScraperRecords(defaultFeeData);}} className="nb-btn"
                  style={{ background:'none', border:'none', color:NB.fog,
                    fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.65rem', cursor:'pointer' }}>
                  ✕ clear
                </button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
                {[
                  ['Cities Scraped', rankedCities.length],
                  ['Total Records',  scraperRecords.length],
                  ['Counties w/ Fees', new Set(rankedCities.map(c=>c.county)).size],
                ].map(([l,v])=>(
                  <div key={l}>
                    <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.55rem',
                      letterSpacing:'0.15em', color:NB.fog, textTransform:'uppercase' }}>{l}</div>
                    <DataVal color={NB.electric} size="1.1rem">{v}</DataVal>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:8 }}>
                <div style={{ height:3, background:NB.fog }}>
                  <div style={{ height:'100%', background:NB.electric,
                    width:`${(new Set(rankedCities.map(c=>c.county)).size/58)*100}%`,
                    transition:'width .5s' }}/>
                </div>
                <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.6rem',
                  color:NB.fog, marginTop:3 }}>
                  {new Set(rankedCities.map(c=>c.county)).size}/58 counties covered
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── EXPORT BAR ── */}
      <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 1.5rem 0.75rem' }}>
        <div style={{ background:NB.shadow, border:`1px solid ${NB.fog}`,
          padding:'0.5rem 0.875rem', display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
          <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.55rem',
            letterSpacing:'0.25em', color:NB.fog, textTransform:'uppercase' }}>Export:</span>
          <button onClick={()=>exportCountiesCSV(countyScores)} className="nb-btn"
            style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.62rem',
              letterSpacing:'0.1em', textTransform:'uppercase', background:'none',
              border:`1px solid ${NB.mist}`, padding:'2px 8px', color:NB.fuel, cursor:'pointer' }}>
            Counties CSV
          </button>
          <button onClick={()=>exportCitiesCSV(cityScores)} className="nb-btn"
            style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.62rem',
              letterSpacing:'0.1em', textTransform:'uppercase', background:'none',
              border:`1px solid ${NB.mist}`, padding:'2px 8px', color:NB.fuel, cursor:'pointer' }}>
            Cities CSV
          </button>
          <button onClick={()=>{
            const url = encodeShareURL({
              county:selectedCounty, city:selectedCity, layer:activeLayer
            });
            navigator.clipboard.writeText(url).then(()=>{
              setToast('Link copied to clipboard');
              setTimeout(()=>setToast(null), 2500);
            });
          }} className="nb-btn"
            style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.62rem',
              letterSpacing:'0.1em', textTransform:'uppercase', background:'none',
              border:`1px solid ${NB.electric}`, padding:'2px 8px', color:NB.electric, cursor:'pointer' }}>
            ⚡ Share Link
          </button>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ borderTop:`2px solid ${NB.reactor}`, padding:'1rem 1.5rem',
        background:NB.shadow, textAlign:'center' }}>
        <div style={{ maxWidth:1200, margin:'0 auto' }}>
          <p style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
            fontSize:'0.82rem', color:NB.oxide, margin:'0 0 4px', fontStyle:'italic' }}>
            California Building Difficulty Index &bull; {CITY_GEO.length} cities &bull; data.ca.gov
          </p>
          <p style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.62rem',
            color:NB.mist, margin:0, letterSpacing:'0.05em' }}>
            Permit Time (20%) · Fees (20%) · CEQA (12%) · Coastal (9%) · Fire (9%) · Approval (9%) · RHNA (9%) · Noise (7%) · SB35 (5%)
          </p>
        </div>
      </div>
    </div>
  );
}
