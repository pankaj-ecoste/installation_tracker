/* ══ MANAGEMENT OVERVIEW REPORT (admin only, inside Reports) ══ (plan.md v2-71)
   The Overview tab of the user's "Ecoste Site Tracker" artifact, built from LIVE app data (no CSV export/upload).
   All the rules live in ../../lib/managementOverview.js (pure functions). This file is presentation only and
   READ-ONLY: it never writes to the database. Handlers hang off window.mgmt (inline onclick, like the other reports)
   so no other file has to change. Download = a print-styled copy opened in a new tab -> "Save as PDF". */
import { state } from '../../lib/state.js';
import { salesPersonOf } from '../../lib/summary.js';
import { selectAllRows } from '../../data/selectAllRows.js';
import { rowToProject, rowToDpr } from '../../lib/mappers.js';
import { setTab } from '../navigation.js';
import { renderProjects } from '../projects/projectCards.js';
import { loadManagerMap } from '../../lib/managerMap.js';
import {
  buildOverviewRows, filterRows, filterOptions, overviewKpis, groupRows, totalsOf, buildDayLog, dprVsProjectInstalled, gapProjects, dataQuality, TYPE_ORDER
} from '../../lib/managementOverview.js';

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const C={green:'#1D9E75',red:'#cc3333',amber:'#d98c00',grey:'#888',plan:'#c9d3cf',ink:'#222'};
const SERIES=['#1D9E75','#3a7bd5','#d98c00','#8e5bd1','#cc3333','#2aa5b8'];
const fmt=n=>(n==null||isNaN(n))?'—':Math.round(n).toLocaleString('en-IN');
const fmtK=n=>n>=100000?(n/100000).toFixed(n>=1000000?0:1)+'L':n>=1000?(n/1000).toFixed(n>=10000?0:1)+'k':String(Math.round(n));
const pl=(n,w)=>n+' '+w+(n===1?'':'s');
const pad=n=>String(n).padStart(2,'0');
const ymdOfDate=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const longDate=ymd=>{ if(!ymd) return '—'; const [y,m,d]=ymd.split('-').map(Number); return d+' '+MON[m-1]+' '+y; };
const shortDate=ymd=>{ if(!ymd) return '—'; const [,m,d]=ymd.split('-').map(Number); return d+' '+MON[m-1]; };
const pctTxt=(a,b)=>b?Math.round(a/b*100)+'%':'—';
const pctColor=(a,b)=>!b?C.grey:a/b>=0.9?C.green:a/b<0.3?C.red:C.ink;

/* ── UI state (module-local; lost on reload, which is fine for a report) ── */
const ui={f:{q:'',pm:'',sup:'',city:'',type:'',vendor:'',product:'',sales:'',status:new Set()},sec:'all',attn:'all',paAll:false,openDays:new Set(),logOpen:true,gapOpen:false,olderOpen:false};
let host=null, printing=false;
let teamMap={}, mapOk=false;   // admin-edited supervisor -> manager list (report_team_map); mapOk=false = could not be read
let cache=null;                // the built rows — rebuilt only when data changes (open / refresh / a new day), not on every filter click
let refreshedAt=null, refreshing=false;

const label=(txt)=>'<div style="font-size:11px;color:#888;margin-bottom:2px">'+txt+'</div>';
const panel=(title,body,extra)=>'<div class="proj-card" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px"><div style="font-size:14px;font-weight:700">'+title+'</div>'+(extra||'')+'</div>'+body+'</div>';
const hint=t=>'<div style="font-size:11px;color:#888;margin-top:8px">'+t+'</div>';
const miniBar=(frac,color)=>'<div style="height:6px;background:#eee;border-radius:3px;min-width:70px"><div style="height:6px;border-radius:3px;background:'+(color||C.green)+';width:'+Math.round(Math.max(0,Math.min(frac,1))*100)+'%"></div></div>';
const TH='style="text-align:left;font-size:11px;color:#888;font-weight:600;padding:6px 8px;border-bottom:1px solid #ddd;white-space:nowrap"';
const THN='style="text-align:right;font-size:11px;color:#888;font-weight:600;padding:6px 8px;border-bottom:1px solid #ddd;white-space:nowrap"';
const TD='style="padding:7px 8px;border-bottom:1px solid #f0f0f0;font-size:12.5px;vertical-align:top"';
const TDN='style="padding:7px 8px;border-bottom:1px solid #f0f0f0;font-size:12.5px;text-align:right;white-space:nowrap"';
const TF='style="padding:7px 8px;border-top:2px solid #ddd;font-size:12.5px;font-weight:700;"';
const TFN='style="padding:7px 8px;border-top:2px solid #ddd;font-size:12.5px;font-weight:700;text-align:right;white-space:nowrap"';
const drillAttr=(key,name)=>printing?'':' title="Click to show only these projects" onclick="mgmt.drill(\''+key+'\',this.dataset.k)" data-k="'+esc(name)+'"';
// v2-73: a project name that opens that project on All Projects (plain text in the PDF)
const plink=(id,name)=>printing?esc(name):'<a href="#" onclick="mgmt.open('+Number(id)+');return false" title="Open this project" style="color:inherit;text-decoration:underline dotted">'+esc(name)+'</a>';
const scroll=h=>'<div style="overflow-x:auto">'+h+'</div>';

/* ── data ── */
function dataset(){
  const today=ymdOfDate(new Date());
  if(!cache||cache.today!==today){
    cache={today,all:buildOverviewRows({projects:state.projects,dprLog:state.dprLog,salesOf:p=>(salesPersonOf(p,state.teamMembers)||{}).name||'',todayYmd:today,members:state.teamMembers,teamMap,mapOk})};
  }
  return {today,all:cache.all,rows:filterRows(cache.all,ui.f)};
}

