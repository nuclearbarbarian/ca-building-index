import { clamp, LAYERS, normCity, normCounty } from './constants.js';
import defaultCeqaData from '../data/ceqaData.json';

// Build CEQA detail lookup: "cityname|county" -> ceqa record
const CEQA_LOOKUP = {};
for (const rec of defaultCeqaData) {
  const k = `${normCity(rec.name)}|${normCounty(rec.county).toLowerCase()}`;
  CEQA_LOOKUP[k] = rec;
  CEQA_LOOKUP[normCity(rec.name)] = rec;
}

/** Compute enriched ceqaRisk from CEQA detail data (0-1 scale, higher = harder) */
function computeCeqaRisk(ceqa) {
  // Weighted composite: EIR rate (40%), review days normalized (35%), inverse cat-ex rate (25%)
  const eirNorm = clamp(ceqa.eirRate / 0.22, 0, 1);          // SF max ~0.22
  const daysNorm = clamp(ceqa.avgReviewDays / 350, 0, 1);    // SF max ~350
  const catExPenalty = clamp(1 - ceqa.categoricalExemptionRate, 0, 1); // lower cat-ex = harder
  return clamp(eirNorm * 0.40 + daysNorm * 0.35 + catExPenalty * 0.25, 0, 1);
}

export const scoreMetrics = (data) => {
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
  if (data.sb35Status==='subject')         composite += 0.05;
  if (data.heCompliance==='non-compliant') composite += 0.05;
  return { ...data, normalized:norm, composite:clamp(composite,0,1) };
};

export function buildCityRecord(geoEntry, scraperRec, hcdCity, countyBase) {
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
    approvalRate:   base.approvalRate|| 0.80,
    sb35Status:     hcd.sb35Status   || base.sb35Status   || 'subject',
    heCompliance:   hcd.heCompliance || base.heCompliance || 'compliant',
    rhnaProgress:   hcd.rhnaProgress != null ? hcd.rhnaProgress : (base.rhnaProgress||0.5),
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
