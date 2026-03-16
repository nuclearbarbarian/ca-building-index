import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CA_GEOJSON_URL, countyNameFromProps, featureToPath,
  HCD_BASE, PACKAGES, getField, safeFloat, normCounty, normCity, clamp,
} from './constants.js';

// ─── Hook: fetch CA county GeoJSON from state GIS ───────────────────────
export function useCountyGeoJSON() {
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

// ═══════════════════════════════════════════════════════════════
// HCD DATA HOOK
// ═══════════════════════════════════════════════════════════════
export function useHCDData() {
  const [state, setState] = useState({ fetchStatus:'idle', countyLive:{}, cityLive:{}, sources:{}, lastFetched:null });
  const abortRef = useRef(null);

  const fetchAll = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setState(s=>({...s, fetchStatus:'fetching',
      sources:{ apr:{label:'APR Permits',status:'fetching'}, sb35:{label:'SB 35 / HE',status:'fetching'}, rhna:{label:'RHNA Progress',status:'fetching'} }
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
          const SB35F=['sb35_status','SB35_Status','determination']; const HEF=['he_status','HE_Status','housing_element_status','compliance_status'];
          const cSB={},cHE={};
          for(const rec of records){
            const j=getField(rec,JNAME); const c=normCounty(getField(rec,CNAME)||'');
            const sb=(getField(rec,SB35F,'')||'').toLowerCase(); const he=(getField(rec,HEF,'')||'').toLowerCase();
            const isSub=sb.includes('subject')||sb==='y'||sb==='1'; const isExm=sb.includes('exempt')||sb==='n'||sb==='0';
            const isCom=he&&!he.includes('non')&&(he.includes('compliant')||he.includes('certified')); const isNon=he&&he.includes('non');
            if(j&&c){ const upd={}; if(isSub)upd.sb35Status='subject'; else if(isExm)upd.sb35Status='exempt';
              if(isCom)upd.heCompliance='compliant'; else if(isNon)upd.heCompliance='non-compliant';
              if(Object.keys(upd).length)mergeCity(j,c,upd); }
            if(c){ if(!cSB[c])cSB[c]={s:0,e:0}; if(!cHE[c])cHE[c]={y:0,n:0};
              if(isSub)cSB[c].s++; if(isExm)cSB[c].e++; if(isCom)cHE[c].y++; if(isNon)cHE[c].n++; }
          }
          for(const[c,v]of Object.entries(cSB))if(v.s+v.e>0)mergeCounty(c,{sb35Status:v.s>=v.e?'subject':'exempt'});
          for(const[c,v]of Object.entries(cHE))if(v.y+v.n>0)mergeCounty(c,{heCompliance:v.y>=v.n?'compliant':'non-compliant'});
          srcRes.sb35={label:'SB 35 / HE',status:'success',records:records.length,year:new Date(res.last_modified||Date.now()).getFullYear()};
        }catch(e){if(e.name!=='AbortError')srcRes.sb35={label:'SB 35 / HE',status:'error',error:e.message};}
        setState(s=>({...s,sources:{...s.sources,...srcRes}}));
      })(),
      (async()=>{
        try{
          const res=(await fetchPkg(PACKAGES.RHNA))[0]; const {records}=await fetchDS(res.id);
          const JNAME=['jurisdiction_name','jurisdiction','city','City']; const CNAME=['county','County'];
          const ALLOC=['rhna_allocation','total_need','allocation']; const PERMIT=['units_permitted','actual','permits_issued'];
          const PCT=['progress_pct','percent_complete','pct_progress']; const cBk={};
          for(const rec of records){
            const j=getField(rec,JNAME); const c=normCounty(getField(rec,CNAME)||''); if(!c)continue;
            if(!cBk[c])cBk[c]={pSum:0,pN:0};
            const p=safeFloat(getField(rec,PCT),NaN);
            const prog=!isNaN(p)?(p>1?p/100:p):(safeFloat(getField(rec,ALLOC))>0?clamp(safeFloat(getField(rec,PERMIT))/safeFloat(getField(rec,ALLOC)),0,1):null);
            if(prog!=null){cBk[c].pSum+=prog;cBk[c].pN++;}
            if(j&&c&&prog!=null)mergeCity(j,c,{rhnaProgress:prog});
          }
          for(const[c,v]of Object.entries(cBk))if(v.pN>0)mergeCounty(c,{rhnaProgress:v.pSum/v.pN});
          srcRes.rhna={label:'RHNA Progress',status:'success',records:records.length,year:new Date(res.last_modified||Date.now()).getFullYear()};
        }catch(e){if(e.name!=='AbortError')srcRes.rhna={label:'RHNA Progress',status:'error',error:e.message};}
        setState(s=>({...s,sources:{...s.sources,...srcRes}}));
      })(),
    ]);
    if(ctrl.signal.aborted)return;
    const ok=Object.values(srcRes).filter(s=>s.status==='success').length;
    setState({ fetchStatus:ok===0?'error':ok<3?'partial':'success', countyLive:countyAgg, cityLive:cityData, sources:srcRes, lastFetched:new Date() });
  },[]);

  useEffect(()=>{ fetchAll(); return()=>abortRef.current?.abort(); },[fetchAll]);
  return {...state, refresh:fetchAll};
}
