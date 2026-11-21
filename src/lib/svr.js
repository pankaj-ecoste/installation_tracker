/* ══ SVR (Site Visit Report) — pure helpers (plan.md v2-79) ══
   No DOM, no database. Dates are local "YYYY-MM-DD" strings built from date PARTS (never toISOString(),
   which shifts a day in IST). The database (migration 0034) enforces the rules again. */
import { todayYmd, addDays, mondayOf, longDate } from './visitPlanner.js';

export const SVR_PROJECT_TYPES=['Residential','Commercial','Resi-cum-Commercial'];
export const SVR_MAX_FILES=20;
export const SVR_PERIODS=[
  {key:'today',label:'Today'},
  {key:'week',label:'This week'},
  {key:'month',label:'This month'},
  {key:'lastmonth',label:'Last month'},
  {key:'custom',label:'Custom range'}
];

const pad=n=>String(n).padStart(2,'0');
// created_at (timestamptz ISO string) -> local calendar date "YYYY-MM-DD"
export function svrLocalDate(iso){
  const d=new Date(iso); if(isNaN(d)) return '';
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
export function svrDateTimeLabel(iso){
  const d=new Date(iso); if(isNaN(d)) return '';
  let h=d.getHours(); const ap=h>=12?'pm':'am'; h=h%12||12;
  return longDate(svrLocalDate(iso))+' '+h+':'+pad(d.getMinutes())+' '+ap;
}

// {from,to} inclusive "YYYY-MM-DD" for a period key (custom uses the given from/to).
export function svrPeriodRange(key,today,customFrom,customTo){
  const t=today||todayYmd();
  const [y,m]=t.split('-').map(Number);
  if(key==='today') return {from:t,to:t};
  if(key==='week') return {from:mondayOf(t),to:addDays(mondayOf(t),6)};
  if(key==='lastmonth'){
    const ly=m===1?y-1:y, lm=m===1?12:m-1;
    const last=new Date(ly,lm,0).getDate();
    return {from:ly+'-'+pad(lm)+'-01',to:ly+'-'+pad(lm)+'-'+pad(last)};
  }
  if(key==='custom') return {from:customFrom||'',to:customTo||''};
  const last=new Date(y,m,0).getDate();
  return {from:y+'-'+pad(m)+'-01',to:y+'-'+pad(m)+'-'+pad(last)};
}
export function svrInRange(report,range){
  const d=svrLocalDate(report.created_at);
  if(range.from&&d<range.from) return false;
  if(range.to&&d>range.to) return false;
  return true;
}

// Person-wise counts, most first.
export function svrPersonCounts(reports){
  const map=new Map();
  reports.forEach(r=>{
    const k=String(r.submitted_by_id);
    const e=map.get(k)||{id:r.submitted_by_id,name:r.submitted_by_name,count:0};
    e.count++; map.set(k,e);
  });
  return [...map.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
}

// Names compare on letters+digits only; "similar" = one contains the other (min 4 chars).
export const svrNameKey=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function svrIsSimilar(a,b){
  const x=svrNameKey(a), y=svrNameKey(b);
  if(x.length<4||y.length<4) return false;
  return x.includes(y)||y.includes(x);
}

// Client / Builder suggestions: developer / client names from requests and projects, plus earlier SVRs. Unique, sorted.
export function svrClientSuggestions(requests,projects,reports){
  const seen=new Map();
  const add=v=>{ const t=String(v||'').trim(); if(!t||t==='—') return; const k=t.toLowerCase(); if(!seen.has(k)) seen.set(k,t); };
  (requests||[]).forEach(r=>{ const d=r.details||{}; add(d.developerName); add(d.clientName); });
  (projects||[]).forEach(p=>add(p.developer));
  (reports||[]).forEach(r=>add(r.client_name));
  return [...seen.values()].sort((a,b)=>a.localeCompare(b));
}

// Friendly validation before the save (the database checks again).
export function svrValidate(d,{cities}){
  if(!String(d.site_name||'').trim()) return 'Please enter the Site / Project Name.';
  if(!String(d.client_name||'').trim()) return 'Please enter the Client / Builder Name.';
  if(!SVR_PROJECT_TYPES.includes(d.project_type)) return 'Please select the Project Type.';
  if(!d.city||(cities&&!cities.includes(d.city))) return 'Please pick the City from the list.';
  if(d.contact_mobile&&!/^[0-9]{10}$/.test(d.contact_mobile)) return 'Contact mobile must be 10 digits.';
  if(d.fileCount<1) return 'Please add at least one photo / document.';
  if(d.fileCount>SVR_MAX_FILES) return 'At most '+SVR_MAX_FILES+' photos / documents.';
  return '';
}

export const svrMapUrl=r=>(r.lat!=null&&r.lng!=null)?'https://www.google.com/maps?q='+r.lat+','+r.lng:'';

export function svrCsv(reports){
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const header=['Date','Time','Submitted by','Site / Project','Client / Builder','Project type','City','Contact person','Contact mobile','Location','Map','Remarks / Next action','Files'];
  const rows=reports.map(r=>{
    const dt=svrDateTimeLabel(r.created_at).split(' ');
    return [dt.slice(0,3).join(' '),dt.slice(3).join(' '),r.submitted_by_name,r.site_name,r.client_name,r.project_type,r.city,r.contact_name,r.contact_mobile,
      r.location_text,svrMapUrl(r),r.remarks,(Array.isArray(r.docs)?r.docs:[]).map(x=>x&&x.url?x.url:x).join(' | ')].map(q).join(',');
  });
  return [header.map(q).join(',')].concat(rows).join('\n');
}