/* ── Refresh: the app loads its data once at login, so projects / DPRs filed since then are not in memory. This re-reads
   ONLY the two tables the report uses (+ the manager list), through selectAllRows (paged past Supabase's 1000-row cap,
   see data/selectAllRows.js). Read-only. ── */
async function fetchAll(table){
  const {data,error}=await selectAllRows(table);
  if(error) throw error;
  return data||[];
}
function setStatus(text,bad){ const el=document.getElementById('mgmt-status'); if(el){ el.textContent=text; el.style.color=bad?C.red:'#888'; } }
const clock=d=>pad(d.getHours())+':'+pad(d.getMinutes());
async function refresh(){
  if(refreshing) return; refreshing=true; setStatus('Refreshing…');
  try{
    const [p,d,m]=await Promise.all([fetchAll('projects'),fetchAll('dpr_log'),loadManagerMap()]);
    state.projects=p.map(rowToProject); state.dprLog=d.map(rowToDpr);
    teamMap=m.map; mapOk=m.ok; cache=null; refreshedAt=new Date();
    setStatus('Refreshed at '+clock(refreshedAt)+' — '+p.length+' projects, '+d.length+' DPRs');
  }catch(e){ console.error('Management Overview refresh failed',e); setStatus('Could not refresh — check your connection and try again.',true); }
  refreshing=false; drawBar(); drawBody();
}

/* ══ ENTRY POINT — called by reportsTab.js's REPORTS registry ══ */
export async function renderManagementOverview(el){
  host=el; cache=null;
  el.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:6px">'+
      '<div><div style="font-size:15px;font-weight:700">Management Overview</div>'+
      '<div style="font-size:12px;color:#888">Projects, DPRs, constraints and snags as of '+longDate(ymdOfDate(new Date()))+'. <span id="mgmt-status">'+(refreshedAt?'Last refreshed at '+clock(refreshedAt)+'.':'Data is as loaded when you logged in — press Refresh for the latest.')+'</span></div></div>'+
      '<div style="display:flex;gap:6px"><button class="btn btn-outline btn-sm" onclick="mgmt.refresh()">⟳ Refresh data</button><button class="btn btn-outline btn-sm" onclick="mgmt.pdf()">⬇ Download PDF</button><button class="btn btn-outline btn-sm" onclick="closeReport()">← All reports</button></div>'+
    '</div>'+
    '<div id="mgmt-bar"></div><div id="mgmt-body"><div style="font-size:12px;color:#888;padding:8px 0">Loading…</div></div>';
  const m=await loadManagerMap();                       // admin-only table; non-admins never get here, but fail quietly anyway
  if(host!==el) return;                                  // user left the report while this loaded
  teamMap=m.map; mapOk=m.ok; cache=null;
  drawBar(); drawBody();
}

