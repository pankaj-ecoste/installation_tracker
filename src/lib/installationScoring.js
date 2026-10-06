/* ══ INSTALLATION SCORING REPORT — pure rules (plan.md v2-58) ══
   No DOM, no database, no `state` import: every function takes the data it needs, so the rules can be tested on
   their own and the DPR form can share the exact same "weekly projection lock" rule as the report.
   Weeks are Monday–Saturday; Sunday is off. All dates are plain local "YYYY-MM-DD" strings built from date PARTS —
   never toISOString(), which shifts a day in IST (see the DPR date gotcha in plan.md). */

export const MANAGERS=[
  {key:'shashank',label:'Shashank'},
  {key:'aditya',label:'Aditya'}
];

const pad=n=>String(n).padStart(2,'0');
const ymdOf=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};

// dpr_log.date is free text like "21 Aug 2026" or "01 Sept 2026" (note "Sept"); sod_eod_log.log_date is "YYYY-MM-DD".
// Parsed by hand (first three letters of the month) so it never depends on the browser's Date-string parser.
export function toYmd(dateLike){
  if(!dateLike) return null;
  const s=String(dateLike).trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return m[1]+'-'+m[2]+'-'+m[3];
  m=s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/);
  if(m){
    const mon=MONTHS[m[2].slice(0,3).toLowerCase()];
    if(mon!==undefined) return m[3]+'-'+pad(mon+1)+'-'+pad(Number(m[1]));
  }
  const d=new Date(s); return isNaN(d)?null:ymdOf(d);
}
const partsOf=ymd=>{ const [y,m,d]=ymd.split('-').map(Number); return new Date(y,m-1,d); };
export const addDays=(ymd,n)=>{ const d=partsOf(ymd); return ymdOf(new Date(d.getFullYear(),d.getMonth(),d.getDate()+n)); };

// Monday of the week a date belongs to. A Sunday belongs to the week that just ended (same as the DPR weekly sums).
export function mondayOf(ymd){
  const d=partsOf(ymd); const day=d.getDay();
  return addDays(ymd,day===0?-6:1-day);
}
export const weekDays=monday=>[0,1,2,3,4,5].map(i=>addDays(monday,i)); // Mon..Sat

// "September Week 4 (21 Sep – 26 Sep 2026)": a week belongs to the month its SATURDAY falls in, and its number is
// which Saturday of that month it is (21–26 Sep: Saturdays are 5, 12, 19, 26 → Week 4).
export function weekTitle(monday){
  const sat=partsOf(addDays(monday,5)); const mon=partsOf(monday);
  const monthName=MONTH_NAMES[sat.getMonth()];
  const n=Math.ceil(sat.getDate()/7);
  const short=d=>d.getDate()+' '+MONTH_NAMES[d.getMonth()].slice(0,3); // fixed English names — locale output varies ("Sept")
  return 'INSTALLATION SCORING REPORT — '+monthName+' Week '+n+' ('+short(mon)+' – '+short(sat)+' '+sat.getFullYear()+')';
}

// Which report row a DPR's supervisor rolls up into. dpr_log.supervisor is free text — sometimes the username
// ("durgendra"), sometimes the display name ("Shubham Salvi"), in any case — so match either, then look the
// username up in the admin-set map ({username: managerKey}). null = not assigned to a manager.
export function managerOfSupervisor(supervisorText,teamMembers,teamMap){
  const s=String(supervisorText||'').trim().toLowerCase(); if(!s) return null;
  const m=(teamMembers||[]).find(x=>String(x.username||'').toLowerCase()===s)||(teamMembers||[]).find(x=>String(x.name||'').toLowerCase()===s);
  return (teamMap||{})[m?String(m.username).toLowerCase():s]||null;
}

// A DPR lists one line per product, and framing items (e.g. an MS pipe) repeat the same area as the main product — adding
// the lines double-counts it (Icon 989 + 989, Bhattcorp 718 + 718). So a DPR counts as its LARGEST single product line.
const installedOn=d=>(d.products||[]).reduce((a,r)=>Math.max(a,Number(r.todayInstalled)||0),0);

// One manager's DPR-based row for a Mon–Sat week.
//   days[i]  = sq ft installed that day by the manager's whole team (null when the team filed no DPR that day)
//   target   = Weekly Committed Qty: the sum of every "today projection qty" the team filed from Monday up to the latest
//              day, so it grows through the week (same figure as the DPR cards' Weekly Committed Qty; null before any DPR)
//   nextWeek = sum of the team's "next week projection" (see below) — shown beside the target, not used in the %
//   pct      = sum(days) ÷ target × 100 (null when the target is 0 or nothing has been filed yet)
export function dprRow(managerKey,monday,dprLog,teamMembers,teamMap){
  const days=weekDays(monday);
  const mine=(dprLog||[]).filter(d=>managerOfSupervisor(d.supervisor,teamMembers,teamMap)===managerKey);
  const inWeek=day=>mine.filter(d=>toYmd(d.date)===day);
  const cells=days.map(day=>{ const rows=inWeek(day); return rows.length?rows.reduce((a,d)=>a+installedOn(d),0):null; });
  const sum=cells.reduce((a,v)=>a+(v||0),0);
  const any=cells.some(v=>v!==null);
  const target=any?days.reduce((a,day)=>a+inWeek(day).reduce((b,d)=>b+(Number(d.todayProjectionQty)||0),0),0):null;
  // Next week projection: the team's figure for each project filed during this Mon–Sat week. A project can be filed on
  // more than one day, so only its LATEST filing counts (never added twice); blank / 0 means not filed. null = none filed.
  const latest={};
  mine.forEach(d=>{
    const y=toYmd(d.date); const v=Number(d.nextWeekProjectionQty);
    if(!days.includes(y)||!(v>0)) return;
    const cur=latest[d.projId];
    if(!cur||y>cur.y||(y===cur.y&&(d.id||0)>(cur.id||0))) latest[d.projId]={y,id:d.id,v};
  });
  const filed=Object.values(latest);
  const nextWeek=filed.length?filed.reduce((a,x)=>a+x.v,0):null;
  return {days:cells,target,nextWeek,sum,pct:(target&&any)?sum/target*100:null};
}

// Supervisors who filed a DPR that week but are not assigned to any manager (so their numbers are in no row).
export function unassignedSupervisors(monday,dprLog,teamMembers,teamMap){
  const days=new Set(weekDays(monday)); const out=new Map(); // keyed lower-case: "Ravi" and "ravi" are one person
  (dprLog||[]).forEach(d=>{ if(days.has(toYmd(d.date))&&!managerOfSupervisor(d.supervisor,teamMembers,teamMap)&&d.supervisor){ const n=String(d.supervisor).trim(); if(!out.has(n.toLowerCase())) out.set(n.toLowerCase(),n); } });
  return [...out.values()];
}

// Neelam's SOD/EOD row. `dayScore(ymd)` returns {get,total} for that day's In Progress group, or null when the day has
// nothing to report (no entries / a legacy day that cannot be split by group). Target is cumulative get / total.
export function sodEodRow(monday,dayScore){
  const cells=weekDays(monday).map(day=>{ const r=dayScore(day); return r&&r.total>0?r:null; });
  const get=cells.reduce((a,c)=>a+(c?c.get:0),0);
  const total=cells.reduce((a,c)=>a+(c?c.total:0),0);
  return {days:cells,get,total,pct:total>0?get/total*100:null};
}
