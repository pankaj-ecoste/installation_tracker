/* ══ SUMMARY MODULE — pure rules (plan.md v2-70) ══
   No DOM and no database: every function takes the data it needs, so the Summary tab and the All Projects
   card tag share the exact same "who is this project's sales person" rule.
   Dates are plain local "YYYY-MM-DD" strings (never toISOString() — it shifts a day in IST). dpr_log.date is free
   text like "21 Aug 2026", so it goes through toYmd() from the scoring rules. */
import { toYmd } from './installationScoring.js';
import { isFrameProduct } from './helpers.js';
import { normalizeWhatsAppNumber } from './whatsapp.js';

const lc=s=>String(s==null?'':s).trim().toLowerCase();

// A project's sales person is its Sales Owner (projects.created_by, the "Sales owner" drop-down in Update Progress),
// valid only when that is an active Sales / Viewer member of the Team tab. Name, email and WhatsApp come from the
// Team record (no project columns). Returns null when there is no valid sales person.
export function salesPersonOf(p,members){
  const key=lc(p&&p.createdBy); if(!key) return null;
  const m=(members||[]).find(x=>x.active&&x.role==='viewer'&&(lc(x.username)===key||lc(x.name)===key));
  if(!m) return null;
  return {name:m.name,email:String(m.email||'').trim(),number:normalizeWhatsAppNumber(m.wa)};
}

/* ── status vs projection (bands from the user's screenshot legend) ── */
export const SUMMARY_STATUS={
  ontrack:{label:'On track',emoji:'🟢',note:'≥90% of projection'},
  slight:{label:'Slightly behind projection',emoji:'🟡',note:'50–89% of projection'},
  behind:{label:'Behind projection',emoji:'🔴',note:'<50% of projection'},
  notfiled:{label:'DPR not filed',emoji:'🟠',note:'no DPR for this date'},
  noproj:{label:'No projection set',emoji:'⚪',note:'DPR filed without a projection'}
};
export function statusKeyFor(filed,installedToday,projected){
  if(!filed) return 'notfiled';
  if(!(projected>0)) return 'noproj'; // legacy DPR saved before the projection became mandatory
  const r=installedToday/projected;
  return r>=0.9?'ontrack':r>=0.5?'slight':'behind';
}

const pctOf=(a,b)=>b>0?Math.round(a/b*100):0;
const fmtN=n=>Number(n||0).toLocaleString('en-IN');
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// "30 Oct 2026" from a YYYY-MM-DD / ISO value, built from the leading date parts (no Date parsing, so no IST shift).
export function longDate(v){
  const ymd=toYmd(v); if(!ymd) return '—';
  const [y,m,d]=ymd.split('-').map(Number);
  return String(d).padStart(2,'0')+' '+MON[m-1]+' '+y;
}

/* ── RA bill (Finance ledger: ra_bill_status / ra_bill_due_date). A project can have several ledger rows:
   status = the least-advanced status among rows not yet Paid (Paid only if every row is Paid),
   deadline = the earliest due date among rows not yet Paid. Both '—' when there is nothing to show. ── */
const RA_ORDER=['Not raised','Raised','Partially paid','Paid'];
export function raBillSummary(projId,ledger){
  const rows=(ledger||[]).filter(r=>r.projId===projId);
  const open=rows.filter(r=>r.raBillStatus!=='Paid');
  const statuses=(open.length?open:rows).map(r=>r.raBillStatus).filter(Boolean);
  statuses.sort((a,b)=>RA_ORDER.indexOf(a)-RA_ORDER.indexOf(b));
  const dues=open.map(r=>toYmd(r.raBillDueDate)).filter(Boolean).sort();
  return {status:statuses[0]||'—',deadline:dues.length?longDate(dues[0]):'—'};
}

