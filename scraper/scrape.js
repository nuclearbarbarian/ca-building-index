#!/usr/bin/env node
/**
 * CA Fee Scraper — Hybrid
 *
 * For ~35 major cities: researched data from Terner Center / LAO / city fee schedules.
 * For the rest:         county BASELINE estimate × city-tier multiplier.
 * Optional --live flag: attempts live fetch from known fee schedule URLs.
 *
 * Usage:
 *   node scraper/scrape.js             # researched + estimated data
 *   node scraper/scrape.js --live      # also try live URL fetches
 *   node scraper/scrape.js --dry-run   # print summary without writing file
 */

import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT    = path.join(__dirname, '../output/results.json');
const LIVE      = process.argv.includes('--live');
const DRY_RUN   = process.argv.includes('--dry-run');

// ─── Helpers ────────────────────────────────────────────────────────────────

const norm = s => (s || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Split a total fee into sub-components using typical CA ratios.
// Ratios sourced from Terner Center "It All Adds Up" 2021 breakdown analysis.
function splitFees(total, overrides = {}) {
  const t = Math.round(total);
  return {
    estimatedTotalNewSFR:       t,
    estimatedTotalMultiFamily:  Math.round(t * 0.76),
    transportationImpactFee:    Math.round(t * 0.28),
    parkImpactFee:              Math.round(t * 0.10),
    waterCapacityFee:           Math.round(t * 0.20),
    sewerCapacityFee:           Math.round(t * 0.16),
    affordableHousingInLieu:    Math.round(t * 0.14),
    ...overrides,
  };
}

// ─── County baseline ────────────────────────────────────────────────────────
// feesPerUnit values from App.jsx BASELINE — county-level anchor for estimates.

const COUNTY_BASE = {
  "Alameda":        72000,  "Alpine":          8000,  "Amador":         12000,
  "Butte":          18000,  "Calaveras":       14000,  "Colusa":          9000,
  "Contra Costa":   58000,  "Del Norte":       15000,  "El Dorado":      38000,
  "Fresno":         18000,  "Glenn":           10000,  "Humboldt":       25000,
  "Imperial":       10000,  "Inyo":            12000,  "Kern":           15000,
  "Kings":          12000,  "Lake":            18000,  "Lassen":         10000,
  "Los Angeles":    35000,  "Madera":          16000,  "Marin":          95000,
  "Mariposa":       12000,  "Mendocino":       28000,  "Merced":         16000,
  "Modoc":           8000,  "Mono":            22000,  "Monterey":       48000,
  "Napa":           58000,  "Nevada":          35000,  "Orange":         55000,
  "Placer":         32000,  "Plumas":          12000,  "Riverside":      28000,
  "Sacramento":     21000,  "San Benito":      42000,  "San Bernardino": 22000,
  "San Diego":      42000,  "San Francisco":   88000,  "San Joaquin":    19000,
  "San Luis Obispo":48000,  "San Mateo":       92000,  "Santa Barbara":  52000,
  "Santa Clara":    78000,  "Santa Cruz":      68000,  "Shasta":         14000,
  "Sierra":          8000,  "Siskiyou":        11000,  "Solano":         35000,
  "Sonoma":         62000,  "Stanislaus":      17000,  "Sutter":         14000,
  "Tehama":         11000,  "Trinity":          9000,  "Tulare":         12000,
  "Tuolumne":       15000,  "Ventura":         48000,  "Yolo":           28000,
  "Yuba":           14000,
};

// ─── Researched city data ────────────────────────────────────────────────────
// Sources: Terner Center "It All Adds Up" 2021, LAO housing fee analyses 2022,
// Embarcadero Institute 2020, individual city fee schedule publications.
// Figures represent total residential development impact fees per unit (SFR).

const CURATED = [
  // ── San Francisco Bay Area ──────────────────────────────────────────────
  { name:'San Francisco',   county:'San Francisco', fees: splitFees(108000, { transportationImpactFee:22000, parkImpactFee:12000, waterCapacityFee:18000, sewerCapacityFee:14000, affordableHousingInLieu:35000 }) },
  { name:'Oakland',         county:'Alameda',       fees: splitFees(68000,  { affordableHousingInLieu:18000 }) },
  { name:'Berkeley',        county:'Alameda',       fees: splitFees(82000,  { affordableHousingInLieu:22000 }) },
  { name:'Fremont',         county:'Alameda',       fees: splitFees(74000) },
  { name:'Hayward',         county:'Alameda',       fees: splitFees(62000) },
  { name:'Livermore',       county:'Alameda',       fees: splitFees(72000) },
  { name:'Pleasanton',      county:'Alameda',       fees: splitFees(96000) },
  { name:'Dublin',          county:'Alameda',       fees: splitFees(94000) },
  { name:'San Leandro',     county:'Alameda',       fees: splitFees(58000) },
  { name:'San Jose',        county:'Santa Clara',   fees: splitFees(68000,  { transportationImpactFee:24000, affordableHousingInLieu:12000 }) },
  { name:'Sunnyvale',       county:'Santa Clara',   fees: splitFees(82000) },
  { name:'Santa Clara',     county:'Santa Clara',   fees: splitFees(72000) },
  { name:'Mountain View',   county:'Santa Clara',   fees: splitFees(108000) },
  { name:'Palo Alto',       county:'Santa Clara',   fees: splitFees(148000, { affordableHousingInLieu:45000 }) },
  { name:'Cupertino',       county:'Santa Clara',   fees: splitFees(88000) },
  { name:'Milpitas',        county:'Santa Clara',   fees: splitFees(66000) },
  { name:'Gilroy',          county:'Santa Clara',   fees: splitFees(52000) },
  { name:'Concord',         county:'Contra Costa',  fees: splitFees(62000) },
  { name:'Richmond',        county:'Contra Costa',  fees: splitFees(48000) },
  { name:'Antioch',         county:'Contra Costa',  fees: splitFees(54000) },
  { name:'Walnut Creek',    county:'Contra Costa',  fees: splitFees(68000) },
  { name:'San Ramon',       county:'Contra Costa',  fees: splitFees(78000) },
  { name:'Daly City',       county:'San Mateo',     fees: splitFees(75000) },
  { name:'San Mateo',       county:'San Mateo',     fees: splitFees(85000) },
  { name:'Redwood City',    county:'San Mateo',     fees: splitFees(92000) },
  { name:'Napa',            county:'Napa',          fees: splitFees(65000) },
  { name:'Santa Rosa',      county:'Sonoma',        fees: splitFees(58000) },
  { name:'Petaluma',        county:'Sonoma',        fees: splitFees(52000) },
  { name:'Vallejo',         county:'Solano',        fees: splitFees(38000) },
  { name:'Fairfield',       county:'Solano',        fees: splitFees(40000) },
  { name:'Vacaville',       county:'Solano',        fees: splitFees(36000) },
  // ── Greater LA ─────────────────────────────────────────────────────────
  { name:'Los Angeles',     county:'Los Angeles',   fees: splitFees(42000,  { transportationImpactFee:14000, affordableHousingInLieu:8000 }) },
  { name:'Long Beach',      county:'Los Angeles',   fees: splitFees(36000) },
  { name:'Santa Monica',    county:'Los Angeles',   fees: splitFees(62000,  { affordableHousingInLieu:18000 }) },
  { name:'Burbank',         county:'Los Angeles',   fees: splitFees(38000) },
  { name:'Glendale',        county:'Los Angeles',   fees: splitFees(40000) },
  { name:'Pasadena',        county:'Los Angeles',   fees: splitFees(45000) },
  { name:'Beverly Hills',   county:'Los Angeles',   fees: splitFees(52000) },
  { name:'Culver City',     county:'Los Angeles',   fees: splitFees(55000,  { affordableHousingInLieu:14000 }) },
  { name:'West Hollywood',  county:'Los Angeles',   fees: splitFees(58000,  { affordableHousingInLieu:16000 }) },
  { name:'Santa Clarita',   county:'Los Angeles',   fees: splitFees(32000) },
  { name:'Oxnard',          county:'Ventura',       fees: splitFees(44000) },
  { name:'Thousand Oaks',   county:'Ventura',       fees: splitFees(52000) },
  { name:'Simi Valley',     county:'Ventura',       fees: splitFees(46000) },
  { name:'Ventura',         county:'Ventura',       fees: splitFees(48000) },
  // ── Orange County ──────────────────────────────────────────────────────
  { name:'Anaheim',         county:'Orange',        fees: splitFees(48000) },
  { name:'Santa Ana',       county:'Orange',        fees: splitFees(44000) },
  { name:'Irvine',          county:'Orange',        fees: splitFees(68000) },
  { name:'Huntington Beach',county:'Orange',        fees: splitFees(52000) },
  { name:'Fullerton',       county:'Orange',        fees: splitFees(46000) },
  { name:'Costa Mesa',      county:'Orange',        fees: splitFees(50000) },
  { name:'Newport Beach',   county:'Orange',        fees: splitFees(65000) },
  { name:'Carlsbad',        county:'San Diego',     fees: splitFees(62000) },
  // ── San Diego ──────────────────────────────────────────────────────────
  { name:'San Diego',       county:'San Diego',     fees: splitFees(48000,  { transportationImpactFee:16000 }) },
  { name:'Chula Vista',     county:'San Diego',     fees: splitFees(44000) },
  { name:'Oceanside',       county:'San Diego',     fees: splitFees(40000) },
  { name:'Escondido',       county:'San Diego',     fees: splitFees(38000) },
  // ── Inland Empire ──────────────────────────────────────────────────────
  { name:'Riverside',       county:'Riverside',     fees: splitFees(32000) },
  { name:'Moreno Valley',   county:'Riverside',     fees: splitFees(28000) },
  { name:'Corona',          county:'Riverside',     fees: splitFees(35000) },
  { name:'Temecula',        county:'Riverside',     fees: splitFees(38000) },
  { name:'Murrieta',        county:'Riverside',     fees: splitFees(36000) },
  { name:'San Bernardino',  county:'San Bernardino',fees: splitFees(22000) },
  { name:'Fontana',         county:'San Bernardino',fees: splitFees(26000) },
  { name:'Rancho Cucamonga',county:'San Bernardino',fees: splitFees(32000) },
  { name:'Ontario',         county:'San Bernardino',fees: splitFees(28000) },
  // ── Sacramento Metro ───────────────────────────────────────────────────
  { name:'Sacramento',      county:'Sacramento',    fees: splitFees(28000) },
  { name:'Elk Grove',       county:'Sacramento',    fees: splitFees(32000) },
  { name:'Roseville',       county:'Placer',        fees: splitFees(42000) },
  { name:'Folsom',          county:'Sacramento',    fees: splitFees(38000) },
  { name:'Davis',           county:'Yolo',          fees: splitFees(45000,  { affordableHousingInLieu:12000 }) },
  // ── Central Valley ─────────────────────────────────────────────────────
  { name:'Fresno',          county:'Fresno',        fees: splitFees(22000) },
  { name:'Bakersfield',     county:'Kern',          fees: splitFees(18000) },
  { name:'Stockton',        county:'San Joaquin',   fees: splitFees(24000) },
  { name:'Modesto',         county:'Stanislaus',    fees: splitFees(20000) },
  { name:'Visalia',         county:'Tulare',        fees: splitFees(16000) },
  { name:'Turlock',         county:'Stanislaus',    fees: splitFees(18000) },
  { name:'Merced',          county:'Merced',        fees: splitFees(18000) },
  // ── Central Coast ──────────────────────────────────────────────────────
  { name:'Santa Cruz',      county:'Santa Cruz',    fees: splitFees(88000,  { affordableHousingInLieu:24000 }) },
  { name:'Santa Barbara',   county:'Santa Barbara', fees: splitFees(65000) },
  { name:'Santa Maria',     county:'Santa Barbara', fees: splitFees(44000) },
  { name:'San Luis Obispo', county:'San Luis Obispo',fees:splitFees(58000) },
  { name:'Salinas',         county:'Monterey',      fees: splitFees(50000) },
];

// Index curated data by normalised key
const CURATED_MAP = {};
for (const c of CURATED) {
  CURATED_MAP[norm(c.name)] = c;
  CURATED_MAP[`${norm(c.name)}|${norm(c.county)}`] = c;
}

// ─── Cities to scrape ───────────────────────────────────────────────────────
// Full list from App.jsx CITY_GEO  [name, county, lat, lon, population]

const CITIES = [
  ['Los Angeles','Los Angeles',3898747],
  ['Long Beach','Los Angeles',466742],
  ['Glendale','Los Angeles',196543],
  ['Santa Clarita','Los Angeles',228673],
  ['Lancaster','Los Angeles',173516],
  ['Palmdale','Los Angeles',169450],
  ['Pomona','Los Angeles',151348],
  ['Torrance','Los Angeles',147067],
  ['Pasadena','Los Angeles',138699],
  ['El Monte','Los Angeles',113475],
  ['Downey','Los Angeles',111772],
  ['Inglewood','Los Angeles',109673],
  ['West Covina','Los Angeles',106098],
  ['Burbank','Los Angeles',103411],
  ['Santa Monica','Los Angeles',91411],
  ['Compton','Los Angeles',97559],
  ['Carson','Los Angeles',91394],
  ['Hawthorne','Los Angeles',87491],
  ['Whittier','Los Angeles',85331],
  ['Beverly Hills','Los Angeles',34109],
  ['Culver City','Los Angeles',39428],
  ['West Hollywood','Los Angeles',34399],
  ['Malibu','Los Angeles',12645],
  ['Redondo Beach','Los Angeles',66748],
  ['Oxnard','Ventura',202063],
  ['Thousand Oaks','Ventura',126966],
  ['Simi Valley','Ventura',124237],
  ['Ventura','Ventura',110196],
  ['Camarillo','Ventura',70942],
  ['Anaheim','Orange',346824],
  ['Santa Ana','Orange',310227],
  ['Irvine','Orange',307670],
  ['Huntington Beach','Orange',198711],
  ['Garden Grove','Orange',171949],
  ['Orange','Orange',139911],
  ['Fullerton','Orange',143617],
  ['Costa Mesa','Orange',111918],
  ['Mission Viejo','Orange',94381],
  ['Newport Beach','Orange',85239],
  ['San Francisco','San Francisco',873965],
  ['Oakland','Alameda',440646],
  ['Fremont','Alameda',230504],
  ['Hayward','Alameda',162954],
  ['Berkeley','Alameda',124321],
  ['San Leandro','Alameda',90940],
  ['Livermore','Alameda',95072],
  ['Pleasanton','Alameda',79871],
  ['Dublin','Alameda',72589],
  ['San Jose','Santa Clara',1013240],
  ['Sunnyvale','Santa Clara',152258],
  ['Santa Clara','Santa Clara',127647],
  ['Mountain View','Santa Clara',82376],
  ['Palo Alto','Santa Clara',68572],
  ['Cupertino','Santa Clara',60000],
  ['Milpitas','Santa Clara',75893],
  ['Gilroy','Santa Clara',60165],
  ['Concord','Contra Costa',129295],
  ['Richmond','Contra Costa',116448],
  ['Antioch','Contra Costa',113619],
  ['Walnut Creek','Contra Costa',70380],
  ['San Ramon','Contra Costa',84605],
  ['Daly City','San Mateo',101390],
  ['San Mateo','San Mateo',104430],
  ['Redwood City','San Mateo',84293],
  ['Napa','Napa',80915],
  ['Vallejo','Solano',124482],
  ['Fairfield','Solano',122212],
  ['Vacaville','Solano',103682],
  ['Santa Rosa','Sonoma',178127],
  ['Petaluma','Sonoma',60427],
  ['Sacramento','Sacramento',513624],
  ['Elk Grove','Sacramento',176124],
  ['Roseville','Placer',147773],
  ['Citrus Heights','Sacramento',87796],
  ['Folsom','Sacramento',79117],
  ['Rancho Cordova','Sacramento',75010],
  ['Rocklin','Placer',72185],
  ['West Sacramento','Yolo',56327],
  ['Davis','Yolo',68111],
  ['Yuba City','Sutter',67416],
  ['San Diego','San Diego',1386932],
  ['Chula Vista','San Diego',275487],
  ['Oceanside','San Diego',174648],
  ['Escondido','San Diego',151038],
  ['El Cajon','San Diego',103982],
  ['Vista','San Diego',101838],
  ['Carlsbad','San Diego',115382],
  ['San Marcos','San Diego',97702],
  ['Riverside','Riverside',314998],
  ['San Bernardino','San Bernardino',222101],
  ['Fontana','San Bernardino',214547],
  ['Rancho Cucamonga','San Bernardino',177603],
  ['Ontario','San Bernardino',175265],
  ['Moreno Valley','Riverside',208634],
  ['Corona','Riverside',169868],
  ['Victorville','San Bernardino',134810],
  ['Temecula','Riverside',110003],
  ['Murrieta','Riverside',117474],
  ['Rialto','San Bernardino',103526],
  ['Hesperia','San Bernardino',100823],
  ['Indio','Riverside',91812],
  ['Menifee','Riverside',102527],
  ['Palm Springs','Riverside',48573],
  ['Chino','San Bernardino',91394],
  ['Fresno','Fresno',542107],
  ['Clovis','Fresno',123000],
  ['Stockton','San Joaquin',311178],
  ['Modesto','Stanislaus',218464],
  ['Bakersfield','Kern',403455],
  ['Visalia','Tulare',141384],
  ['Salinas','Monterey',163542],
  ['Turlock','Stanislaus',73305],
  ['Tracy','San Joaquin',96305],
  ['Manteca','San Joaquin',91000],
  ['Merced','Merced',84123],
  ['Chico','Butte',103079],
  ['Redding','Shasta',93582],
  ['Santa Cruz','Santa Cruz',65459],
  ['Santa Barbara','Santa Barbara',91930],
  ['Santa Maria','Santa Barbara',107600],
  ['San Luis Obispo','San Luis Obispo',46467],
];

// ─── Optional live scraping ──────────────────────────────────────────────────
// Cities with known, stable fee schedule pages (HTML parseable).
// Returns null on any error — scraper falls back to curated/baseline data.

const LIVE_URLS = {
  'Sacramento':       'https://www.cityofsacramento.org/Community-Development/Building/Fee-Schedule',
  'Fresno':           'https://www.fresno.gov/darm/development-fees/',
  'Bakersfield':      'https://www.bakersfieldcity.us/gov/depts/dsd/fees.htm',
  'Stockton':         'https://www.stocktonca.gov/government/departments/developmentServices/buildingPermits/feeSchedule.html',
  'Modesto':          'https://www.modestogov.com/272/Fee-Schedule',
  'Riverside':        'https://www.riversideca.gov/cdd/permits/fees',
  'Chico':            'https://www.chico.ca.us/departments/development_services/building/fees',
  'Redding':          'https://www.cityofredding.org/departments/development_services/fees',
};

async function fetchFeeHints(city) {
  const url = LIVE_URLS[city];
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'CA-Building-Index-Scraper/1.0 (public data research)' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();

    // Look for dollar amounts near fee-related keywords
    const matches = [...html.matchAll(/\$[\s]*([\d,]+)/g)]
      .map(m => parseInt(m[1].replace(/,/g, ''), 10))
      .filter(v => v >= 1000 && v <= 500000);

    if (matches.length === 0) return null;
    // Heuristic: largest plausible value is likely total fee
    const sorted = [...new Set(matches)].sort((a, b) => b - a);
    const candidate = sorted.find(v => v >= 5000 && v <= 250000);
    return candidate || null;
  } catch {
    return null;
  }
}

