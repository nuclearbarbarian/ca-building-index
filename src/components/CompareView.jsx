import React, { useState, useMemo } from 'react';
import { NB, LAYERS, getTier, CITY_GEO } from '../lib/constants.js';
import { SectionLabel, DataVal, TierStamp } from './DesignPrimitives.jsx';

const MAX_COMPARE = 3;

// Deduplicated city names for the dropdown (CITY_GEO entries are [name, county, lat, lon, pop])
const ALL_CITIES = [...new Set(CITY_GEO.map(c => c[0]))].sort();

export default function CompareView({ cityScores, onClose }) {
  const [selected, setSelected]       = useState([]);
  const [search, setSearch]           = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return ALL_CITIES.filter(n => !selected.includes(n)).slice(0, 12);
    const q = search.toLowerCase();
    return ALL_CITIES.filter(n => n.toLowerCase().includes(q) && !selected.includes(n)).slice(0, 8);
  }, [search, selected]);

  const addCity = (name) => {
    if (selected.length < MAX_COMPARE && !selected.includes(name)) {
      setSelected([...selected, name]);
      setSearch('');
    }
  };
  const removeCity = (name) => setSelected(selected.filter(n => n !== name));

  const cities = selected.map(n => cityScores[n]).filter(Boolean);

  // Metric rows to compare
  const metricRows = Object.entries(LAYERS).filter(([k]) => k !== 'composite');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      background: 'rgba(26,26,26,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: NB.void, border: `2px solid ${NB.reactor}`,
        width: '90vw', maxWidth: 900, maxHeight: '85vh',
        overflow: 'auto', position: 'relative',
      }}>
        {/* Header */}
        <div style={{
          background: NB.reactor, padding: '1rem 1.25rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontFamily: "'Source Serif 4','Charter',Georgia,serif",
              fontSize: '1.1rem', fontWeight: 700, color: NB.shadow,
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              Jurisdiction Comparison
            </div>
            <div style={{
              fontFamily: "'IBM Plex Mono','Consolas',monospace",
              fontSize: '0.6rem', color: NB.oxide, letterSpacing: '0.1em',
            }}>
              Select up to {MAX_COMPARE} cities to compare side by side
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: `1px solid ${NB.fog}`,
            color: NB.shadow, fontFamily: "'IBM Plex Mono','Consolas',monospace",
            fontSize: '0.8rem', padding: '4px 10px', cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* City selector */}
        <div style={{
          padding: '0.75rem 1.25rem',
          borderBottom: `1px solid ${NB.fog}`,
          background: NB.shadow,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {selected.map(name => {
              const tier = getTier(cityScores[name]?.composite || 0);
              return (
                <div key={name} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  border: `1px solid ${tier.color}`, padding: '3px 8px',
                  background: NB.void,
                }}>
                  <span style={{
                    fontFamily: "'Source Serif 4',Georgia,serif",
                    fontSize: '0.72rem', fontWeight: 600, color: NB.reactor,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>{name}</span>
                  <DataVal color={tier.color} size="0.72rem">
                    {Math.round((cityScores[name]?.composite || 0) * 100)}
                  </DataVal>
                  <button onClick={() => removeCity(name)} style={{
                    background: 'none', border: 'none', color: NB.fog,
                    cursor: 'pointer', fontSize: '0.7rem', padding: '0 2px',
                    fontFamily: "'IBM Plex Mono','Consolas',monospace",
                  }}>✕</button>
                </div>
              );
            })}
            {selected.length < MAX_COMPARE && (
              <div style={{ position: 'relative' }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  placeholder="+ Add city…"
                  style={{
                    fontFamily: "'Source Serif 4',Georgia,serif",
                    fontSize: '0.75rem', padding: '4px 8px',
                    border: `1px solid ${NB.mist}`, background: NB.void,
                    color: NB.reactor, width: 160, outline: 'none',
                  }}
                />
                {showDropdown && filtered.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 10,
                    background: NB.shadow, border: `1px solid ${NB.fog}`,
                    width: 220, maxHeight: 180, overflowY: 'auto',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  }}>
                    {filtered.map(name => (
                      <div key={name} onClick={() => addCity(name)}
                        style={{
                          padding: '4px 8px', cursor: 'pointer',
                          fontFamily: "'Source Serif 4',Georgia,serif",
                          fontSize: '0.72rem', color: NB.fuel,
                          borderBottom: `1px solid ${NB.fog}20`,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = NB.fog}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {name}
                        {cityScores[name] && (
                          <span style={{
                            fontFamily: "'IBM Plex Mono','Consolas',monospace",
                            fontSize: '0.6rem', color: NB.oxide, marginLeft: 6,
                          }}>
                            {cityScores[name].county}
                          </span>
                        )}
                      </div>
                    ))}
                    {filtered.length === 0 && (
                      <div style={{
                        padding: '6px 8px', fontFamily: "'IBM Plex Mono','Consolas',monospace",
                        fontSize: '0.65rem', color: NB.fog,
                      }}>No matches</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Comparison table */}
        {cities.length >= 2 ? (
          <div style={{ padding: '0.75rem 1.25rem' }}>
            {/* Score headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `140px repeat(${cities.length}, 1fr)`,
              gap: 0, marginBottom: 12,
            }}>
              <div />
              {cities.map(city => {
                const tier = getTier(city.composite || 0);
                return (
                  <div key={city.name} style={{
                    textAlign: 'center', padding: '0.5rem',
                    borderBottom: `2px solid ${tier.color}`,
                  }}>
                    <div style={{
                      fontFamily: "'Source Serif 4',Georgia,serif",
                      fontSize: '0.75rem', fontWeight: 700, color: NB.reactor,
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                    }}>{city.name}</div>
                    <div style={{
                      fontFamily: "'IBM Plex Mono','Consolas',monospace",
                      fontSize: '0.58rem', color: NB.oxide,
                    }}>{city.county} Co.</div>
                    <div style={{
                      fontFamily: "'Source Serif 4',Georgia,serif",
                      fontSize: '2rem', fontWeight: 700, color: tier.color,
                      lineHeight: 1.1,
                    }}>{Math.round((city.composite || 0) * 100)}</div>
                    <TierStamp tier={tier} />
                  </div>
                );
              })}
            </div>

            {/* Metric rows */}
            {metricRows.map(([key, cfg], i) => {
              const vals = cities.map(c => c[key]);
              const norms = cities.map(c => c.normalized?.[key] || 0);
              const maxNorm = Math.max(...norms, 0.01);
              return (
                <div key={key} style={{
                  display: 'grid',
                  gridTemplateColumns: `140px repeat(${cities.length}, 1fr)`,
                  gap: 0, alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: `1px solid ${NB.fog}30`,
                  background: i % 2 === 0 ? 'transparent' : `${NB.fog}20`,
                }}>
                  <div style={{
                    fontFamily: "'Source Serif 4',Georgia,serif",
                    fontSize: '0.65rem', letterSpacing: '0.08em',
                    color: NB.oxide, textTransform: 'uppercase',
                    paddingRight: 8,
                  }}>
                    {cfg.label}
                    {cfg.weight && (
                      <span style={{
                        fontFamily: "'IBM Plex Mono','Consolas',monospace",
                        fontSize: '0.55rem', color: NB.fog, display: 'block',
                      }}>{Math.round(cfg.weight * 100)}%</span>
                    )}
                  </div>
                  {cities.map((city, ci) => {
                    const val = vals[ci];
                    const norm = norms[ci];
                    const isWorst = !cfg.categorical && norm === maxNorm && cities.length > 1;
                    return (
                      <div key={city.name} style={{
                        textAlign: 'center', padding: '4px 8px',
                      }}>
                        <DataVal
                          color={isWorst ? NB.ember : cfg.color}
                          size="0.82rem"
                        >
                          {cfg.format ? cfg.format(val) : val}
                        </DataVal>
                        {!cfg.categorical && (
                          <div style={{
                            height: 3, background: NB.fog, marginTop: 3,
                          }}>
                            <div style={{
                              height: '100%',
                              background: isWorst ? NB.ember : cfg.color,
                              width: `${norm * 100}%`,
                              transition: 'width .3s',
                            }} />
                          </div>
                        )}
                        {city.hasFeeData && key === 'feesPerUnit' && (
                          <span style={{ fontSize: '0.55rem', color: NB.electric }}>⚡</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* CEQA detail comparison */}
            {cities.some(c => c.ceqaDetail) && (
              <div style={{ marginTop: 12 }}>
                <SectionLabel accent={NB.ember}>CEQA Detail Comparison</SectionLabel>
                {[
                  ['Review Days', c => c.ceqaDetail?.avgReviewDays, v => `${v} days`],
                  ['Cat. Exemption', c => c.ceqaDetail?.categoricalExemptionRate, v => `${Math.round(v * 100)}%`],
                  ['EIR Rate', c => c.ceqaDetail?.eirRate, v => `${Math.round(v * 100)}%`],
                  ['Mitigated Neg Dec', c => c.ceqaDetail?.mitigatedNegDecRate, v => `${Math.round(v * 100)}%`],
                ].map(([label, getter, fmt]) => (
                  <div key={label} style={{
                    display: 'grid',
                    gridTemplateColumns: `140px repeat(${cities.length}, 1fr)`,
                    padding: '4px 0',
                    borderBottom: `1px solid ${NB.fog}20`,
                  }}>
                    <span style={{
                      fontFamily: "'Source Serif 4',Georgia,serif",
                      fontSize: '0.65rem', color: NB.oxide,
                    }}>{label}</span>
                    {cities.map(city => {
                      const val = getter(city);
                      return (
                        <div key={city.name} style={{ textAlign: 'center' }}>
                          <DataVal color={NB.fuel} size="0.78rem">
                            {val != null ? fmt(val) : '—'}
                          </DataVal>
                          {city.ceqaStatus === 'researched' && (
                            <span style={{
                              fontFamily: "'IBM Plex Mono','Consolas',monospace",
                              fontSize: '0.5rem', color: NB.electric, marginLeft: 2,
                            }}>⚡</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Fee comparison */}
            {cities.some(c => c.hasFeeData) && (
              <div style={{ marginTop: 12 }}>
                <SectionLabel accent={NB.electric}>Fee Schedule Comparison</SectionLabel>
                {[
                  ['Total SFR (est.)', c => c.estimatedSFR],
                  ['Total MF/unit (est.)', c => c.estimatedMF],
                  ['Transportation', c => c.transportFee],
                  ['Parks', c => c.parkFee],
                  ['Water Capacity', c => c.waterCapFee],
                  ['Sewer Capacity', c => c.sewerCapFee],
                  ['Affordable In-Lieu', c => c.affordInLieu],
                ].map(([label, getter]) => {
                  const vals = cities.map(getter);
                  if (vals.every(v => !v)) return null;
                  const maxVal = Math.max(...vals.filter(Boolean));
                  return (
                    <div key={label} style={{
                      display: 'grid',
                      gridTemplateColumns: `140px repeat(${cities.length}, 1fr)`,
                      padding: '4px 0',
                      borderBottom: `1px solid ${NB.fog}20`,
                    }}>
                      <span style={{
                        fontFamily: "'Source Serif 4',Georgia,serif",
                        fontSize: '0.65rem', color: NB.oxide,
                      }}>{label}</span>
                      {cities.map((city, ci) => {
                        const val = vals[ci];
                        const isMax = val === maxVal && cities.length > 1 && val > 0;
                        return (
                          <div key={city.name} style={{ textAlign: 'center' }}>
                            <DataVal color={isMax ? NB.ember : NB.fuel} size="0.78rem">
                              {val ? `$${val.toLocaleString()}` : '—'}
                            </DataVal>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Source note */}
            <div style={{
              marginTop: 12, fontFamily: "'IBM Plex Mono','Consolas',monospace",
              fontSize: '0.58rem', color: NB.fog, textAlign: 'center',
            }}>
              Sources: HCD APR/SB35/RHNA via data.ca.gov · Fee scraper · CEQAnet/OPR
            </div>
          </div>
        ) : (
          <div style={{
            padding: '3rem 1.25rem', textAlign: 'center',
            fontFamily: "'Source Serif 4',Georgia,serif",
            fontSize: '0.85rem', fontStyle: 'italic', color: NB.oxide,
          }}>
            {cities.length === 1
              ? 'Select one more city to begin comparison'
              : 'Select at least two cities to compare'}
          </div>
        )}
      </div>
    </div>
  );
}