/* ── one Summary row for a project on a date ── */
export function buildSummaryRow(p,ymd,{dprLog,members,ledger}){
  const dprs=(dprLog||[]).filter(d=>d.projId===p.id&&toYmd(d.date)===ymd);
  const filed=dprs.length>0;
  const installedToday=dprs.reduce((s,d)=>s+(d.products||[]).reduce((a,r)=>a+(isFrameProduct(r.product)?0:(Number(r.todayInstalled)||0)),0),0);
  const projected=dprs.reduce((s,d)=>s+(Number(d.todayProjectionQty)||0),0);
  const last=dprs[0]; // dprLog is newest-first
  const statusKey=statusKeyFor(filed,installedToday,projected);
  const sp=salesPersonOf(p,members);
  const issues=(p.constraints||[]).filter(c=>c.status==='open'||c.status==='in-progress').map(c=>c.text).filter(Boolean);
  const ra=raBillSummary(p.id,ledger);
  return {
    key:p.id+'|'+ymd, projId:p.id, name:p.name, tower:p.tower, projStatus:p.status||'', ymd, filed, statusKey, status:SUMMARY_STATUS[statusKey],
    unit:p.unit||'sqft', installedToday, projected, todayPct:pctOf(installedToday,projected),
    installed:p.installedQty||0, planned:p.plannedQty||0, overallPct:pctOf(p.installedQty,p.plannedQty),
    startDate:longDate(p.startDate), expectedCompletion:longDate(p.committedDate),
    raStatus:ra.status, raDeadline:ra.deadline,
    manpowerActual:last?last.actualMp:null, manpowerCommitted:last?last.committedMp:null,
    supervisor:(last&&last.supervisor)||p.supervisor||'—', issues, sales:sp
  };
}

// Every project that filed a DPR on the date, plus In Progress projects that filed nothing ("DPR not filed").
export function buildSummaryRows(ymd,{projects,dprLog,members,ledger}){
  const filedIds=new Set((dprLog||[]).filter(d=>toYmd(d.date)===ymd).map(d=>d.projId));
  return (projects||[])
    .filter(p=>filedIds.has(p.id)||p.status==='In Progress')
    .map(p=>buildSummaryRow(p,ymd,{dprLog,members,ledger}))
    .sort((a,b)=>(a.filed===b.filed?0:a.filed?-1:1)||(a.name+a.tower).localeCompare(b.name+b.tower));
}

export const installedTodayText=r=>!r.filed?'No DPR filed'
  :r.projected>0?fmtN(r.installedToday)+' '+r.unit+' of '+fmtN(r.projected)+' projected ('+r.todayPct+'%)'
  :fmtN(r.installedToday)+' '+r.unit+' (no projection set)';

/* ── message text (Gmail's compose link and wa.me carry plain text only, so the "table" is labelled lines) ── */
const rowLines=(r,note)=>{
  const mp=r.manpowerActual==null?'—':(r.manpowerActual+' / '+(r.manpowerCommitted==null?'—':r.manpowerCommitted));
  return [
    ['Status',r.status.emoji+' '+r.status.label],
    ['Installed today',installedTodayText(r)],
    ['Overall progress',fmtN(r.installed)+' / '+fmtN(r.planned)+' '+r.unit+' ('+r.overallPct+'%)'],
    ['Start date',r.startDate],
    ['Expected completion',r.expectedCompletion],
    ['RA bill submission status',r.raStatus],
    ['RA bill submission deadline',r.raDeadline],
    ['Manpower (actual / committed)',mp],
    ['Site supervisor',r.supervisor],
    ['Open issues / blockers',r.issues.length?r.issues.map(t=>'• '+t).join('\n'):'None']
  ].concat(note?[['Note',note]]:[]);
};
export const summarySubject=r=>r.status.emoji+' DPR summary — '+r.name+' — '+r.tower+' — '+longDate(r.ymd);
export function summaryEmailBody(r,note){
  return ['Daily progress summary — '+longDate(r.ymd),'',
    'Dear '+(r.sales&&r.sales.name?r.sales.name:'Sales Team')+',','',
    'Here is today\'s progress for '+r.name+' — '+r.tower+'.','',
    ...rowLines(r,note).map(([k,v])=>k+': '+v),'',
    'Regards,','Ecoste Operations'].join('\n');
}
export function summaryWhatsAppText(r,note){
  return ['*Daily progress summary — '+longDate(r.ymd)+'*','*'+r.name+' — '+r.tower+'*','',
    ...rowLines(r,note).map(([k,v])=>'*'+k+':* '+v),'','Regards,','Ecoste Operations'].join('\n');
}
