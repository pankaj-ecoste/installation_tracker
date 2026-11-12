/* ══ MANAGEMENT OVERVIEW — pure rules (plan.md v2-71) ══
   No DOM, no database, no `state` import: every function takes the data it needs.
   Ported from the user's "Ecoste Site Tracker" artifact (Overview tab), but fed from LIVE data instead of an
   uploaded CSV. Dates are plain "YYYY-MM-DD" strings (never toISOString — IST day-shift gotcha, see plan.md).
   Rules (agreed 2026-11-12):
   - active  = status is not Completed / CNC / Only Supply (On Hold stays "active" for counts, but gets no day target,
               and is never "late" / "behind").
   - Installed today / last 7 days = DPR installed qty dated today / in the last 7 days, frame rows excluded (v2-68),
               same as the project Installed total.
   - Today / Weekly projection = the DPR "today projection qty" summed over the same windows (today / last 7 days),
               so projection and actual always cover the same days.
   - Planned qty falls back to SO qty, then PO qty (labelled via qtySrc). */
import { toYmd as parseYmd, addDays } from './installationScoring.js';

// parseYmd accepts "2026-13-45" as-is; reject impossible calendar dates so they can never produce nonsense
// "late by N days" figures (the value is treated as "no date").
function toYmd(v){
  const y=parseYmd(v); if(!y) return null;
  const [Y,M,D]=y.split('-').map(Number); const dt=new Date(Y,M-1,D);
  return (dt.getFullYear()===Y&&dt.getMonth()===M-1&&dt.getDate()===D)?y:null;
}

const words=s=>String(s==null?'':s).toLowerCase().split(/[^a-z]+/).filter(Boolean);

// Project Manager is DERIVED from the site supervisor (user, 2026-11-12) — there is no PM field on a project.
//   Shubham Salvi, Mahesh or Aditya  -> Aditya
//   any other supervisor              -> Shashank   (Karan, Durgendra, Ravi, Faizan Alam, Shashank himself, and any new name)
//   no supervisor ('', '—', null)     -> 'Unassigned'
// Same word-matching idea as summaryCc() in summary.js (case-insensitive, matches first name or full name), so
// "shubham", "Shubham Salvi" and "SHUBHAM" all count.
export function projectManagerOf(supervisor){
  const w=words(supervisor);
  if(!w.length) return 'Unassigned';
  return (w.includes('shubham')||w.includes('mahesh')||w.includes('aditya'))?'Aditya':'Shashank';
}

const num=v=>{ const n=Number(v); return isNaN(n)?0:n; };
const clean=v=>{ const t=String(v==null?'':v).trim(); return (t==='—'||t==='-'||t.toLowerCase()==='nan')?'':t; };
const txt=v=>{ const t=clean(v); return /^(no|nil|na|n\/a|none|-|0)$/i.test(t)?'':t; };
const dayNum=ymd=>{ const [y,m,d]=ymd.split('-').map(Number); return Math.round(Date.UTC(y,m-1,d)/86400000); };
const diffDays=(a,b)=>dayNum(a)-dayNum(b);
const dowOf=ymd=>{ const [y,m,d]=ymd.split('-').map(Number); return new Date(y,m-1,d).getDay(); };
// Frame rows never roll into Installed (v2-68) — same rule as dprRowsInstalled in helpers.js (not imported: that file pulls in `state`).
const isFrame=name=>!!name&&String(name).toLowerCase().includes('frame');
const dprInstalled=rows=>(rows||[]).reduce((a,r)=>a+(isFrame(r.product)?0:num(r.todayInstalled)),0);

export const isActiveStatus=s=>s!=='Completed'&&s!=='CNC'&&s!=='Only Supply';
// Working days from today (inclusive) to the committed date (inclusive), skipping Sundays.
export function workDaysLeft(todayYmd,committedYmd){
  if(!committedYmd||committedYmd<todayYmd) return 0;
  let n=0; for(let d=todayYmd; d<=committedYmd; d=addDays(d,1)) if(dowOf(d)!==0) n++;
  return n;
}

