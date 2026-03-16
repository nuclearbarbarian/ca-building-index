import { NB, LAYERS, getTier, fmtK } from './constants.js';

// ─── CSV Export ────────────────────────────────────────────────────────────────

export function exportCitiesCSV(cityScores) {
  const cities = Object.values(cityScores).sort((a, b) => (b.composite || 0) - (a.composite || 0));
  if (!cities.length) return;

  const headers = [
    'Rank', 'City', 'County', 'Population', 'Composite Score',
    'Tier', 'Permit Days', 'Fees Per Unit', 'CEQA Risk',
    'Coastal %', 'Fire Hazard %', 'Approval Rate', 'RHNA Progress',
    'SB 35 Status', 'Airport Noise %',
    'Has Fee Data', 'Has HCD Data', 'CEQA Status',
    'CEQA Review Days', 'CEQA Cat Ex Rate', 'CEQA EIR Rate',
  ];

  const rows = cities.map((c, i) => [
    i + 1,
    `"${c.name}"`,
    `"${c.county}"`,
    c.population || '',
    Math.round((c.composite || 0) * 100),
    `"${getTier(c.composite || 0).label}"`,
    c.permitDays || '',
    c.feesPerUnit || '',
    Math.round((c.ceqaRisk || 0) * 100),
    c.coastalPct || 0,
    c.fireZonePct || 0,
    Math.round((c.approvalRate || 0) * 100),
    Math.round((c.rhnaProgress || 0) * 100),
    `"${c.sb35Status || ''}"`,
    c.airportNoisePct || 0,
    c.hasFeeData ? 'Y' : 'N',
    c.hasHCDData ? 'Y' : 'N',
    `"${c.ceqaStatus || 'none'}"`,
    c.ceqaDetail?.avgReviewDays || '',
    c.ceqaDetail ? Math.round(c.ceqaDetail.categoricalExemptionRate * 100) : '',
    c.ceqaDetail ? Math.round(c.ceqaDetail.eirRate * 100) : '',
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadBlob(csv, 'ca-building-index-cities.csv', 'text/csv');
}

export function exportCountiesCSV(countyScores) {
  const counties = Object.entries(countyScores).sort((a, b) => b[1].composite - a[1].composite);
  if (!counties.length) return;

  const headers = [
    'Rank', 'County', 'Composite Score', 'Tier',
    'Permit Days', 'Fees Per Unit', 'CEQA Risk',
    'Coastal %', 'Fire Hazard %', 'Approval Rate',
    'RHNA Progress', 'SB 35 Status', 'Airport Noise %',
  ];

  const rows = counties.map(([name, c], i) => [
    i + 1,
    `"${name}"`,
    Math.round((c.composite || 0) * 100),
    `"${getTier(c.composite || 0).label}"`,
    c.permitDays || '',
    c.feesPerUnit || '',
    Math.round((c.ceqaRisk || 0) * 100),
    c.coastalPct || 0,
    c.fireZonePct || 0,
    Math.round((c.approvalRate || 0) * 100),
    Math.round((c.rhnaProgress || 0) * 100),
    `"${c.sb35Status || ''}"`,
    c.airportNoisePct || 0,
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadBlob(csv, 'ca-building-index-counties.csv', 'text/csv');
}

// ─── URL Hash Sharing ──────────────────────────────────────────────────────────

export function encodeShareURL(state) {
  const params = new URLSearchParams();
  if (state.county)  params.set('county', state.county);
  if (state.city)    params.set('city', state.city);
  if (state.layer)   params.set('layer', state.layer);
  if (state.compare) params.set('compare', state.compare.join(','));
  return `${window.location.origin}${window.location.pathname}#${params.toString()}`;
}

export function decodeShareURL() {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  return {
    county:  params.get('county') || null,
    city:    params.get('city') || null,
    layer:   params.get('layer') || null,
    compare: params.get('compare')?.split(',').filter(Boolean) || null,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
