import React, { useState } from 'react';
import { NB, LAYERS, getTier, fmtFull } from '../lib/constants.js';
import { SectionLabel, DataVal, TierStamp, BlueprintGrid } from './DesignPrimitives.jsx';

const CEQA_TIPS = {
  'Avg. Review Days':     'Mean calendar days from CEQA filing to final determination. Longer reviews delay project starts and add holding costs.',
  'Cat. Exemption Rate':  'Share of projects granted categorical exemption — fast-tracked past full environmental review. Higher = easier path to approval.',
  'EIR Rate':             'Share of projects requiring a full Environmental Impact Report — the most expensive and time-consuming CEQA outcome.',
  'Mitigated Neg. Dec.':  'Share resolved via Mitigated Negative Declaration: environmental concerns exist but can be addressed with conditions.',
  'Composite CEQA Risk':  'Weighted composite of EIR rate (40%), review days (35%), and inverse categorical exemption rate (25%). Higher = harder.',
};

const FEE_TIPS = {
  'Total SFR (est.)':      'Estimated total development fees for a new single-family residence, summing all applicable impact fees.',
  'Total MF/unit (est.)':  'Estimated total development fees per unit for a new multifamily project.',
  'Transportation Impact':  'Fee to fund road, transit, and traffic infrastructure improvements necessitated by new development.',
  'Parks & Recreation':     'Fee to fund new parks, trails, and recreational facilities to serve the added population.',
  'Water Capacity':         'Fee to expand water supply, treatment, and distribution infrastructure for new connections.',
  'Sewer Capacity':         'Fee to expand wastewater collection and treatment capacity for new connections.',
  'Affordable In-Lieu':     'Fee paid instead of building affordable units on-site. Funds the city\'s affordable housing trust.',
  'Inclusionary %':         'Required percentage of units in new projects that must be deed-restricted affordable.',
  'Plan Check':             'Fee for city review of construction plans for code compliance — separate from impact fees.',
  'Data Quality':           'Confidence score (1–10) based on source recency, completeness, and whether fees were directly from the city\'s schedule.',
};

function TipRow({ label, children, tip }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position:'relative' }}
      onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      {children}
      {show && tip && (
        <div style={{ position:'absolute', left:0, bottom:'100%', zIndex:99, width:260,
          background:NB.void, border:`1px solid ${NB.mist}`, borderLeft:`3px solid ${NB.ember}`,
          padding:'0.5rem 0.6rem', pointerEvents:'none',
          boxShadow:`0 2px 6px rgba(26,26,26,.1)` }}>
          <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
            letterSpacing:'0.15em', color:NB.ember, textTransform:'uppercase', fontWeight:600,
            marginBottom:3 }}>{label}</div>
          <div style={{ fontFamily:"'Source Serif 4',Georgia,serif", fontSize:'0.72rem',
            color:NB.fuel, lineHeight:1.55, fontStyle:'italic' }}>{tip}</div>
        </div>
      )}
    </div>
  );
}