const ORDER_TYPE_LABELS={'pre-mockup':'Pre-Mockup','mockup':'Mockup','post-mockup':'Post-Mockup','pre-main':'Pre-Main Order Survey','main':'Main Order','post-main':'Post-Main Order','sampling':'Sampling Survey'};
export const TYPE_ORDER=['Pre-Mockup','Mockup','Pre-Main Order Survey','Main Order','Post-Main Order','Not set'];
const vkey=v=>String(v).toLowerCase().replace(/[^a-z]/g,'').replace(/(.)\1+/g,'$1'); // "Bombay" / "bombay" / "Bombbay" = one vendor
const titleCase=t=>String(t).toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const lastOf=a=>(a&&a.length)?a[a.length-1]:null;

// A project can have several vendors; the table groups by the FIRST one (qty is not split per vendor in the app).
function primaryVendor(p){
  const list=(p.vendors||[]).map(v=>clean(v&&v.name)).filter(Boolean);
  if(list.length) return list[0];
  return clean(String(p.vendor||'').split(',')[0]);
}

export function buildOverviewRows({projects,dprLog,salesOf,todayYmd}){
  const weekStart=addDays(todayYmd,-6);
  // DPRs per project, with parsed date + installed + projection
  const byProj={};
  (dprLog||[]).forEach(d=>{
    const ymd=toYmd(d.date); if(!ymd) return;
    (byProj[d.projId]||(byProj[d.projId]=[])).push({d,ymd,inst:dprInstalled(d.products),proj:num(d.todayProjectionQty),id:d.id||0});
  });
  const vendorCanon={};
  const vname=raw=>{
    if(!raw) return 'No vendor';
    const k=vkey(raw); if(!k) return raw;
    return vendorCanon[k]||(vendorCanon[k]=raw);
  };
  return (projects||[]).map(p=>{
    const entries=(byProj[p.id]||[]).sort((a,b)=>a.ymd<b.ymd?-1:a.ymd>b.ymd?1:a.id-b.id);
    const latest=lastOf(entries);
    const days={}; // ymd -> {inst, proj}
    let todayInst=0,todayProj=0,hasToday=false,weekInst=0,weekProj=0,dprInstTotal=0;
    entries.forEach(e=>{
      const o=days[e.ymd]||(days[e.ymd]={inst:0,proj:0}); o.inst+=e.inst; o.proj+=e.proj; dprInstTotal+=e.inst;
      if(e.ymd===todayYmd){ hasToday=true; todayInst+=e.inst; todayProj+=e.proj; }
      if(e.ymd>=weekStart&&e.ymd<=todayYmd){ weekInst+=e.inst; weekProj+=e.proj; }
    });
    const status=p.status||'Not Started';
    const live=isActiveStatus(status), running=live&&status!=='On Hold';
    let planned=num(p.plannedQty)>0?num(p.plannedQty):null, qtySrc=planned!=null?'Planned':null;
    if(planned==null&&num(p.soQty)>0){ planned=num(p.soQty); qtySrc='SO'; }
    if(planned==null&&num(p.poQty)>0){ planned=num(p.poQty); qtySrc='PO'; }
    const installed=num(p.installedQty), P=planned||0;
    const balance=Math.max(P-installed,0);
    const ref=toYmd(p.installCommencementDate)||toYmd(p.startDate), committed=toYmd(p.committedDate);
    const daysLeft=committed?diffDays(committed,todayYmd):null;
    const wdLeft=committed?workDaysLeft(todayYmd,committed):null;
    let expected=null;
    if(ref&&committed&&committed>ref){ const f=Math.min(Math.max(diffDays(todayYmd,ref)/diffDays(committed,ref),0),1); expected=P*f; }
    if(status==='Completed') expected=P;
    const gap=expected!=null?installed-expected:null;
    let dayTarget=0,overdue=false;
    if(running&&balance>0){
      if(wdLeft>0) dayTarget=balance/wdLeft;
      else if(committed){ dayTarget=balance; overdue=true; }
      else dayTarget=null;
    }
    const age=latest?diffDays(todayYmd,latest.ymd):null;
    // constraints / snags / stalled milestone — "open" = not resolved (the app also has an 'in-progress' state)
    const unresolved=c=>c&&c.status!=='resolved'&&c.status!=='solved';
    const constraint=lastOf((p.constraints||[]).filter(unresolved));
    const snag=lastOf((p.snags||[]).filter(s=>s&&s.status==='open'));
    const stalled=(p.milestones||[]).filter(m=>m&&!m.actual&&m.planned&&toYmd(m.planned)&&toYmd(m.planned)<todayYmd).sort((a,b)=>toYmd(a.planned)<toYmd(b.planned)?-1:1)[0];
    const milestone=stalled?{label:stalled.label,planned:toYmd(stalled.planned),overdue:diffDays(todayYmd,toYmd(stalled.planned))}:null;
    const d=latest?latest.d:null;
    const sup=clean(p.supervisor)?titleCase(clean(p.supervisor)):'Unassigned';
    const sales=salesOf?(salesOf(p)||''):'';
    const type=clean(p.sourceRequestType)||ORDER_TYPE_LABELS[p.orderType]||'Not set';
    const vendor=vname(primaryVendor(p));
    const product=(p.products||[]).map(x=>clean(x&&x.name)).filter(Boolean).join(', ');
    const row={
      id:p.id,name:p.name||'(unnamed)',tower:clean(p.tower),developer:clean(p.developer),city:clean(p.city),state:clean(p.state),status,type,
      supervisor:sup,pm:projectManagerOf(p.supervisor),sales:sales||'Not set',vendor,product,
      live,running,planned,qtySrc,installed,balance,progress:P>0?Math.min(installed/P,1):(status==='Completed'?1:0),
      committed,daysLeft,expected,gap,dayTarget,overdue,
      dprDate:latest?latest.ymd:null,dprAge:age,hasToday,todayInst,todayProj:hasToday?todayProj:null,weekInst,weekProj,dprInstTotal,days,
      escalation:d?txt(d.escalations):'',hindrance:d?txt(d.internalHindrance):'',remarks:d?txt(d.remarks):'',
      constraint:constraint?{text:clean(constraint.text),date:constraint.date||''}:null,
      snag:snag?{text:clean(snag.description||snag.text),severity:snag.severity||'',location:snag.location||'',date:snag.raisedDate||''}:null,
      milestone
    };
    row.late=running&&balance>0&&daysLeft!=null&&daysLeft<0;
    row.behind=running&&gap!=null&&P>0&&gap<-0.1*P;
    row.dprStale=status==='In Progress'&&(age==null||age>2);
    row.attention=live&&!!(row.escalation||row.hindrance||row.late||row.behind||row.constraint||row.milestone);
    row.score=(row.escalation?6:0)+(row.hindrance?3:0)+(row.late?4:0)+(row.constraint?3:0)+(row.behind?2:0)+(milestone?Math.min(milestone.overdue,60)/30:0);
    row.search=[row.name,row.tower,row.developer,row.city,row.supervisor,row.pm,row.sales,row.vendor,row.product].join(' ').toLowerCase();
    return row;
  });
}