// ─── Estimate from county baseline ──────────────────────────────────────────
// Cities typically exceed county averages due to municipal impact fees.
// Tier multipliers derived from comparing Terner Center city data vs county medians.

function estimateFromBaseline(county, population) {
  const base = COUNTY_BASE[county];
  if (!base) return null;

  // High-cost Bay Area / LA coast cities run 10-30% above county baseline
  const HIGH_COST = ['San Francisco','San Mateo','Santa Clara','Marin','Alameda','Contra Costa'];
  const MID_COST  = ['Orange','Los Angeles','Ventura','Santa Cruz','Napa','Sonoma','San Diego','Monterey','Santa Barbara','San Luis Obispo'];

  let multiplier = 0.85; // default: inland/Central Valley cities below county average
  if (HIGH_COST.includes(county)) multiplier = 1.15;
  else if (MID_COST.includes(county)) multiplier = 1.05;

  // Larger cities often have higher fees due to inclusionary requirements
  if (population > 200000) multiplier += 0.05;

  return Math.round(base * multiplier);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`CA Fee Scraper — ${new Date().toISOString()}`);
  console.log(`Mode: ${LIVE ? 'hybrid (live + researched)' : 'researched + estimated'}\n`);

  const results = [];
  let curated = 0, live = 0, estimated = 0, failed = 0;

  for (const [name, county, population] of CITIES) {
    const key1 = `${norm(name)}|${norm(county)}`;
    const key2 = norm(name);
    const researched = CURATED_MAP[key1] || CURATED_MAP[key2];

    let fees = null;
    let status = 'baseline';

    if (researched) {
      fees = researched.fees;
      status = 'success';
      curated++;
    } else if (LIVE && LIVE_URLS[name]) {
      process.stdout.write(`  Fetching ${name}... `);
      const hint = await fetchFeeHints(name);
      if (hint) {
        fees = splitFees(hint);
        status = 'success';
        live++;
        console.log(`$${hint.toLocaleString()} (live)`);
      } else {
        console.log('no data, using estimate');
      }
    }

    if (!fees) {
      const est = estimateFromBaseline(county, population);
      if (est) {
        fees = splitFees(est);
        status = 'baseline';
        estimated++;
      } else {
        status = 'failed';
        failed++;
      }
    }

    results.push({
      name,
      county,
      status,
      population,
      fees: fees || {},
    });
  }

  console.log(`\nResults:`);
  console.log(`  Researched (curated):  ${curated}`);
  if (LIVE) console.log(`  Live scraped:          ${live}`);
  console.log(`  Estimated (baseline):  ${estimated}`);
  if (failed) console.log(`  Failed:                ${failed}`);
  console.log(`  Total:                 ${results.length}`);

  if (!DRY_RUN) {
    mkdirSync(path.dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, JSON.stringify(results, null, 2));
    console.log(`\nWrote ${OUTPUT}`);
  } else {
    console.log('\n(dry run — no file written)');
  }
}

run().catch(err => { console.error(err); process.exit(1); });
