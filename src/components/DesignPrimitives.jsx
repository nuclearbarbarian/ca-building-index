import React from 'react';
import { NB } from '../lib/constants.js';

// Section header — Oswald uppercase with ember rule
export const SectionLabel = ({ children, accent=NB.ember }) => (
  <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.7rem',
    fontVariant:'small-caps', letterSpacing:'0.1em', color:NB.reactor,
    borderBottom:`2px solid ${NB.reactor}`, paddingBottom:'0.3rem', marginBottom:'0.75rem', fontWeight:700 }}>
    {children}
  </div>
);

// Monospace data value — Courier Prime
export const DataVal = ({ children, color=NB.fuel, size='0.9rem' }) => (
  <span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", color, fontSize:size, fontWeight:400 }}>
    {children}
  </span>
);

// Classification stamp — for difficulty tiers
export const TierStamp = ({ tier, score }) => (
  <div style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem',
    border:`1px solid ${NB.mist}`, borderLeft:`3px solid ${tier.color}`, padding:'0.15rem 0.6rem' }}>
    <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.65rem',
      fontVariant:'small-caps', letterSpacing:'0.1em', color:tier.color, fontWeight:700 }}>
      {tier.label}
    </span>
  </div>
);

// Blueprint grid background element
// Penney: clean paper — no grid texture
export const BlueprintGrid = () => null;

// Penney: no grid texture — clean paper surface
export const PaperTexture = () => null;

// Live indicator — Pope Electric, not green
export const LivePip = ({ color=NB.electric, active=true }) => (
  <span style={{ display:'inline-block', width:5, height:5, borderRadius:'50%',
    background: active?color:NB.fog, verticalAlign:'middle', marginLeft:3,
    boxShadow: undefined,
    animation: active?'pip 2.5s infinite':undefined }} />
);