// f = {q,pm,sup,city,type,vendor,product,sales,status:Set}. Empty = no filter on that field.
export function filterRows(rows,f){
  const q=String(f.q||'').trim().toLowerCase();
  return rows.filter(r=>
    (!q||r.search.includes(q))&&(!f.pm||r.pm===f.pm)&&(!f.sup||r.supervisor===f.sup)&&(!f.city||r.city===f.city)&&
    (!f.type||r.type===f.type)&&(!f.vendor||r.vendor===f.vendor)&&(!f.product||r.product.split(', ').includes(f.product))&&
    (!f.sales||r.sales===f.sales)&&(!f.status||!f.status.size||f.status.has(r.status)));
}
export function filterOptions(rows){
  const uniq=fn=>[...new Set(rows.map(fn).filter(Boolean))].sort();
  return {pm:['Aditya','Shashank','Unassigned'].filter(x=>rows.some(r=>r.pm===x)),sup:uniq(r=>r.supervisor),city:uniq(r=>r.city),
    type:TYPE_ORDER.filter(t=>rows.some(r=>r.type===t)).concat(uniq(r=>r.type).filter(t=>!TYPE_ORDER.includes(t))),
    vendor:uniq(r=>r.vendor),product:[...new Set(rows.flatMap(r=>r.product?r.product.split(', '):[]))].sort(),sales:uniq(r=>r.sales),
    status:['In Progress','Not Started','On Hold','Completed','CNC','Only Supply'].filter(s=>rows.some(r=>r.status===s))};
}

