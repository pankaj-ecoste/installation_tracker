/* ══ CNC ORDER TRACKING DASHBOARD (admin only, inside Reports) ══ (plan.md v2-51)
   Reads existing CNC requests only — no new fields, no new table. All the business rules live in
   ../../lib/cncDashboard.js (pure functions, verified separately); this file is presentation only:
   filter bar -> KPI cards -> stage pipeline (+ CNC machine group + CNC run days button) -> stuck
   table -> delay chart -> missing-dates list, plus three stacking popup types (list / CNC run days
   / order detail). Popups are a NEW small overlay pattern (backdrop + Esc-to-close + stacking) — the
   rest of the app uses full-page panels with no backdrop, but the spec explicitly calls for popups
   layered on top of the dashboard and of each other (an order detail opens "on top of" a list
   popup), which the existing panel system can't do. Kept local to this file. */
import { state } from '../../lib/state.js';
import { fmtDate } from '../../lib/helpers.js';
import { CNC_STAGES } from '../../lib/constants.js';
import { namedDocLink } from '../../lib/uploads.js';
import { emailSalesPreviewUpdated } from '../requests/requestsTab.js';
import {
  COLOR_GREEN, COLOR_RED, COLOR_AMBER, COLOR_GREY,
  PRODUCTION_STARTED_IDX, PRODUCTION_COMPLETED_IDX,
  allCncRequests, applyCncFilters, computeKpis, currentStageIdx, isDispatched, isOverdue, isDueSoon,
  isRunningOnCnc, isWaitingForCnc, lateByDays, daysStuck, daysWaiting, missingStageLabels,
  plannedRunDays, actualRunDays, runningSoFar, expectedFinishDate, runVariance, isOverrunning,
  plannedStart, machineDaysInQueue, delayPerStage, stageGap
} from '../../lib/cncDashboard.js';

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ── date-range presets (the reference design's filter defaults to "This month") ── */
function presetRange(preset){
  const today=new Date(); const y=today.getFullYear(),m=today.getMonth(),d=today.getDate();
  const ymd=dt=>dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
  if(preset==='this-month') return {dateFrom:ymd(new Date(y,m,1)),dateTo:ymd(today)};
  if(preset==='last-7') return {dateFrom:ymd(new Date(y,m,d-6)),dateTo:ymd(today)};
  if(preset==='last-30') return {dateFrom:ymd(new Date(y,m,d-29)),dateTo:ymd(today)};
  return {dateFrom:'',dateTo:''}; // 'all-time'
}
function effectiveFilters(){
  const f=state.cncFilters;
  return {...f,...presetRange(f.datePreset)};
}
function currentStageLabel(r){ return isDispatched(r)?'Dispatched':CNC_STAGES[currentStageIdx(r)].label; }
function statusOf(r){
  if(isOverdue(r)) return {text:'Overdue '+lateByDays(r)+'d',color:COLOR_RED};
  if(isDispatched(r)) return {text:'Dispatched',color:COLOR_GREEN};
  if(isDueSoon(r)) return {text:'Due soon',color:COLOR_AMBER};
  return {text:'On track',color:COLOR_GREY};
}

/* ══ ENTRY POINT — called by reportsTab.js's REPORTS registry ══ */
export function renderCncDashboard(el){
  const requests=applyCncFilters(allCncRequests(),effectiveFilters());
  const kpis=computeKpis(requests);
  el.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">'+
      '<div><div style="font-size:15px;font-weight:700">CNC order tracking</div>'+
      '<div style="font-size:12px;color:#888">Where every CNC order sits right now, as of '+fmtDate(new Date())+'. Click any number, stage or row to see the orders behind it.</div></div>'+
      '<button class="btn btn-outline btn-sm" onclick="closeReport()">← All reports</button>'+
    '</div>'+
    filterBarHTML()+
    kpiCardsHTML(kpis)+
    stagePipelineHTML(requests)+
    '<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-top:16px;align-items:start" id="cnc-lower-grid">'+
      stuckTableHTML(requests)+
      '<div style="display:flex;flex-direction:column;gap:16px">'+delayChartHTML(requests)+missingDatesHTML(requests)+'</div>'+
    '</div>'+
    '<div id="cnc-popup-root"></div>';
  // Mobile layout (KPI row, pipeline scroll, lower grid stack) is real CSS in app.css's existing
  // @media block, not a one-time JS check — stays correct through a resize, not just first paint.
  renderCncPopups();
}

/* ══ A. FILTER BAR ══ */
function optionsFor(key){
  const vals=[...new Set(allCncRequests().map(r=>key==='salesTeam'?r.details.salesName:key==='client'?r.details.clientName:key==='developer'?r.details.developerName:r.details.cncRequestType).filter(Boolean))];
  return vals.sort();
}
function filterBarHTML(){
  const f=state.cncFilters;
  const sel=(key,label,opts,extra)=>'<div class="form-group"><label class="form-label" style="font-size:11px">'+label+'</label>'+
    '<select class="form-input" onchange="cncFilterChanged(\''+key+'\',this.value)">'+extra+opts.map(o=>'<option value="'+esc(o)+'"'+(f[key]===o?' selected':'')+'>'+esc(o)+'</option>').join('')+'</select></div>';
  return '<div class="filters" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:10px 0">'+
    sel('salesTeam','Sales team',optionsFor('salesTeam'),'<option value="">All sales teams</option>')+
    '<div class="form-group"><label class="form-label" style="font-size:11px">Date range</label>'+
      '<select class="form-input" onchange="cncFilterChanged(\'datePreset\',this.value)">'+
        ['this-month','last-7','last-30','all-time'].map(v=>'<option value="'+v+'"'+(f.datePreset===v?' selected':'')+'>'+({'this-month':'This month','last-7':'Last 7 days','last-30':'Last 30 days','all-time':'All time'}[v])+'</option>').join('')+
      '</select></div>'+
    sel('client','Client',optionsFor('client'),'<option value="">All clients</option>')+
    sel('developer','Developer',optionsFor('developer'),'<option value="">All developers</option>')+
    sel('cncType','Type of CNC request',['Fresh','Revise'],'<option value="">All types</option>')+
    sel('scope','Scope',['Installation','Only Supply'],'<option value="">All scopes</option>')+
  '</div>';
}
// Re-renders this report directly (not via reportsTab.js's renderReports, to avoid a circular
// import — reportsTab.js already imports this file for the REPORTS registry).
function rerenderCncDashboard(){ const el=document.getElementById('reports-content'); if(el) renderCncDashboard(el); }
export function cncFilterChanged(key,val){ state.cncFilters={...state.cncFilters,[key]:val}; rerenderCncDashboard(); }

/* ══ B. KPI CARDS ══ */
function kpiCard(color,title,valueHTML,onclick){
  return '<div class="proj-card" style="cursor:pointer;border-top:3px solid '+color+';margin-bottom:0" onclick="'+onclick+'">'+
    '<div style="font-size:12px;color:#666">'+title+'</div>'+
    '<div style="font-size:26px;font-weight:700;margin-top:4px">'+valueHTML+'</div>'+
  '</div>';
}
function kpiCardsHTML(kpis){
  const ids=arr=>JSON.stringify(arr.map(r=>r.id));
  const runAvgHTML=kpis.avgActualRunRounded==null?'<span style="color:#888;font-size:16px">No completed runs yet</span>'
    :kpis.avgActualRunRounded+'<div style="font-size:11px;color:#888;font-weight:400;margin-top:2px">Planned avg '+(kpis.avgPlannedRunRounded==null?'—':kpis.avgPlannedRunRounded)+'</div>';
  return '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:16px" class="cnc-kpi-row">'+
    kpiCard('#444','Active orders',kpis.active.length,'openCncListPopup(\'Active orders\',\'Orders not dispatched\','+ids(kpis.active)+')')+
    kpiCard(COLOR_RED,'Stuck / overdue',kpis.stuck.length,'openCncListPopup(\'Stuck / overdue\',\'Current stage past its planned date\','+ids(kpis.stuck)+')')+
    kpiCard('#0a5c50','Running on CNC',kpis.running.length,'openCncListPopup(\'Running on CNC\',\'Production started, not completed\','+ids(kpis.running)+')')+
    kpiCard('#7a4f00','Waiting for CNC',kpis.waiting.length,'openCncListPopup(\'Waiting for CNC\',\'Shared with production, not started\','+ids(kpis.waiting)+')')+
    kpiCard(COLOR_GREEN,'Dispatched',kpis.dispatched.length,'openCncListPopup(\'Dispatched\',\'All 7 stages done, in the selected period\','+ids(kpis.dispatched)+')')+
    kpiCard('#a05a00','Avg CNC run days',runAvgHTML,'openCncRunDaysPopup(\'completed\')')+
  '</div>';
}

/* ══ C/D. STAGE PIPELINE + CNC MACHINE GROUP + CNC RUN DAYS BUTTON ══ */
function stageBtn(idx,requests,extraStyle,caption){
  const def=CNC_STAGES[idx];
  const here=requests.filter(r=>currentStageIdx(r)===idx);
  const overdueHere=here.filter(isOverdue);
  const avgStuck=here.length?Math.round(here.reduce((a,r)=>a+daysStuck(r),0)/here.length*10)/10:0;
  return '<div class="proj-card" style="cursor:pointer;text-align:left;margin-bottom:0;'+(extraStyle||'')+'" onclick="openCncListPopup(\''+esc(def.label)+'\',\''+here.length+' order(s) waiting on this stage\','+JSON.stringify(here.map(r=>r.id))+')">'+
    '<div style="font-size:11px;color:'+(extraStyle?'rgba(255,255,255,.7)':'#888')+'">Stage '+(idx+1)+'</div>'+
    '<div style="font-size:13px;font-weight:700;margin:2px 0;'+(extraStyle?'color:#fff':'')+'">'+def.label+'</div>'+
    (caption?'<div style="font-size:11px;color:'+(extraStyle?'#ffb066':'#a05a00')+';margin-bottom:4px">'+caption+'</div>':'')+
    '<div style="font-size:22px;font-weight:700;'+(extraStyle?'color:#fff':'')+'">'+here.length+'</div>'+
    '<div style="font-size:11px;color:'+(overdueHere.length?'#ff8a80':COLOR_RED)+'">'+overdueHere.length+' overdue</div>'+
    '<div style="font-size:11px;color:'+(extraStyle?'rgba(255,255,255,.6)':'#888')+'">Avg '+avgStuck+'d stuck</div>'+
  '</div>';
}
function cncRunDaysButton(requests){
  const running=requests.filter(isRunningOnCnc), overrunning=running.filter(isOverrunning);
  const queueDays=machineDaysInQueue(requests);
  return '<div class="proj-card" style="cursor:pointer;margin-top:8px;margin-bottom:0;background:#1a1a1a;border:1px solid #333" onclick="openCncRunDaysPopup(\'running\')">'+
    '<div style="font-size:12px;color:#ffb066;font-weight:700">CNC run days</div>'+
    '<div style="display:flex;gap:14px;margin-top:6px;flex-wrap:wrap">'+
      [['Running now',running.length],['Overrunning',overrunning.length],['Machine days queued',queueDays]].map(([l,v])=>
        '<div><div style="font-size:20px;font-weight:700;color:#fff">'+v+'</div><div style="font-size:10px;color:#bbb">'+l+'</div></div>').join('')+
    '</div></div>';
}
function stagePipelineHTML(requests){
  const others=[0,1,2,3].map(i=>stageBtn(i,requests));
  return '<div style="font-size:11px;color:#888;margin:14px 0 6px">Each stage shows orders waiting, how many are overdue, and average days stuck. Click a stage to see its orders.</div>'+
    '<div style="display:grid;grid-template-columns:repeat(4,1fr) 2fr 1fr;gap:8px;align-items:stretch" class="cnc-pipeline">'+
      others.join('')+
      '<div style="background:#0f1f1c;border-radius:10px;padding:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
        '<div style="grid-column:1/-1;font-size:11px;font-weight:700;color:#ffb066;text-align:center">CNC MACHINE</div>'+
        stageBtn(PRODUCTION_STARTED_IDX,requests,'background:transparent;border:1px solid #2a4a42','waiting for CNC to start')+
        stageBtn(PRODUCTION_COMPLETED_IDX,requests,'background:transparent;border:1px solid #2a4a42','running on CNC now')+
        '<div style="grid-column:1/-1">'+cncRunDaysButton(requests)+'</div>'+
      '</div>'+
      stageBtn(6,requests)+
    '</div>';
}

/* ══ E. STUCK ORDERS TABLE ══ */
function stuckTableHTML(requests){
  const stuck=requests.filter(isOverdue).sort((a,b)=>daysStuck(b)-daysStuck(a));
  return '<div class="proj-card" style="margin-bottom:0">'+
    '<div style="font-size:14px;font-weight:700;margin-bottom:8px">Stuck orders</div>'+
    (stuck.length?'<div style="overflow-x:auto"><table class="team-table"><thead><tr><th>Client</th><th>Stuck at</th><th>Planned</th><th>Days stuck</th><th>Late by</th><th>Sales team</th><th>Sq ft</th></tr></thead><tbody>'+
      stuck.map(r=>'<tr style="cursor:pointer" onclick="openCncOrderDetail('+r.id+')"><td><b>'+esc(r.details.clientName)+'</b></td><td>'+esc(currentStageLabel(r))+'</td>'+
        '<td>'+fmtDate((r.details.cncStages[currentStageIdx(r)]||{}).planned)+'</td><td>'+daysStuck(r)+'d</td>'+
        '<td style="color:'+COLOR_RED+'">'+lateByDays(r)+'d late</td><td>'+esc(r.details.salesName)+'</td><td>'+esc(r.details.grillSizeSqFt||'—')+'</td></tr>').join('')+
    '</tbody></table></div>':'<div class="empty">No stuck orders — nothing is past its planned date.</div>')+
  '</div>';
}

/* ══ F. WHERE DELAYS HAPPEN ══ */
function delayChartHTML(requests){
  const delays=delayPerStage(requests);
  const max=Math.max(1,...delays.map(d=>d.avgDaysLate));
  return '<div class="proj-card" style="margin-bottom:0">'+
    '<div style="font-size:14px;font-weight:700;margin-bottom:2px">Where delays happen</div>'+
    '<div style="font-size:11px;color:#888;margin-bottom:8px">Average days late per stage. Click a bar for that stage\'s orders.</div>'+
    delays.map((d,i)=>{
      const isCnc=i===PRODUCTION_STARTED_IDX||i===PRODUCTION_COMPLETED_IDX;
      const here=requests.filter(r=>currentStageIdx(r)===i);
      return '<div style="margin-bottom:8px;cursor:pointer" onclick="openCncListPopup(\''+esc(d.label)+'\',\'Orders currently at this stage\','+JSON.stringify(here.map(r=>r.id))+')">'+
        '<div style="font-size:11px;color:#444;margin-bottom:2px">'+d.label+' <span style="color:#888">('+d.avgDaysLate+'d avg)</span></div>'+
        '<div style="background:#eee;border-radius:4px;height:10px;overflow:hidden"><div style="width:'+Math.round(d.avgDaysLate/max*100)+'%;height:100%;background:'+(isCnc?'#a05a00':'#185FA5')+'"></div></div>'+
      '</div>';
    }).join('')+
  '</div>';
}

/* ══ G. MISSING STAGE DATES ══ */
function missingDatesHTML(requests){
  const rows=[]; requests.forEach(r=>missingStageLabels(r).forEach(label=>rows.push({r,label})));
  return '<div class="proj-card" style="margin-bottom:0">'+
    '<div style="font-size:14px;font-weight:700;margin-bottom:2px">Missing stage dates</div>'+
    '<div style="font-size:11px;color:#888;margin-bottom:8px">A later stage is filled while an earlier one is blank — data errors to fix.</div>'+
    (rows.length?rows.map(x=>'<div style="padding:6px 0;border-top:1px solid #f0f0f0;cursor:pointer;font-size:12px" onclick="openCncOrderDetail('+x.r.id+')"><b>'+esc(x.r.details.clientName)+'</b> — blank: '+esc(x.label)+'</div>').join('')
      :'<div class="empty">No missing stage dates.</div>')+
  '</div>';
}

/* ══ POPUPS (list / CNC run days / order detail) — stack in state.cncPopupStack ══
   Each popup is its own full-screen backdrop layered by z-index (deeper popups stay mounted
   underneath, matching "clicking a row opens the order detail popup on top of the list"). Esc and
   a backdrop click close only the TOPMOST popup. */
export function openCncListPopup(title,subtitle,ids){
  state.cncListSearch=''; state.cncListSort={col:'',dir:'asc'};
  state.cncPopupStack=[...state.cncPopupStack,{type:'list',title,subtitle,ids}];
  renderCncPopups();
}
export function openCncRunDaysPopup(tab){
  state.cncRunDaysTab=tab||'running';
  state.cncPopupStack=[...state.cncPopupStack,{type:'run-days'}];
  renderCncPopups();
}
export function openCncOrderDetail(id){
  state.cncPopupStack=[...state.cncPopupStack,{type:'detail',id}];
  renderCncPopups();
}
export function closeCncTopPopup(){ state.cncPopupStack=state.cncPopupStack.slice(0,-1); renderCncPopups(); }
export function cncRunDaysTabChanged(tab){ state.cncRunDaysTab=tab; renderCncPopups(); }
export function cncListSearchChanged(v){ state.cncListSearch=v; renderCncPopups(); }
export function cncListSortChanged(col){
  const cur=state.cncListSort;
  state.cncListSort={col,dir:cur.col===col&&cur.dir==='asc'?'desc':'asc'};
  renderCncPopups();
}
function cncKeydownHandler(e){ if(e.key==='Escape'&&state.cncPopupStack.length) closeCncTopPopup(); }
// Registered once at module load (this module is only ever imported once — ES module singleton) —
// safe to listen globally since it's a no-op whenever no CNC popup is open.
document.addEventListener('keydown',cncKeydownHandler);

function overlayWrap(zBase,innerHTML,onBackdropClick){
  return '<div style="position:fixed;inset:0;z-index:'+zBase+';background:rgba(20,20,20,.45);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 16px" onclick="if(event.target===this)'+onBackdropClick+'">'+
    '<div style="background:#fff;border-radius:10px;max-width:1100px;width:100%;padding:20px;margin:auto" onclick="event.stopPropagation()">'+innerHTML+'</div>'+
  '</div>';
}
export function renderCncPopups(){
  const root=document.getElementById('cnc-popup-root'); if(!root) return;
  root.innerHTML=state.cncPopupStack.map((p,i)=>{
    const z=1000+i*10;
    if(p.type==='list') return overlayWrap(z,listPopupHTML(p),'closeCncTopPopup()');
    if(p.type==='run-days') return overlayWrap(z,runDaysPopupHTML(),'closeCncTopPopup()');
    if(p.type==='detail') return overlayWrap(z,orderDetailHTML(p.id),'closeCncTopPopup()');
    return '';
  }).join('');
}

/* ── List popup ── */
const LIST_COLS=[['num','Order no.'],['client','Client'],['stage','Current stage'],['planned','Planned date'],['stuck','Days stuck'],['status','Status'],['sales','Sales team'],['dev','Developer'],['sqft','Sq ft']];
function listPopupHTML(p){
  const all=allCncRequests();
  let rows=p.ids.map(id=>all.find(r=>r.id===id)).filter(Boolean);
  const q=state.cncListSearch.trim().toLowerCase();
  if(q) rows=rows.filter(r=>[r.requestNumber,r.details.clientName,r.details.salesName,r.details.developerName].filter(Boolean).some(v=>v.toLowerCase().includes(q)));
  const sort=state.cncListSort;
  const val=(r,col)=>({num:r.requestNumber,client:r.details.clientName,stage:currentStageLabel(r),planned:(r.details.cncStages[currentStageIdx(r)]||{}).planned||'',stuck:daysStuck(r),status:statusOf(r).text,sales:r.details.salesName,dev:r.details.developerName,sqft:r.details.grillSizeSqFt||0}[col]);
  if(sort.col) rows=[...rows].sort((a,b)=>{ const av=val(a,sort.col),bv=val(b,sort.col); const c=av<bv?-1:av>bv?1:0; return sort.dir==='asc'?c:-c; });
  const overdueCount=rows.filter(isOverdue).length;
  return '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">'+
      '<div><div style="font-size:16px;font-weight:700">'+esc(p.title)+' — '+rows.length+' order(s)'+(overdueCount?', '+overdueCount+' overdue':'')+'</div>'+
      (p.subtitle?'<div style="font-size:12px;color:#888">'+esc(p.subtitle)+'</div>':'')+'</div>'+
      '<div style="display:flex;gap:6px"><button class="btn btn-outline btn-sm" onclick="exportCncListCSV()">↓ Export to Excel</button><button class="btn btn-outline btn-sm" onclick="closeCncTopPopup()">Close</button></div>'+
    '</div>'+
    '<input class="form-input" placeholder="Search order no., client, sales team, developer..." style="margin:10px 0" value="'+esc(state.cncListSearch)+'" oninput="cncListSearchChanged(this.value)">'+
    (rows.length?'<div style="overflow-x:auto;max-height:60vh"><table class="team-table" id="cnc-list-table"><thead><tr>'+
      LIST_COLS.map(([c,l])=>'<th style="cursor:pointer" onclick="cncListSortChanged(\''+c+'\')">'+l+(sort.col===c?(sort.dir==='asc'?' ▲':' ▼'):'')+'</th>').join('')+
    '</tr></thead><tbody>'+
      rows.map(r=>{const st=statusOf(r); return '<tr style="cursor:pointer" onclick="openCncOrderDetail('+r.id+')"><td>'+r.requestNumber+'</td><td><b>'+esc(r.details.clientName)+'</b></td><td>'+esc(currentStageLabel(r))+'</td>'+
        '<td>'+fmtDate((r.details.cncStages[currentStageIdx(r)]||{}).planned)+'</td><td>'+daysStuck(r)+'d</td><td style="color:'+st.color+';font-weight:600">'+st.text+'</td>'+
        '<td>'+esc(r.details.salesName)+'</td><td>'+esc(r.details.developerName)+'</td><td>'+esc(r.details.grillSizeSqFt||'—')+'</td></tr>';}).join('')+
    '</tbody></table></div>':'<div class="empty">No orders match.</div>');
}
export function exportCncListCSV(){
  const top=state.cncPopupStack[state.cncPopupStack.length-1]; if(!top||top.type!=='list') return;
  const all=allCncRequests(); const rows=top.ids.map(id=>all.find(r=>r.id===id)).filter(Boolean);
  const header=['Order no.','Client','Current stage','Planned date','Days stuck','Status','Sales team','Developer','Sq ft'];
  const lines=[header.join(',')].concat(rows.map(r=>{const st=statusOf(r); return [r.requestNumber,r.details.clientName,currentStageLabel(r),(r.details.cncStages[currentStageIdx(r)]||{}).planned||'',daysStuck(r),st.text,r.details.salesName,r.details.developerName,r.details.grillSizeSqFt||''].map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',');}));
  const blob=new Blob([lines.join('\n')],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='cnc-orders.csv'; a.click();
}

/* ── CNC run days popup (3 tabs) ── */
function runDaysPopupHTML(){
  const requests=applyCncFilters(allCncRequests(),effectiveFilters());
  const running=requests.filter(isRunningOnCnc), overrunning=running.filter(isOverrunning);
  const completed=requests.filter(r=>actualRunDays(r)!=null);
  const waiting=requests.filter(isWaitingForCnc);
  const avgActual=completed.length?Math.round(completed.reduce((a,r)=>a+actualRunDays(r),0)/completed.length*10)/10:null;
  const avgPlanned=requests.filter(r=>plannedRunDays(r)!=null).length?Math.round(requests.filter(r=>plannedRunDays(r)!=null).reduce((a,r)=>a+plannedRunDays(r),0)/requests.filter(r=>plannedRunDays(r)!=null).length*10)/10:null;
  const monthStart=new Date(); monthStart.setDate(1); const monthStartYmd=monthStart.getFullYear()+'-'+String(monthStart.getMonth()+1).padStart(2,'0')+'-'+String(monthStart.getDate()).padStart(2,'0');
  const machineDaysUsedThisMonth=requests.filter(r=>actualRunDays(r)!=null&&(r.details.cncStages[PRODUCTION_STARTED_IDX].actual||'')>=monthStartYmd).reduce((a,r)=>a+actualRunDays(r),0);
  const queueDays=machineDaysInQueue(requests), queueSqft=waiting.reduce((a,r)=>a+(parseInt(r.details.grillSizeSqFt)||0),0);
  const tabs=[['running','Running now'],['completed','Completed runs'],['waiting','Waiting queue']];
  const tab=state.cncRunDaysTab;
  let body='';
  if(tab==='running'){
    body=running.length?'<table class="team-table"><thead><tr><th>Client</th><th>Started</th><th>Expected finish</th><th>Running so far</th><th>Planned run days</th><th>Status</th><th>Sq ft</th></tr></thead><tbody>'+
      running.map(r=>{const over=isOverrunning(r); return '<tr style="cursor:pointer" onclick="openCncOrderDetail('+r.id+')"><td><b>'+esc(r.details.clientName)+'</b></td><td>'+fmtDate(r.details.cncStages[PRODUCTION_STARTED_IDX].actual)+'</td><td>'+fmtDate(expectedFinishDate(r))+'</td><td>'+runningSoFar(r)+'d</td><td>'+plannedRunDays(r)+'d</td><td style="color:'+(over?COLOR_RED:COLOR_GREEN)+';font-weight:600">'+(over?'Overrunning by '+(runningSoFar(r)-plannedRunDays(r))+'d':'On track')+'</td><td>'+esc(r.details.grillSizeSqFt||'—')+'</td></tr>';}).join('')+
    '</tbody></table>':'<div class="empty">No orders running on CNC.</div>';
  } else if(tab==='completed'){
    body=completed.length?'<table class="team-table"><thead><tr><th>Client</th><th>Started</th><th>Completed</th><th>Actual run days</th><th>Planned run days</th><th>Variance</th><th>Sq ft</th></tr></thead><tbody>'+
      completed.map(r=>{const v=runVariance(r); return '<tr style="cursor:pointer" onclick="openCncOrderDetail('+r.id+')"><td><b>'+esc(r.details.clientName)+'</b></td><td>'+fmtDate(r.details.cncStages[PRODUCTION_STARTED_IDX].actual)+'</td><td>'+fmtDate(r.details.cncStages[PRODUCTION_COMPLETED_IDX].actual)+'</td><td>'+actualRunDays(r)+'d</td><td>'+plannedRunDays(r)+'d</td><td style="color:'+(v>0?COLOR_RED:v<0?COLOR_GREEN:'#444')+';font-weight:600">'+(v>0?'+':'')+v+'d</td><td>'+esc(r.details.grillSizeSqFt||'—')+'</td></tr>';}).join('')+
    '</tbody></table>':'<div class="empty">No completed CNC runs yet.</div>';
  } else {
    const sorted=[...waiting].sort((a,b)=>plannedStart(a).localeCompare(plannedStart(b)));
    body=sorted.length?'<table class="team-table"><thead><tr><th>Client</th><th>Shared with production on</th><th>Planned start</th><th>Days waiting</th><th>Planned run days</th><th>Status</th><th>Sq ft</th></tr></thead><tbody>'+
      sorted.map(r=>{const late=isOverdue(r); return '<tr style="cursor:pointer" onclick="openCncOrderDetail('+r.id+')"><td><b>'+esc(r.details.clientName)+'</b></td><td>'+fmtDate(r.details.cncStages[PRODUCTION_STARTED_IDX-1].actual)+'</td><td>'+fmtDate(plannedStart(r))+'</td><td>'+daysWaiting(r)+'d</td><td>'+plannedRunDays(r)+'d</td><td style="color:'+(late?COLOR_RED:'#444')+';font-weight:600">'+(late?'Start overdue '+lateByDays(r)+'d':'Scheduled')+'</td><td>'+esc(r.details.grillSizeSqFt||'—')+'</td></tr>';}).join('')+
    '</tbody></table>':'<div class="empty">No orders waiting for CNC.</div>';
  }
  return '<div style="display:flex;justify-content:space-between;align-items:flex-start">'+
      '<div style="font-size:16px;font-weight:700">CNC run days</div>'+
      '<button class="btn btn-outline btn-sm" onclick="closeCncTopPopup()">Close</button>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:12px 0;text-align:center">'+
      [['On CNC now',running.length],['Overrunning',overrunning.length],['Avg run days (actual/planned)',(avgActual==null?'—':avgActual)+' / '+(avgPlanned==null?'—':avgPlanned)],['Machine days used this month',machineDaysUsedThisMonth],['Machine days queued',queueDays+' ('+queueSqft+' sq ft)']]
        .map(([l,v])=>'<div style="background:#f5f5f3;border-radius:8px;padding:8px"><div style="font-size:16px;font-weight:700">'+v+'</div><div style="font-size:10px;color:#888">'+l+'</div></div>').join('')+
    '</div>'+
    '<div style="display:flex;gap:6px;margin-bottom:10px">'+tabs.map(([id,l])=>'<button class="btn btn-sm '+(tab===id?'btn-green':'btn-outline')+'" onclick="cncRunDaysTabChanged(\''+id+'\')">'+l+'</button>').join('')+'</div>'+
    '<div style="overflow-x:auto;max-height:55vh">'+body+'</div>';
}

/* ── Order detail popup ── Visit report section is intentionally OMITTED: CNC requests never
   collect those fields (see plan.md v2-51 — confirmed against the live New CNC Request form). */
function orderDetailHTML(id){
  const r=allCncRequests().find(x=>x.id===id);
  if(!r) return '<div style="display:flex;justify-content:flex-end"><button class="btn btn-outline btn-sm" onclick="closeCncTopPopup()">Close</button></div><div class="empty">This order could not be found.</div>';
  const d=r.details||{}; const stages=d.cncStages||[]; const st=statusOf(r);
  const docs=[['Documents',d.documentUrls],['AutoCAD file',d.autocadFileUrls],['Rough Doc',d.roughDrawingUrls],['Preview PDF',d.previewPdfUrls]];
  const reqLine=(label,val)=>'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f5f5f3;font-size:12px"><span style="color:#888">'+label+'</span><span style="font-weight:600;text-align:right">'+esc(val||'—')+'</span></div>';
  return '<div style="display:flex;justify-content:space-between;align-items:flex-start">'+
      '<div><div style="font-size:11px;color:#888">'+r.requestNumber+' · CNC · '+esc(d.scope||'Installation')+'</div>'+
        '<div style="font-size:18px;font-weight:700">'+esc(d.clientName)+'</div>'+
        '<div style="font-size:12px;color:'+st.color+';font-weight:600">'+esc(currentStageLabel(r))+' · '+st.text+'</div></div>'+
      '<div style="display:flex;gap:6px">'+(d.previewPdfUrls&&d.previewPdfUrls.length?'<button class="btn btn-outline btn-sm" onclick="emailSalesPreviewUpdated('+r.id+')">Email sales team</button>':'')+
        '<button class="btn btn-outline btn-sm" onclick="closeCncTopPopup()">Close</button></div>'+
    '</div>'+
    (plannedRunDays(r)!=null?'<div style="background:#1a1a1a;border-radius:8px;padding:10px 14px;margin:12px 0;display:flex;gap:20px;color:#fff;flex-wrap:wrap">'+
      '<div><div style="font-size:10px;color:#bbb">Planned run days</div><div style="font-weight:700">'+plannedRunDays(r)+'d</div></div>'+
      '<div><div style="font-size:10px;color:#bbb">Actual / running so far</div><div style="font-weight:700">'+(actualRunDays(r)!=null?actualRunDays(r)+'d':runningSoFar(r)!=null?runningSoFar(r)+'d (running)':'Not started')+'</div></div>'+
      '<div><div style="font-size:10px;color:#bbb">Status</div><div style="font-weight:700;color:'+(isOverrunning(r)?'#ff8a80':'#9be7c4')+'">'+(isOverrunning(r)?'Overrunning':isRunningOnCnc(r)?'On track':actualRunDays(r)!=null?(runVariance(r)>0?'+'+runVariance(r)+'d over':runVariance(r)<0?runVariance(r)+'d under':'On plan'):'Planned start '+fmtDate(plannedStart(r)))+'</div></div>'+
    '</div>':'')+
    '<div style="overflow-x:auto;margin:12px 0"><table class="team-table"><thead><tr><th>Stage</th><th>Planned</th><th>Actual</th><th>Gap</th></tr></thead><tbody>'+
      stages.map((s,i)=>{const g=stageGap(s); const cnc=i===PRODUCTION_STARTED_IDX||i===PRODUCTION_COMPLETED_IDX; return '<tr style="'+(cnc?'background:#fff4e8':'')+'"><td>'+(cnc?'<b>':'')+s.label+(cnc?'</b>':'')+'</td><td style="color:#666">'+fmtDate(s.planned)+'</td><td>'+(s.actual?fmtDate(s.actual):'<span style="color:#888">Pending</span>')+'</td><td style="color:'+g.color+';font-weight:600">'+g.text+'</td></tr>';}).join('')+
    '</tbody></table></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:10px">'+
      '<div><div class="proj-sub" style="font-weight:700;margin-bottom:4px">Request details</div>'+
        reqLine('Sales team',d.salesName)+reqLine('Sales team email',d.salesEmail)+reqLine('Client',d.clientName)+reqLine('Developer',d.developerName)+
        reqLine('Type of CNC request',d.cncRequestType)+reqLine('Scope',d.scope||'Installation')+reqLine('Size of grill',d.grillSizeSqFt?d.grillSizeSqFt+' sq ft':'')+
        reqLine('Need installation',d.needInstallation)+reqLine('Remarks',d.remarks)+
      '</div>'+
      '<div><div class="proj-sub" style="font-weight:700;margin-bottom:4px">Files</div>'+
        docs.map(([label,list])=>'<div style="margin-bottom:8px"><div style="font-size:11px;color:#888">'+label+'</div>'+((list||[]).length?(list.map((doc,i)=>namedDocLink(doc,i)).join('<br>')):'<span style="font-size:12px;color:#888">None</span>')+'</div>').join('')+
      '</div>'+
    '</div>';
}