export default function CityDetail({ city, onBack }) {
  const tier = getTier(city.composite||0);
  const feeRows = [
    ['Total SFR (est.)',      city.estimatedSFR,  false, true],
    ['Total MF/unit (est.)',  city.estimatedMF,   false, true],
    ['Transportation Impact', city.transportFee,  false],
    ['Parks & Recreation',    city.parkFee,       false],
    ['Water Capacity',        city.waterCapFee,   false],
    ['Sewer Capacity',        city.sewerCapFee,   false],
    ['Affordable In-Lieu',    city.affordInLieu,  false],
    ['Inclusionary %',        city.inclusionary,  true],
    ['Plan Check',            city.planCheck,     false],
  ].filter(r=>r[1]!=null&&r[1]>0);

  return (
    <div style={{ background:NB.shadow, border:`1px solid ${NB.mist}`, borderTop:`2px solid ${NB.reactor}` }}>
      {/* Header */}
      <div style={{ padding:'1rem', borderBottom:`1px solid ${NB.fog}` }}>
        <BlueprintGrid />
        <button onClick={onBack} style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
          letterSpacing:'0.2em', color:NB.electric, background:'none', border:'none', cursor:'pointer',
          textTransform:'uppercase', marginBottom:'0.6rem', display:'block', padding:0, fontVariant:'small-caps' }}>
          ← Back to County
        </button>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative' }}>
          <div>
            <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:4 }}>
              {city.hasFeeData&&<span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.55rem',
                letterSpacing:'0.2em', color:NB.electric, border:`1px solid ${NB.electric}`,
                padding:'1px 5px', textTransform:'uppercase', fontVariant:'small-caps' }}>&#x26A1; Live Data</span>}
              {city.hasHCDData&&<span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.55rem',
                letterSpacing:'0.2em', color:NB.coolant, border:`1px solid ${NB.coolant}`,
                padding:'1px 5px', textTransform:'uppercase', fontVariant:'small-caps' }}>HCD Live</span>}
            </div>
            <h2 style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
              fontWeight:700, fontSize:'1.5rem', color:NB.reactor, margin:'0 0 2px', lineHeight:1 }}>
              {city.name}
            </h2>
            <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem', color:NB.oxide }}>
              {city.county} County · Pop. {city.population?.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
              fontSize:'2.8rem', fontWeight:700, color:tier.color, lineHeight:1 }}>
              {Math.round((city.composite||0)*100)}
            </div>
            <TierStamp tier={tier} />
          </div>
        </div>
      </div>

      {/* Metric bars */}
      <div style={{ padding:'0.75rem 1rem' }}>
        <SectionLabel>Factor Analysis</SectionLabel>
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {Object.entries(LAYERS).filter(([k])=>k!=='composite').map(([key,cfg])=>{
            const val=city[key];
            const bar=cfg.categorical?(val==='subject'?80:20):(city.normalized?.[key]||0)*100;
            const isCity=key==='feesPerUnit'?city.hasFeeData:city.hasHCDData;
            return (
              <div key={key} style={{ display:'grid', gridTemplateColumns:'80px 1fr 45px 12px', gap:5, alignItems:'center' }}>
                <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
                  letterSpacing:'0.1em', color:NB.oxide, textTransform:'uppercase', overflow:'hidden',
                  textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cfg.label}</span>
                <div style={{ height:3, background:NB.fog }}>
                  <div style={{ height:'100%', background:cfg.color, width:`${bar}%`, transition:'width .3s' }}/>
                </div>
                <DataVal color={cfg.color} size="0.78rem">{cfg.format?cfg.format(val):val}</DataVal>
                <span style={{ fontSize:'0.6rem', textAlign:'center',
                  color:isCity?NB.electric:NB.fog }}>{isCity?'⚡':'≈'}</span>
              </div>
            );
          })}
        </div>

        {/* CEQA detail breakdown */}
        {city.ceqaDetail&&(
          <div style={{ marginTop:'0.75rem', borderLeft:`2px solid ${NB.ember}`, paddingLeft:'0.75rem' }}>
            <SectionLabel accent={NB.ember}>
              CEQA Environmental Review
              {city.ceqaStatus==='researched'&&<span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
                fontSize:'0.55rem', color:NB.electric, marginLeft:6 }}>&#x26A1; researched</span>}
              {city.ceqaStatus==='baseline'&&<span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
                fontSize:'0.55rem', color:NB.fog, marginLeft:6 }}>≈ county est.</span>}
            </SectionLabel>
            {[
              ['Avg. Review Days',      city.ceqaDetail.avgReviewDays, d=>`${d} days`],
              ['Cat. Exemption Rate',   city.ceqaDetail.categoricalExemptionRate, v=>`${Math.round(v*100)}%`],
              ['EIR Rate',              city.ceqaDetail.eirRate, v=>`${Math.round(v*100)}%`],
              ['Mitigated Neg. Dec.',   city.ceqaDetail.mitigatedNegDecRate, v=>`${Math.round(v*100)}%`],
              ['Composite CEQA Risk',   city.ceqaRisk, v=>`${Math.round(v*100)}%`],
            ].map(([label,val,fmt])=>(
              <TipRow key={label} label={label} tip={CEQA_TIPS[label]}>
                <div style={{ display:'flex', justifyContent:'space-between',
                  padding:'3px 0', borderBottom:`1px solid ${NB.fog}30`, cursor:'help' }}>
                  <span style={{ fontFamily:"'Source Serif 4',Georgia,serif",
                    fontSize:'0.78rem', color:NB.oxide,
                    borderBottom:`1px dotted ${NB.fog}` }}>{label}</span>
                  <DataVal color={label==='Composite CEQA Risk'?NB.ember:NB.fuel} size="0.8rem">
                    {fmt(val)}
                  </DataVal>
                </div>
              </TipRow>
            ))}
            <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
              fontSize:'0.55rem', color:NB.fog, marginTop:4 }}>
              Source: CEQAnet/OPR · Compiled 2024
            </div>
          </div>
        )}

        {/* Fee breakdown */}
        {feeRows.length>0&&(
          <div style={{ marginTop:'0.75rem', borderLeft:`2px solid ${NB.ember}`, paddingLeft:'0.75rem' }}>
            <SectionLabel accent={NB.ember}>
              Fee Schedule {city.docYear?`· ${city.docYear}`:''}
            </SectionLabel>
            {feeRows.map(([label,val,isPct,isTotal])=>(
              <TipRow key={label} label={label} tip={FEE_TIPS[label]}>
                <div style={{ display:'flex', justifyContent:'space-between',
                  padding:'3px 0', borderBottom:`1px solid ${NB.fog}30`, cursor:'help' }}>
                  <span style={{ fontFamily:"'Source Serif 4',Georgia,serif",
                    fontSize:'0.78rem', color:isTotal?NB.reactor:NB.oxide,
                    borderBottom:`1px dotted ${NB.fog}` }}>{label}</span>
                  <DataVal color={isTotal?NB.ember:NB.fuel} size="0.8rem">
                    {isPct?`${((val||0)*100).toFixed(0)}%`:fmtFull(val)}
                  </DataVal>
                </div>
              </TipRow>
            ))}
            {city.dataQuality>0&&(
              <TipRow label="Data Quality" tip={FEE_TIPS['Data Quality']}>
                <div style={{ display:'flex', justifyContent:'space-between',
                  padding:'3px 0', borderBottom:`1px solid ${NB.fog}30`, cursor:'help' }}>
                  <span style={{ fontFamily:"'Source Serif 4',Georgia,serif",
                    fontSize:'0.78rem', color:NB.oxide,
                    borderBottom:`1px dotted ${NB.fog}` }}>Data Quality</span>
                  <DataVal color={city.dataQuality>=7?NB.coolant:city.dataQuality>=4?NB.fuel:NB.ember} size="0.8rem">
                    {city.dataQuality}/10
                  </DataVal>
                </div>
              </TipRow>
            )}
            {city.sourceUrl&&<a href={city.sourceUrl} target="_blank" rel="noreferrer"
              style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.6rem',
                color:NB.electric, display:'block', marginTop:6, textDecoration:'none' }}>
              ↗ {city.sourceUrl.replace(/^https?:\/\//,'').slice(0,50)}
            </a>}
          </div>
        )}
        <div style={{ marginTop:6, fontFamily:"'IBM Plex Mono','Consolas',monospace",
          fontSize:'0.62rem', color:NB.fog }}>
          {city.ceqaDetail
            ? `≈ Permit timeline, fire zone from ${city.county} County baseline · CEQA from CEQAnet/OPR`
            : `≈ Permit timeline, CEQA, fire zone from ${city.county} County baseline`}
        </div>
      </div>
    </div>
  );
}