// KPI block: Planned / Actual / Difference.
export function overviewKpis(rows){
  const lv=rows.filter(r=>r.live);
  const total=rows.reduce((a,r)=>a+(r.planned||0),0), inst=rows.reduce((a,r)=>a+r.installed,0);
  const wP=lv.reduce((a,r)=>a+r.weekProj,0), tP=lv.reduce((a,r)=>a+(r.todayProj||0),0);
  const week=rows.reduce((a,r)=>a+r.weekInst,0);
  const hasToday=rows.some(r=>r.hasToday);
  const todayA=hasToday?rows.reduce((a,r)=>a+r.todayInst,0):null;
  return {n:rows.length,total,inst,balance:Math.max(total-inst,0),wP,wN:lv.filter(r=>r.weekProj>0).length,tP,tN:lv.filter(r=>r.todayProj>0).length,
    week,todayA,weekGap:wP-week,todayGap:todayA==null?null:tP-todayA};
}

// Group rows for the by-type / by-vendor / by-supervisor / by-PM tables.
export function groupRows(rows,keyFn){
  const by={};
  rows.forEach(r=>{
    const k=keyFn(r); const o=by[k]||(by[k]={name:k,projects:0,active:0,total:0,installed:0,tp:0,wp:0,need:0,issues:0,cities:new Set(),products:new Set()});
    o.projects++; o.total+=r.planned||0; o.installed+=r.installed;
    if(r.city) o.cities.add(r.city);
    if(r.product) r.product.split(', ').forEach(x=>o.products.add(x));
    if(r.live){ o.active++; o.tp+=r.todayProj||0; o.wp+=r.weekProj; o.need+=r.dayTarget||0; if(r.constraint||r.snag||r.milestone||r.escalation||r.hindrance) o.issues++; }
  });
  return Object.values(by);
}
export function totalsOf(groups){
  return groups.reduce((t,o)=>{ for(const k of ['projects','active','total','installed','tp','wp','need','issues']) t[k]+=o[k]; return t; },{projects:0,active:0,total:0,installed:0,tp:0,wp:0,need:0,issues:0});
}

// Day-wise installed log, newest first. Built from DPRs of the rows passed in (so it follows the filters).
export function buildDayLog(rows){
  const by={};
  rows.forEach(r=>Object.keys(r.days).forEach(ymd=>{
    const o=by[ymd]||(by[ymd]={ymd,inst:0,proj:0,projects:[]}); const d=r.days[ymd];
    o.inst+=d.inst; o.proj+=d.proj;
    if(d.inst||d.proj) o.projects.push({id:r.id,name:r.name,tower:r.tower,supervisor:r.supervisor,inst:d.inst,proj:d.proj});
  }));
  const log=Object.values(by).sort((a,b)=>a.ymd<b.ymd?1:-1);
  log.forEach(l=>l.projects.sort((a,b)=>b.inst-a.inst));
  return log;
}
// How far the DPR-recorded installed total is from the projects' own Installed totals (manual edits in Edit Project, the cap at
// planned qty, corrections). Shown as a note on the day log so management is not misled.
export function dprVsProjectInstalled(rows){
  const dpr=rows.reduce((a,r)=>a+r.dprInstTotal,0), proj=rows.reduce((a,r)=>a+r.installed,0);
  return {dpr,proj,diff:proj-dpr};
}
