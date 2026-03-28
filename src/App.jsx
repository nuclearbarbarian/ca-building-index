import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import defaultFeeData from './data/feeData.json';
import defaultCeqaData from './data/ceqaData.json';
import CompareView from './components/CompareView.jsx';
import { exportCitiesCSV, exportCountiesCSV, encodeShareURL, decodeShareURL } from './lib/export.js';

// ═══════════════════════════════════════════════════════════════
// PENNEY DESIGN SYSTEM TOKENS
// 1940s Trade Journal Aesthetic — Period-Accurate Revival
// ═══════════════════════════════════════════════════════════════
const PDS = {
  // Backgrounds — newsprint & paper
  void:    '#F5F2E8',   // Newsprint — page background
  shadow:  '#FDFCF9',   // Paper White — panel / card background
  fog:     '#DCDCDC',   // Gray-15 — borders, dividers
  mist:    '#B8B8B8',   // Gray-30 — hover, secondary borders
  // Text — ink register
  reactor: '#1A1A1A',   // Ink Black — primary text
  fuel:    '#5C5C5C',   // Gray-70 — secondary text
  steam:   '#1A1A1A',   // Ink Black — highlight text
  oxide:   '#9C9788',   // Warm Gray — muted / placeholder
  // Danger / authority — Industrial Red
  blood:   '#6B1F1F',   // Deep Red — extreme danger
  ember:   '#8B2B2B',   // Industrial Red — accent, active, warning
  // Technical / live — Utility Blue
  electric:'#2B4B6F',   // Utility Blue — live data, technical
  coolant: '#3D5C3D',   // Technical Green — low danger, success
  // Google Fonts import
  fonts:   `@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400;1,8..60,700&family=IBM+Plex+Mono:wght@400;700&display=swap');`,
};

// Tier mapping to PDS palette
const TIERS = [
  { min:0.75, label:'EXTREMELY HARD',   color:'#6B1F1F',  dark:'#4A1515'   },
  { min:0.55, label:'VERY HARD',        color:'#8B2B2B',  dark:'#5C1A1A'   },
  { min:0.40, label:'MODERATELY HARD',  color:'#5C5C5C',  dark:'#2D2D2D'   },
  { min:0.25, label:'SOMEWHAT HARD',    color:'#3D5C3D',  dark:'#2A4020'   },
  { min:0,    label:'RELATIVELY EASY',  color:'#2B4B6F',  dark:'#1A2E47'   },
];
const getTier  = s => TIERS.find(t => s >= t.min) || TIERS[4];
const scoreColor = (s, alpha=1) => {
  if (s > 0.75) return `rgba(107,31,31,${alpha})`;
  if (s > 0.55) return `rgba(139,43,43,${alpha})`;
  if (s > 0.40) return `rgba(92,92,92,${alpha})`;
  if (s > 0.25) return `rgba(61,92,61,${alpha})`;
  return `rgba(43,75,111,${alpha})`;
};

// ═══════════════════════════════════════════════════════════════
// HCD API
// ═══════════════════════════════════════════════════════════════
const HCD_BASE = 'https://data.ca.gov/api/3/action';
const PACKAGES = {
  APR:  'housing-element-annual-progress-report-apr-data-by-jurisdiction-and-year',
  SB35: 'housing-element-open-data-project-and-sb-35-determination',
};

function getField(rec, candidates, def = null) {
  const keys = Object.keys(rec);
  for (const c of candidates) {
    const found = keys.find(k => k.toLowerCase() === c.toLowerCase());
    if (found !== undefined && rec[found] !== null && rec[found] !== '') return rec[found];
  }
  return def;
}
const safeFloat  = (v, d=0) => { const n=parseFloat(v); return isNaN(n)?d:n; };
const normCounty = s => (s||'').trim().replace(/\s+county$/i,'').replace(/\s+/g,' ');
const normCity   = s => (s||'').trim().replace(/\s+/g,' ').toLowerCase();
const clamp      = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const fmtK       = v => v>=1000 ? `$${Math.round(v/1000)}k` : `$${Math.round(v)}`;
const fmtFull    = v => `$${Math.round(v).toLocaleString()}`;
// CalGreen compliance cost above state baseline per unit (SFR), piecewise linear
// Sources: CEC cost-effectiveness studies, CBSC Title 24 Part 11 RIA, USGBC CA data
// 0.0-0.3: baseline only (~$0-$2k admin/documentation); 0.3-0.5: Tier 1 (~$2k-$8k);
// 0.5-0.75: Tier 2 (~$8k-$25k); 0.75-1.0: reach codes + all-electric (~$25k-$45k)
const calGreenCost = v => {
  if (v < 0.3)  return Math.round(v / 0.3 * 2000);
  if (v < 0.5)  return Math.round(2000 + (v-0.3)/0.2 * 6000);
  if (v < 0.75) return Math.round(8000 + (v-0.5)/0.25 * 17000);
  return          Math.round(25000 + (v-0.75)/0.25 * 20000);
};

// ═══════════════════════════════════════════════════════════════
// CEQA DETAIL LOOKUP
// ═══════════════════════════════════════════════════════════════
const CEQA_LOOKUP = {};
for (const rec of defaultCeqaData) {
  const k = `${normCity(rec.name)}|${normCounty(rec.county).toLowerCase()}`;
  CEQA_LOOKUP[k] = rec;
  CEQA_LOOKUP[normCity(rec.name)] = rec;
}

function computeCeqaRisk(ceqa) {
  const eirNorm = clamp(ceqa.eirRate / 0.22, 0, 1);
  const daysNorm = clamp(ceqa.avgReviewDays / 350, 0, 1);
  const catExPenalty = clamp(1 - ceqa.categoricalExemptionRate, 0, 1);
  return clamp(eirNorm * 0.40 + daysNorm * 0.35 + catExPenalty * 0.25, 0, 1);
}

// ═══════════════════════════════════════════════════════════════
// GEO SYSTEM
// ═══════════════════════════════════════════════════════════════
// Aspect-corrected equirectangular projection centred on 37°N
// x_scale = y_scale × cos(37°) so lat/lon degrees map to equal screen distances
const GEO = { latMax:42.0, latRange:9.5, lonMin:-124.4, lonRange:10.3, svgX0:0, svgW:554, svgH:640 };
const geoToSvg = (lat,lon) => ({
  x: GEO.svgX0 + (lon - GEO.lonMin) / GEO.lonRange * GEO.svgW,
  y: (GEO.latMax - lat)             / GEO.latRange * GEO.svgH,
});

// ─── EPSG:3857 (Web Mercator meters) → WGS84 lat/lon ────────────────────
const _R = 6378137;
const merc2ll = (mx, my) => ({
  lon: mx / _R * (180 / Math.PI),
  lat: (2 * Math.atan(Math.exp(my / _R)) - Math.PI / 2) * (180 / Math.PI),
});

