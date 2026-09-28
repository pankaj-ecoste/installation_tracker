/* ══ CNC ORDER TRACKING DASHBOARD — calculation layer ══ (plan.md v2-51)
   Pure functions only — no DOM, no state mutation. Every rule here comes straight from the
   management build spec; each function's comment quotes the rule it implements so a reviewer can
   check code against spec line-by-line. Reused across the KPI cards, stage pipeline, stuck table,
   delay chart, CNC run days popup and order detail popup — one place, so every screen agrees.

   Colours match the rest of the app (src/styles/app.css badge palette), not the reference design's
   own palette — the build spec says "match the existing app" for colour meaning, not the mockup's hex.
   green=#1a5e2a (early/on time), red=#cc3333 (late/overdue), amber=#a06a00 (due soon), grey=#888 (pending). */
import { state } from './state.js';
import { TODAY } from './config.js';
import { daysDiff } from './helpers.js';
import { CNC_STAGES } from './constants.js';

export const COLOR_GREEN='#1a5e2a', COLOR_RED='#cc3333', COLOR_AMBER='#a06a00', COLOR_GREY='#888';

// Stages 5 and 6 (1-indexed, matching the spec/UI captions) = array indices 4 and 5 (0-indexed) =
// "Production started" and "Production completed". These are the CNC-machine stages.
export const PRODUCTION_STARTED_IDX=4, PRODUCTION_COMPLETED_IDX=5, DISPATCHED_IDX=6;

function todayYMD(){
  return TODAY.getFullYear()+'-'+String(TODAY.getMonth()+1).padStart(2,'0')+'-'+String(TODAY.getDate()).padStart(2,'0');
}
const TODAY_YMD=todayYMD();

export function cncStages(r){ return (r.details&&r.details.cncStages)||[]; }

// "Current stage: first stage, in order, with no Actual date. If all 7 have Actual dates, the
// order is Dispatched." Returns an index 0..6, or 7 when fully dispatched.
export function currentStageIdx(r){
  const stages=cncStages(r);
  const i=stages.findIndex(s=>!s.actual);
  return i<0?stages.length:i;
}
export const isDispatched=r=>currentStageIdx(r)>=CNC_STAGES.length;

// "Gap per stage: Actual − Planned. Negative = 'Xd early' (green), 0 = 'On time', positive =
// 'Xd late' (red). No Actual and today > Planned = 'Overdue Xd' (red). Otherwise 'Pending' (grey)."
export function stageGap(stage){
  if(stage.actual){
    const g=daysDiff(stage.planned,stage.actual);
    if(g<0) return {text:Math.abs(g)+'d early',color:COLOR_GREEN,days:g};
    if(g===0) return {text:'On time',color:'#444',days:0};
    return {text:g+'d late',color:COLOR_RED,days:g};
  }
  if(stage.planned&&TODAY_YMD>stage.planned){
    const g=daysDiff(stage.planned,TODAY_YMD);
    return {text:'Overdue '+g+'d',color:COLOR_RED,days:g};
  }
  return {text:'Pending',color:COLOR_GREY,days:null};
}

// "Overdue / stuck: Today > Planned date of the current stage." Already-dispatched orders have no
// current stage left, so they are never overdue.
export function isOverdue(r){
  if(isDispatched(r)) return false;
  const stages=cncStages(r); const cur=stages[currentStageIdx(r)];
  return !!(cur&&cur.planned&&TODAY_YMD>cur.planned);
}
// "Late by: Today − Planned date of the current stage (only when positive)."
export function lateByDays(r){
  if(!isOverdue(r)) return null;
  const stages=cncStages(r); const cur=stages[currentStageIdx(r)];
  return daysDiff(cur.planned,TODAY_YMD);
}
// "Days stuck: Today − latest Actual date filled so far. If no Actual date yet, use the request
// creation date."
export function daysStuck(r){
  const stages=cncStages(r);
  const actuals=stages.map(s=>s.actual).filter(Boolean).sort();
  const from=actuals.length?actuals[actuals.length-1]:(r.createdAt?r.createdAt.slice(0,10):null);
  if(!from) return 0;
  return Math.max(0,daysDiff(from,TODAY_YMD));
}
// "Due soon: Current stage Planned date is within the next 2 days (amber)." Not overdue (that takes
// priority) — due soon covers today through +2 days inclusive.
export function isDueSoon(r){
  if(isDispatched(r)||isOverdue(r)) return false;
  const stages=cncStages(r); const cur=stages[currentStageIdx(r)];
  if(!cur||!cur.planned) return false;
  const g=daysDiff(TODAY_YMD,cur.planned);
  return g>=0&&g<=2;
}
// "Missing stage date: A later stage has an Actual date while an earlier stage is blank. List these
// separately; they are data errors to fix." Returns the labels of every blank stage that has a
// later stage already actioned.
export function missingStageLabels(r){
  const stages=cncStages(r); const out=[];
  stages.forEach((s,i)=>{
    if(s.actual) return;
    if(stages.slice(i+1).some(later=>later.actual)) out.push(s.label);
  });
  return out;
}

/* ── CNC run days (stages 5 & 6 only) ── "Both start and finish days count, so a job started and
   finished on the same day = 1 run day." */
