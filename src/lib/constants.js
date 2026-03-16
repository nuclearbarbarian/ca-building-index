// ═══════════════════════════════════════════════════════════════
// PENNEY DESIGN SYSTEM TOKENS
// 1940s Trade Journal Aesthetic — Period-Accurate Revival
// ═══════════════════════════════════════════════════════════════
export const NB = {
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

// Tier mapping to NB palette
export const TIERS = [
  { min:0.75, label:'EXTREMELY HARD',   color:'#6B1F1F',  dark:'#4A1515'   },
  { min:0.55, label:'VERY HARD',        color:'#8B2B2B',  dark:'#5C1A1A'   },
  { min:0.40, label:'MODERATELY HARD',  color:'#5C5C5C',  dark:'#2D2D2D'   },
  { min:0.25, label:'SOMEWHAT HARD',    color:'#3D5C3D',  dark:'#2A4020'   },
  { min:0,    label:'RELATIVELY EASY',  color:'#2B4B6F',  dark:'#1A2E47'   },
];
export const getTier  = s => TIERS.find(t => s >= t.min) || TIERS[4];
export const scoreColor = (s, alpha=1) => {
  if (s > 0.75) return `rgba(107,31,31,${alpha})`;
  if (s > 0.55) return `rgba(139,43,43,${alpha})`;
  if (s > 0.40) return `rgba(92,92,92,${alpha})`;
  if (s > 0.25) return `rgba(61,92,61,${alpha})`;
  return `rgba(43,75,111,${alpha})`;
};

// ═══════════════════════════════════════════════════════════════
// HCD API
// ═══════════════════════════════════════════════════════════════
export const HCD_BASE = 'https://data.ca.gov/api/3/action';
export const PACKAGES = {
  APR:  'housing-element-annual-progress-report-apr-data-by-jurisdiction-and-year',
  SB35: 'housing-element-open-data-project-and-sb-35-determination',
  RHNA: 'rhna-progress-report',
};

export function getField(rec, candidates, def = null) {
  const keys = Object.keys(rec);
  for (const c of candidates) {
    const found = keys.find(k => k.toLowerCase() === c.toLowerCase());
    if (found !== undefined && rec[found] !== null && rec[found] !== '') return rec[found];
  }
  return def;
}
export const safeFloat  = (v, d=0) => { const n=parseFloat(v); return isNaN(n)?d:n; };
export const normCounty = s => (s||'').trim().replace(/\s+county$/i,'').replace(/\s+/g,' ');
export const normCity   = s => (s||'').trim().replace(/\s+/g,' ').toLowerCase();
export const clamp      = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
export const fmtK       = v => v>=1000 ? `$${Math.round(v/1000)}k` : `$${Math.round(v)}`;
export const fmtFull    = v => `$${Math.round(v).toLocaleString()}`;

// ═══════════════════════════════════════════════════════════════
// GEO SYSTEM
// ═══════════════════════════════════════════════════════════════
// Aspect-corrected equirectangular projection centred on 37°N
// x_scale = y_scale × cos(37°) so lat/lon degrees map to equal screen distances
export const GEO = { latMax:42.0, latRange:9.5, lonMin:-124.4, lonRange:10.3, svgX0:0, svgW:554, svgH:640 };
export const geoToSvg = (lat,lon) => ({
  x: GEO.svgX0 + (lon - GEO.lonMin) / GEO.lonRange * GEO.svgW,
  y: (GEO.latMax - lat)             / GEO.latRange * GEO.svgH,
});

// ─── EPSG:3857 (Web Mercator meters) → WGS84 lat/lon ────────────────────
const _R = 6378137;
export const merc2ll = (mx, my) => ({
  lon: mx / _R * (180 / Math.PI),
  lat: (2 * Math.atan(Math.exp(my / _R)) - Math.PI / 2) * (180 / Math.PI),
});

// ─── GeoJSON → SVG path string ──────────────────────────────────────────
// Projects a GeoJSON ring [[x,y],...] (EPSG:3857) into SVG space
export const ringToPath = ring =>
  ring.map(([mx,my],i) => {
    const {lat,lon} = merc2ll(mx,my);
    const {x,y} = geoToSvg(lat,lon);
    return `${i===0?'M':'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + ' Z';

// Handles Polygon (one exterior ring + optional holes) and MultiPolygon
export const featureToPath = geom => {
  if (!geom) return '';
  if (geom.type === 'Polygon')
    return geom.coordinates.map(ringToPath).join(' ');
  if (geom.type === 'MultiPolygon')
    return geom.coordinates.flatMap(poly => poly.map(ringToPath)).join(' ');
  return '';
};

// Derive county name from GeoJSON feature properties
export const countyNameFromProps = props => {
  const raw = props?.NAME || props?.COUNTY_NAME || props?.CountyName ||
              props?.name  || props?.county     || '';
  return raw.trim().replace(/\s+county$/i,'');
};

// ─── CA GeoJSON URL ───────────────────────
export const CA_GEOJSON_URL =
  'https://gis.data.ca.gov/api/download/v1/items/a7a5b9ebd58842e9979933cb7fe2287c/geojson?layers=0';

export const METROS = {
  'Greater LA':    { bounds:[33.4,34.85,-119.0,-117.0], counties:['Los Angeles','Ventura','Orange'] },
  'Bay Area':      { bounds:[37.0,38.35,-123.0,-121.4], counties:['Alameda','Contra Costa','San Francisco','San Mateo','Santa Clara','Marin','Sonoma','Napa','Solano'] },
  'San Diego':     { bounds:[32.5,33.55,-117.8,-116.7], counties:['San Diego'] },
  'Inland Empire': { bounds:[33.6,34.55,-117.85,-115.8],counties:['Riverside','San Bernardino'] },
  'Sacramento':    { bounds:[38.0,39.0,-122.1,-120.7],  counties:['Sacramento','Placer','El Dorado','Yolo','Sutter','Yuba'] },
  'Central Valley':{ bounds:[36.4,37.85,-120.7,-119.0], counties:['Fresno','Madera','Merced','Stanislaus','San Joaquin','Tulare','Kings'] },
};

export const CITY_GEO = [
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

export const CITY_LOOKUP = {};
CITY_GEO.forEach(([name,county,lat,lon,pop]) => {
  const svgPt = geoToSvg(lat,lon);
  const rec = { name, county, lat, lon, pop, svgX:svgPt.x, svgY:svgPt.y };
  CITY_LOOKUP[normCity(name)] = rec;
  CITY_LOOKUP[`${normCity(name)}|${normCounty(county).toLowerCase()}`] = rec;
});
export const lookupCity = (name,county) => {
  const k1 = `${normCity(name)}|${normCounty(county||'').toLowerCase()}`;
  return CITY_LOOKUP[k1] || CITY_LOOKUP[normCity(name)] || null;
};

// ═══════════════════════════════════════════════════════════════
// BASELINE DATA
// ═══════════════════════════════════════════════════════════════
export const BASELINE = {
  "Alameda":        { permitDays:195, feesPerUnit:72000,  ceqaRisk:0.75, coastalPct:12,  fireZonePct:18,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.42, approvalRate:0.78, population:1682353,  medianHomePrice:1150000,  airportNoisePct:12  },
  "Alpine":         { permitDays:45,  feesPerUnit:8000,   ceqaRisk:0.15, coastalPct:0,   fireZonePct:85,  sb35Status:"exempt",   heCompliance:"compliant",     rhnaProgress:0.95, approvalRate:0.92, population:1204,     medianHomePrice:425000,  airportNoisePct:0   },
  "Amador":         { permitDays:55,  feesPerUnit:12000,  ceqaRisk:0.20, coastalPct:0,   fireZonePct:72,  sb35Status:"subject",  heCompliance:"non-compliant", rhnaProgress:0.28, approvalRate:0.85, population:40474,    medianHomePrice:385000,  airportNoisePct:0   },
  "Butte":          { permitDays:75,  feesPerUnit:18000,  ceqaRisk:0.35, coastalPct:0,   fireZonePct:68,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.35, approvalRate:0.82, population:211632,   medianHomePrice:340000,  airportNoisePct:2   },
  "Calaveras":      { permitDays:60,  feesPerUnit:14000,  ceqaRisk:0.25, coastalPct:0,   fireZonePct:78,  sb35Status:"subject",  heCompliance:"non-compliant", rhnaProgress:0.22, approvalRate:0.88, population:45905,    medianHomePrice:395000,  airportNoisePct:0   },
  "Colusa":         { permitDays:40,  feesPerUnit:9000,   ceqaRisk:0.12, coastalPct:0,   fireZonePct:15,  sb35Status:"exempt",   heCompliance:"compliant",     rhnaProgress:0.88, approvalRate:0.94, population:21917,    medianHomePrice:295000,  airportNoisePct:0   },
  "Contra Costa":   { permitDays:165, feesPerUnit:58000,  ceqaRisk:0.65, coastalPct:8,   fireZonePct:28,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.38, approvalRate:0.76, population:1161413,  medianHomePrice:875000,  airportNoisePct:8   },
  "Del Norte":      { permitDays:70,  feesPerUnit:15000,  ceqaRisk:0.30, coastalPct:45,  fireZonePct:55,  sb35Status:"subject",  heCompliance:"non-compliant", rhnaProgress:0.18, approvalRate:0.80, population:27812,    medianHomePrice:285000,  airportNoisePct:1   },
  "El Dorado":      { permitDays:105, feesPerUnit:38000,  ceqaRisk:0.50, coastalPct:0,   fireZonePct:72,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.32, approvalRate:0.79, population:192843,   medianHomePrice:625000,  airportNoisePct:1   },
  "Fresno":         { permitDays:68,  feesPerUnit:18000,  ceqaRisk:0.30, coastalPct:0,   fireZonePct:18,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.45, approvalRate:0.86, population:1008654,  medianHomePrice:365000,  airportNoisePct:5   },
  "Glenn":          { permitDays:42,  feesPerUnit:10000,  ceqaRisk:0.15, coastalPct:0,   fireZonePct:22,  sb35Status:"exempt",   heCompliance:"compliant",     rhnaProgress:0.82, approvalRate:0.91, population:28750,    medianHomePrice:285000,  airportNoisePct:0   },
  "Humboldt":       { permitDays:135, feesPerUnit:25000,  ceqaRisk:0.50, coastalPct:58,  fireZonePct:45,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.28, approvalRate:0.75, population:136310,   medianHomePrice:395000,  airportNoisePct:2   },
  "Imperial":       { permitDays:48,  feesPerUnit:10000,  ceqaRisk:0.15, coastalPct:0,   fireZonePct:5,   sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.55, approvalRate:0.90, population:180701,   medianHomePrice:285000,  airportNoisePct:3   },
  "Inyo":           { permitDays:55,  feesPerUnit:12000,  ceqaRisk:0.22, coastalPct:0,   fireZonePct:45,  sb35Status:"exempt",   heCompliance:"compliant",     rhnaProgress:0.75, approvalRate:0.88, population:19016,    medianHomePrice:325000,  airportNoisePct:1   },
  "Kern":           { permitDays:58,  feesPerUnit:15000,  ceqaRisk:0.25, coastalPct:0,   fireZonePct:22,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.52, approvalRate:0.87, population:909235,   medianHomePrice:315000,  airportNoisePct:4   },
  "Kings":          { permitDays:50,  feesPerUnit:12000,  ceqaRisk:0.18, coastalPct:0,   fireZonePct:8,   sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.48, approvalRate:0.89, population:153443,   medianHomePrice:295000,  airportNoisePct:3   },
  "Lake":           { permitDays:85,  feesPerUnit:18000,  ceqaRisk:0.35, coastalPct:0,   fireZonePct:75,  sb35Status:"subject",  heCompliance:"non-compliant", rhnaProgress:0.22, approvalRate:0.80, population:68766,    medianHomePrice:295000,  airportNoisePct:0   },
  "Lassen":         { permitDays:45,  feesPerUnit:10000,  ceqaRisk:0.15, coastalPct:0,   fireZonePct:62,  sb35Status:"exempt",   heCompliance:"compliant",     rhnaProgress:0.85, approvalRate:0.92, population:30573,    medianHomePrice:245000,  airportNoisePct:1   },
  "Los Angeles":    { permitDays:185, feesPerUnit:35000,  ceqaRisk:0.72, coastalPct:8,   fireZonePct:28,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.25, approvalRate:0.72, population:9829544,  medianHomePrice:925000,  airportNoisePct:22  },
  "Madera":         { permitDays:65,  feesPerUnit:16000,  ceqaRisk:0.28, coastalPct:0,   fireZonePct:35,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.42, approvalRate:0.85, population:160089,   medianHomePrice:365000,  airportNoisePct:2   },
  "Marin":          { permitDays:340, feesPerUnit:95000,  ceqaRisk:0.95, coastalPct:68,  fireZonePct:65,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.12, approvalRate:0.58, population:262321,   medianHomePrice:1650000,  airportNoisePct:3   },
  "Mariposa":       { permitDays:55,  feesPerUnit:12000,  ceqaRisk:0.22, coastalPct:0,   fireZonePct:82,  sb35Status:"exempt",   heCompliance:"compliant",     rhnaProgress:0.78, approvalRate:0.88, population:17131,    medianHomePrice:385000,  airportNoisePct:0   },
  "Mendocino":      { permitDays:155, feesPerUnit:28000,  ceqaRisk:0.55, coastalPct:52,  fireZonePct:55,  sb35Status:"subject",  heCompliance:"non-compliant", rhnaProgress:0.18, approvalRate:0.72, population:91601,    medianHomePrice:485000,  airportNoisePct:1   },
  "Merced":         { permitDays:62,  feesPerUnit:16000,  ceqaRisk:0.28, coastalPct:0,   fireZonePct:12,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.48, approvalRate:0.86, population:286461,   medianHomePrice:365000,  airportNoisePct:5   },
  "Modoc":          { permitDays:38,  feesPerUnit:8000,   ceqaRisk:0.10, coastalPct:0,   fireZonePct:55,  sb35Status:"exempt",   heCompliance:"compliant",     rhnaProgress:0.92, approvalRate:0.95, population:8661,     medianHomePrice:195000,  airportNoisePct:0   },
  "Mono":           { permitDays:75,  feesPerUnit:22000,  ceqaRisk:0.35, coastalPct:0,   fireZonePct:58,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.35, approvalRate:0.82, population:13247,    medianHomePrice:585000,  airportNoisePct:0   },
  "Monterey":       { permitDays:235, feesPerUnit:48000,  ceqaRisk:0.72, coastalPct:42,  fireZonePct:38,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.22, approvalRate:0.68, population:439035,   medianHomePrice:825000,  airportNoisePct:4   },
  "Napa":           { permitDays:175, feesPerUnit:58000,  ceqaRisk:0.70, coastalPct:5,   fireZonePct:58,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.28, approvalRate:0.72, population:138019,   medianHomePrice:895000,  airportNoisePct:3   },
  "Nevada":         { permitDays:95,  feesPerUnit:35000,  ceqaRisk:0.45, coastalPct:0,   fireZonePct:78,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.32, approvalRate:0.78, population:103487,   medianHomePrice:595000,  airportNoisePct:0   },
  "Orange":         { permitDays:125, feesPerUnit:55000,  ceqaRisk:0.62, coastalPct:18,  fireZonePct:22,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.35, approvalRate:0.75, population:3186989,  medianHomePrice:1125000,  airportNoisePct:8   },
  "Placer":         { permitDays:82,  feesPerUnit:32000,  ceqaRisk:0.40, coastalPct:0,   fireZonePct:48,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.55, approvalRate:0.82, population:412300,   medianHomePrice:675000,  airportNoisePct:2   },
  "Plumas":         { permitDays:50,  feesPerUnit:12000,  ceqaRisk:0.20, coastalPct:0,   fireZonePct:82,  sb35Status:"exempt",   heCompliance:"compliant",     rhnaProgress:0.82, approvalRate:0.90, population:19790,    medianHomePrice:325000,  airportNoisePct:0   },
  "Riverside":      { permitDays:88,  feesPerUnit:28000,  ceqaRisk:0.42, coastalPct:0,   fireZonePct:42,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.48, approvalRate:0.84, population:2458395,  medianHomePrice:565000,  airportNoisePct:6   },
  "Sacramento":     { permitDays:92,  feesPerUnit:21000,  ceqaRisk:0.45, coastalPct:0,   fireZonePct:12,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.42, approvalRate:0.82, population:1585055,  medianHomePrice:485000,  airportNoisePct:8   },
  "San Benito":     { permitDays:115, feesPerUnit:42000,  ceqaRisk:0.52, coastalPct:0,   fireZonePct:35,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.38, approvalRate:0.78, population:64209,    medianHomePrice:725000,  airportNoisePct:0   },
  "San Bernardino": { permitDays:82,  feesPerUnit:22000,  ceqaRisk:0.38, coastalPct:0,   fireZonePct:42,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.52, approvalRate:0.85, population:2194710,  medianHomePrice:485000,  airportNoisePct:7   },
  "San Diego":      { permitDays:145, feesPerUnit:42000,  ceqaRisk:0.55, coastalPct:15,  fireZonePct:38,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.32, approvalRate:0.76, population:3298634,  medianHomePrice:925000,  airportNoisePct:18  },
  "San Francisco":  { permitDays:425, feesPerUnit:88000,  ceqaRisk:0.92, coastalPct:100, fireZonePct:5,   sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.15, approvalRate:0.55, population:873965,   medianHomePrice:1485000,  airportNoisePct:28  },
  "San Joaquin":    { permitDays:72,  feesPerUnit:19000,  ceqaRisk:0.32, coastalPct:0,   fireZonePct:8,   sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.52, approvalRate:0.85, population:789410,   medianHomePrice:495000,  airportNoisePct:4   },
  "San Luis Obispo":{ permitDays:205, feesPerUnit:48000,  ceqaRisk:0.68, coastalPct:48,  fireZonePct:42,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.22, approvalRate:0.70, population:283111,   medianHomePrice:825000,  airportNoisePct:3   },
  "San Mateo":      { permitDays:275, feesPerUnit:92000,  ceqaRisk:0.88, coastalPct:55,  fireZonePct:22,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.18, approvalRate:0.62, population:764442,   medianHomePrice:1725000,  airportNoisePct:35  },
  "Santa Barbara":  { permitDays:215, feesPerUnit:52000,  ceqaRisk:0.75, coastalPct:42,  fireZonePct:55,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.22, approvalRate:0.68, population:448229,   medianHomePrice:985000,  airportNoisePct:5   },
  "Santa Clara":    { permitDays:195, feesPerUnit:78000,  ceqaRisk:0.82, coastalPct:5,   fireZonePct:15,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.28, approvalRate:0.72, population:1936259,  medianHomePrice:1585000,  airportNoisePct:10  },
  "Santa Cruz":     { permitDays:255, feesPerUnit:68000,  ceqaRisk:0.82, coastalPct:75,  fireZonePct:48,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.15, approvalRate:0.62, population:270861,   medianHomePrice:1125000,  airportNoisePct:2   },
  "Shasta":         { permitDays:62,  feesPerUnit:14000,  ceqaRisk:0.25, coastalPct:0,   fireZonePct:58,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.55, approvalRate:0.88, population:182155,   medianHomePrice:345000,  airportNoisePct:2   },
  "Sierra":         { permitDays:40,  feesPerUnit:8000,   ceqaRisk:0.12, coastalPct:0,   fireZonePct:85,  sb35Status:"exempt",   heCompliance:"compliant",     rhnaProgress:0.95, approvalRate:0.94, population:3236,     medianHomePrice:285000,  airportNoisePct:0   },
  "Siskiyou":       { permitDays:52,  feesPerUnit:11000,  ceqaRisk:0.18, coastalPct:0,   fireZonePct:62,  sb35Status:"exempt",   heCompliance:"compliant",     rhnaProgress:0.78, approvalRate:0.90, population:44076,    medianHomePrice:265000,  airportNoisePct:1   },
  "Solano":         { permitDays:98,  feesPerUnit:35000,  ceqaRisk:0.45, coastalPct:12,  fireZonePct:12,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.42, approvalRate:0.80, population:453491,   medianHomePrice:545000,  airportNoisePct:5   },
  "Sonoma":         { permitDays:195, feesPerUnit:62000,  ceqaRisk:0.72, coastalPct:22,  fireZonePct:62,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.25, approvalRate:0.70, population:488863,   medianHomePrice:795000,  airportNoisePct:3   },
  "Stanislaus":     { permitDays:68,  feesPerUnit:17000,  ceqaRisk:0.28, coastalPct:0,   fireZonePct:8,   sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.52, approvalRate:0.86, population:552878,   medianHomePrice:445000,  airportNoisePct:3   },
  "Sutter":         { permitDays:55,  feesPerUnit:14000,  ceqaRisk:0.22, coastalPct:0,   fireZonePct:5,   sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.58, approvalRate:0.88, population:99633,    medianHomePrice:385000,  airportNoisePct:2   },
  "Tehama":         { permitDays:48,  feesPerUnit:11000,  ceqaRisk:0.18, coastalPct:0,   fireZonePct:55,  sb35Status:"exempt",   heCompliance:"compliant",     rhnaProgress:0.75, approvalRate:0.90, population:65829,    medianHomePrice:285000,  airportNoisePct:1   },
  "Trinity":        { permitDays:45,  feesPerUnit:9000,   ceqaRisk:0.15, coastalPct:0,   fireZonePct:78,  sb35Status:"exempt",   heCompliance:"compliant",     rhnaProgress:0.88, approvalRate:0.92, population:16060,    medianHomePrice:245000,  airportNoisePct:0   },
  "Tulare":         { permitDays:52,  feesPerUnit:12000,  ceqaRisk:0.22, coastalPct:0,   fireZonePct:22,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.55, approvalRate:0.88, population:473117,   medianHomePrice:325000,  airportNoisePct:2   },
  "Tuolumne":       { permitDays:65,  feesPerUnit:15000,  ceqaRisk:0.28, coastalPct:0,   fireZonePct:78,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.45, approvalRate:0.85, population:55810,    medianHomePrice:385000,  airportNoisePct:0   },
  "Ventura":        { permitDays:185, feesPerUnit:48000,  ceqaRisk:0.70, coastalPct:32,  fireZonePct:52,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.25, approvalRate:0.70, population:843843,   medianHomePrice:825000,  airportNoisePct:4   },
  "Yolo":           { permitDays:88,  feesPerUnit:28000,  ceqaRisk:0.42, coastalPct:0,   fireZonePct:15,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.48, approvalRate:0.82, population:216986,   medianHomePrice:565000,  airportNoisePct:4   },
  "Yuba":           { permitDays:55,  feesPerUnit:14000,  ceqaRisk:0.22, coastalPct:0,   fireZonePct:35,  sb35Status:"subject",  heCompliance:"compliant",     rhnaProgress:0.52, approvalRate:0.86, population:81575,    medianHomePrice:385000,  airportNoisePct:3   },
};

export const COUNTY_SHAPES = {
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
export const LAYERS = {
  composite:    { label:'Overall Difficulty', color:NB.ember,    weight:null,
    description:'A weighted composite of all eight regulatory factors below. Counties scoring above 75 face conditions hostile enough to make most projects economically unviable. Think of it as the sum total of institutional resistance a builder must overcome.' },
  permitDays:   { label:'Permit Timeline',    color:NB.electric, weight:0.20, format:v=>`${v}d`, domain:[30,450],
    description:'The median number of calendar days from application to permit issuance for a new residential project. Every extra month is dead carrying cost — land loans accruing, construction windows closing, pro formas collapsing. San Francisco routinely exceeds a year.' },
  feesPerUnit:  { label:'Dev Fees / Unit',    color:NB.fuel,     weight:0.20, format:v=>fmtK(v), domain:[5000,100000],
    description:'Total government-imposed fees per housing unit: impact fees, plan check, utility connections, school fees, and affordable housing in-lieu payments. In coastal California these can exceed $150,000 per unit — a pure regulatory tax on housing production.' },
  ceqaRisk:     { label:'CEQA Risk',          color:NB.ember,    weight:0.12, format:v=>`${Math.round(v*100)}%`, domain:[0,1],
    description:'Probability of a project facing California Environmental Quality Act litigation or extended review. CEQA is frequently weaponized by neighbors and competitors to kill projects that have nothing to do with environmental harm. A high score means delay, legal fees, and settlement costs.' },
  coastalPct:   { label:'Coastal Zone',       color:NB.coolant,  weight:0.09, format:v=>`${v}%`, domain:[0,100],
    description:'Percentage of the jurisdiction\'s land area subject to California Coastal Commission review. Coastal Act permitting adds a second approval layer on top of local permits, with its own appeals process. Projects in the Coastal Zone can take years longer than identical inland projects.' },
  fireZonePct:  { label:'Fire Hazard',        color:'#A8441F',   weight:0.09, format:v=>`${v}%`, domain:[0,100],
    description:'Share of land in a CalFire High or Very High Fire Hazard Severity Zone. Building in these zones triggers mandatory hardening requirements, insurance difficulties, and sometimes outright denial. After Paradise and Lahaina, some insurers have simply exited California entirely.' },
  approvalRate: { label:'Approval Rate',      color:NB.electric, weight:0.09, format:v=>`${Math.round(v*100)}%`, domain:[0.5,1], invert:true,
    description:'The fraction of submitted housing applications that reach final approval. A low approval rate signals a hostile planning commission, aggressive design review, or a council with a pattern of finding pretextual grounds to deny. High is good — low means the game is rigged.' },
  rhnaProgress: { label:'RHNA Progress',      color:NB.fuel,     weight:0.09, format:v=>`${Math.round(v*100)}%`, domain:[0,1], invert:true,
    description:'How far along a jurisdiction is toward meeting its Regional Housing Needs Allocation — the state-mandated number of homes it must plan and permit. Low progress means the jurisdiction is chronically under-building, which tightens supply and signals bureaucratic resistance to growth.' },
  sb35Status:   { label:'SB 35 Status',       color:NB.blood,    weight:0.05, format:v=>v==='subject'?'SUBJECT':'EXEMPT', categorical:true,
    description:'Whether the jurisdiction is subject to SB 35, which grants by-right ministerial approval to qualifying projects in cities that are behind on their RHNA targets. Being subject to SB 35 is a red flag — it means the city has failed its housing obligations and the state has stripped some of its discretionary power.' },
  airportNoisePct:{ label:'Airport Noise Zone', color:NB.reactor,  weight:0.07, format:v=>`${v}%`, domain:[0,40],
    description:"Percentage of the county's developable residential land inside a 65 dB CNEL contour — the noise threshold at which California Building Code §1207 mandates acoustic analysis and mitigation. Sourced from Airport Land Use Compatibility Plans (ALUCPs) filed with Caltrans Division of Aeronautics. High-noise zones add acoustic study costs ($5k–$20k per project), mandatory building treatment, and in some cases outright prohibition of residential use. San Mateo (SFO), Los Angeles (LAX + six general aviation airports), and San Diego (Lindbergh + Miramar + Montgomery) are the most constrained." },
};