// ─── GeoJSON → SVG path string ──────────────────────────────────────────
// Projects a GeoJSON ring [[x,y],...] (EPSG:3857) into SVG space
const ringToPath = ring =>
  ring.map(([mx,my],i) => {
    const {lat,lon} = merc2ll(mx,my);
    const {x,y} = geoToSvg(lat,lon);
    return `${i===0?'M':'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + ' Z';

// Handles Polygon (one exterior ring + optional holes) and MultiPolygon
const featureToPath = geom => {
  if (!geom) return '';
  if (geom.type === 'Polygon')
    return geom.coordinates.map(ringToPath).join(' ');
  if (geom.type === 'MultiPolygon')
    return geom.coordinates.flatMap(poly => poly.map(ringToPath)).join(' ');
  return '';
};

// Derive county name from GeoJSON feature properties
const countyNameFromProps = props => {
  const raw = props?.NAME || props?.COUNTY_NAME || props?.CountyName ||
              props?.name  || props?.county     || '';
  return raw.trim().replace(/\s+county$/i,'');
};

// ─── Hook: fetch CA county GeoJSON from state GIS ───────────────────────
const CA_GEOJSON_URL =
  'https://gis.data.ca.gov/api/download/v1/items/a7a5b9ebd58842e9979933cb7fe2287c/geojson?layers=0';

function useCountyGeoJSON() {
  const [paths,  setPaths]  = useState(null);   // { 'Alameda': 'M...Z', ... }
  const [bounds, setBounds] = useState(null);   // { 'Alameda': {minX,minY,maxX,maxY,cx,cy} }
  const [status, setStatus] = useState('idle'); // idle | loading | ok | error

  useEffect(() => {
    setStatus('loading');
    fetch(CA_GEOJSON_URL)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(gj => {
        const pathMap = {}, bboxMap = {};
        for (const feat of gj.features) {
          const name = countyNameFromProps(feat.properties);
          if (!name) continue;
          const d = featureToPath(feat.geometry);
          if (!d) continue;
          pathMap[name] = d;
          // Compute bounding box for county label placement
          const nums = d.match(/[-\d.]+/g)?.map(Number) || [];
          const xs = nums.filter((_,i)=>i%2===0);
          const ys = nums.filter((_,i)=>i%2===1);
          const minX=Math.min(...xs), maxX=Math.max(...xs);
          const minY=Math.min(...ys), maxY=Math.max(...ys);
          bboxMap[name] = { minX, minY, maxX, maxY, cx:(minX+maxX)/2, cy:(minY+maxY)/2 };
        }
        setPaths(pathMap);
        setBounds(bboxMap);
        setStatus('ok');
      })
      .catch(err => {
        console.warn('County GeoJSON fetch failed, using fallback shapes:', err.message);
        setStatus('error');
      });
  }, []);

  return { paths, bounds, status };
}

const METROS = {
  'Greater LA':    { bounds:[33.4,34.85,-119.0,-117.0], counties:['Los Angeles','Ventura','Orange'] },
  'Bay Area':      { bounds:[37.0,38.35,-123.0,-121.4], counties:['Alameda','Contra Costa','San Francisco','San Mateo','Santa Clara','Marin','Sonoma','Napa','Solano'] },
  'San Diego':     { bounds:[32.5,33.55,-117.8,-116.7], counties:['San Diego'] },
  'Inland Empire': { bounds:[33.6,34.55,-117.85,-115.8],counties:['Riverside','San Bernardino'] },
  'Sacramento':    { bounds:[38.0,39.0,-122.1,-120.7],  counties:['Sacramento','Placer','El Dorado','Yolo','Sutter','Yuba'] },
  'Central Valley':{ bounds:[36.4,37.85,-120.7,-119.0], counties:['Fresno','Madera','Merced','Stanislaus','San Joaquin','Tulare','Kings'] },
};

const CITY_GEO = [
  ['Los Angeles','Los Angeles',34.052,-118.243,3898747],
  ['Long Beach','Los Angeles',33.770,-118.193,466742],
  ['Glendale','Los Angeles',34.142,-118.255,196543],
  ['Santa Clarita','Los Angeles',34.394,-118.543,228673],
  ['Lancaster','Los Angeles',34.698,-118.137,173516],
  ['Palmdale','Los Angeles',34.579,-118.117,169450],
  ['Pomona','Los Angeles',34.056,-117.749,151348],
  ['Torrance','Los Angeles',33.836,-118.340,147067],
  ['Pasadena','Los Angeles',34.148,-118.144,138699],
  ['El Monte','Los Angeles',34.070,-118.027,113475],
  ['Downey','Los Angeles',33.940,-118.132,111772],
  ['Inglewood','Los Angeles',33.962,-118.353,109673],
  ['West Covina','Los Angeles',34.069,-117.939,106098],
  ['Burbank','Los Angeles',34.181,-118.309,103411],
  ['Santa Monica','Los Angeles',34.020,-118.491,91411],
  ['Compton','Los Angeles',33.896,-118.221,97559],
  ['Carson','Los Angeles',33.832,-118.281,91394],
  ['Hawthorne','Los Angeles',33.916,-118.352,87491],
  ['Whittier','Los Angeles',33.980,-118.033,85331],
  ['Beverly Hills','Los Angeles',34.073,-118.400,34109],
  ['Culver City','Los Angeles',34.021,-118.396,39428],
  ['West Hollywood','Los Angeles',34.091,-118.362,34399],
  ['Malibu','Los Angeles',34.026,-118.779,12645],
  ['Redondo Beach','Los Angeles',33.849,-118.388,66748],
  ['Oxnard','Ventura',34.197,-119.177,202063],
  ['Thousand Oaks','Ventura',34.171,-118.838,126966],
  ['Simi Valley','Ventura',34.271,-118.781,124237],
  ['Ventura','Ventura',34.275,-119.228,110196],
  ['Camarillo','Ventura',34.217,-119.038,70942],
  ['Anaheim','Orange',33.836,-117.914,346824],
  ['Santa Ana','Orange',33.745,-117.868,310227],
  ['Irvine','Orange',33.684,-117.826,307670],
  ['Huntington Beach','Orange',33.660,-118.000,198711],
  ['Garden Grove','Orange',33.774,-117.941,171949],
  ['Orange','Orange',33.788,-117.853,139911],
  ['Fullerton','Orange',33.870,-117.926,143617],
  ['Costa Mesa','Orange',33.663,-117.922,111918],
  ['Mission Viejo','Orange',33.600,-117.671,94381],
  ['Newport Beach','Orange',33.618,-117.929,85239],
  ['San Francisco','San Francisco',37.774,-122.419,873965],
  ['Oakland','Alameda',37.804,-122.271,440646],
  ['Fremont','Alameda',37.548,-121.989,230504],
  ['Hayward','Alameda',37.669,-122.081,162954],
  ['Berkeley','Alameda',37.872,-122.273,124321],
  ['San Leandro','Alameda',37.723,-122.157,90940],
  ['Livermore','Alameda',37.682,-121.768,95072],
  ['Pleasanton','Alameda',37.660,-121.875,79871],
  ['Dublin','Alameda',37.702,-121.936,72589],
  ['San Jose','Santa Clara',37.338,-121.886,1013240],
  ['Sunnyvale','Santa Clara',37.369,-122.036,152258],
  ['Santa Clara','Santa Clara',37.355,-121.956,127647],
  ['Mountain View','Santa Clara',37.386,-122.086,82376],
  ['Palo Alto','Santa Clara',37.445,-122.161,68572],
  ['Cupertino','Santa Clara',37.323,-122.033,60000],
  ['Milpitas','Santa Clara',37.433,-121.899,75893],
  ['Gilroy','Santa Clara',37.006,-121.568,60165],
  ['Concord','Contra Costa',37.977,-122.030,129295],
  ['Richmond','Contra Costa',37.936,-122.347,116448],
  ['Antioch','Contra Costa',37.996,-121.806,113619],
  ['Walnut Creek','Contra Costa',37.906,-122.064,70380],
  ['San Ramon','Contra Costa',37.780,-121.978,84605],
  ['Daly City','San Mateo',37.706,-122.462,101390],
  ['San Mateo','San Mateo',37.563,-122.323,104430],
  ['Redwood City','San Mateo',37.485,-122.236,84293],
  ['Napa','Napa',38.297,-122.285,80915],
  ['Vallejo','Solano',38.104,-122.257,124482],
  ['Fairfield','Solano',38.249,-122.040,122212],
  ['Vacaville','Solano',38.357,-121.988,103682],
  ['Santa Rosa','Sonoma',38.440,-122.714,178127],
  ['Petaluma','Sonoma',38.232,-122.637,60427],
  ['Sacramento','Sacramento',38.575,-121.478,513624],
  ['Elk Grove','Sacramento',38.409,-121.371,176124],
  ['Roseville','Placer',38.752,-121.288,147773],
  ['Citrus Heights','Sacramento',38.693,-121.281,87796],
  ['Folsom','Sacramento',38.678,-121.176,79117],
  ['Rancho Cordova','Sacramento',38.589,-121.302,75010],
  ['Rocklin','Placer',38.792,-121.235,72185],
  ['West Sacramento','Yolo',38.580,-121.532,56327],
  ['Davis','Yolo',38.544,-121.740,68111],
  ['Yuba City','Sutter',39.141,-121.617,67416],
  ['San Diego','San Diego',32.715,-117.157,1386932],
  ['Chula Vista','San Diego',32.640,-117.084,275487],
  ['Oceanside','San Diego',33.196,-117.379,174648],
  ['Escondido','San Diego',33.119,-117.087,151038],
  ['El Cajon','San Diego',32.794,-116.963,103982],
  ['Vista','San Diego',33.200,-117.243,101838],
  ['Carlsbad','San Diego',33.159,-117.351,115382],
  ['San Marcos','San Diego',33.142,-117.166,97702],
  ['Riverside','Riverside',33.982,-117.375,314998],
  ['San Bernardino','San Bernardino',34.108,-117.289,222101],
  ['Fontana','San Bernardino',34.092,-117.435,214547],
  ['Rancho Cucamonga','San Bernardino',34.106,-117.594,177603],
  ['Ontario','San Bernardino',34.064,-117.651,175265],
  ['Moreno Valley','Riverside',33.937,-117.230,208634],
  ['Corona','Riverside',33.875,-117.567,169868],
  ['Victorville','San Bernardino',34.536,-117.292,134810],
  ['Temecula','Riverside',33.494,-117.149,110003],
  ['Murrieta','Riverside',33.556,-117.214,117474],
  ['Rialto','San Bernardino',34.107,-117.371,103526],
  ['Hesperia','San Bernardino',34.427,-117.301,100823],
  ['Indio','Riverside',33.720,-116.215,91812],
  ['Menifee','Riverside',33.688,-117.184,102527],
  ['Palm Springs','Riverside',33.830,-116.546,48573],
  ['Chino','San Bernardino',34.012,-117.689,91394],
  ['Fresno','Fresno',36.737,-119.787,542107],
  ['Clovis','Fresno',36.825,-119.703,123000],
  ['Stockton','San Joaquin',37.956,-121.291,311178],
  ['Modesto','Stanislaus',37.638,-120.997,218464],
  ['Bakersfield','Kern',35.374,-119.019,403455],
  ['Visalia','Tulare',36.330,-119.292,141384],
  ['Salinas','Monterey',36.678,-121.655,163542],
  ['Turlock','Stanislaus',37.495,-120.845,73305],
  ['Tracy','San Joaquin',37.740,-121.429,96305],
  ['Manteca','San Joaquin',37.797,-121.218,91000],
  ['Merced','Merced',37.302,-120.483,84123],
  ['Chico','Butte',39.729,-121.836,103079],
  ['Redding','Shasta',40.587,-122.391,93582],
  ['Santa Cruz','Santa Cruz',36.974,-122.026,65459],
  ['Santa Barbara','Santa Barbara',34.421,-119.698,91930],
  ['Santa Maria','Santa Barbara',34.952,-120.436,107600],
  ['San Luis Obispo','San Luis Obispo',35.283,-120.660,46467],
];

const CITY_LOOKUP = {};
CITY_GEO.forEach(([name,county,lat,lon,pop]) => {
  const svgPt = geoToSvg(lat,lon);
  const rec = { name, county, lat, lon, pop, svgX:svgPt.x, svgY:svgPt.y };
  CITY_LOOKUP[normCity(name)] = rec;
  CITY_LOOKUP[`${normCity(name)}|${normCounty(county).toLowerCase()}`] = rec;
});
const lookupCity = (name,county) => {
  const k1 = `${normCity(name)}|${normCounty(county||'').toLowerCase()}`;
  return CITY_LOOKUP[k1] || CITY_LOOKUP[normCity(name)] || null;
};

// ═══════════════════════════════════════════════════════════════
// BASELINE DATA
// ═══════════════════════════════════════════════════════════════
const BASELINE = {
  "Alameda":        { permitDays:195, feesPerUnit:72000,  ceqaRisk:0.75, coastalPct:12,  fireZonePct:18,  heCompliance:"compliant",     approvalRate:0.78, population:1682353,  medianHomePrice:1150000,  airportNoisePct:12,  histPreservation:0.70, calGreen:0.72 },
  "Alpine":         { permitDays:45,  feesPerUnit:8000,   ceqaRisk:0.15, coastalPct:0,   fireZonePct:85,  heCompliance:"compliant",     approvalRate:0.92, population:1204,     medianHomePrice:425000,  airportNoisePct:0,   histPreservation:0.05, calGreen:0.10 },
  "Amador":         { permitDays:55,  feesPerUnit:12000,  ceqaRisk:0.20, coastalPct:0,   fireZonePct:72,  heCompliance:"non-compliant", approvalRate:0.85, population:40474,    medianHomePrice:385000,  airportNoisePct:0,   histPreservation:0.55, calGreen:0.15 },
  "Butte":          { permitDays:75,  feesPerUnit:18000,  ceqaRisk:0.35, coastalPct:0,   fireZonePct:68,  heCompliance:"compliant",     approvalRate:0.82, population:211632,   medianHomePrice:340000,  airportNoisePct:2,   histPreservation:0.22, calGreen:0.20 },
  "Calaveras":      { permitDays:60,  feesPerUnit:14000,  ceqaRisk:0.25, coastalPct:0,   fireZonePct:78,  heCompliance:"non-compliant", approvalRate:0.88, population:45905,    medianHomePrice:395000,  airportNoisePct:0,   histPreservation:0.45, calGreen:0.15 },
  "Colusa":         { permitDays:40,  feesPerUnit:9000,   ceqaRisk:0.12, coastalPct:0,   fireZonePct:15,  heCompliance:"compliant",     approvalRate:0.94, population:21917,    medianHomePrice:295000,  airportNoisePct:0,   histPreservation:0.10, calGreen:0.10 },
  "Contra Costa":   { permitDays:165, feesPerUnit:58000,  ceqaRisk:0.65, coastalPct:8,   fireZonePct:28,  heCompliance:"compliant",     approvalRate:0.76, population:1161413,  medianHomePrice:875000,  airportNoisePct:8,   histPreservation:0.48, calGreen:0.55 },
  "Del Norte":      { permitDays:70,  feesPerUnit:15000,  ceqaRisk:0.30, coastalPct:45,  fireZonePct:55,  heCompliance:"non-compliant", approvalRate:0.80, population:27812,    medianHomePrice:285000,  airportNoisePct:1,   histPreservation:0.12, calGreen:0.15 },
  "El Dorado":      { permitDays:105, feesPerUnit:38000,  ceqaRisk:0.50, coastalPct:0,   fireZonePct:72,  heCompliance:"compliant",     approvalRate:0.79, population:192843,   medianHomePrice:625000,  airportNoisePct:1,   histPreservation:0.32, calGreen:0.25 },
  "Fresno":         { permitDays:68,  feesPerUnit:18000,  ceqaRisk:0.30, coastalPct:0,   fireZonePct:18,  heCompliance:"compliant",     approvalRate:0.86, population:1008654,  medianHomePrice:365000,  airportNoisePct:5,   histPreservation:0.20, calGreen:0.20 },
  "Glenn":          { permitDays:42,  feesPerUnit:10000,  ceqaRisk:0.15, coastalPct:0,   fireZonePct:22,  heCompliance:"compliant",     approvalRate:0.91, population:28750,    medianHomePrice:285000,  airportNoisePct:0,   histPreservation:0.10, calGreen:0.10 },
  "Humboldt":       { permitDays:135, feesPerUnit:25000,  ceqaRisk:0.50, coastalPct:58,  fireZonePct:45,  heCompliance:"compliant",     approvalRate:0.75, population:136310,   medianHomePrice:395000,  airportNoisePct:2,   histPreservation:0.35, calGreen:0.30 },
  "Imperial":       { permitDays:48,  feesPerUnit:10000,  ceqaRisk:0.15, coastalPct:0,   fireZonePct:5,   heCompliance:"compliant",     approvalRate:0.90, population:180701,   medianHomePrice:285000,  airportNoisePct:3,   histPreservation:0.10, calGreen:0.12 },
  "Inyo":           { permitDays:55,  feesPerUnit:12000,  ceqaRisk:0.22, coastalPct:0,   fireZonePct:45,  heCompliance:"compliant",     approvalRate:0.88, population:19016,    medianHomePrice:325000,  airportNoisePct:1,   histPreservation:0.20, calGreen:0.12 },
  "Kern":           { permitDays:58,  feesPerUnit:15000,  ceqaRisk:0.25, coastalPct:0,   fireZonePct:22,  heCompliance:"compliant",     approvalRate:0.87, population:909235,   medianHomePrice:315000,  airportNoisePct:4,   histPreservation:0.15, calGreen:0.18 },
  "Kings":          { permitDays:50,  feesPerUnit:12000,  ceqaRisk:0.18, coastalPct:0,   fireZonePct:8,   heCompliance:"compliant",     approvalRate:0.89, population:153443,   medianHomePrice:295000,  airportNoisePct:3,   histPreservation:0.12, calGreen:0.15 },
  "Lake":           { permitDays:85,  feesPerUnit:18000,  ceqaRisk:0.35, coastalPct:0,   fireZonePct:75,  heCompliance:"non-compliant", approvalRate:0.80, population:68766,    medianHomePrice:295000,  airportNoisePct:0,   histPreservation:0.15, calGreen:0.18 },
  "Lassen":         { permitDays:45,  feesPerUnit:10000,  ceqaRisk:0.15, coastalPct:0,   fireZonePct:62,  heCompliance:"compliant",     approvalRate:0.92, population:30573,    medianHomePrice:245000,  airportNoisePct:1,   histPreservation:0.10, calGreen:0.10 },
  "Los Angeles":    { permitDays:185, feesPerUnit:35000,  ceqaRisk:0.72, coastalPct:8,   fireZonePct:28,  heCompliance:"compliant",     approvalRate:0.72, population:9829544,  medianHomePrice:925000,  airportNoisePct:22,  histPreservation:0.68, calGreen:0.58 },
  "Madera":         { permitDays:65,  feesPerUnit:16000,  ceqaRisk:0.28, coastalPct:0,   fireZonePct:35,  heCompliance:"compliant",     approvalRate:0.85, population:160089,   medianHomePrice:365000,  airportNoisePct:2,   histPreservation:0.15, calGreen:0.18 },
  "Marin":          { permitDays:340, feesPerUnit:95000,  ceqaRisk:0.95, coastalPct:68,  fireZonePct:65,  heCompliance:"compliant",     approvalRate:0.58, population:262321,   medianHomePrice:1650000, airportNoisePct:3,   histPreservation:0.72, calGreen:0.82 },
  "Mariposa":       { permitDays:55,  feesPerUnit:12000,  ceqaRisk:0.22, coastalPct:0,   fireZonePct:82,  heCompliance:"compliant",     approvalRate:0.88, population:17131,    medianHomePrice:385000,  airportNoisePct:0,   histPreservation:0.25, calGreen:0.15 },
  "Mendocino":      { permitDays:155, feesPerUnit:28000,  ceqaRisk:0.55, coastalPct:52,  fireZonePct:55,  heCompliance:"non-compliant", approvalRate:0.72, population:91601,    medianHomePrice:485000,  airportNoisePct:1,   histPreservation:0.38, calGreen:0.28 },
  "Merced":         { permitDays:62,  feesPerUnit:16000,  ceqaRisk:0.28, coastalPct:0,   fireZonePct:12,  heCompliance:"compliant",     approvalRate:0.86, population:286461,   medianHomePrice:365000,  airportNoisePct:5,   histPreservation:0.18, calGreen:0.18 },
  "Modoc":          { permitDays:38,  feesPerUnit:8000,   ceqaRisk:0.10, coastalPct:0,   fireZonePct:55,  heCompliance:"compliant",     approvalRate:0.95, population:8661,     medianHomePrice:195000,  airportNoisePct:0,   histPreservation:0.08, calGreen:0.10 },
  "Mono":           { permitDays:75,  feesPerUnit:22000,  ceqaRisk:0.35, coastalPct:0,   fireZonePct:58,  heCompliance:"compliant",     approvalRate:0.82, population:13247,    medianHomePrice:585000,  airportNoisePct:0,   histPreservation:0.18, calGreen:0.15 },
  "Monterey":       { permitDays:235, feesPerUnit:48000,  ceqaRisk:0.72, coastalPct:42,  fireZonePct:38,  heCompliance:"compliant",     approvalRate:0.68, population:439035,   medianHomePrice:825000,  airportNoisePct:4,   histPreservation:0.78, calGreen:0.48 },
  "Napa":           { permitDays:175, feesPerUnit:58000,  ceqaRisk:0.70, coastalPct:5,   fireZonePct:58,  heCompliance:"compliant",     approvalRate:0.72, population:138019,   medianHomePrice:895000,  airportNoisePct:3,   histPreservation:0.65, calGreen:0.52 },
  "Nevada":         { permitDays:95,  feesPerUnit:35000,  ceqaRisk:0.45, coastalPct:0,   fireZonePct:78,  heCompliance:"compliant",     approvalRate:0.78, population:103487,   medianHomePrice:595000,  airportNoisePct:0,   histPreservation:0.62, calGreen:0.28 },
  "Orange":         { permitDays:125, feesPerUnit:55000,  ceqaRisk:0.62, coastalPct:18,  fireZonePct:22,  heCompliance:"compliant",     approvalRate:0.75, population:3186989,  medianHomePrice:1125000, airportNoisePct:8,   histPreservation:0.35, calGreen:0.30 },
  "Placer":         { permitDays:82,  feesPerUnit:32000,  ceqaRisk:0.40, coastalPct:0,   fireZonePct:48,  heCompliance:"compliant",     approvalRate:0.82, population:412300,   medianHomePrice:675000,  airportNoisePct:2,   histPreservation:0.30, calGreen:0.28 },
  "Plumas":         { permitDays:50,  feesPerUnit:12000,  ceqaRisk:0.20, coastalPct:0,   fireZonePct:82,  heCompliance:"compliant",     approvalRate:0.90, population:19790,    medianHomePrice:325000,  airportNoisePct:0,   histPreservation:0.18, calGreen:0.12 },
  "Riverside":      { permitDays:88,  feesPerUnit:28000,  ceqaRisk:0.42, coastalPct:0,   fireZonePct:42,  heCompliance:"compliant",     approvalRate:0.84, population:2458395,  medianHomePrice:565000,  airportNoisePct:6,   histPreservation:0.28, calGreen:0.22 },
  "Sacramento":     { permitDays:92,  feesPerUnit:21000,  ceqaRisk:0.45, coastalPct:0,   fireZonePct:12,  heCompliance:"compliant",     approvalRate:0.82, population:1585055,  medianHomePrice:485000,  airportNoisePct:8,   histPreservation:0.52, calGreen:0.38 },
  "San Benito":     { permitDays:115, feesPerUnit:42000,  ceqaRisk:0.52, coastalPct:0,   fireZonePct:35,  heCompliance:"compliant",     approvalRate:0.78, population:64209,    medianHomePrice:725000,  airportNoisePct:0,   histPreservation:0.22, calGreen:0.22 },
  "San Bernardino": { permitDays:82,  feesPerUnit:22000,  ceqaRisk:0.38, coastalPct:0,   fireZonePct:42,  heCompliance:"compliant",     approvalRate:0.85, population:2194710,  medianHomePrice:485000,  airportNoisePct:7,   histPreservation:0.22, calGreen:0.20 },
  "San Diego":      { permitDays:145, feesPerUnit:42000,  ceqaRisk:0.55, coastalPct:15,  fireZonePct:38,  heCompliance:"compliant",     approvalRate:0.76, population:3298634,  medianHomePrice:925000,  airportNoisePct:18,  histPreservation:0.52, calGreen:0.45 },
  "San Francisco":  { permitDays:425, feesPerUnit:88000,  ceqaRisk:0.92, coastalPct:100, fireZonePct:5,   heCompliance:"compliant",     approvalRate:0.55, population:873965,   medianHomePrice:1485000, airportNoisePct:28,  histPreservation:0.92, calGreen:0.95 },
  "San Joaquin":    { permitDays:72,  feesPerUnit:19000,  ceqaRisk:0.32, coastalPct:0,   fireZonePct:8,   heCompliance:"compliant",     approvalRate:0.85, population:789410,   medianHomePrice:495000,  airportNoisePct:4,   histPreservation:0.28, calGreen:0.22 },
  "San Luis Obispo":{ permitDays:205, feesPerUnit:48000,  ceqaRisk:0.68, coastalPct:48,  fireZonePct:42,  heCompliance:"compliant",     approvalRate:0.70, population:283111,   medianHomePrice:825000,  airportNoisePct:3,   histPreservation:0.55, calGreen:0.50 },
  "San Mateo":      { permitDays:275, feesPerUnit:92000,  ceqaRisk:0.88, coastalPct:55,  fireZonePct:22,  heCompliance:"compliant",     approvalRate:0.62, population:764442,   medianHomePrice:1725000, airportNoisePct:35,  histPreservation:0.52, calGreen:0.72 },
  "Santa Barbara":  { permitDays:215, feesPerUnit:52000,  ceqaRisk:0.75, coastalPct:42,  fireZonePct:55,  heCompliance:"compliant",     approvalRate:0.68, population:448229,   medianHomePrice:985000,  airportNoisePct:5,   histPreservation:0.88, calGreen:0.55 },
  "Santa Clara":    { permitDays:195, feesPerUnit:78000,  ceqaRisk:0.82, coastalPct:5,   fireZonePct:15,  heCompliance:"compliant",     approvalRate:0.72, population:1936259,  medianHomePrice:1585000, airportNoisePct:10,  histPreservation:0.38, calGreen:0.75 },
  "Santa Cruz":     { permitDays:255, feesPerUnit:68000,  ceqaRisk:0.82, coastalPct:75,  fireZonePct:48,  heCompliance:"compliant",     approvalRate:0.62, population:270861,   medianHomePrice:1125000, airportNoisePct:2,   histPreservation:0.58, calGreen:0.62 },
  "Shasta":         { permitDays:62,  feesPerUnit:14000,  ceqaRisk:0.25, coastalPct:0,   fireZonePct:58,  heCompliance:"compliant",     approvalRate:0.88, population:182155,   medianHomePrice:345000,  airportNoisePct:2,   histPreservation:0.20, calGreen:0.18 },
  "Sierra":         { permitDays:40,  feesPerUnit:8000,   ceqaRisk:0.12, coastalPct:0,   fireZonePct:85,  heCompliance:"compliant",     approvalRate:0.94, population:3236,     medianHomePrice:285000,  airportNoisePct:0,   histPreservation:0.12, calGreen:0.10 },
  "Siskiyou":       { permitDays:52,  feesPerUnit:11000,  ceqaRisk:0.18, coastalPct:0,   fireZonePct:62,  heCompliance:"compliant",     approvalRate:0.90, population:44076,    medianHomePrice:265000,  airportNoisePct:1,   histPreservation:0.18, calGreen:0.12 },
  "Solano":         { permitDays:98,  feesPerUnit:35000,  ceqaRisk:0.45, coastalPct:12,  fireZonePct:12,  heCompliance:"compliant",     approvalRate:0.80, population:453491,   medianHomePrice:545000,  airportNoisePct:5,   histPreservation:0.28, calGreen:0.32 },
  "Sonoma":         { permitDays:195, feesPerUnit:62000,  ceqaRisk:0.72, coastalPct:22,  fireZonePct:62,  heCompliance:"compliant",     approvalRate:0.70, population:488863,   medianHomePrice:795000,  airportNoisePct:3,   histPreservation:0.60, calGreen:0.58 },
  "Stanislaus":     { permitDays:68,  feesPerUnit:17000,  ceqaRisk:0.28, coastalPct:0,   fireZonePct:8,   heCompliance:"compliant",     approvalRate:0.86, population:552878,   medianHomePrice:445000,  airportNoisePct:3,   histPreservation:0.22, calGreen:0.20 },
  "Sutter":         { permitDays:55,  feesPerUnit:14000,  ceqaRisk:0.22, coastalPct:0,   fireZonePct:5,   heCompliance:"compliant",     approvalRate:0.88, population:99633,    medianHomePrice:385000,  airportNoisePct:2,   histPreservation:0.15, calGreen:0.15 },
  "Tehama":         { permitDays:48,  feesPerUnit:11000,  ceqaRisk:0.18, coastalPct:0,   fireZonePct:55,  heCompliance:"compliant",     approvalRate:0.90, population:65829,    medianHomePrice:285000,  airportNoisePct:1,   histPreservation:0.12, calGreen:0.10 },
  "Trinity":        { permitDays:45,  feesPerUnit:9000,   ceqaRisk:0.15, coastalPct:0,   fireZonePct:78,  heCompliance:"compliant",     approvalRate:0.92, population:16060,    medianHomePrice:245000,  airportNoisePct:0,   histPreservation:0.12, calGreen:0.10 },
  "Tulare":         { permitDays:52,  feesPerUnit:12000,  ceqaRisk:0.22, coastalPct:0,   fireZonePct:22,  heCompliance:"compliant",     approvalRate:0.88, population:473117,   medianHomePrice:325000,  airportNoisePct:2,   histPreservation:0.15, calGreen:0.18 },
  "Tuolumne":       { permitDays:65,  feesPerUnit:15000,  ceqaRisk:0.28, coastalPct:0,   fireZonePct:78,  heCompliance:"compliant",     approvalRate:0.85, population:55810,    medianHomePrice:385000,  airportNoisePct:0,   histPreservation:0.40, calGreen:0.18 },
  "Ventura":        { permitDays:185, feesPerUnit:48000,  ceqaRisk:0.70, coastalPct:32,  fireZonePct:52,  heCompliance:"compliant",     approvalRate:0.70, population:843843,   medianHomePrice:825000,  airportNoisePct:4,   histPreservation:0.50, calGreen:0.45 },
  "Yolo":           { permitDays:88,  feesPerUnit:28000,  ceqaRisk:0.42, coastalPct:0,   fireZonePct:15,  heCompliance:"compliant",     approvalRate:0.82, population:216986,   medianHomePrice:565000,  airportNoisePct:4,   histPreservation:0.30, calGreen:0.38 },
  "Yuba":           { permitDays:55,  feesPerUnit:14000,  ceqaRisk:0.22, coastalPct:0,   fireZonePct:35,  heCompliance:"compliant",     approvalRate:0.86, population:81575,    medianHomePrice:385000,  airportNoisePct:3,   histPreservation:0.18, calGreen:0.18 },
};

const COUNTY_SHAPES = {
  "Alameda":[[395,285],[420,275],[435,290],[430,315],[405,325],[390,310]],
  "Alpine":[[445,235],[460,225],[470,240],[460,255],[445,250]],
  "Amador":[[420,250],[445,240],[455,260],[440,275],[420,270]],
  "Butte":[[385,145],[420,130],[440,155],[420,180],[390,170]],
  "Calaveras":[[430,265],[460,255],[475,280],[455,300],[430,290]],
  "Colusa":[[355,165],[385,155],[395,180],[375,195],[350,185]],
  "Contra Costa":[[380,270],[410,260],[425,280],[415,300],[385,295]],
  "Del Norte":[[290,45],[320,35],[335,60],[315,80],[290,70]],
  "El Dorado":[[440,215],[485,200],[505,235],[475,260],[445,245]],
  "Fresno":[[400,340],[480,315],[510,380],[460,420],[395,385]],
  "Glenn":[[355,140],[385,130],[395,155],[375,170],[350,160]],
  "Humboldt":[[290,80],[335,65],[355,115],[320,145],[285,125]],
  "Imperial":[[520,510],[600,490],[620,545],[560,575],[515,550]],
  "Inyo":[[500,320],[560,290],[590,400],[545,470],[490,410]],
  "Kern":[[420,400],[510,370],[545,460],[480,510],[410,460]],
  "Kings":[[400,385],[445,365],[465,405],[435,435],[395,415]],
  "Lake":[[330,175],[365,165],[380,195],[355,215],[325,200]],
  "Lassen":[[430,85],[490,65],[520,115],[480,145],[430,125]],
  "Los Angeles":[[400,455],[490,430],[520,490],[470,535],[395,505]],
  "Madera":[[425,300],[475,280],[500,330],[460,365],[420,340]],
  "Marin":[[345,265],[375,255],[385,280],[365,300],[340,290]],
  "Mariposa":[[455,285],[495,270],[515,310],[485,340],[450,320]],
  "Mendocino":[[290,125],[340,110],[365,170],[325,205],[285,175]],
  "Merced":[[395,315],[440,300],[460,345],[425,375],[390,355]],
  "Modoc":[[475,45],[535,25],[560,75],[520,105],[475,85]],
  "Mono":[[475,245],[530,220],[555,300],[510,345],[470,305]],
  "Monterey":[[340,345],[400,320],[430,400],[375,445],[330,400]],
  "Napa":[[360,220],[390,210],[405,245],[385,265],[355,250]],
  "Nevada":[[430,185],[470,170],[490,205],[465,230],[430,215]],
  "Orange":[[460,490],[505,475],[520,515],[490,540],[455,520]],
  "Placer":[[430,170],[480,155],[505,200],[475,230],[435,210]],
  "Plumas":[[430,125],[490,105],[520,155],[480,185],[435,165]],
  "Riverside":[[490,490],[590,460],[625,540],[560,580],[495,545]],
  "Sacramento":[[390,220],[430,205],[450,250],[420,280],[385,260]],
  "San Benito":[[375,345],[415,330],[435,380],[400,410],[370,385]],
  "San Bernardino":[[520,380],[620,340],[670,470],[600,530],[530,470]],
  "San Diego":[[480,540],[560,515],[595,585],[545,620],[480,590]],
  "San Francisco":[[355,290],[375,285],[380,305],[365,315],[350,305]],
  "San Joaquin":[[400,270],[440,255],[460,300],[430,330],[395,310]],
  "San Luis Obispo":[[355,395],[415,370],[445,445],[395,485],[345,445]],
  "San Mateo":[[350,305],[380,295],[395,330],[370,355],[345,340]],
  "Santa Barbara":[[365,445],[430,420],[465,480],[420,515],[360,490]],
  "Santa Clara":[[375,315],[415,300],[440,355],[400,385],[365,360]],
  "Santa Cruz":[[345,340],[380,325],[400,370],[365,400],[335,375]],
  "Shasta":[[375,85],[435,65],[465,120],[425,155],[375,130]],
  "Sierra":[[455,155],[490,140],[510,175],[480,195],[455,180]],
  "Siskiyou":[[335,35],[425,15],[465,75],[400,110],[335,85]],
  "Solano":[[365,235],[400,225],[420,265],[395,285],[360,270]],
  "Sonoma":[[315,200],[360,185],[385,235],[350,265],[310,245]],
  "Stanislaus":[[400,295],[445,280],[470,330],[435,360],[395,340]],
  "Sutter":[[385,185],[415,175],[430,210],[405,230],[380,215]],
  "Tehama":[[355,115],[400,100],[425,145],[390,170],[355,155]],
  "Trinity":[[320,85],[375,70],[400,120],[360,155],[315,130]],
  "Tulare":[[445,365],[505,340],[540,420],[490,465],[440,425]],
  "Tuolumne":[[455,250],[505,235],[530,285],[495,315],[455,295]],
  "Ventura":[[395,455],[455,435],[485,495],[440,530],[390,500]],
  "Yolo":[[365,200],[400,190],[420,235],[390,255],[360,240]],
  "Yuba":[[400,170],[430,160],[450,195],[425,215],[395,200]],
};

// ═══════════════════════════════════════════════════════════════
// LAYERS
// ═══════════════════════════════════════════════════════════════
const LAYERS = {
  composite:    { label:'Overall Difficulty', color:PDS.ember,    weight:null,
    description:'A weighted composite of all eight regulatory factors below. Counties scoring above 75 face conditions hostile enough to make most projects economically unviable. Think of it as the sum total of institutional resistance a builder must overcome.' },
  permitDays:   { label:'Permit Timeline',    color:PDS.electric, weight:0.20, format:v=>`${v}d`, domain:[30,450],
    description:'The median number of calendar days from application to permit issuance for a new residential project. Every extra month is dead carrying cost — land loans accruing, construction windows closing, pro formas collapsing. San Francisco routinely exceeds a year.' },
  feesPerUnit:  { label:'Dev Fees / Unit',    color:PDS.fuel,     weight:0.20, format:v=>fmtK(v), domain:[5000,100000],
    description:'Total government-imposed fees per housing unit: impact fees, plan check, utility connections, school fees, and affordable housing in-lieu payments. In coastal California these can exceed $150,000 per unit — a pure regulatory tax on housing production.' },
  ceqaRisk:     { label:'CEQA Risk',          color:PDS.ember,    weight:0.09, format:v=>`${Math.round(v*100)}%`, domain:[0,1],
    description:'Probability of a project facing California Environmental Quality Act litigation or extended review. CEQA is frequently weaponized by neighbors and competitors to kill projects that have nothing to do with environmental harm. A high score means delay, legal fees, and settlement costs.' },
  coastalPct:   { label:'Coastal Zone',       color:PDS.coolant,  weight:0.10, format:v=>`${v}%`, domain:[0,100],
    description:'Percentage of the jurisdiction\'s land area subject to California Coastal Commission review. Coastal Act permitting adds a second approval layer on top of local permits, with its own appeals process. Projects in the Coastal Zone can take years longer than identical inland projects.' },
  fireZonePct:  { label:'Fire Hazard',        color:'#A8441F',   weight:0.10, format:v=>`${v}%`, domain:[0,100],
    description:'Share of land in a CalFire High or Very High Fire Hazard Severity Zone. Building in these zones triggers mandatory hardening requirements, insurance difficulties, and sometimes outright denial. After Paradise and Lahaina, some insurers have simply exited California entirely.' },
  approvalRate: { label:'Approval Rate',      color:PDS.electric, weight:0.10, format:v=>`${Math.round(v*100)}%`, domain:[0,1], invert:true,
    description:'The fraction of submitted housing applications that reach final approval. A low approval rate signals a hostile planning commission, aggressive design review, or a council with a pattern of finding pretextual grounds to deny. High is good — low means the game is rigged.' },
  airportNoisePct:{ label:'Airport Noise Zone', color:PDS.reactor,  weight:0.06, format:v=>`${v}%`, domain:[0,40],
    description:"Percentage of the county's developable residential land inside a 65 dB CNEL contour — the noise threshold at which California Building Code §1207 mandates acoustic analysis and mitigation. Sourced from Airport Land Use Compatibility Plans (ALUCPs) filed with Caltrans Division of Aeronautics. High-noise zones add acoustic study costs ($5k–$20k per project), mandatory building treatment, and in some cases outright prohibition of residential use. San Mateo (SFO), Los Angeles (LAX + six general aviation airports), and San Diego (Lindbergh + Miramar + Montgomery) are the most constrained." },
  histPreservation:{ label:'Historic Preservation', color:'#7A5C3A', weight:0.05, format:v=>`${Math.round(v*100)}%`, domain:[0,1],
    description:"Share of a county's developable land subject to historic preservation overlay review. Designated historic districts — enforced under the California Historic Building Code and local ordinances — impose design review, materials restrictions, and demolition constraints that can add months and five-figure compliance costs to otherwise routine projects. San Francisco's blanket neighborhood designations, Santa Barbara's Spanish Colonial enforcement, and Gold Rush-era foothill counties carry the heaviest burden. Even a single contributing structure on a parcel can trigger full discretionary review." },
  calGreen:     { label:'CalGreen Tier',      color:PDS.coolant,  weight:0.05, format:v=>fmtK(calGreenCost(v)), domain:[0,1],
    description:"Estimated hard-cost premium per unit above state CalGreen baseline (Title 24 Part 11), based on CEC cost-effectiveness studies and CBSC Title 24 Part 11 regulatory impact analyses. Tier 1 amendments add roughly $2k–$8k/unit (20% efficiency gain, EV conduit, enhanced water fixtures). Tier 2 adds $8k–$25k/unit (30% efficiency, stricter waste and IAQ). Energy reach codes with all-electric mandates — as in San Francisco and Berkeley — push compliance costs to $25k–$45k/unit through heat pump HVAC, induction-only kitchens, and battery-ready wiring. Unlike impact fees, these are construction cost increases baked into contractor bids, not line-item charges." },
};

const scoreMetrics = (data) => {
  const norm = {};
  let composite = 0;
  for (const [key,cfg] of Object.entries(LAYERS)) {
    if (key==='composite'||cfg.categorical) continue;
    const [mn,mx] = cfg.domain;
    let n = clamp(((data[key]??mn)-mn)/(mx-mn),0,1);
    if (cfg.invert) n = 1-n;
    norm[key] = n;
    composite += n * cfg.weight;
  }
  if (data.heCompliance==='non-compliant') composite += 0.05;
  return { ...data, normalized:norm, composite:clamp(composite,0,1) };
};

// ═══════════════════════════════════════════════════════════════
// CITY RECORD BUILDER
// ═══════════════════════════════════════════════════════════════
function buildCityRecord(geoEntry, scraperRec, hcdCity, countyBase) {
  const hcd     = hcdCity || {};
  const scraper = scraperRec?.fees || {};
  const base    = countyBase || {};

  // CEQA detail enrichment
  const ceqaKey1 = `${normCity(geoEntry.name)}|${normCounty(geoEntry.county).toLowerCase()}`;
  const ceqaRec = CEQA_LOOKUP[ceqaKey1] || CEQA_LOOKUP[normCity(geoEntry.name)];
  const ceqaDetail = ceqaRec?.ceqa || null;
  const ceqaRisk = ceqaDetail ? computeCeqaRisk(ceqaDetail) : (base.ceqaRisk || 0.4);

  return {
    name:           geoEntry.name,
    county:         geoEntry.county,
    population:     scraperRec?.population || geoEntry.pop,
    svgX:           geoEntry.svgX, svgY:geoEntry.svgY,
    lat:            geoEntry.lat,  lon:geoEntry.lon,
    feesPerUnit:    scraper.estimatedTotalNewSFR || base.feesPerUnit || 30000,
    permitDays:     base.permitDays  || 90,
    ceqaRisk,
    ceqaDetail,
    ceqaStatus:     ceqaRec?.status || 'none',
    coastalPct:     base.coastalPct  || 0,
    fireZonePct:    base.fireZonePct || 20,
    airportNoisePct: base.airportNoisePct ?? 0,
    calGreen:       base.calGreen    ?? 0.20,
    histPreservation: base.histPreservation ?? 0.20,
    approvalRate:   base.approvalRate|| 0.80,
    heCompliance:   hcd.heCompliance || base.heCompliance || 'compliant',
    hasFeeData:     !!scraperRec?.fees?.estimatedTotalNewSFR,
    hasHCDData:     Object.keys(hcd).length > 0,
    scraperRecord:  scraperRec,
    estimatedSFR:   scraper.estimatedTotalNewSFR,
    estimatedMF:    scraper.estimatedTotalMultiFamily,
    transportFee:   scraper.transportationImpactFee,
    parkFee:        scraper.parkImpactFee,
    waterCapFee:    scraper.waterCapacityFee,
    sewerCapFee:    scraper.sewerCapacityFee,
    affordInLieu:   scraper.affordableHousingInLieu,
    inclusionary:   scraper.inclusionaryRequirement,
    planCheck:      scraper.planCheckFee,
    sourceUrl:      scraperRec?.feeSourceUrl,
    docYear:        scraper.documentYear || scraperRec?.documentYear,
    dataQuality:    scraperRec?.dataQualityScore || 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// HCD DATA HOOK
// ═══════════════════════════════════════════════════════════════
function useHCDData() {
  const [state, setState] = useState({ fetchStatus:'idle', countyLive:{}, cityLive:{}, sources:{}, lastFetched:null });
  const abortRef = useRef(null);

  const fetchAll = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setState(s=>({...s, fetchStatus:'fetching',
      sources:{ apr:{label:'APR Permits',status:'fetching'}, he:{label:'Housing Element',status:'fetching'} }
    }));
    const countyAgg={}, cityData={}, srcRes={};
    const mergeCounty=(county,data)=>{ const k=normCounty(county); if(!countyAgg[k])countyAgg[k]={}; Object.assign(countyAgg[k],data); };
    const mergeCity=(city,county,data)=>{
      const k1=`${normCity(city)}|${normCounty(county).toLowerCase()}`;
      const k2=normCity(city);
      if(!cityData[k1])cityData[k1]={}; Object.assign(cityData[k1],data);
      if(!cityData[k2])cityData[k2]={}; Object.assign(cityData[k2],data);
    };
    async function fetchPkg(slug){
      const r=await fetch(`${HCD_BASE}/package_show?id=${slug}`,{signal:ctrl.signal});
      const j=await r.json(); if(!j.success)throw new Error('pkg fail');
      return j.result.resources.filter(r=>r.datastore_active).sort((a,b)=>new Date(b.last_modified||0)-new Date(a.last_modified||0));
    }
    async function fetchDS(id){
      const r=await fetch(`${HCD_BASE}/datastore_search?resource_id=${encodeURIComponent(id)}&limit=10000`,{signal:ctrl.signal});
      const j=await r.json(); if(!j.success)throw new Error('ds fail'); return j.result;
    }
    await Promise.allSettled([
      (async()=>{
        try{
          const res=(await fetchPkg(PACKAGES.APR))[0]; const {records}=await fetchDS(res.id);
          const JNAME=['jurisdiction_name','jurisdiction','city','City']; const CNAME=['county','county_name','County'];
          const TOTAL=['total_units','Total_Units','dr_total','total_dr'];
          const cB={};
          for(const rec of records){ const j=getField(rec,JNAME); const c=normCounty(getField(rec,CNAME)||''); const u=safeFloat(getField(rec,TOTAL));
            if(c)cB[c]=(cB[c]||0)+u; if(j&&c)mergeCity(j,c,{permitCount:u}); }
          for(const[c,n]of Object.entries(cB))mergeCounty(c,{permitCount:n});
          srcRes.apr={label:'APR Permits',status:'success',records:records.length,year:new Date(res.last_modified||Date.now()).getFullYear()};
        }catch(e){if(e.name!=='AbortError')srcRes.apr={label:'APR Permits',status:'error',error:e.message};}
        setState(s=>({...s,sources:{...s.sources,...srcRes}}));
      })(),
      (async()=>{
        try{
          const res=(await fetchPkg(PACKAGES.SB35))[0]; const {records}=await fetchDS(res.id);
          const JNAME=['jurisdiction_name','jurisdiction','city','City']; const CNAME=['county','County'];
          const HEF=['he_status','HE_Status','housing_element_status','compliance_status'];
          const cHE={};
          for(const rec of records){
            const j=getField(rec,JNAME); const c=normCounty(getField(rec,CNAME)||'');
            const he=(getField(rec,HEF,'')||'').toLowerCase();
            const isCom=he&&!he.includes('non')&&(he.includes('compliant')||he.includes('certified')); const isNon=he&&he.includes('non');
            if(j&&c){ const upd={};
              if(isCom)upd.heCompliance='compliant'; else if(isNon)upd.heCompliance='non-compliant';
              if(Object.keys(upd).length)mergeCity(j,c,upd); }
            if(c){ if(!cHE[c])cHE[c]={y:0,n:0};
              if(isCom)cHE[c].y++; if(isNon)cHE[c].n++; }
          }
          for(const[c,v]of Object.entries(cHE))if(v.y+v.n>0)mergeCounty(c,{heCompliance:v.y>=v.n?'compliant':'non-compliant'});
          srcRes.he={label:'Housing Element',status:'success',records:records.length,year:new Date(res.last_modified||Date.now()).getFullYear()};
        }catch(e){if(e.name!=='AbortError')srcRes.he={label:'Housing Element',status:'error',error:e.message};}
        setState(s=>({...s,sources:{...s.sources,...srcRes}}));
      })(),
    ]);
    if(ctrl.signal.aborted)return;
    const ok=Object.values(srcRes).filter(s=>s.status==='success').length;
    setState({ fetchStatus:ok===0?'error':ok<2?'partial':'success', countyLive:countyAgg, cityLive:cityData, sources:srcRes, lastFetched:new Date() });
  },[]);

  useEffect(()=>{ fetchAll(); return()=>abortRef.current?.abort(); },[fetchAll]);
  return {...state, refresh:fetchAll};
}

// ═══════════════════════════════════════════════════════════════
// PDS DESIGN COMPONENTS
// ═══════════════════════════════════════════════════════════════

// Section header — Oswald uppercase with ember rule
const SectionLabel = ({ children, accent=PDS.ember }) => (
  <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.7rem',
    fontVariant:'small-caps', letterSpacing:'0.1em', color:PDS.reactor,
    borderBottom:`2px solid ${PDS.reactor}`, paddingBottom:'0.3rem', marginBottom:'0.75rem', fontWeight:700 }}>
    {children}
  </div>
);

// Monospace data value — Courier Prime
const DataVal = ({ children, color=PDS.fuel, size='0.9rem' }) => (
  <span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", color, fontSize:size, fontWeight:400 }}>
    {children}
  </span>
);

// Classification stamp — for difficulty tiers
const TierStamp = ({ tier, score }) => (
  <div style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem',
    border:`1px solid ${PDS.mist}`, borderLeft:`3px solid ${tier.color}`, padding:'0.15rem 0.6rem' }}>
    <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.65rem',
      fontVariant:'small-caps', letterSpacing:'0.1em', color:tier.color, fontWeight:700 }}>
      {tier.label}
    </span>
  </div>
);

// Blueprint grid background element
// Penney: clean paper — no grid texture
const BlueprintGrid = () => null;

// Penney: no grid texture — clean paper surface
const PaperTexture = () => null;

// Live indicator — Pope Electric, not green
const LivePip = ({ color=PDS.electric, active=true }) => (
  <span style={{ display:'inline-block', width:5, height:5, borderRadius:'50%',
    background: active?color:PDS.fog, verticalAlign:'middle', marginLeft:3,
    boxShadow: undefined,
    animation: active?'pip 2.5s infinite':undefined }} />
);

// ═══════════════════════════════════════════════════════════════
// METRO ZOOM MAP
// ═══════════════════════════════════════════════════════════════
function MetroZoomMap({ metroKey, cityScores, geoBounds, selectedCity, onCityClick, onClose }) {
  const metro = METROS[metroKey];
  if (!metro) return null;
  const [latMin,latMax,lonMin,lonMax] = metro.bounds;
  const W=420, H=360, PAD=28;
  // Aspect-correct the metro zoom map using the same cos(refLat) approach
  const refLat = (latMin+latMax)/2;
  const cosLat = Math.cos(refLat * Math.PI/180);
  const lonSpan = lonMax-lonMin, latSpan = latMax-latMin;
  // Scale to fit within W×H while preserving aspect
  const xScale = (W-PAD*2) / lonSpan;
  const yScale = (H-PAD*2) / latSpan;
  // Use the tighter constraint, applying cos correction to x
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
      <div style={{ background:PDS.shadow, border:`1px solid ${PDS.ember}60`,
        width:'min(660px,96vw)', maxHeight:'94vh', display:'flex', flexDirection:'column', gap:0, overflow:'hidden' }}>

        {/* Header — Ferriss monumental */}
        <div style={{ background:PDS.reactor, borderBottom:`2px solid ${PDS.reactor}`,
          padding:'0.875rem 1.25rem', display:'flex', justifyContent:'space-between', alignItems:'center', position:'relative' }}>
          <BlueprintGrid />
          <div style={{ position:'relative' }}>
            <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem', letterSpacing:'0.25em',
              color:PDS.oxide, textTransform:'uppercase', marginBottom:3 }}>Field Report · Metro Zone</div>
            <h2 style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
              fontSize:'1.4rem', fontWeight:700, color:PDS.shadow, margin:0 }}>
              {metroKey}
            </h2>
          </div>
          <button onClick={onClose} style={{ background:'none', border:`1px solid ${PDS.fog}`,
            color:PDS.void, fontSize:'0.8rem', cursor:'pointer', padding:'0.3rem 0.6rem',
            fontFamily:"'IBM Plex Mono','Consolas',monospace", background:'transparent', border:`1px solid ${PDS.fuel}` }}>✕ CLOSE</button>
        </div>

        {/* Blueprint map */}
        <div style={{ padding:'1rem', position:'relative', background:PDS.void }}>
          <BlueprintGrid />
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', display:'block', position:'relative' }}>
            {/* County watermarks */}
            {metro.counties.map(county=>{
              const cs=cities.filter(c=>c.county===county);
              if(!cs.length)return null;
              const xs=cs.map(c=>toSvg(c.lat,c.lon).x), ys=cs.map(c=>toSvg(c.lat,c.lon).y);
              const cx=xs.reduce((a,b)=>a+b,0)/xs.length, cy=ys.reduce((a,b)=>a+b,0)/ys.length;
              return <text key={county} x={cx} y={cy} fill={`${PDS.electric}40`} fontSize="11"
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
                  {isSelected&&<circle cx={pt.x} cy={pt.y} r={r+5} fill="none" stroke={PDS.reactor} strokeWidth="1.5"/>}
                  <circle cx={pt.x} cy={pt.y} r={r} fill={col}
                    fillOpacity={city.hasFeeData?0.88:0.35}
                    stroke={city.hasFeeData?col:PDS.fog} strokeWidth={city.hasFeeData?1:0.6}/>
                  {city.hasFeeData&&r>8&&<text x={pt.x} y={pt.y+1} textAnchor="middle" dominantBaseline="middle"
                    fill="#FDFCF9" fontSize={r>12?"9":"7"} fontWeight="700"
                    fontFamily="'IBM Plex Mono','Consolas',monospace">{Math.round(s*100)}</text>}
                  <text x={pt.x} y={pt.y+r+9} textAnchor="middle"
                    fill={isSelected?PDS.reactor:PDS.oxide} fontSize={isSelected?8:7}
                    fontFamily="'Source Serif 4','Charter',Georgia,serif" letterSpacing="1" fontWeight="600">
                    {city.name.toUpperCase().split(' ')[0]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Tier legend */}
        <div style={{ padding:'0.75rem 1.25rem', background:PDS.shadow,
          borderTop:`1px solid ${PDS.fog}`, display:'flex', gap:'1rem', flexWrap:'wrap' }}>
          {TIERS.slice().reverse().map(t=>(
            <div key={t.label} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:11, height:11, background:t.color, borderRadius:2 }} />
              <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.72rem',
                letterSpacing:'0.1em', color:PDS.fuel, textTransform:'uppercase' }}>{t.label}</span>
            </div>
          ))}
          <span style={{ marginLeft:'auto', fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.65rem', color:PDS.fog }}>
            {cities.filter(c=>c.hasFeeData).length} scraped · {cities.length} total
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TOOLTIP DICTIONARIES
// ═══════════════════════════════════════════════════════════════
const CEQA_TIPS = {
  'Avg. Review Days':     'Mean calendar days from CEQA filing to final determination. Longer reviews delay project starts and add holding costs.',
  'Cat. Exemption Rate':  'Share of projects granted categorical exemption — fast-tracked past full environmental review. Higher = easier path to approval.',
  'EIR Rate':             'Share of projects requiring a full Environmental Impact Report — the most expensive and time-consuming CEQA outcome.',
  'Mitigated Neg. Dec.':  'Share resolved via Mitigated Negative Declaration: environmental concerns exist but can be addressed with conditions.',
  'Composite CEQA Risk':  'Weighted composite: EIR rate normalized against a 22% ceiling (40% weight) + avg review days normalized against a 350-day ceiling (35% weight) + inverse categorical exemption rate (25% weight). Each component is clamped 0–1 before weighting. Higher = harder to build.',
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
          background:PDS.void, border:`1px solid ${PDS.mist}`, borderLeft:`3px solid ${PDS.ember}`,
          padding:'0.5rem 0.6rem', pointerEvents:'none',
          boxShadow:`0 2px 6px rgba(26,26,26,.1)` }}>
          <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
            letterSpacing:'0.15em', color:PDS.ember, textTransform:'uppercase', fontWeight:600,
            marginBottom:3 }}>{label}</div>
          <div style={{ fontFamily:"'Source Serif 4',Georgia,serif", fontSize:'0.72rem',
            color:PDS.fuel, lineHeight:1.55, fontStyle:'italic' }}>{tip}</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CITY DETAIL
// ═══════════════════════════════════════════════════════════════
function CityDetail({ city, onBack }) {
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
    <div style={{ background:PDS.shadow, border:`1px solid ${PDS.mist}`, borderTop:`2px solid ${PDS.reactor}` }}>
      {/* Header */}
      <div style={{ padding:'1rem', borderBottom:`1px solid ${PDS.fog}` }}>
        <BlueprintGrid />
        <button onClick={onBack} style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
          letterSpacing:'0.2em', color:PDS.electric, background:'none', border:'none', cursor:'pointer',
          textTransform:'uppercase', marginBottom:'0.6rem', display:'block', padding:0, fontVariant:'small-caps' }}>
          ← Back to County
        </button>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative' }}>
          <div>
            <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:4 }}>
              {city.hasFeeData&&<span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.55rem',
                letterSpacing:'0.2em', color:PDS.electric, border:`1px solid ${PDS.electric}`,
                padding:'1px 5px', textTransform:'uppercase', fontVariant:'small-caps' }}>&#x26A1; Live Data</span>}
              {city.hasHCDData&&<span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.55rem',
                letterSpacing:'0.2em', color:PDS.coolant, border:`1px solid ${PDS.coolant}`,
                padding:'1px 5px', textTransform:'uppercase', fontVariant:'small-caps' }}>HCD Live</span>}
            </div>
            <h2 style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
              fontWeight:700, fontSize:'1.5rem', color:PDS.reactor, margin:'0 0 2px', lineHeight:1 }}>
              {city.name}
            </h2>
            <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem', color:PDS.oxide }}>
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
            const bar=clamp(((val||0)/cfg.domain[1])*100,0,100);
            const isCity=key==='feesPerUnit'?city.hasFeeData:city.hasHCDData;
            return (
              <div key={key} style={{ display:'grid', gridTemplateColumns:'80px 1fr 45px 12px', gap:5, alignItems:'center' }}>
                <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
                  letterSpacing:'0.1em', color:PDS.oxide, textTransform:'uppercase', overflow:'hidden',
                  textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cfg.label}</span>
                <div style={{ height:3, background:PDS.fog }}>
                  <div style={{ height:'100%', background:cfg.color, width:`${bar}%`, transition:'width .3s' }}/>
                </div>
                <DataVal color={cfg.color} size="0.78rem">{cfg.format?cfg.format(val):val}</DataVal>
                <span style={{ fontSize:'0.6rem', textAlign:'center',
                  color:isCity?PDS.electric:PDS.fog }}>{isCity?'⚡':'≈'}</span>
              </div>
            );
          })}
        </div>

        {/* CEQA detail breakdown */}
        {city.ceqaDetail&&(
          <div style={{ marginTop:'0.75rem', borderLeft:`2px solid ${PDS.ember}`, paddingLeft:'0.75rem' }}>
            <SectionLabel accent={PDS.ember}>
              CEQA Environmental Review
              {city.ceqaStatus==='researched'&&<span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
                fontSize:'0.55rem', color:PDS.electric, marginLeft:6 }}>&#x26A1; researched</span>}
              {city.ceqaStatus==='baseline'&&<span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
                fontSize:'0.55rem', color:PDS.fog, marginLeft:6 }}>≈ county est.</span>}
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
                  padding:'3px 0', borderBottom:`1px solid ${PDS.fog}30`, cursor:'help' }}>
                  <span style={{ fontFamily:"'Source Serif 4',Georgia,serif",
                    fontSize:'0.78rem', color:PDS.oxide,
                    borderBottom:`1px dotted ${PDS.fog}` }}>{label}</span>
                  <DataVal color={label==='Composite CEQA Risk'?PDS.ember:PDS.fuel} size="0.8rem">
                    {fmt(val)}
                  </DataVal>
                </div>
              </TipRow>
            ))}
            <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
              fontSize:'0.55rem', color:PDS.fog, marginTop:4 }}>
              Source: CEQAnet/OPR · Compiled 2024
            </div>
          </div>
        )}

        {/* Fee breakdown */}
        {feeRows.length>0&&(
          <div style={{ marginTop:'0.75rem', borderLeft:`2px solid ${PDS.ember}`, paddingLeft:'0.75rem' }}>
            <SectionLabel accent={PDS.ember}>
              Fee Schedule {city.docYear?`· ${city.docYear}`:''}
            </SectionLabel>
            {feeRows.map(([label,val,isPct,isTotal])=>(
              <TipRow key={label} label={label} tip={FEE_TIPS[label]}>
                <div style={{ display:'flex', justifyContent:'space-between',
                  padding:'3px 0', borderBottom:`1px solid ${PDS.fog}30`, cursor:'help' }}>
                  <span style={{ fontFamily:"'Source Serif 4',Georgia,serif",
                    fontSize:'0.78rem', color:isTotal?PDS.reactor:PDS.oxide,
                    borderBottom:`1px dotted ${PDS.fog}` }}>{label}</span>
                  <DataVal color={isTotal?PDS.ember:PDS.fuel} size="0.8rem">
                    {isPct?`${((val||0)*100).toFixed(0)}%`:fmtFull(val)}
                  </DataVal>
                </div>
              </TipRow>
            ))}
            {city.dataQuality>0&&(
              <TipRow label="Data Quality" tip={FEE_TIPS['Data Quality']}>
                <div style={{ display:'flex', justifyContent:'space-between',
                  padding:'3px 0', borderBottom:`1px solid ${PDS.fog}30`, cursor:'help' }}>
                  <span style={{ fontFamily:"'Source Serif 4',Georgia,serif",
                    fontSize:'0.78rem', color:PDS.oxide,
                    borderBottom:`1px dotted ${PDS.fog}` }}>Data Quality</span>
                  <DataVal color={city.dataQuality>=7?PDS.coolant:city.dataQuality>=4?PDS.fuel:PDS.ember} size="0.8rem">
                    {city.dataQuality}/10
                  </DataVal>
                </div>
              </TipRow>
            )}
            {city.sourceUrl&&<a href={city.sourceUrl} target="_blank" rel="noreferrer"
              style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.6rem',
                color:PDS.electric, display:'block', marginTop:6, textDecoration:'none' }}>
              ↗ {city.sourceUrl.replace(/^https?:\/\//,'').slice(0,50)}
            </a>}
          </div>
        )}
        <div style={{ marginTop:6, fontFamily:"'IBM Plex Mono','Consolas',monospace",
          fontSize:'0.62rem', color:PDS.fog }}>
          {city.ceqaDetail
            ? `≈ Permit timeline, fire zone from ${city.county} County baseline · CEQA from CEQAnet/OPR`
            : `≈ Permit timeline, CEQA, fire zone from ${city.county} County baseline`}
        </div>
      </div>
    </div>
  );
}

function MHPLabel() {
  const [show, setShow] = useState(false);
  const [pos,  setPos]  = useState({ x:0, y:0 });
  return (
    <span style={{ position:'relative', display:'inline-block' }}
      onMouseEnter={e=>{ setShow(true); setPos({ x:e.clientX, y:e.clientY }); }}
      onMouseMove={e=>setPos({ x:e.clientX, y:e.clientY })}
      onMouseLeave={()=>setShow(false)}>
      <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
        letterSpacing:'0.15em', color:PDS.oxide, textTransform:'uppercase',
        cursor:'help', borderBottom:`1px dotted ${PDS.fog}` }}>
        MHP:{'\u00a0\u00a0'}
      </span>
      {show && (
        <div style={{
          position:'fixed',
          left: Math.min(pos.x, (typeof window!=='undefined'?window.innerWidth:800) - 300),
          top:  pos.y + 14,
          zIndex:9999,
          background:PDS.void,
          border:`1px solid ${PDS.mist}`,
          borderLeft:`3px solid ${PDS.electric}`,
          padding:'0.5rem 0.8rem',
          pointerEvents:'none',
          boxShadow:`0 8px 32px rgba(44,36,22,.14), 0 0 0 1px ${PDS.fog}`,
          animation:'fadeUp .12s ease',
          whiteSpace:'nowrap',
        }}>
          <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
            letterSpacing:'0.2em', color:PDS.electric, textTransform:'uppercase',
            fontWeight:600 }}>
            Median Home Price
          </div>
        </div>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// COUNTY DETAIL
// ═══════════════════════════════════════════════════════════════
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
        letterSpacing:'0.15em', color:PDS.oxide, textTransform:'uppercase',
        cursor:'help', borderBottom:`1px dotted ${PDS.fog}` }}>
        HE Status:{'\u00a0\u00a0'}
      </span>
      {show && (
        <div style={{
          position:'fixed',
          left: Math.min(pos.x, (typeof window!=='undefined'?window.innerWidth:800) - 300),
          top:  pos.y + 14,
          zIndex:9999,
          width:280,
          background:PDS.void,
          border:`1px solid ${PDS.mist}`,
          borderLeft:`3px solid ${PDS.electric}`,
          padding:'0.65rem 0.8rem',
          pointerEvents:'none',
          boxShadow:`0 8px 32px rgba(44,36,22,.14), 0 0 0 1px ${PDS.fog}`,
          animation:'fadeUp .12s ease',
        }}>
          <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
            letterSpacing:'0.2em', color:PDS.electric, textTransform:'uppercase',
            fontWeight:600, marginBottom:'0.35rem' }}>
            Housing Element Status
          </div>
          <p style={{ fontFamily:"'Source Serif 4',Georgia,serif", fontSize:'0.76rem',
            color:PDS.fuel, lineHeight:1.65, margin:0 }}>
            {HE_TOOLTIP}
          </p>
        </div>
      )}
    </span>
  );
}

// Carrying cost assumptions — commercial bridge/construction loan basis
const CARRYING_LAND_SHARE  = 0.20;   // land as share of median home price
const CARRYING_PREDEV_SOFT = 35000;  // arch, engineering, environmental, legal (per unit, CA avg)
const CARRYING_LOAN_RATE   = 0.085;  // commercial construction loan rate (annualized)

function calcCarryingCost(data) {
  const landPerUnit  = (data.medianHomePrice || 600000) * CARRYING_LAND_SHARE;
  const financedBasis = landPerUnit + CARRYING_PREDEV_SOFT;
  return {
    landPerUnit,
    financedBasis,
    cost: financedBasis * CARRYING_LOAN_RATE * ((data.permitDays || 90) / 365),
  };
}

function CountyDetail({ county, data, liveFlags, citiesInCounty, onCityClick, onLoadScraper }) {
  const tier = getTier(data.composite);
  const carry = calcCarryingCost(data);
  return (
    <div style={{ background:PDS.shadow, border:`1px solid ${PDS.mist}`, borderTop:`2px solid ${PDS.reactor}` }}>
      <div style={{ padding:'1rem', borderBottom:`1px solid ${PDS.fog}` }}>
        <BlueprintGrid />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative' }}>
          <div>
            <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
              letterSpacing:'0.2em', color:PDS.fuel, fontVariant:'small-caps', letterSpacing:'0.08em', marginBottom:3 }}>
              County · California
            </div>
            <h2 style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
              fontWeight:700, fontSize:'1.6rem', color:PDS.reactor, margin:'0 0 2px', lineHeight:1 }}>
              {county}
            </h2>
            <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem', color:PDS.oxide }}>
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
            const bar=clamp(((val||0)/cfg.domain[1])*100,0,100);
            const isLive=liveFlags.has(key);
            return (
              <div key={key} style={{ display:'grid', gridTemplateColumns:'80px 1fr 45px 12px', gap:5, alignItems:'center' }}>
                <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
                  letterSpacing:'0.1em', color:PDS.oxide, textTransform:'uppercase', overflow:'hidden',
                  textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cfg.label}</span>
                <div style={{ height:3, background:PDS.fog }}>
                  <div style={{ height:'100%', background:cfg.color, width:`${bar}%`, transition:'width .3s' }}/>
                </div>
                <DataVal color={cfg.color} size="0.78rem">{cfg.format?cfg.format(val):val}</DataVal>
                {isLive&&<LivePip/>}
              </div>
            );
          })}
        </div>

        {/* ── Carrying Cost Estimate ─────────────────────────────────── */}
        <div style={{ position:'relative' }}
          onMouseEnter={e=>{ const t=e.currentTarget.querySelector('.carry-tooltip'); if(t) t.style.display='block'; }}
          onMouseLeave={e=>{ const t=e.currentTarget.querySelector('.carry-tooltip'); if(t) t.style.display='none'; }}>
          <div style={{ padding:'0.5rem 0.65rem', background:PDS.void,
            border:`1px solid ${PDS.fog}`, borderLeft:`2px solid ${PDS.ember}`,
            marginBottom:'0.6rem', cursor:'help' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
              <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
                letterSpacing:'0.12em', color:PDS.oxide, textTransform:'uppercase' }}>
                Carrying Cost / Unit
              </span>
              <DataVal color={PDS.ember} size="0.9rem">{fmtFull(carry.cost)}</DataVal>
            </div>
            <div style={{ marginTop:'0.3rem', display:'flex', gap:'0.8rem', flexWrap:'wrap',
              fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.58rem', color:PDS.oxide }}>
              <span>land+soft {fmtK(carry.financedBasis)}</span>
              <span>· {(CARRYING_LOAN_RATE*100).toFixed(1)}% loan</span>
              <span>· {data.permitDays}d</span>
            </div>
          </div>
          <div className="carry-tooltip" style={{
            display:'none', position:'absolute', bottom:'calc(100% + 4px)', left:0, right:0, zIndex:50,
            background:PDS.shadow, border:`1px solid ${PDS.ember}`, borderLeft:`2px solid ${PDS.ember}`,
            padding:'0.6rem 0.75rem',
            fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.58rem', color:PDS.oxide,
            lineHeight:1.6, pointerEvents:'none',
          }}>
            <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
              letterSpacing:'0.1em', color:PDS.reactor, textTransform:'uppercase', marginBottom:'0.35rem' }}>
              How this is calculated
            </div>
            <div>Land / unit = median home price ({fmtFull(data.medianHomePrice)}) × 20%</div>
            <div>= {fmtFull(carry.landPerUnit)}</div>
            <div style={{ marginTop:'0.25rem' }}>+ Pre-dev soft costs (arch, engineering, legal) = $35,000</div>
            <div>= Financed basis of {fmtFull(carry.financedBasis)}</div>
            <div style={{ marginTop:'0.25rem' }}>× {(CARRYING_LOAN_RATE*100).toFixed(1)}% construction loan rate</div>
            <div>× {data.permitDays} days ÷ 365</div>
            <div style={{ marginTop:'0.35rem', color:PDS.ember }}>= {fmtFull(carry.cost)} per unit in carrying cost</div>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem',
          padding:'0.6rem 0', borderTop:`1px solid ${PDS.fog}`, marginBottom:'0.6rem' }}>
          <div style={{ position:'relative' }}>
            <HETooltipLabel />
            <DataVal color={data.heCompliance==='compliant'?PDS.electric:PDS.blood} size="0.75rem">
              {data.heCompliance==='compliant'?'COMPLIANT':'NON-COMPLIANT'}
            </DataVal>
          </div>
          <div>
            <MHPLabel />
            <DataVal size="0.75rem" color={PDS.electric}>${(data.medianHomePrice/1000).toFixed(0)}K</DataVal>
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
                      background:PDS.void, border:`1px solid ${PDS.fog}`,
                      cursor:'pointer', textAlign:'left', transition:'border-color .1s' }}>
                    <div style={{ width:4, height:4, background:t.color, flexShrink:0 }}/>
                    <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.65rem',
                      letterSpacing:'0.05em', color:PDS.fuel, flex:1, overflow:'hidden',
                      textOverflow:'ellipsis', whiteSpace:'nowrap', textTransform:'uppercase' }}>
                      {city.name}
                    </span>
                    {city.hasFeeData&&<span style={{ fontSize:'0.55rem', color:PDS.electric }}>⚡</span>}
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
              background:PDS.void, border:`1px dashed ${PDS.electric}40`,
              color:PDS.electric, fontFamily:"'Source Serif 4','Charter',Georgia,serif",
              fontSize:'0.6rem', letterSpacing:'0.2em', textTransform:'uppercase', cursor:'pointer' }}>
            📂 Load Fee Scraper Data
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FEE UPLOAD
// ═══════════════════════════════════════════════════════════════
function FeeUploadPanel({ onLoad, onClose }) {
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
      <div style={{ background:PDS.shadow, border:`1px solid ${PDS.ember}70`, width:'min(500px,94vw)' }}>
        <div style={{ background:PDS.reactor, borderBottom:`2px solid ${PDS.reactor}`,
          padding:'0.875rem 1.25rem', display:'flex', justifyContent:'space-between', alignItems:'center', position:'relative' }}>
          <BlueprintGrid />
          <div style={{ position:'relative' }}>
            <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
              letterSpacing:'0.25em', color:PDS.electric, textTransform:'uppercase', marginBottom:3 }}>
              Intelligence Upload
            </div>
            <h3 style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
              fontSize:'1.2rem', fontWeight:700, color:PDS.shadow, margin:0 }}>
              Load Fee Scraper Data
            </h3>
          </div>
          <button onClick={onClose} style={{ background:'none', border:`1px solid ${PDS.fog}`,
            color:PDS.void, fontSize:'0.8rem', cursor:'pointer', padding:'0.25rem 0.5rem',
            fontFamily:"'IBM Plex Mono','Consolas',monospace", background:'transparent', border:`1px solid ${PDS.fuel}` }}>✕</button>
        </div>
        <div style={{ padding:'1.25rem' }}>
          <div onClick={()=>fileRef.current?.click()} style={{ background:PDS.void,
            border:`2px dashed ${PDS.mist}`, padding:'1.25rem', textAlign:'center',
            cursor:'pointer', marginBottom:'0.75rem' }}>
            <div style={{ fontSize:'1.5rem', marginBottom:4 }}>📂</div>
            <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.7rem',
              letterSpacing:'0.15em', color:PDS.electric, textTransform:'uppercase' }}>
              Upload results.json
            </div>
            <input ref={fileRef} type="file" accept=".json" style={{ display:'none' }} onChange={e=>{
              const f=e.target.files[0]; if(!f)return;
              const r=new FileReader(); r.onload=ev=>parse(ev.target.result); r.readAsText(f);
            }}/>
          </div>
          <textarea value={text} onChange={e=>{setText(e.target.value);setError('');}}
            placeholder='[{"name":"Palo Alto","county":"Santa Clara","status":"success","fees":{"estimatedTotalNewSFR":142000,...,  airportNoisePct:0   }}]'
            style={{ width:'100%', height:80, background:PDS.void, border:`1px solid ${PDS.fog}`,
              padding:'0.5rem', color:PDS.fuel, fontSize:'0.75rem',
              fontFamily:"'IBM Plex Mono','Consolas',monospace", resize:'vertical', boxSizing:'border-box' }}/>
          {error&&<div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem',
            color:PDS.blood, marginTop:4 }}>{error}</div>}
          <div style={{ display:'flex', gap:8, marginTop:'0.75rem' }}>
            <button onClick={()=>parse(text)} disabled={!text.trim()}
              style={{ flex:1, padding:'0.6rem', background:text.trim()?PDS.void:'transparent',
                border:`1px solid ${text.trim()?PDS.ember:PDS.fog}`,
                color:text.trim()?PDS.ember:PDS.fog,
                fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.7rem',
                letterSpacing:'0.2em', textTransform:'uppercase', cursor:text.trim()?'pointer':'not-allowed' }}>
              Load Data
            </button>
            <button onClick={onClose} style={{ padding:'0.6rem 1rem', background:'none',
              border:`1px solid ${PDS.fog}`, color:PDS.oxide,
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

// ═══════════════════════════════════════════════════════════════
// FAI LOGO
// ═══════════════════════════════════════════════════════════════
function FaiLogo({ height = 48 }) {
  const width = Math.round(height * 1910 / 1003);
  return (
    <svg viewBox="0 0 1910 1003" xmlns="http://www.w3.org/2000/svg" width={width} height={height} style={{ display:'block' }}>
      <path fill="#fdfcf9" d="M426.01.6l407.96,500.92-407.96,500.92V.6h0Z"/>
      <path fill="#fdfcf9" d="M0,.6l407.96,500.92L0,1002.43V.59h0Z"/>
      <path fill="#fdfcf9" d="M1111.6,998.9v-472.9h147.97v-119.65h-147.97V131.44h167.88V1.82h-334.35v997.09h166.47Z"/>
      <path fill="#fdfcf9" d="M1355.54,1.81l-106.71,997.09h149.39l27.03-273.49h99.6l25.61,273.49h156.5L1597.41,1.81h-241.87ZM1476.48,199.8l36.99,401.69h-76.83l39.84-401.69h0Z"/>
      <path fill="#fdfcf9" d="M1739.27.38v998.51h170.73V.38h-170.73Z"/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
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
  const [showDataSources, setShowDataSources] = useState(false);
  const [showFaiInfo,     setShowFaiInfo]     = useState(false);
  const [activeMetro,    setActiveMetro]    = useState(null);
  const [scraperRecords, setScraperRecords] = useState(()=>{
    try { const s=localStorage.getItem('ca-fee-data'); return s?JSON.parse(s):defaultFeeData; } catch{return defaultFeeData;}
  });
  const [rankTab,        setRankTab]        = useState('county');
  const [showCompare,    setShowCompare]    = useState(false);
  const [toast,          setToast]          = useState(null);

  // URL hash restoration
  useEffect(() => {
    const state = decodeShareURL();
    if (!state) return;
    if (state.layer && LAYERS[state.layer]) setActiveLayer(state.layer);
    if (state.county) setSelectedCounty(state.county);
    if (state.city)   setSelectedCity(state.city);
  }, []);

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

  // City scores
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

  // Map fill — subtractive charcoal logic with ember/blood heat
  const getCountyFill = useCallback((county)=>{
    const d=countyScores[county]; if(!d)return PDS.void;
    let intensity = activeLayer==='composite' ? d.composite
      : LAYERS[activeLayer]?.categorical ? (d[activeLayer]==='subject'?0.8:0.2)
      : (d.normalized[activeLayer]||0);
    // Penney: newsprint pale → Industrial Red deep
    const lo=[245,242,232]; // Newsprint
    const hi= intensity>0.5
      ? [107,31,31]    // Deep Red (blood)
      : [139,43,43];   // Industrial Red (ember)
    const t=intensity;
    return `rgb(${Math.round(lo[0]+(hi[0]-lo[0])*t*1.15)},${Math.round(lo[1]+(hi[1]-lo[1])*t*1.15)},${Math.round(lo[2]+(hi[2]-lo[2])*t*1.15)})`;
  },[activeLayer,countyScores]);

  const activeCounty = hoveredCounty||selectedCounty;
  const liveFlags    = activeCounty ? new Set(Object.keys(countyLive[activeCounty]||{})) : new Set();
  const activeCity   = selectedCity ? cityScores[selectedCity] : null;
  const hcdOk        = fetchStatus==='success'||fetchStatus==='partial';
  const scraperCities = rankedCities.length;

  const statusCfg = {
    idle:    { color:PDS.fog,      label:'INITIALIZING' },
    fetching:{ color:PDS.electric, label:'CONNECTING TO HCD' },
    partial: { color:PDS.fuel,     label:`PARTIAL · ${Object.keys(countyLive).length} COUNTIES` },
    success: { color:PDS.electric, label:`LIVE · ${Object.keys(countyLive).length} COUNTIES` },
    error:   { color:PDS.blood,    label:'OFFLINE · BASELINE ESTIMATES' },
  }[fetchStatus]||{ color:PDS.fog, label:'…' };

  return (
    <div style={{ minHeight:'100vh', background:PDS.void, color:PDS.reactor,
      fontFamily:"'Source Serif 4',Georgia,serif" }}>
      <style>{`
        ${PDS.fonts}
        @keyframes pip{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(1.5)}}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;}
        .cp{cursor:pointer;transition:background .1s}.cp:hover{background:rgba(26,26,26,.04)}
        .nb-btn{transition:all .12s;cursor:pointer}.nb-btn:hover{opacity:.8}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:${PDS.void}}
        ::-webkit-scrollbar-thumb{background:${PDS.mist}}
        select,input{font-family:'Source Serif 4',Georgia,serif}
        button{border-radius:0!important}
      `}</style>

      {showUpload&&<FeeUploadPanel onLoad={r=>{try{localStorage.setItem('ca-fee-data',JSON.stringify(r));}catch{}setScraperRecords(r);setShowUpload(false);}} onClose={()=>setShowUpload(false)}/>}
      {showCompare&&<CompareView cityScores={cityScores} onClose={()=>setShowCompare(false)}/>}
      {toast&&<div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:9999,
        background:PDS.reactor, color:PDS.shadow, padding:'0.5rem 1.2rem',
        fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.72rem',
        letterSpacing:'0.08em', animation:'fadeUp .2s ease' }}>{toast}</div>}
      {activeMetro&&<MetroZoomMap metroKey={activeMetro} cityScores={cityScores}
        geoBounds={geoBounds}
        selectedCity={selectedCity} onCityClick={n=>{setSelectedCity(n);setActiveMetro(null);}} onClose={()=>setActiveMetro(null)}/>}

      {/* ── MASTHEAD — Penney document-header: ink bg, white text ── */}
      <div style={{ background:PDS.reactor, borderBottom:`2px solid ${PDS.reactor}`,
        padding:'2rem 1.5rem 1.5rem' }}>
        <div style={{ maxWidth:1200, margin:'0 auto' }}>

          {/* Top row: logo left, sources right */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1rem' }}>

          {/* FAI logo — top left of masthead */}
          <div style={{ position:'relative' }}
            onMouseEnter={()=>setShowFaiInfo(true)}
            onMouseLeave={()=>setShowFaiInfo(false)}>
            <FaiLogo height={48} />
            {showFaiInfo&&(
              <div style={{
                position:'absolute', top:'100%', left:0, marginTop:4,
                background:PDS.void, border:`1px solid ${PDS.fog}`,
                borderLeft:`3px solid ${PDS.electric}`,
                padding:'0.75rem 1rem', width:280, zIndex:999,
                boxShadow:'0 4px 16px rgba(26,26,26,.15)',
                animation:'fadeUp .12s ease', textAlign:'left',
              }}>
                <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
                  fontSize:'0.68rem', color:PDS.fuel, lineHeight:1.6 }}>
                  This is a Foundation for American Innovation project. Support this project and others like it{' '}
                  <a href="https://www.thefai.org/donate" target="_blank" rel="noreferrer"
                    style={{ color:PDS.electric, textDecoration:'underline' }}>
                    here
                  </a>.
                </div>
              </div>
            )}
          </div>

          {/* Sources button — top right of masthead */}
          <div style={{ position:'relative' }}
            onMouseEnter={()=>setShowDataSources(true)}
            onMouseLeave={()=>setShowDataSources(false)}>
            <button style={{
              fontFamily:"'IBM Plex Mono','Consolas',monospace",
              fontSize:'0.65rem', letterSpacing:'0.15em',
              color:PDS.mist, background:'none',
              border:`1px solid ${PDS.mist}80`,
              padding:'4px 10px', textTransform:'uppercase',
              cursor:'default', userSelect:'none',
            }}>
              Sources
            </button>
            {showDataSources&&(
              <div style={{
                position:'absolute', top:'100%', right:0, marginTop:4,
                background:PDS.void, border:`1px solid ${PDS.fog}`,
                borderLeft:`3px solid ${PDS.electric}`,
                padding:'0.75rem 1rem', width:360, zIndex:999,
                boxShadow:'0 4px 16px rgba(26,26,26,.15)',
                animation:'fadeUp .12s ease', textAlign:'left',
              }}>
                <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
                  fontSize:'0.6rem', letterSpacing:'0.2em', color:PDS.oxide,
                  textTransform:'uppercase', marginBottom:'0.6rem', borderBottom:`1px solid ${PDS.fog}`,
                  paddingBottom:'0.4rem' }}>
                  Data Sources
                </div>
                {[
                  { label:'HCD Annual Progress Reports', org:'CA Dept of Housing & Community Development', url:'data.ca.gov', desc:'Permit counts & housing production by jurisdiction' },
                  { label:'Housing Element Compliance', org:'CA Dept of Housing & Community Development', url:'data.ca.gov', desc:'Housing element compliance status by jurisdiction' },
                  { label:'CA County Boundaries', org:'CA State GIS Open Data', url:'gis.data.ca.gov', desc:'GeoJSON county boundaries for the interactive map' },
                  { label:'CEQA Environmental Review Data', org:'CEQAnet / Governor\'s Office of Planning and Research', url:'ceqanet.opr.ca.gov', desc:'Filing-level data on environmental review outcomes: categorical exemptions, EIR rates, mitigated negative declarations, and review timelines for 121 jurisdictions' },
                  { label:'Baseline Jurisdiction Estimates', org:'Compiled — state & local sources', url:null, desc:'Permit timelines, CEQA risk, coastal/fire zone coverage, approval rates' },
                  { label:'Historic Preservation Districts', org:'CA Office of Historic Preservation', url:'ohp.parks.ca.gov', desc:'Share of developable land subject to historic overlay review — design restrictions, materials requirements, and demolition constraints' },
                  { label:'Municipal Development Fee Schedules', org:'City websites (scraped)', url:null, desc:'Impact fees for 120+ cities: transportation, park, water, sewer, affordable housing in-lieu' },
                  { label:'Carrying Cost Estimator', org:'Methodology — industry benchmarks', url:null, desc:'Land valued at 20% of median home price (typical CA infill land share); $35K/unit pre-dev soft costs (architecture, engineering, environmental, legal — CA average); 8.5% commercial construction loan rate; holding period = county permit timeline in days' },
                  { label:'CalGreen Tier & Cost Estimates', org:'CA Building Standards Commission · CA Energy Commission', url:'dgs.ca.gov/BSC', desc:'Local CalGreen tier adoption (Tier 1/2 amendments and energy reach codes) compiled from CBSC, CEC, and municipal building code databases. Per-unit cost premiums above state baseline derived from CEC Title 24 Part 11 cost-effectiveness studies and CBSC regulatory impact analyses: Tier 1 ~$2k–$8k/unit, Tier 2 ~$8k–$25k/unit, all-electric reach codes ~$25k–$45k/unit' },
                ].map((s,i,arr)=>(
                  <div key={i} style={{ paddingBottom:'0.55rem', marginBottom:'0.55rem',
                    borderBottom:i<arr.length-1?`1px solid ${PDS.fog}30`:'none' }}>
                    <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
                      fontSize:'0.68rem', color:PDS.reactor, fontWeight:600, marginBottom:2 }}>
                      {s.label}
                    </div>
                    <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
                      fontSize:'0.57rem', color:PDS.electric, marginBottom:2 }}>
                      {s.org}{s.url?` · ${s.url}`:''}
                    </div>
                    <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
                      fontSize:'0.62rem', color:PDS.fuel, fontStyle:'italic' }}>
                      {s.desc}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          </div>{/* end top flex row */}

          <div style={{ textAlign:'center' }}>
          <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.72rem',
            letterSpacing:'0.1em', color:PDS.oxide, textTransform:'uppercase', marginBottom:'0.5rem' }}>
            California Housing Policy &bull; All 58 Counties &bull; 120+ Cities
          </div>
          <h1 style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
            fontWeight:700, fontSize:'clamp(1.6rem,4vw,2.4rem)', color:PDS.shadow,
            margin:'0 0 0.75rem', lineHeight:1.1, letterSpacing:'0.05em', textTransform:'uppercase' }}>
            Building Difficulty Index <span style={{ fontSize:'0.5em', fontWeight:400, letterSpacing:'0.12em', verticalAlign:'super', color:PDS.oxide }}>(beta)</span>
          </h1>
          <p style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.9rem',
            fontStyle:'italic', color:'#B8B8B8', maxWidth:580, lineHeight:1.6,
            margin:'0 auto 0.75rem' }}>
            Composite scoring of regulatory friction, fee burden, and permitting obstruction
            across California jurisdictions.
          </p>
          <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.62rem',
            letterSpacing:'0.12em', color:PDS.fog, textTransform:'uppercase' }}>
            Last Updated: {__BUILD_DATE__}
          </div>
          </div>{/* end centered title block */}
        </div>
      </div>

      {/* ── STATUS BARS ── */}
      <div style={{ maxWidth:1200, margin:'0 auto', padding:'0.75rem 1.5rem 0',
        display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}>

        {/* HCD */}
        <div style={{ background:PDS.shadow, border:`1px solid ${PDS.fog}`,
          padding:'0.5rem 0.875rem', display:'flex', alignItems:'center', gap:10 }}>
          <LivePip color={statusCfg.color} active={fetchStatus==='success'||fetchStatus==='partial'||fetchStatus==='fetching'}/>
          <span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.68rem',
            letterSpacing:'0.1em', color:statusCfg.color, flex:1 }}>
            HCD DATASTORE · {statusCfg.label}
          </span>
          {lastFetched&&<span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
            fontSize:'0.6rem', color:PDS.fog }}>{lastFetched.toLocaleTimeString()}</span>}
          <button onClick={()=>setShowSources(s=>!s)} className="nb-btn"
            style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem', letterSpacing:'0.15em',
              color:PDS.oxide, background:'none', border:`1px solid ${PDS.fog}`,
              padding:'2px 7px', textTransform:'uppercase', cursor:'pointer' }}>
            {showSources?'▲':'▼'} SRC
          </button>
          <button onClick={refresh} disabled={fetchStatus==='fetching'} className="nb-btn"
            style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem',
              color:fetchStatus==='fetching'?PDS.fog:PDS.electric, background:'none',
              border:`1px solid ${fetchStatus==='fetching'?PDS.fog:PDS.electric}40`,
              padding:'2px 8px', cursor:'pointer' }}>↻</button>
        </div>

        {/* Fee scraper */}
        <div onClick={()=>setShowUpload(true)} className="nb-btn"
          style={{ background:PDS.shadow, border:`1px solid ${scraperRecords?PDS.electric:PDS.fog}`,
            padding:'0.5rem 0.875rem', display:'flex', alignItems:'center', gap:8,
            cursor:'pointer', minWidth:195 }}>
          {scraperRecords?(
            <>
              <LivePip color={PDS.electric}/>
              <div>
                <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.68rem',
                  letterSpacing:'0.1em', color:PDS.electric }}>
                  FEE DATA · {scraperCities} CITIES
                </div>
                <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.58rem', color:PDS.fog }}>
                  {scraperRecords.length} records loaded
                </div>
              </div>
            </>
          ):(
            <>
              <span style={{ fontSize:'0.9rem' }}>📂</span>
              <div>
                <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.65rem',
                  letterSpacing:'0.15em', color:PDS.oxide, textTransform:'uppercase' }}>Load Fee Data</div>
                <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.58rem', color:PDS.fog }}>
                  results.json from scraper
                </div>
              </div>
              <span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem', color:PDS.fog }}>→</span>
            </>
          )}
        </div>
      </div>

      {/* Source details */}
      {showSources&&(
        <div style={{ maxWidth:1200, margin:'6px auto 0', padding:'0 1.5rem', animation:'fadeUp .2s ease' }}>
          <div style={{ background:PDS.shadow, border:`1px solid ${PDS.mist}`,
            padding:'0.75rem 1rem', display:'grid',
            gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:0 }}>
            {Object.entries(sources).map(([k,v])=>{
              const col={success:PDS.electric,error:PDS.blood,fetching:PDS.fuel}[v.status]||PDS.fog;
              return (
                <div key={k} style={{ display:'flex', gap:8, padding:'0.4rem 0',
                  borderBottom:`1px solid ${PDS.fog}30` }}>
                  <span style={{ width:13,height:13,border:`1px solid ${col}`,color:col,
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:'7px',
                    flexShrink:0,fontFamily:"'IBM Plex Mono','Consolas',monospace",
                    animation:v.status==='fetching'?'spin 1.2s linear infinite':undefined }}>
                    {v.status==='success'?'✓':v.status==='error'?'✗':'↻'}
                  </span>
                  <div>
                    <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.65rem',
                      letterSpacing:'0.1em', color:PDS.fuel, textTransform:'uppercase' }}>{v.label}</div>
                    {v.status==='success'&&<div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
                      fontSize:'0.58rem', color:PDS.fog }}>{v.records?.toLocaleString()} rec · {v.year}</div>}
                    {v.status==='error'&&<div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
                      fontSize:'0.58rem', color:PDS.blood }}>{v.error?.slice(0,45)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LAYER CONTROLS — Oswald compressed tabs ── */}
      <div style={{ maxWidth:1200, margin:'0.75rem auto 0', padding:'0 1.5rem', position:'relative' }}>
        {/* Tooltip */}
        {hoveredLayer && LAYERS[hoveredLayer] && (
          <div style={{
            position:'fixed',
            left: Math.min(tooltipPos.x, window.innerWidth - 340),
            top:  tooltipPos.y + 14,
            zIndex:999,
            width:320,
            background:PDS.void,
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
                <span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.6rem', color:PDS.fog }}>
                  {Math.round(LAYERS[hoveredLayer].weight * 100)}% weight
                </span>
              )}
            </div>
            <p style={{ fontFamily:"'Source Serif 4',Georgia,serif", fontSize:'0.78rem',
              color:PDS.fuel, lineHeight:1.65, margin:0 }}>
              {LAYERS[hoveredLayer].description}
            </p>
          </div>
        )}
        <div style={{ background:PDS.shadow, border:`1px solid ${PDS.fog}`,
          borderBottom:'none', display:'flex', flexWrap:'wrap', gap:0 }}>
          {Object.entries(LAYERS).map(([key,cfg])=>{
            const isActive=key===activeLayer;
            return (
              <button key={key} onClick={()=>setActiveLayer(key)} className="nb-btn"
                onMouseEnter={e=>{ setHoveredLayer(key); setTooltipPos({ x:e.clientX, y:e.clientY }); }}
                onMouseMove={e=>setTooltipPos({ x:e.clientX, y:e.clientY })}
                onMouseLeave={()=>setHoveredLayer(null)}
                style={{ padding:'0.55rem 0.9rem', background:isActive?PDS.fog:'transparent',
                  border:'none', borderRight:`1px solid ${PDS.fog}`,
                  borderBottom:isActive?`2px solid ${PDS.reactor}`:'2px solid transparent',
                  color:isActive?PDS.reactor:PDS.oxide, cursor:'pointer',
                  fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.65rem',
                  letterSpacing:'0.15em', textTransform:'uppercase', fontWeight:isActive?600:400,
                  display:'flex', alignItems:'center', gap:4 }}>
                {cfg.label}
                {key==='feesPerUnit'&&<span style={{ fontSize:'0.55rem',
                  color:isActive&&scraperRecords?PDS.electric:PDS.fog }}>
                  {scraperRecords?'⚡':'≈'}
                </span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── METRO SHORTCUTS ── */}
      <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 1.5rem 0.5rem' }}>
        <div style={{ background:PDS.shadow, border:`1px solid ${PDS.fog}`,
          borderTop:`1px solid ${PDS.mist}`, padding:'0.4rem 0.75rem',
          display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
          <button onClick={()=>setShowCompare(true)} className="nb-btn"
            style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.62rem',
              letterSpacing:'0.1em', textTransform:'uppercase',
              background:'none', border:`1px solid ${PDS.ember}`, padding:'2px 8px',
              color:PDS.ember, cursor:'pointer' }}>
            Compare Cities
          </button>
          <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.55rem',
            letterSpacing:'0.25em', color:PDS.fog, textTransform:'uppercase' }}>Metro:</span>
          {Object.entries(METROS).map(([key])=>{
            const m=METROS[key];
            const n=Object.values(cityScores).filter(c=>
              c.lat>=m.bounds[0]&&c.lat<=m.bounds[1]&&c.lon>=m.bounds[2]&&c.lon<=m.bounds[3]&&c.hasFeeData
            ).length;
            return (
              <button key={key} onClick={()=>setActiveMetro(key)} className="nb-btn"
                style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.62rem',
                  letterSpacing:'0.1em', textTransform:'uppercase',
                  background:'none', border:`1px solid ${PDS.mist}`, padding:'2px 8px',
                  color:PDS.fuel, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                {key}
                {n>0&&<span style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.6rem',
                  color:PDS.electric, background:`${PDS.electric}18`, padding:'0 4px' }}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 1.5rem 3rem',
        display:'flex', flexDirection:'column', gap:14 }} className="main-row">
        <style>{`@media(min-width:1024px){.main-row{flex-direction:row!important}}`}</style>

        {/* ── MAP — real CA county GIS boundaries ── */}
        <div style={{ flex:1, background:PDS.void, border:`1px solid ${PDS.mist}`,
          borderTop:`2px solid ${PDS.reactor}`, position:'relative', overflow:'hidden', minWidth:0 }}>
          <BlueprintGrid />
          {/* GeoJSON load status indicator */}
          {geoStatus==='loading'&&(
            <div style={{ position:'absolute', top:8, left:8, zIndex:10,
              fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.6rem',
              color:PDS.electric, letterSpacing:'0.1em', background:PDS.void,
              padding:'2px 6px', border:`1px solid ${PDS.fog}` }}>
              Loading GIS boundaries…
            </div>
          )}
          <svg viewBox="-8 -8 570 656" style={{ width:'100%', height:'auto', maxHeight:'74vh',
            display:'block', position:'relative' }}>
            {/* Counties — GeoJSON paths if loaded, else fallback polygons */}
            {(geoPaths ? Object.entries(geoPaths) : Object.entries(COUNTY_SHAPES).map(([c,pts])=>[c,null]))
              .map(([county, geoD])=>{
              const isActive=county===hoveredCounty||county===selectedCounty;
              const hasScraper=!!(scraperRecords?.some(r=>normCounty(r.county||'')===county&&r.status==='success'));
              // Fallback path from COUNTY_SHAPES if GeoJSON not ready
              const d = geoD || (COUNTY_SHAPES[county]
                ? `M ${COUNTY_SHAPES[county].map(p=>p.join(',')).join(' L ')} Z`
                : null);
              if (!d) return null;
              return (
                <path key={county} className="cp"
                  d={d}
                  fill={getCountyFill(county)}
                  stroke={isActive?PDS.reactor:hasScraper?PDS.electric:`${PDS.mist}90`}
                  strokeWidth={isActive?2:hasScraper?1.2:0.5}
                  onMouseEnter={()=>setHoveredCounty(county)}
                  onMouseLeave={()=>setHoveredCounty(null)}
                  onClick={()=>{ setSelectedCounty(c=>c===county?null:county); setSelectedCity(null); }}
                />
              );
            })}
            {/* County name labels — centered in each county's GIS bbox */}
            {geoStatus==='ok' && geoBounds && Object.entries(geoBounds).map(([county,bb])=>{
              const isActive=county===hoveredCounty||county===selectedCounty;
              // Only show labels for counties large enough to hold text
              const w=bb.maxX-bb.minX, h=bb.maxY-bb.minY;
              if(w<22||h<12) return null;
              return (
                <text key={`lbl-${county}`}
                  x={bb.cx} y={bb.cy}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={w>80?8.5:w>45?7:6}
                  fontFamily="'IBM Plex Mono','Consolas',monospace"
                  fontWeight="400"
                  fill={isActive?PDS.reactor:`${PDS.reactor}55`}
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
                      stroke={PDS.reactor} strokeWidth="1.5"/>}
                    <circle cx={city.svgX} cy={city.svgY} r={r}
                      fill={col} fillOpacity={city.hasFeeData?0.92:0.35}
                      stroke={city.hasFeeData?col:`${PDS.fog}60`} strokeWidth=".7"/>
                  </g>
                );
              })}
            {/* Gradient legend */}
            <defs>
              <linearGradient id="nbGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor='#F5F2E8'/>
                <stop offset="50%" stopColor='#8B2B2B'/>
                <stop offset="100%" stopColor='#6B1F1F'/>
              </linearGradient>
            </defs>
            <g transform="translate(10,595)">
              <text x="0" y="0" fill={PDS.fog} fontSize="7.5"
                fontFamily="'Source Serif 4','Charter',Georgia,serif" letterSpacing="2" fontWeight="600">
                {LAYERS[activeLayer].label.toUpperCase()}
              </text>
              <rect x="0" y="7" width="105" height="5" fill="url(#nbGrad)"/>
              <text x="0" y="21" fill={PDS.fog} fontSize="7" fontFamily="'IBM Plex Mono','Consolas',monospace">LOW</text>
              <text x="85" y="21" fill={PDS.fog} fontSize="7" fontFamily="'IBM Plex Mono','Consolas',monospace">HIGH</text>
            </g>
            <g transform="translate(10,622)">
              <circle cx="4" cy="4" r="4" fill={scoreColor(0.7,0.9)}/>
              <text x="12" y="8" fill={PDS.fog} fontSize="7" fontFamily="'IBM Plex Mono','Consolas',monospace">scraped fee data</text>
              <circle cx="4" cy="16" r="4" fill={scoreColor(0.4,0.3)}/>
              <text x="12" y="20" fill={PDS.fog} fontSize="7" fontFamily="'IBM Plex Mono','Consolas',monospace">HCD only</text>
            </g>
          </svg>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ width:'100%', maxWidth:380, display:'flex', flexDirection:'column', gap:10 }}>

          {/* Active layer descriptor */}
          <div style={{ background:PDS.shadow, border:`1px solid ${PDS.mist}`, borderTop:`2px solid ${PDS.reactor}`, padding:'0.75rem 1rem' }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:3 }}>
              <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
                fontSize:'1rem', fontWeight:700, color:PDS.reactor }}>
                {LAYERS[activeLayer].label}
              </span>
              {LAYERS[activeLayer].weight&&(
                <DataVal size="0.65rem" color={PDS.fog}>
                  {Math.round(LAYERS[activeLayer].weight*100)}% weight
                </DataVal>
              )}
            </div>
            <p style={{ fontSize:'0.78rem', color:PDS.oxide, margin:0, lineHeight:1.6,
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
            <div style={{ background:PDS.shadow, border:`1px solid ${PDS.fog}`,
              padding:'2rem 1rem', textAlign:'center',
              fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.82rem', fontStyle:'italic', color:PDS.oxide }}>
              — Select a county or city dot —
            </div>
          )}

          {/* Rankings — with tabs */}
          <div style={{ background:PDS.shadow, border:`1px solid ${PDS.mist}`, borderTop:`2px solid ${PDS.reactor}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'0.6rem 0.875rem', borderBottom:`2px solid ${PDS.fog}` }}>
              <span style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
                fontSize:'0.9rem', fontWeight:700, color:PDS.reactor }}>Rankings</span>
              <div style={{ display:'flex', gap:0 }}>
                {['county','city'].map(t=>(
                  <button key={t} onClick={()=>setRankTab(t)} className="nb-btn"
                    style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
                      letterSpacing:'0.15em', textTransform:'uppercase', padding:'3px 9px',
                      background:rankTab===t?PDS.fog:'none',
                      border:`1px solid ${rankTab===t?PDS.reactor:PDS.fog}`,
                      color:rankTab===t?PDS.reactor:PDS.oxide, cursor:'pointer' }}>
                    {t}{t==='city'&&scraperCities>0?` (${scraperCities})`:''}
                  </button>
                ))}
              </div>
            </div>

            {rankTab==='city'&&rankedCities.length===0?(
              <div style={{ padding:'1rem', textAlign:'center',
                fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.7rem', color:PDS.fog }}>
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
                        borderBottom:`1px solid ${PDS.fog}20`, cursor:'pointer',
                        transition:'background .1s' }}
                      onMouseEnter={e=>e.currentTarget.style.background=PDS.fog+'90'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <DataVal size="0.7rem" color={i<3?PDS.ember:i<10?PDS.oxide:PDS.fog}>
                        {String(i+1).padStart(2,'0')}
                      </DataVal>
                      <div>
                        <div style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.68rem',
                          letterSpacing:'0.05em', color:PDS.fuel, overflow:'hidden',
                          textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.label}</div>
                        {item.sub&&<div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace",
                          fontSize:'0.58rem', color:PDS.fog }}>{item.sub}</div>}
                      </div>
                      {item.hasFee&&<span style={{ fontSize:'0.6rem', color:PDS.electric }}>⚡</span>}
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
            <div style={{ background:PDS.shadow, border:`1px solid ${PDS.mist}`, borderLeft:`3px solid ${PDS.electric}`,
              padding:'0.75rem 1rem', animation:'fadeUp .3s ease' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <SectionLabel accent={PDS.electric}>Field Intelligence</SectionLabel>
                <button onClick={()=>{try{localStorage.removeItem('ca-fee-data');}catch{}setScraperRecords(defaultFeeData);}} className="nb-btn"
                  style={{ background:'none', border:'none', color:PDS.fog,
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
                      letterSpacing:'0.15em', color:PDS.fog, textTransform:'uppercase' }}>{l}</div>
                    <DataVal color={PDS.electric} size="1.1rem">{v}</DataVal>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:8 }}>
                <div style={{ height:3, background:PDS.fog }}>
                  <div style={{ height:'100%', background:PDS.electric,
                    width:`${(new Set(rankedCities.map(c=>c.county)).size/58)*100}%`,
                    transition:'width .5s' }}/>
                </div>
                <div style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.6rem',
                  color:PDS.fog, marginTop:3 }}>
                  {new Set(rankedCities.map(c=>c.county)).size}/58 counties covered
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── EXPORT BAR ── */}
      <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 1.5rem 0.75rem',
        display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={()=>exportCountiesCSV(countyScores)} className="nb-btn"
          style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
            letterSpacing:'0.15em', textTransform:'uppercase', padding:'4px 10px',
            background:'none', border:`1px solid ${PDS.mist}`, color:PDS.oxide, cursor:'pointer' }}>
          Export Counties CSV
        </button>
        {rankedCities.length>0&&(
          <button onClick={()=>exportCitiesCSV(cityScores)} className="nb-btn"
            style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
              letterSpacing:'0.15em', textTransform:'uppercase', padding:'4px 10px',
              background:'none', border:`1px solid ${PDS.mist}`, color:PDS.oxide, cursor:'pointer' }}>
            Export Cities CSV
          </button>
        )}
        <button onClick={()=>{
          const url=encodeShareURL({ county:selectedCounty, city:selectedCity, layer:activeLayer });
          navigator.clipboard.writeText(url).then(()=>{setToast('Link copied');setTimeout(()=>setToast(null),2000);});
        }} className="nb-btn"
          style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif", fontSize:'0.6rem',
            letterSpacing:'0.15em', textTransform:'uppercase', padding:'4px 10px',
            background:'none', border:`1px solid ${PDS.electric}`, color:PDS.electric, cursor:'pointer', marginLeft:'auto' }}>
          Copy Share Link
        </button>
      </div>

      {/* ── FOOTER — Penney document-footer ── */}
      <div style={{ borderTop:`2px solid ${PDS.reactor}`, padding:'1rem 1.5rem',
        background:PDS.shadow, textAlign:'center' }}>
        <div style={{ maxWidth:1200, margin:'0 auto' }}>
          <p style={{ fontFamily:"'Source Serif 4','Charter',Georgia,serif",
            fontSize:'0.82rem', color:PDS.oxide, margin:'0 0 4px', fontStyle:'italic' }}>
            California Building Difficulty Index &bull; {CITY_GEO.length} cities &bull; data.ca.gov
          </p>
          <p style={{ fontFamily:"'IBM Plex Mono','Consolas',monospace", fontSize:'0.62rem',
            color:PDS.mist, margin:0, letterSpacing:'0.05em' }}>
            Permit Time (20%) · Fees (20%) · Coastal (10%) · Fire (10%) · Approval (10%) · CEQA (9%) · Noise (6%) · Hist. Preservation (5%) · CalGreen (5%) · HE Compliance (5%)
          </p>
        </div>
      </div>
    </div>
  );
}