export function plannedRunDays(r){
  const stages=cncStages(r); const start=stages[PRODUCTION_STARTED_IDX], end=stages[PRODUCTION_COMPLETED_IDX];
  if(!start||!end||!start.planned||!end.planned) return null;
  return daysDiff(start.planned,end.planned)+1;
}
export function actualRunDays(r){
  const stages=cncStages(r); const start=stages[PRODUCTION_STARTED_IDX], end=stages[PRODUCTION_COMPLETED_IDX];
  if(!start||!end||!start.actual||!end.actual) return null;
  return daysDiff(start.actual,end.actual)+1;
}
export function isRunningOnCnc(r){
  const stages=cncStages(r); const start=stages[PRODUCTION_STARTED_IDX], end=stages[PRODUCTION_COMPLETED_IDX];
  return !!(start&&start.actual&&end&&!end.actual);
}
export function isWaitingForCnc(r){
  const stages=cncStages(r); const shared=stages[PRODUCTION_STARTED_IDX-1], start=stages[PRODUCTION_STARTED_IDX];
  return !!(shared&&shared.actual&&start&&!start.actual);
}
// "Running so far: Today − Actual 'Production started' + 1 (started, not completed)."
export function runningSoFar(r){
  if(!isRunningOnCnc(r)) return null;
  const start=cncStages(r)[PRODUCTION_STARTED_IDX];
  return daysDiff(start.actual,TODAY_YMD)+1;
}
// "Expected finish: Actual 'Production started' + Planned run days − 1."
export function expectedFinishDate(r){
  if(!isRunningOnCnc(r)) return null;
  const planned=plannedRunDays(r); if(planned==null) return null;
  const start=cncStages(r)[PRODUCTION_STARTED_IDX];
  const d=new Date(start.actual+'T00:00:00'); d.setDate(d.getDate()+planned-1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
// "Run variance: Actual run days − Planned run days. Positive = over plan (red), negative = under
// plan (green)."
export function runVariance(r){
  const a=actualRunDays(r), p=plannedRunDays(r);
  if(a==null||p==null) return null;
  return a-p;
}
// "Overrunning: Running so far > Planned run days."
export function isOverrunning(r){
  const running=runningSoFar(r), planned=plannedRunDays(r);
  return running!=null&&planned!=null&&running>planned;
}
// "Machine days in queue: Sum of Planned run days for orders at stage 4 (shared with production,
// not started)" — i.e. orders currently isWaitingForCnc.
export function machineDaysInQueue(requests){
  return requests.filter(isWaitingForCnc).reduce((a,r)=>a+(plannedRunDays(r)||0),0);
}
export function daysWaiting(r){
  if(!isWaitingForCnc(r)) return null;
  const shared=cncStages(r)[PRODUCTION_STARTED_IDX-1];
  return Math.max(0,daysDiff(shared.actual,TODAY_YMD));
}
// Planned start of the CNC run for a waiting order = the Production started stage's own Planned
// date (fixed at request creation, never recalculated — same convention as every other CNC stage).
export function plannedStart(r){ return cncStages(r)[PRODUCTION_STARTED_IDX]?.planned||''; }

// "Delay per stage (bottleneck chart): For each stage: average of (Actual − Planned, counted as 0
// if early) over orders that completed it, plus Late by for orders currently stuck at it."
export function delayPerStage(requests){
  return CNC_STAGES.map((def,i)=>{
    const values=[];
    requests.forEach(r=>{
      const stage=cncStages(r)[i]; if(!stage) return;
      if(stage.actual&&stage.planned) values.push(Math.max(0,daysDiff(stage.planned,stage.actual)));
      else if(currentStageIdx(r)===i&&isOverdue(r)) values.push(lateByDays(r));
    });
    const avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
    return {index:i,key:def.key,label:def.label,avgDaysLate:Math.round(avg*10)/10,sampleSize:values.length};
  });
}

/* ── Filters ── "Sales Team, Date range, Client, Developer, Type of CNC Request, Scope. Every
   number, chart and list on the page follows the filters." Date range filters by request creation
   date — the one timestamp every CNC request has regardless of how far it has progressed. */
export function applyCncFilters(requests,f){
  f=f||{};
  return requests.filter(r=>{
    const d=r.details||{};
    if(f.salesTeam&&d.salesName!==f.salesTeam) return false;
    if(f.client&&d.clientName!==f.client) return false;
    if(f.developer&&d.developerName!==f.developer) return false;
    if(f.cncType&&d.cncRequestType!==f.cncType) return false;
    if(f.scope&&(d.scope||'Installation')!==f.scope) return false;
    if(f.dateFrom||f.dateTo){
      const created=(r.createdAt||'').slice(0,10);
      if(f.dateFrom&&created<f.dateFrom) return false;
      if(f.dateTo&&created>f.dateTo) return false;
    }
    return true;
  });
}
export function allCncRequests(){ return state.requests.filter(r=>r.requestType==='cnc'); }

// The 6 KPI cards, computed together so every number and its popup list are built from exactly the
// same predicate (no drift between the number shown and the rows a click reveals).
export function computeKpis(requests){
  const active=requests.filter(r=>!isDispatched(r));
  const stuck=requests.filter(isOverdue);
  const running=requests.filter(isRunningOnCnc);
  const waiting=requests.filter(isWaitingForCnc);
  const dispatched=requests.filter(isDispatched);
  const withActualRun=requests.filter(r=>actualRunDays(r)!=null);
  const avgActualRun=withActualRun.length?withActualRun.reduce((a,r)=>a+actualRunDays(r),0)/withActualRun.length:null;
  const withPlannedRun=requests.filter(r=>plannedRunDays(r)!=null);
  const avgPlannedRun=withPlannedRun.length?withPlannedRun.reduce((a,r)=>a+plannedRunDays(r),0)/withPlannedRun.length:null;
  return {active,stuck,running,waiting,dispatched,avgActualRun,avgPlannedRun,
    avgActualRunRounded:avgActualRun==null?null:Math.round(avgActualRun*10)/10,
    avgPlannedRunRounded:avgPlannedRun==null?null:Math.round(avgPlannedRun*10)/10};
}