/* ══ FILTER BAR ══ */
function drawBar(){
  const el=document.getElementById('mgmt-bar'); if(!el) return;
  const {all}=dataset(); const o=filterOptions(all);
  const sel=(key,ph,list)=>'<select onchange="mgmt.set(\''+key+'\',this.value)" style="font-size:12.5px;padding:5px 6px;max-width:150px"><option value="">'+ph+'</option>'+
    list.map(v=>'<option value="'+esc(v)+'"'+(ui.f[key]===v?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select>';
  const chip=s=>'<button class="btn btn-sm '+(ui.f.status.has(s)?'btn-primary':'btn-outline')+'" onclick="mgmt.status(\''+esc(s)+'\')">'+esc(s)+'</button>';
  const any=ui.f.q||ui.f.pm||ui.f.sup||ui.f.city||ui.f.type||ui.f.vendor||ui.f.product||ui.f.sales||ui.f.status.size;
  el.innerHTML='<div class="proj-card" style="margin:10px 0">'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+
      '<input type="text" placeholder="Search project, city, person…" value="'+esc(ui.f.q)+'" oninput="mgmt.search(this.value)" style="font-size:12.5px;padding:5px 8px;min-width:190px">'+
      sel('pm','All project managers',o.pm)+sel('sup','All supervisors',o.sup)+sel('city','All cities',o.city)+sel('type','All request types',o.type)+
      sel('vendor','All vendors',o.vendor)+sel('product','All products',o.product)+sel('sales','All sales people',o.sales)+
      (any?'<button class="btn btn-outline btn-sm" onclick="mgmt.reset()">✕ Clear filters</button>':'')+
    '</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+o.status.map(chip).join('')+'</div></div>';
}

/* ══ BODY (KPIs + sections) ══ */
function bodyHTML(forPrint){
  printing=!!forPrint;
  const {today,rows}=dataset();
  if(!rows.length) return '<div class="proj-card" style="color:#888;font-size:13px">No projects match these filters.</div>';
  const k=overviewKpis(rows);
  const secBtn=(id,text,n)=>'<button class="btn btn-sm '+(ui.sec===id?'btn-primary':'btn-outline')+'" onclick="mgmt.sec(\''+id+'\')">'+text+(n!=null?' <span style="opacity:.7">'+n+'</span>':'')+'</button>';
  const live=rows.filter(r=>r.live);
  const bar=forPrint?'':'<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 12px">'+
    secBtn('all','All')+secBtn('attn','Needs attention',rows.filter(r=>r.attention).length)+secBtn('pa','Planned vs actual',live.filter(r=>r.planned).length)+
    secBtn('vendor','Vendor',new Set(rows.map(r=>r.vendor)).size)+secBtn('sup','Supervisor',new Set(rows.map(r=>r.supervisor)).size)+
    secBtn('pm','Project manager',new Set(rows.map(r=>r.pm)).size)+secBtn('log','Day-wise log')+secBtn('dq','Data checks',dqCount(rows))+'</div>';
  const S={type:()=>typePanel(rows),log:()=>logPanel(rows,today,forPrint),pa:()=>paPanel(rows,forPrint),vendor:()=>groupPanel('By vendor',rows,r=>r.vendor,'Vendor',{drill:'vendor',muted:'No vendor',products:true,cities:true,hint:'Click a row to show only that vendor. Spellings that differ only by case or a doubled letter count as one vendor. A project with several vendors is counted under its first vendor.'}),
    sup:()=>groupPanel('By supervisor',rows,r=>r.supervisor,'Supervisor',{drill:'sup',muted:'Unassigned',need:true,hint:'Click a row to show only that supervisor. Today proj. turns amber when it is less than what is needed today to finish on the committed date (balance ÷ working days left, Mon–Sat).'}),
    pm:()=>groupPanel('By project manager',rows,r=>r.pm,'Project manager',{drill:'pm',muted:'Unassigned',need:true,hint:'Click a row to show only that manager. Project manager comes from the supervisor, using the "Who reports to whom" list in Reports → Installation Scoring Report. A supervisor not on that list is counted by the default rule (Shubham, Mahesh, Aditya → Aditya; everyone else → Shashank) and appears under Data checks.'}),
    attn:()=>attnPanel(rows,forPrint),dq:()=>dqPanel(rows)};
  const parts=forPrint||ui.sec==='all'?['type','log','pa','vendor','sup','pm','attn','dq']:[ui.sec];
  return kpiHTML(k)+bar+parts.map(p=>S[p]()).join('');
}
const dqCount=rows=>{ const q=dataQuality(rows); return q.unmappedSup.length+q.noSales.length+q.noPlanned.length+q.qtyFromSoPo.length+q.noCommitted.length+q.multiVendor.length+(mapOk?0:1); };
function drawBody(){ const el=document.getElementById('mgmt-body'); if(el) el.innerHTML=bodyHTML(false); }

/* ── KPI block ── */
function kpiHTML(k){
  const gapTxt=g=>g==null?'—':g>0?fmt(g)+' short':g<0?fmt(-g)+' extra':'on target';
  const gapSub=(g,w)=>g==null?'no DPR filed today yet':g>0?'less than '+w:g<0?'more than '+w:'matches '+w;
  const gapCol=g=>g==null?C.grey:g>0?C.red:C.green;
  const cell=(lab,val,sub,col)=>'<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:7px 0;border-bottom:1px solid #f0f0f0">'+
    '<div><div style="font-size:12.5px">'+lab+'</div><div style="font-size:11px;color:#888">'+sub+'</div></div><div style="font-size:18px;font-weight:700;color:'+(col||C.ink)+'">'+val+'</div></div>';
  const col=(title,body)=>'<div style="flex:1 1 260px;min-width:240px"><div style="font-size:11px;font-weight:700;letter-spacing:.04em;color:#888;text-transform:uppercase;margin-bottom:2px">'+title+' · sqft</div>'+body+'</div>';
  return '<div class="proj-card" style="margin-bottom:12px"><div style="display:flex;gap:22px;flex-wrap:wrap">'+
    col('Planned',cell('Total qty',fmt(k.total),pl(k.n,'project'))+cell('Weekly projection',fmt(k.wP),pl(k.wN,'active project')+' · last 7 days')+cell('Today projection',fmt(k.tP),pl(k.tN,'active project')))+
    col('Actual',cell('Installed',fmt(k.inst),(k.total?Math.round(k.inst/k.total*100):0)+'% of total qty')+cell('Last 7 days',fmt(k.week),'from DPRs')+cell('Installed today',k.todayA==null?'—':fmt(k.todayA),k.todayA==null?'no DPR filed today yet ('+k.inProgress+' in progress)':k.filedToday+' of '+k.inProgress+' in-progress projects have filed today'))+
    col('Difference',cell('Balance',fmt(k.balance),(k.total?Math.round(k.balance/k.total*100):0)+'% of total qty left',k.balance>0?C.ink:C.green)+cell('Weekly',gapTxt(k.weekGap),gapSub(k.weekGap,'weekly projection'),gapCol(k.weekGap))+cell('Today',gapTxt(k.todayGap),gapSub(k.todayGap,'today\'s projection'),gapCol(k.todayGap)))+
    '</div></div>';
}

/* ── By request type (donut + table) ── */
function donut(items,size,center){
  const tot=items.reduce((a,i)=>a+i.value,0)||1, R=size/2-14, cx=size/2, cy=size/2, L=2*Math.PI*R; let off=0;
  const arcs=items.map(i=>{ const len=i.value/tot*L; const s='<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="none" stroke="'+i.color+'" stroke-width="22" stroke-dasharray="'+len+' '+(L-len)+'" stroke-dashoffset="'+(-off)+'" transform="rotate(-90 '+cx+' '+cy+')"><title>'+esc(i.label)+': '+i.value+'</title></circle>'; off+=len; return s; }).join('');
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'+arcs+'<text x="'+cx+'" y="'+(cy+2)+'" text-anchor="middle" font-size="26" font-weight="700" fill="'+C.ink+'">'+esc(center[0])+'</text><text x="'+cx+'" y="'+(cy+20)+'" text-anchor="middle" font-size="11" fill="#888">'+esc(center[1])+'</text></svg>';
}
function typePanel(rows){
  const g=groupRows(rows,r=>r.type);
  const order=t=>{ const i=TYPE_ORDER.indexOf(t); return i<0?TYPE_ORDER.length-1.5:i; };
  g.sort((a,b)=>order(a.name)-order(b.name));
  const col=(t,i)=>t==='Not set'?C.plan:SERIES[i%SERIES.length];
  const items=g.map((o,i)=>({label:o.name,value:o.projects,color:col(o.name,i)}));
  const tr=g.map((o,i)=>'<tr'+drillAttr('type',o.name)+(printing?'':' style="cursor:pointer"')+'><td '+TD+'><span style="display:inline-flex;gap:8px;align-items:center"><i style="width:10px;height:10px;border-radius:2px;background:'+col(o.name,i)+'"></i><b>'+esc(o.name)+'</b></span></td>'+
    '<td '+TDN+'>'+o.projects+'</td><td '+TDN+'>'+o.active+'</td><td '+TDN+'>'+fmt(o.total)+'</td><td '+TDN+'>'+fmt(o.installed)+'</td><td '+TD+'>'+miniBar(o.total?o.installed/o.total:0)+'</td></tr>').join('');
  return panel('By request type','<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:center"><div style="margin:0 auto">'+donut(items,180,[String(rows.length),'projects'])+'</div>'+
    '<div style="flex:1 1 380px;min-width:0">'+scroll('<table style="width:100%;border-collapse:collapse"><thead><tr><th '+TH+'>Request type</th><th '+THN+'>Projects</th><th '+THN+'>Active</th><th '+THN+'>Total qty</th><th '+THN+'>Installed</th><th '+TH+'>Progress</th></tr></thead><tbody>'+tr+'</tbody></table>')+'</div></div>'+
    hint('Click a row to show only that request type. The ring shows the number of projects. Request type = what the project was created from; older projects use their Order Type.'));
}

/* ── Day-wise installed log ── */
function dayChart(log){
  const pts=log.slice(0,30).reverse(); if(!pts.length) return '';
  const W=1100,H=200,L=46,R=10,T=14,B=28;
  const max=Math.max(1,...pts.map(d=>Math.max(d.inst,d.proj)));
  const y=v=>T+(max-v)/max*(H-T-B), slot=(W-L-R)/pts.length, bw=Math.min(34,slot*0.6), x=i=>L+(i+0.5)*slot;
  const ticks=[0,0.5,1].map(f=>Math.round(max*f));
  let s='<svg width="100%" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Installed quantity per day">';
  ticks.forEach(v=>{ s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#e5e5e5"/><text x="'+(L-6)+'" y="'+(y(v)+4)+'" font-size="10.5" text-anchor="end" fill="#888">'+fmtK(v)+'</text>'; });
  const every=Math.ceil(pts.length/8);
  pts.forEach((d,i)=>{
    s+='<g><title>'+esc(longDate(d.ymd)+' — installed '+fmt(d.inst)+' sqft, projected '+fmt(d.proj)+' sqft, '+d.projects.length+' projects')+'</title>'+
      '<rect x="'+(x(i)-bw/2)+'" y="'+y(d.inst)+'" width="'+bw+'" height="'+Math.max(d.inst?1:0,(H-B)-y(d.inst))+'" rx="2" fill="'+C.green+'"/>'+
      (d.proj?'<line x1="'+(x(i)-bw/2-3)+'" x2="'+(x(i)+bw/2+3)+'" y1="'+y(d.proj)+'" y2="'+y(d.proj)+'" stroke="'+C.ink+'" stroke-width="2" stroke-dasharray="3 2"/>':'')+
      ((i%every===0||i===pts.length-1)?'<text x="'+x(i)+'" y="'+(H-8)+'" font-size="10.5" text-anchor="middle" fill="#888">'+shortDate(d.ymd)+'</text>':'')+'</g>';
  });
  return s+'</svg>';
}
function logPanel(rows,today,forPrint){
  const log=buildDayLog(rows), cmp=dprVsProjectInstalled(rows);
  const wk=(()=>{ const [y,m,d]=today.split('-').map(Number); return ymdOfDate(new Date(y,m-1,d-6)); })();
  const last7=log.filter(l=>l.ymd>=wk&&l.ymd<=today).reduce((a,l)=>a+l.inst,0);
  const sub=log.length?'Last 7 days: +'+fmt(last7)+' sqft · '+log.filter(l=>l.ymd>=wk).length+' day(s) with DPRs':'No DPRs filed yet';
  const toggle=forPrint?'':'<button class="btn btn-outline btn-sm" onclick="mgmt.log()">'+(ui.logOpen?'Hide':'Show')+'</button>';
  if(!ui.logOpen&&!forPrint) return panel('Day-wise installed log','<div style="font-size:12px;color:#888">'+sub+'</div>',toggle);
  if(!log.length) return panel('Day-wise installed log','<div style="font-size:12px;color:#888">No DPRs filed for these projects yet.</div>',toggle);
  const legend='<div style="display:flex;gap:16px;font-size:11px;color:#888;margin:4px 0"><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:'+C.green+';margin-right:5px"></i>Installed that day</span><span><i style="display:inline-block;width:14px;border-top:2px dashed '+C.ink+';margin-right:5px;vertical-align:middle"></i>Projection from DPR</span></div>';
  const rowHtml=l=>{
    const open=!forPrint&&ui.openDays.has(l.ymd);
    const det=open?'<tr><td colspan="4" style="padding:0 8px 8px 24px;border-bottom:1px solid #f0f0f0">'+l.projects.map(p=>'<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:2px 0"><span>'+plink(p.id,p.name)+(p.tower?' · '+esc(p.tower):'')+' <span style="color:#888">'+esc(p.supervisor)+'</span></span><span><b>'+fmt(p.inst)+'</b> <span style="color:#888">/ proj. '+fmt(p.proj)+'</span></span></div>').join('')+'</div></td></tr>':'';
    return '<tr'+(forPrint?'':' style="cursor:pointer" onclick="mgmt.day(\''+l.ymd+'\')"')+'><td '+TD+'>'+(forPrint?'':(open?'▾ ':'▸ '))+longDate(l.ymd)+'</td><td '+TDN+'>'+(l.projects.length?'<b>'+fmt(l.inst)+'</b>':'<span style="color:#888;font-style:italic">DPR filed, nothing installed</span>')+'</td><td '+TDN+'>'+(l.proj?fmt(l.proj):'—')+'</td><td '+TDN+'>'+l.projects.length+'</td></tr>'+det;
  };
  // v2-74: the table shows the last 7 days only; older days sit behind a Show / Hide button (never in the PDF)
  const recent=log.filter(l=>l.ymd>=wk), older=log.filter(l=>l.ymd<wk);
  const list=(recent.length?recent.map(rowHtml).join(''):'<tr><td colspan="4" style="padding:8px;font-size:12.5px;color:#888">No DPRs filed in the last 7 days.</td></tr>')+((!forPrint&&ui.olderOpen)?older.map(rowHtml).join(''):'');
  const olderBtn=(forPrint||!older.length)?'':'<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="mgmt.older()">'+(ui.olderOpen?'Hide older days':'Show older days ('+older.length+')')+'</button>';
  const note=Math.abs(cmp.diff)>0?hint('Installed total on the projects is '+fmt(cmp.proj)+' sqft; DPRs add up to '+fmt(cmp.dpr)+' sqft ('+(cmp.diff>0?fmt(cmp.diff)+' sqft is not in any DPR — e.g. installed before DPRs were used, or set by hand in Edit Project':fmt(-cmp.diff)+' sqft more in DPRs than in project totals — e.g. the planned-qty cap or corrections')+'). Daily bars use DPRs only.'):'';
  return panel('Day-wise installed log',
    '<div style="font-size:12px;color:#888;margin-bottom:4px">'+sub+'</div>'+legend+dayChart((!forPrint&&ui.olderOpen)?log:recent)+
    scroll('<table style="width:100%;border-collapse:collapse;margin-top:8px"><thead><tr><th '+TH+'>Date</th><th '+THN+'>Installed</th><th '+THN+'>Projected</th><th '+THN+'>Projects</th></tr></thead><tbody>'+list+'</tbody></table>')+olderBtn+note+gapListHTML(rows,forPrint),toggle);
}
// Which projects make the DPR total differ from the project Installed total (opens from a button under the log).
function gapListHTML(rows,forPrint){
  const g=gapProjects(rows); if(!g.length||forPrint) return '';
  const btn='<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="mgmt.gap()">'+(ui.gapOpen?'Hide':'Which projects differ?')+' ('+g.length+')</button>';
  if(!ui.gapOpen) return btn;
  const tr=g.slice(0,25).map(x=>'<tr><td '+TD+'><b>'+plink(x.id,x.name)+'</b>'+(x.tower?' · '+esc(x.tower):'')+'<div style="font-size:11px;color:#888">'+esc(x.status)+' · '+esc(x.supervisor)+'</div></td><td '+TDN+'>'+fmt(x.installed)+'</td><td '+TDN+'>'+fmt(x.dpr)+'</td><td '+TDN+' style="color:'+(x.diff>0?C.amber:C.red)+'">'+(x.diff>0?'+':'')+fmt(x.diff)+'</td></tr>').join('');
  return btn+scroll('<table style="width:100%;border-collapse:collapse;margin-top:6px"><thead><tr><th '+TH+'>Project</th><th '+THN+'>Project Installed</th><th '+THN+'>Sum of DPRs</th><th '+THN+'>Difference</th></tr></thead><tbody>'+tr+'</tbody></table>')+
    hint('Largest differences first'+(g.length>25?' (top 25 of '+g.length+')':'')+'. A positive difference means the project says more is installed than its DPRs add up to (work before DPRs were used, or Installed set by hand in Edit Project). A negative one means the DPRs add up to more (the planned-qty cap, or corrections).');
}

/* ── Data checks: reasons a number above may look wrong or incomplete, with the projects to fix ── */
function dqPanel(rows){
  const q=dataQuality(rows);
  const names=list=>list.slice(0,12).map(r=>esc(r.name+(r.tower?' · '+r.tower:''))).join(', ')+(list.length>12?' … +'+(list.length-12)+' more':'');
  const item=(n,title,fix,detail)=>'<div style="border-left:4px solid '+C.amber+';padding:6px 10px;margin:6px 0;background:#fafafa;border-radius:0 6px 6px 0"><div style="font-size:13px"><b>'+n+'</b> '+title+'</div>'+
    (detail?'<div style="font-size:12px;color:#555;margin-top:2px">'+detail+'</div>':'')+'<div style="font-size:11.5px;color:#888;margin-top:2px">'+fix+'</div></div>';
  const out=[];
  if(!mapOk) out.push('<div style="border-left:4px solid '+C.red+';padding:6px 10px;margin:6px 0;background:#fdf0f0;border-radius:0 6px 6px 0;font-size:12.5px">The supervisor → manager list could not be read, so the default rule is used (Shubham, Mahesh, Aditya → Aditya; everyone else → Shashank). Press Refresh to try again.</div>');
  if(q.unmappedSup.length) out.push(item(q.unmappedSup.length,'supervisor name(s) not in the manager list — counted under the default rule',
    'Assign them in Reports → Installation Scoring Report → "Who reports to whom". They then move to the right manager here and in the export.',
    q.unmappedSup.map(s=>esc(s.name)+' ('+pl(s.count,'project')+' → '+esc(s.pm)+')').join(', ')));
  if(q.noSales.length) out.push(item(q.noSales.length,'active project(s) have no valid sales person','Set an active Sales / Viewer member as Sales owner in the project\'s Update Progress.',names(q.noSales)));
  if(q.noPlanned.length) out.push(item(q.noPlanned.length,'active project(s) have no quantity at all (no planned, SO or PO qty)','Fill the Planned qty in Edit Project; until then they add nothing to the totals.',names(q.noPlanned)));
  if(q.qtyFromSoPo.length) out.push(item(q.qtyFromSoPo.length,'project(s) use the SO / PO qty because Planned qty is empty','Fill the Planned qty in Edit Project to use the real figure.',names(q.qtyFromSoPo)));
  if(q.noCommitted.length) out.push(item(q.noCommitted.length,'running project(s) have no committed date, so no day target or late / behind check','Set the Committed date in Edit Project.',names(q.noCommitted)));
  if(q.multiVendor.length) out.push(item(q.multiVendor.length,'project(s) have more than one vendor — counted under the first vendor only','The app does not split quantity between vendors, so the vendor table cannot either.',names(q.multiVendor)));
  return panel('Data checks',out.length?out.join(''):'<div style="font-size:12.5px;color:'+C.green+'">✓ Nothing to fix — every project has a supervisor on the manager list, a sales person, a quantity and a committed date.</div>');
}

/* ── Planned vs actual (active projects) ── */
function paPanel(rows,forPrint){
  const list=rows.filter(r=>r.live&&r.planned).sort((a,b)=>b.planned-a.planned);
  if(!list.length) return panel('Planned vs actual — active projects','<div style="font-size:12px;color:#888">No active projects with a total qty in this filter.</div>');
  const LIMIT=15, shown=(ui.paAll||forPrint)?list:list.slice(0,LIMIT);
  const T=list.reduce((t,r)=>{ t.planned+=r.planned; t.expected+=r.expected||0; t.installed+=r.installed; t.balance+=r.balance; t.tp+=r.todayProj||0; t.wp+=r.weekProj; return t; },{planned:0,expected:0,installed:0,balance:0,tp:0,wp:0});
  const signed=d=>(d>0?'+':'')+fmt(d);
  const tr=shown.map(r=>{
    const d=r.expected==null?null:r.installed-r.expected;
    return '<tr><td '+TD+'><b>'+plink(r.id,r.name)+'</b><div style="font-size:11px;color:#888">'+esc([r.tower,r.supervisor].filter(Boolean).join(' · '))+(r.qtySrc&&r.qtySrc!=='Planned'?' · qty from '+r.qtySrc:'')+'</div></td>'+
      '<td '+TDN+'>'+fmt(r.planned)+'</td><td '+TDN+'>'+(r.expected==null?'—':fmt(r.expected))+'</td><td '+TDN+'>'+fmt(r.installed)+'</td>'+
      '<td '+TDN+' style="color:'+(d==null?C.grey:d<0?C.red:C.green)+'">'+(d==null?'—':signed(d))+'</td>'+
      '<td '+TDN+' style="color:'+pctColor(r.installed,r.planned)+'">'+pctTxt(r.installed,r.planned)+'</td><td '+TD+'>'+miniBar(r.planned?r.installed/r.planned:0)+'</td>'+
      '<td '+TDN+'>'+fmt(r.balance)+'</td><td '+TDN+'>'+(r.todayProj==null?'—':fmt(r.todayProj))+'</td><td '+TDN+'>'+(r.weekProj?fmt(r.weekProj):'—')+'</td></tr>';
  }).join('');
  const td=T.installed-T.expected;
  const more=(!forPrint&&list.length>LIMIT)?'<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="mgmt.paAll()">'+(ui.paAll?'Show largest '+LIMIT:'Show all '+list.length+' active projects')+'</button>':'';
  return panel('Planned vs actual — active projects',scroll('<table style="width:100%;border-collapse:collapse"><thead><tr><th '+TH+'>Project</th><th '+THN+'>Total qty</th><th '+THN+'>Planned to date</th><th '+THN+'>Installed</th><th '+THN+'>Difference</th><th '+THN+'>% done</th><th '+TH+'>Progress</th><th '+THN+'>Balance</th><th '+THN+'>Today proj.</th><th '+THN+'>Week proj.</th></tr></thead><tbody>'+tr+'</tbody>'+
    '<tfoot><tr><td '+TF+'>Total ('+list.length+' active)</td><td '+TFN+'>'+fmt(T.planned)+'</td><td '+TFN+'>'+fmt(T.expected)+'</td><td '+TFN+'>'+fmt(T.installed)+'</td><td '+TFN+' style="color:'+(td<0?C.red:C.green)+'">'+signed(td)+'</td><td '+TFN+'>'+pctTxt(T.installed,T.planned)+'</td><td '+TF+'></td><td '+TFN+'>'+fmt(T.balance)+'</td><td '+TFN+'>'+fmt(T.tp)+'</td><td '+TFN+'>'+fmt(T.wp)+'</td></tr></tfoot></table>')+more+
    hint('Difference = installed − planned to date. Planned to date assumes a steady rate from installation start (or project start) to the committed date. Where a project has no planned qty, its SO (then PO) qty is used. Week proj. = DPR projections of the last 7 days.'));
}

/* ── Vendor / supervisor / project manager tables ── */
function groupPanel(title,rows,keyFn,firstCol,opt){
  const g=groupRows(rows,keyFn).sort((a,b)=>((a.name===opt.muted)-(b.name===opt.muted))||(b.active-a.active)||(b.total-a.total));
  const T=totalsOf(g);
  const cols=[firstCol].concat(opt.products?['Products']:[],['Projects','Active','Total qty','Installed','% done','Balance','Today proj.'],opt.need?['Needed today']:[],['Week proj.',opt.need?'Open issues':'With issues']);
  const tr=g.map(o=>{
    const muted=o.name===opt.muted?'color:#999;':'';
    const sub=opt.cities?[...o.cities].slice(0,3).join(', '):'';
    return '<tr'+drillAttr(opt.drill,o.name)+' style="'+muted+(printing?'':'cursor:pointer;')+'"><td '+TD+'><b>'+esc(o.name)+'</b>'+(sub?'<div style="font-size:11px;color:#888">'+esc(sub)+'</div>':'')+'</td>'+
      (opt.products?'<td '+TD+'>'+esc([...o.products].join(', ')||'—')+'</td>':'')+
      '<td '+TDN+'>'+o.projects+'</td><td '+TDN+'>'+o.active+'</td><td '+TDN+'>'+fmt(o.total)+'</td><td '+TDN+'>'+fmt(o.installed)+'</td>'+
      '<td '+TDN+' style="color:'+pctColor(o.installed,o.total)+'">'+pctTxt(o.installed,o.total)+'</td><td '+TDN+'>'+fmt(Math.max(o.total-o.installed,0))+'</td>'+
      '<td '+TDN+(opt.need&&o.active&&o.tp<o.need?' style="color:'+C.amber+'"':'')+'>'+fmt(o.tp)+'</td>'+(opt.need?'<td '+TDN+' style="color:#888">'+fmt(o.need)+'</td>':'')+
      '<td '+TDN+'>'+fmt(o.wp)+'</td><td '+TDN+' style="color:'+(o.issues?C.red:C.grey)+'">'+o.issues+'</td></tr>';
  }).join('');
  const foot='<tr><td '+TF+'>Total</td>'+(opt.products?'<td '+TF+'></td>':'')+'<td '+TFN+'>'+T.projects+'</td><td '+TFN+'>'+T.active+'</td><td '+TFN+'>'+fmt(T.total)+'</td><td '+TFN+'>'+fmt(T.installed)+'</td><td '+TFN+'>'+pctTxt(T.installed,T.total)+'</td><td '+TFN+'>'+fmt(Math.max(T.total-T.installed,0))+'</td><td '+TFN+'>'+fmt(T.tp)+'</td>'+(opt.need?'<td '+TFN+'>'+fmt(T.need)+'</td>':'')+'<td '+TFN+'>'+fmt(T.wp)+'</td><td '+TFN+'>'+T.issues+'</td></tr>';
  return panel(title,scroll('<table style="width:100%;border-collapse:collapse"><thead><tr>'+cols.map((c,i)=>'<th '+(i===0||c==='Products'?TH:THN)+'>'+c+'</th>').join('')+'</tr></thead><tbody>'+tr+'</tbody><tfoot>'+foot+'</tfoot></table>')+hint(opt.hint));
}

/* ── Needs attention ── */
function attnPanel(rows,forPrint){
  const lv=rows.filter(r=>r.live);
  const lists={
    all:lv.filter(r=>r.attention).sort((a,b)=>b.score-a.score),
    constraint:lv.filter(r=>r.constraint),
    stuck:lv.filter(r=>r.milestone).sort((a,b)=>b.milestone.overdue-a.milestone.overdue),
    snag:lv.filter(r=>r.snag)};
  const mode=forPrint?'all':ui.attn, list=lists[mode], LIMIT=forPrint?25:10;
  const tile=(k,l,n,sub,bad)=>'<div '+(forPrint?'':'onclick="mgmt.attn(\''+k+'\')" ')+'style="flex:1 1 150px;cursor:'+(forPrint?'default':'pointer')+';padding:10px;border-radius:8px;border:1px solid '+(mode===k?C.ink:'#e3e3e3')+';background:'+(n?(bad?'#fdf0f0':'#fff7e6'):'#f2faf6')+'">'+
    '<div style="font-size:22px;font-weight:700;color:'+(n?(bad?C.red:C.amber):C.green)+'">'+n+'</div><div style="font-size:12.5px;font-weight:600">'+l+'</div><div style="font-size:11px;color:#888">'+sub+'</div></div>';
  const item=r=>{
    const why=[];
    if(r.escalation) why.push('Escalation: '+r.escalation);
    if(r.hindrance) why.push('Internal hindrance: '+r.hindrance);
    if(r.late) why.push('Past committed date by '+(-r.daysLeft)+'d');
    if(r.behind) why.push('Behind plan by '+fmt(-r.gap)+' sqft');
    if(r.constraint) why.push('Constraint: '+r.constraint.text);
    if(r.milestone) why.push('Work stuck: '+(r.milestone.label||'milestone')+' ('+r.milestone.overdue+' days overdue)');
    if(mode==='snag') { why.length=0; why.push('Snag: '+[r.snag.text,r.snag.severity,r.snag.location].filter(Boolean).join(' · ')); }
    if(mode==='constraint') { why.length=0; why.push('Constraint: '+r.constraint.text+(r.constraint.date?' (since '+r.constraint.date+')':'')); }
    if(mode==='stuck') { why.length=0; why.push((r.milestone.label||'Milestone')+' — '+r.milestone.overdue+' days overdue (planned '+shortDate(r.milestone.planned)+')'); }
    const bad=r.late||r.constraint;
    return '<div style="border-left:4px solid '+(bad?C.red:C.amber)+';padding:6px 10px;margin:6px 0;background:#fafafa;border-radius:0 6px 6px 0">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b style="font-size:13px">'+plink(r.id,r.name)+(r.tower?' · '+esc(r.tower):'')+'</b><span style="font-size:11px;color:#888">'+esc(r.status)+' · '+esc(r.supervisor)+' · PM '+esc(r.pm)+'</span></div>'+
      '<div style="font-size:12.5px;margin-top:2px">'+why.map(esc).join(' · ')+'</div></div>';
  };
  const empty={all:'Nothing late, behind plan, or blocked in this filter.',constraint:'No open constraints on active projects.',stuck:'No work stuck on active projects.',snag:'No open snags on active projects.'}[mode];
  const more=(!forPrint&&list.length>LIMIT)?'<div style="font-size:12px;color:#888;margin-top:4px">Showing the top '+LIMIT+' of '+list.length+' (highest priority first). Narrow the filters above to see the rest.</div>':'';
  return panel('Needs attention',
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'+
      tile('all','All alerts',lists.all.length,'late, behind plan or blocked',true)+tile('constraint','Open constraints',lists.constraint.length,'not yet resolved',true)+
      tile('stuck','Work stuck',lists.stuck.length,'milestone past planned date',false)+tile('snag','Open snags',lists.snag.length,'not yet resolved',false)+'</div>'+
    (list.length?list.slice(0,LIMIT).map(item).join('')+more:'<div style="font-size:12.5px;color:#888">'+empty+'</div>'));
}

/* ══ Handlers (window.mgmt) ══ */
// Open a project: switch to All Projects, expand that card and scroll to it. If the All Projects filters hide it, say so.
function openProject(id){
  try{ setTab('projects'); }catch(e){ console.error(e); return; }
  state.expanded[id]=true; renderProjects();
  setTimeout(()=>{
    const card=document.getElementById('card-'+id);
    if(!card){ alert('That project is hidden by the filters on All Projects. Clear the status / state / search filters there and try again.'); return; }
    card.scrollIntoView({behavior:'smooth',block:'center'});
    card.style.transition='box-shadow .3s'; card.style.boxShadow='0 0 0 3px '+C.green;
    setTimeout(()=>{ card.style.boxShadow=''; },2200);
  },120);
}
function reset(){ ui.f={q:'',pm:'',sup:'',city:'',type:'',vendor:'',product:'',sales:'',status:new Set()}; }
function openPrintView(){
  // Preferred: a new tab. If the browser blocks pop-ups, print from a hidden frame on this page instead, so the button
  // still works without the user having to change any browser setting.
  let w=window.open('','_blank'), frame=null;
  if(!w){
    frame=document.createElement('iframe'); frame.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame); w=frame.contentWindow;
  }
  const f=ui.f, applied=[f.q&&'search "'+f.q+'"',f.pm&&'PM '+f.pm,f.sup&&'supervisor '+f.sup,f.city&&'city '+f.city,f.type&&'type '+f.type,f.vendor&&'vendor '+f.vendor,f.product&&'product '+f.product,f.sales&&'sales '+f.sales,f.status.size&&'status '+[...f.status].join('/')].filter(Boolean);
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Management Overview — '+esc(longDate(ymdOfDate(new Date())))+'</title>'+
    '<style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0;font-size:12px}.proj-card{border:1px solid #ddd;border-radius:8px;padding:10px;margin-bottom:10px;break-inside:avoid-page}table{break-inside:auto}tr{break-inside:avoid}.btn{display:none}h1{font-size:18px;margin:0 0 2px}</style></head><body>'+
    '<h1>Ecoste — Management Overview</h1><div style="color:#888;margin-bottom:10px">As of '+esc(longDate(ymdOfDate(new Date())))+(applied.length?' · Filters: '+esc(applied.join(', ')):' · All projects')+'</div>'+
    bodyHTML(true)+'</body></html>');
  printing=false;
  w.document.close(); w.focus();
  setTimeout(()=>{ try{ w.print(); }catch(e){} if(frame) setTimeout(()=>frame.remove(),60000); },400);
}
window.mgmt={
  set:(k,v)=>{ ui.f[k]=v; drawBar(); drawBody(); },
  search:v=>{ ui.f.q=v; drawBody(); },
  status:s=>{ ui.f.status.has(s)?ui.f.status.delete(s):ui.f.status.add(s); drawBar(); drawBody(); },
  reset:()=>{ reset(); drawBar(); drawBody(); },
  sec:id=>{ ui.sec=id; if(id==='log') ui.logOpen=true; drawBody(); },
  attn:k=>{ ui.attn=k; drawBody(); },
  log:()=>{ ui.logOpen=!ui.logOpen; drawBody(); },
  day:ymd=>{ ui.openDays.has(ymd)?ui.openDays.delete(ymd):ui.openDays.add(ymd); drawBody(); },
  drill:(k,v)=>{ ui.f[k]=v; drawBar(); drawBody(); try{ window.scrollTo(0,0); }catch(e){} },
  paAll:()=>{ ui.paAll=!ui.paAll; drawBody(); },
  gap:()=>{ ui.gapOpen=!ui.gapOpen; drawBody(); },
  older:()=>{ ui.olderOpen=!ui.olderOpen; drawBody(); },
  open:openProject,
  refresh,
  pdf:openPrintView
};
