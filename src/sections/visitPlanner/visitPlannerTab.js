import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { INDIAN_CITIES } from '../../lib/indianCities.js';
import { notifyByGmail } from '../../lib/constants.js';
import { logActivity } from '../../lib/activityLog.js';
import { countUnseen, markKeysSeen } from '../../lib/seenItems.js';
import { visitPlanAttentionKeys } from '../../lib/attentionKeys.js';
import {
  MAX_VISITS_PER_DAY, NO_VISIT_OPTIONS, SITE_HIDDEN_STATUSES, VISIT_REASONS, VISIT_STATUSES,
  addDays, blankVisit, blankWeek, dayAllowedFor, dayName, ddmmyy, isRealVisit, longDate, mondayOf, newVisitId,
  planEmailContent, planEmailRecipients, statusAllowedOn, supervisorWeekChoices, todayYmd, validatePlan,
  visitIsNotUpdated, visitReasonLabel, visitSiteLabel, visitStats, weekDays, weekRangeLabel
} from '../../lib/visitPlanner.js';
import { closePanel, openPanel, setTab, showSection } from '../navigation.js';
import { updateBell } from '../alerts.js';

/* ══ VISIT PLANNER (plan.md v2-64) ══
   Admin: every supervisor's weekly plan, filters, status follow-up, Edit / Email / Delete.
   Supervisor: only their own plans, and a form to plan the week (a saved plan is admin-edit only).
   Plans live in visit_plans (one row per supervisor per week, visits as a jsonb array — migration 0029); the database
   enforces every rule again, this file just gives friendly messages first. */

const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const isAdmin=()=>!!state.currentUser&&state.currentUser.role==='admin';
const isSupervisor=()=>!!state.currentUser&&state.currentUser.role==='supervisor';
export const canUseVisitPlanner=()=>isAdmin()||isSupervisor();
const activeSupervisors=()=>state.teamMembers.filter(m=>m.role==='supervisor'&&m.active);

/* ── data ── */
export async function loadVisitPlans(){
  if(!canUseVisitPlanner()){ state.visitPlans=[]; state.visitPlansLoaded=true; return true; }
  try{
    const {data,error}=await db.from('visit_plans').select('*').order('week_start',{ascending:false});
    if(error) throw error;
    state.visitPlans=(data||[]).map(p=>({...p,visits:Array.isArray(p.visits)?p.visits:[]}));
    state.visitPlansLoaded=true;
    updateBell();
    return true;
  }catch(e){
    console.error('Visit Planner: load failed',e);
    return false;
  }
}
async function writePlan(planId,patch){
  const {data,error}=await db.from('visit_plans').update(patch).eq('id',planId).select();
  if(error) return {ok:false,message:error.message||'Could not save.'};
  // RLS turns a forbidden update into "0 rows changed" with no error — treat that as a failure, not a success.
  if(!data||!data.length) return {ok:false,message:'Could not save — you may not have permission, or the plan no longer exists.'};
  return {ok:true};
}

/* ── bell / notification (admin) ── */
export const unseenVisitPlanCount=()=>state.currentUser?countUnseen('visitplanner',state.currentUser.username,visitPlanAttentionKeys()):0;
export function updateVisitPlannerBadge(){
  const el=document.getElementById('visitplanner-count'); if(!el) return;
  const n=unseenVisitPlanCount();
  if(n>0){ el.classList.remove('hidden'); el.textContent=n; } else el.classList.add('hidden');
}
// Notifications panel section: plans submitted that the admin hasn't opened the Visit Planner tab to see yet.
export function buildVisitPlanNotifHTML(){
  if(!isAdmin()) return '';
  const unseen=state.visitPlans.filter(p=>countUnseen('visitplanner',state.currentUser.username,['vp:'+p.id])>0);
  if(!unseen.length) return '';
  return '<div class="section-hdr">🗓 New visit plans <span class="count-pill" style="background:#d4edda;color:#1a5e2a">'+unseen.length+'</span></div>'+
    unseen.map(p=>'<div class="alert-card"><div class="alert-header"><div class="alert-icon amber">🗓</div><div class="alert-body"><div class="alert-proj">'+esc(p.supervisor_name)+' — '+esc(p.base_city)+'</div><div class="alert-msg">Submitted the visit plan for the week of '+esc(weekRangeLabel(p.week_start))+'</div></div></div>'+
      '<div class="alert-footer"><button class="btn btn-outline btn-sm" onclick="goToVisitPlanner(\''+p.week_start+'\')">View in Visit Planner →</button></div></div>').join('');
}
export function goToVisitPlanner(weekStart){
  showSection('team');
  if(weekStart) state.vpFilters.week=weekStart;
  setTab('visitplanner');
}

/* ── list view ── */
function filteredPlans(){
  const f=state.vpFilters, today=todayYmd();
  return state.visitPlans.filter(p=>{
    if(p.week_start!==f.week) return false;
    if(isAdmin()&&f.supervisorId&&String(p.supervisor_id)!==String(f.supervisorId)) return false;
    if(f.status){
      const hit=p.visits.some(v=>isRealVisit(v)&&(f.status==='Not updated'?visitIsNotUpdated(v,today):v.status===f.status));
      if(!hit) return false;
    }
    return true;
  });
}
const STATUS_STYLE={
  Planned:'background:#f1f1ef;color:#444;border-color:#bbb',
  Done:'background:#d4edda;color:#1a5e2a;border-color:#9fd3b0',
  Missed:'background:#fde8e8;color:#8b1a1a;border-color:#e6aaaa',
  Rescheduled:'background:#fff3cd;color:#7a4f00;border-color:#e6cf8a'
};
function statusCell(plan,v){
  if(!isRealVisit(v)) return '<span style="color:#aaa">—</span>';
  const st=v.status||'Planned';
  if(isAdmin()){
    return '<select class="vp-status" style="'+STATUS_STYLE[st]+'" onchange="vpSetStatus('+plan.id+',\''+v.id+'\',this.value)">'+
      VISIT_STATUSES.map(s=>'<option value="'+s+'"'+(s===st?' selected':'')+'>'+s+'</option>').join('')+'</select>';
  }
  return '<span class="vp-status" style="display:inline-block;'+STATUS_STYLE[st]+'">'+st+'</span>';
}
function planCardHTML(plan){
  const admin=isAdmin();
  const days=weekDays(plan.week_start);
  const real=plan.visits.filter(isRealVisit);
  const doneCount=real.filter(v=>v.status==='Done').length;
  let rows='';
  days.forEach(day=>{
    const list=plan.visits.filter(v=>v.date===day);
    if(!list.length){
      rows+='<tr><td class="vp-d">'+ddmmyy(day)+'</td><td class="vp-d">'+dayName(day)+'</td><td colspan="3" style="color:#aaa">Not planned</td></tr>';
      return;
    }
    list.forEach((v,i)=>{
      const tag=v.kind==='new_site'?' <span class="vp-newtag">🆕 New site</span>':'';
      const remark=(v.status==='Missed'||v.status==='Rescheduled')&&v.remark?'<div class="vp-remark">'+esc(v.status)+' — '+esc(v.remark)+'</div>':'';
      rows+='<tr>'+
        (i===0?'<td class="vp-d" rowspan="'+list.length+'">'+ddmmyy(day)+'</td><td class="vp-d" rowspan="'+list.length+'">'+dayName(day)+'</td>':'')+
        '<td><b>'+esc(visitSiteLabel(v))+'</b>'+tag+'</td>'+
        '<td>'+(isRealVisit(v)?esc(visitReasonLabel(v)):'')+remark+'</td>'+
        '<td>'+statusCell(plan,v)+'</td></tr>';
    });
  });
  return '<div class="vp-card" id="vp-plan-'+plan.id+'">'+
    '<div class="vp-h1">Visit plan — week of '+esc(weekRangeLabel(plan.week_start))+'</div>'+
    '<div class="vp-h2">Employee name = '+esc(plan.supervisor_name)+'</div>'+
    '<div class="vp-h3">Location = '+esc(plan.base_city)+'</div>'+
    '<div style="overflow-x:auto"><table class="vp-table"><thead><tr><th style="width:90px">Date</th><th style="width:100px">Day</th><th>Site location</th><th>Reason / Task</th><th style="width:140px">Status</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="vp-foot"><span style="color:#666;font-size:12px">'+doneCount+' of '+real.length+' visit'+(real.length!==1?'s':'')+' done</span>'+
      (admin?'<span class="vp-actions"><button class="btn btn-outline btn-sm" onclick="openVisitPlanForm('+plan.id+')">✎ Edit Plan</button> <button class="btn btn-outline btn-sm" onclick="emailVisitPlan('+plan.id+')">✉ Email Plan</button> <button class="btn btn-outline btn-sm" style="color:#c0392b;border-color:#e6aaaa" onclick="deleteVisitPlan('+plan.id+')">Delete</button></span>':'')+
    '</div></div>';
}
function statCard(label,value,color){
  return '<div class="vp-stat"><div class="vp-stat-l">'+label+'</div><div class="vp-stat-v" style="color:'+(color||'#1a1a1a')+'">'+value+'</div></div>';
}

export async function renderVisitPlanner(){
  const host=document.getElementById('visitplanner-content'); if(!host) return;
  if(!canUseVisitPlanner()){ host.innerHTML=''; return; }
  const today=todayYmd();
  if(!state.vpFilters.week) state.vpFilters.week=mondayOf(today);
  if(!state.visitPlansLoaded){
    host.innerHTML='<div class="empty">Loading…</div>';
    const ok=await loadVisitPlans();
    if(!ok){ host.innerHTML='<div class="empty" style="color:#cc3333">Could not load visit plans. Check your connection and reopen this tab.</div>'; return; }
    // plans that arrived only now were not in the list when setTab() marked this tab's plans as seen
    if(state.activeTab==='visitplanner'&&state.currentUser) markKeysSeen('visitplanner',state.currentUser.username,visitPlanAttentionKeys());
    updateVisitPlannerBadge(); updateBell();
  }
  drawVisitPlanner();
}
function drawVisitPlanner(){
  const host=document.getElementById('visitplanner-content'); if(!host) return;
  const admin=isAdmin(), f=state.vpFilters, today=todayYmd();
  const plans=filteredPlans();
  const stats=visitStats(plans,today);
  const supOptions=activeSupervisors();
  // "Plans submitted x / y": y = the supervisors expected to plan (one when a single supervisor is picked / for a supervisor).
  const expected=admin?(f.supervisorId?1:supOptions.length):1;
  const weekPlansAll=state.visitPlans.filter(p=>p.week_start===f.week&&(!admin||!f.supervisorId||String(p.supervisor_id)===String(f.supervisorId)));
  host.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:4px">'+
      '<div><h3 style="font-size:16px;font-weight:700">Site Visit Planner</h3>'+
      '<div style="font-size:12px;color:#666;margin-top:3px">Each Supervisor plans next week\'s site visits: date, site and the reason for the visit.'+(admin?' Update each visit as Done, Missed or Rescheduled once the day is over.':'')+'</div></div>'+
      '<button class="btn btn-green btn-sm" onclick="openVisitPlanForm()">+ New Weekly Plan</button>'+
    '</div>'+
    '<div class="vp-filters">'+
      '<div class="form-group"><label class="form-label">Week</label><div style="display:flex;gap:6px"><button class="btn btn-outline btn-sm" onclick="vpWeekShift(-1)">← Prev</button>'+
        '<input type="date" class="form-input" id="vp-f-week" value="'+f.week+'" onchange="vpWeekPicked(this.value)"><button class="btn btn-outline btn-sm" onclick="vpWeekShift(1)">Next →</button></div></div>'+
      (admin?'<div class="form-group"><label class="form-label">Supervisor</label><select class="form-input" id="vp-f-sup" onchange="vpFilterChanged()"><option value="">All supervisors</option>'+
        supOptions.map(m=>'<option value="'+m.id+'"'+(String(m.id)===String(f.supervisorId)?' selected':'')+'>'+esc(m.name)+'</option>').join('')+'</select></div>':'')+
      '<div class="form-group"><label class="form-label">Visit Status</label><select class="form-input" id="vp-f-status" onchange="vpFilterChanged()"><option value="">All</option>'+
        ['Planned','Done','Missed','Rescheduled','Not updated'].map(s=>'<option value="'+s+'"'+(s===f.status?' selected':'')+'>'+s+'</option>').join('')+'</select></div>'+
    '</div>'+
    '<div style="font-size:14px;font-weight:700;margin:6px 0 8px">Week of '+esc(weekRangeLabel(f.week))+'</div>'+
    '<div class="vp-stats">'+
      statCard('PLANS SUBMITTED',(f.status?plans.length:weekPlansAll.length)+' / '+expected,'#1D9E75')+
      statCard('VISITS PLANNED',stats.planned)+
      statCard('DONE',stats.done,'#1D9E75')+
      statCard('MISSED',stats.missed,'#a32020')+
      statCard('NOT UPDATED',stats.notUpdated,stats.notUpdated?'#b36b00':'#1a1a1a')+
    '</div>'+
    (plans.length?plans.map(planCardHTML).join(''):'<div class="empty">'+(f.status?'No plans with a "'+esc(f.status)+'" visit this week.':(admin?'No visit plans submitted for this week.':'You have not planned this week yet. Click "+ New Weekly Plan".'))+'</div>');
}
export function vpWeekShift(n){ state.vpFilters.week=addDays(state.vpFilters.week,7*n); drawVisitPlanner(); }
export function vpWeekPicked(v){ if(!v) return; state.vpFilters.week=mondayOf(v); drawVisitPlanner(); }
export function vpFilterChanged(){
  const s=document.getElementById('vp-f-sup'), st=document.getElementById('vp-f-status');
  if(s) state.vpFilters.supervisorId=s.value;
  if(st) state.vpFilters.status=st.value;
  drawVisitPlanner();
}

/* ── status follow-up (admin only) ── */
function findVisit(planId,visitId){
  const plan=state.visitPlans.find(p=>p.id===planId);
  return {plan,visit:plan?plan.visits.find(v=>v.id===visitId):null};
}
async function commitStatus(plan,visitId,status,remark){
  const visits=plan.visits.map(v=>v.id===visitId?{...v,status,remark:remark||''}:v);
  const res=await writePlan(plan.id,{visits});
  if(!res.ok){ alert(res.message); await loadVisitPlans(); drawVisitPlanner(); return; }
  plan.visits=visits;
  drawVisitPlanner(); updateBell();
}
export async function vpSetStatus(planId,visitId,status){
  if(!isAdmin()) return;
  const {plan,visit}=findVisit(planId,visitId); if(!plan||!visit) return;
  if(status===(visit.status||'Planned')) return;
  if(!statusAllowedOn(status,visit.date,todayYmd())){
    alert('A visit can be marked '+status+' only on or after its date ('+ddmmyy(visit.date)+').');
    drawVisitPlanner(); return;
  }
  if(status==='Missed'||status==='Rescheduled'){
    state.vpStatusPending={planId,visitId,status};
    document.getElementById('vp-remark-title').textContent='Mark as '+status;
    document.getElementById('vp-remark-sub').textContent=visitSiteLabel(visit)+' — '+dayName(visit.date)+' '+ddmmyy(visit.date);
    const ta=document.getElementById('vp-remark-text'); ta.value=visit.remark||'';
    document.getElementById('vp-remark-error').classList.add('hidden');
    openPanel('panel-vp-remark');
    return;
  }
  await commitStatus(plan,visitId,status,'');
}
export function vpCancelRemark(){ state.vpStatusPending=null; closePanel('panel-vp-remark'); setTab('visitplanner'); }
export async function vpSaveRemark(){
  const p=state.vpStatusPending; if(!p) return;
  const remark=document.getElementById('vp-remark-text').value.trim();
  if(!remark){ const e=document.getElementById('vp-remark-error'); e.classList.remove('hidden'); document.getElementById('vp-remark-err-msg').textContent='A remark is required for '+p.status+'.'; return; }
  const {plan}=findVisit(p.planId,p.visitId); if(!plan) return;
  state.vpStatusPending=null;
  closePanel('panel-vp-remark'); setTab('visitplanner');
  await commitStatus(plan,p.visitId,p.status,remark);
}

/* ── email / delete (admin only) ── */
export function emailVisitPlan(planId){
  const plan=state.visitPlans.find(p=>p.id===planId); if(!plan) return;
  const r=planEmailRecipients(plan,state.teamMembers);
  if(r.missing.length||!r.to.length){
    alert('Cannot prepare this email — no email address in the Team tab for: '+(r.missing.join(', ')||'the To recipients')+'.\nAdd it in the Team tab and try again.');
    return;
  }
  const {subject,body}=planEmailContent(plan);
  notifyByGmail(r.to.join(','),subject,body,r.cc.join(','));
  logActivity('Visit plan emailed',plan.supervisor_name+' — week of '+weekRangeLabel(plan.week_start));
}
export async function deleteVisitPlan(planId){
  if(!isAdmin()) return;
  const plan=state.visitPlans.find(p=>p.id===planId); if(!plan) return;
  if(!confirm('Delete '+plan.supervisor_name+'\'s visit plan for the week of '+weekRangeLabel(plan.week_start)+'? This cannot be undone.')) return;
  const {data,error}=await db.from('visit_plans').delete().eq('id',planId).select();
  if(error||(data&&!data.length)){ alert('Could not delete the plan.'+(error?' '+error.message:'')); await loadVisitPlans(); drawVisitPlanner(); return; }
  state.visitPlans=state.visitPlans.filter(p=>p.id!==planId);
  logActivity('Visit plan deleted',plan.supervisor_name+' — week of '+weekRangeLabel(plan.week_start));
  drawVisitPlanner(); updateBell();
}

/* ── plan form ── */
function setVpError(msg){
  const e=document.getElementById('vp-error'); if(!e) return;
  if(msg){ e.classList.remove('hidden'); document.getElementById('vp-err-msg').textContent=msg; } else e.classList.add('hidden');
}
function memberFor(id){ return state.teamMembers.find(m=>String(m.id)===String(id))||null; }
// Active projects assigned to this supervisor. A project's supervisor is stored sometimes as the username and
// sometimes as the display name, so match both (same as visibleProjects()).
function projectsOfSupervisor(m){
  if(!m) return [];
  return state.projects.filter(p=>!SITE_HIDDEN_STATUSES.includes(p.status)&&(p.supervisor===m.username||p.supervisor===m.name));
}
const projectLabel=p=>p.name+(p.tower&&p.tower!=='—'?' — '+p.tower:'');
function existingPlan(supervisorId,week,exceptId){
  return state.visitPlans.find(p=>String(p.supervisor_id)===String(supervisorId)&&p.week_start===week&&p.id!==exceptId);
}
function previousCity(supervisorId){
  const mine=state.visitPlans.filter(p=>String(p.supervisor_id)===String(supervisorId)).sort((a,b)=>a.week_start<b.week_start?1:-1);
  return mine.length?mine[0].base_city:'';
}

export function openVisitPlanForm(planId){
  if(!canUseVisitPlanner()) return;
  const today=todayYmd();
  let d;
  if(planId){
    if(!isAdmin()) return; // a saved plan is admin-edit only
    const p=state.visitPlans.find(x=>x.id===planId); if(!p) return;
    d={planId:p.id,supervisor_id:p.supervisor_id,supervisor_name:p.supervisor_name,base_city:p.base_city,week_start:p.week_start,visits:p.visits.map(v=>({...v}))};
  } else {
    let week,sup;
    if(isSupervisor()){
      sup=state.currentUser;
      const choices=supervisorWeekChoices(today);
      // The normal flow is planning NEXT week on Saturday/Sunday; otherwise (or if next week is done) the current week.
      week=choices.slice().reverse().find(w=>!existingPlan(sup.id,w))||choices[choices.length-1];
    } else { sup=null; week=state.vpFilters.week||mondayOf(today); }
    d={planId:null,supervisor_id:sup?sup.id:'',supervisor_name:sup?sup.name:'',base_city:sup?previousCity(sup.id):'',week_start:week,visits:blankWeek(week)};
    // A supervisor can't plan days already gone — their rows start out empty and locked.
    if(!isAdmin()) d.visits=d.visits.filter(v=>v.date>=today);
  }
  state.vpDraft=d;
  document.getElementById('vp-panel-title').textContent=planId?'Edit Visit Plan':'Weekly Visit Plan';
  document.getElementById('vp-save-btn').textContent=planId?'Save Changes':'Save Plan';
  setVpError('');
  renderVpForm();
  openPanel('panel-visit-plan');
}
export function closeVisitPlanForm(){
  state.vpDraft=null; closePanel('panel-visit-plan'); setTab('visitplanner');
}

function renderVpForm(){
  const d=state.vpDraft; if(!d) return;
  const admin=isAdmin(), editing=!!d.planId, today=todayYmd();
  const body=document.getElementById('vp-form-body'); if(!body) return;
  const lockedEmployee=!admin||editing;
  const weekControl=(admin&&!editing)
    ?'<input class="form-input" type="date" id="vp-week" value="'+d.week_start+'" onchange="vpFormWeekChanged(this.value)">'
    :(editing
      ?'<input class="form-input" type="text" value="'+esc(longDate(d.week_start))+'" disabled>'
      :'<select class="form-input" id="vp-week" onchange="vpFormWeekChanged(this.value)">'+supervisorWeekChoices(today).map(w=>'<option value="'+w+'"'+(w===d.week_start?' selected':'')+'>'+esc(weekRangeLabel(w))+(w===mondayOf(today)?' (this week)':' (next week)')+'</option>').join('')+'</select>');
  body.innerHTML=
    '<div class="form-card"><div class="form-card-title">Plan Details</div>'+
      '<div class="form-row">'+
        '<div class="form-group"><label class="form-label">Employee Name *</label>'+
          '<input class="form-input" id="vp-employee" list="vp-emp-list" autocomplete="off" placeholder="Type a name and pick from the list" value="'+esc(d.supervisor_name)+'"'+(lockedEmployee?' disabled':'')+' onchange="vpEmployeeChanged(this.value)">'+
          '<datalist id="vp-emp-list">'+activeSupervisors().map(m=>'<option value="'+esc(m.name)+'"></option>').join('')+'</datalist></div>'+
        '<div class="form-group"><label class="form-label">Location (Base City) *</label>'+
          '<input class="form-input" id="vp-city" list="vp-city-list" autocomplete="off" placeholder="Type a city and pick from the list" value="'+esc(d.base_city)+'" onchange="vpCityChanged(this.value)">'+
          '<datalist id="vp-city-list">'+INDIAN_CITIES.map(c=>'<option value="'+esc(c)+'"></option>').join('')+'</datalist></div>'+
      '</div>'+
      '<div class="form-group" style="margin-top:10px"><label class="form-label">Week Starting (Monday)</label>'+weekControl+'</div>'+
    '</div>'+
    '<div class="form-card"><div class="form-card-title">Visits</div><div id="vp-visits-wrap"></div></div>';
  renderVpVisits();
}

function renderVpVisits(){
  const d=state.vpDraft, wrap=document.getElementById('vp-visits-wrap'); if(!d||!wrap) return;
  const admin=isAdmin(), today=todayYmd();
  const sup=memberFor(d.supervisor_id);
  const projects=projectsOfSupervisor(sup);
  const siteListHTML='<datalist id="vp-site-list">'+projects.map(p=>'<option value="'+esc(projectLabel(p))+'"></option>').join('')+NO_VISIT_OPTIONS.map(o=>'<option value="'+o.label+'"></option>').join('')+'</datalist>';
  let rows='';
  weekDays(d.week_start).forEach(day=>{
    const entries=d.visits.map((v,idx)=>({v,idx})).filter(x=>x.v.date===day);
    const past=!dayAllowedFor(admin,day,today);
    if(past){
      rows+='<tr class="vp-past" onclick="vpPastDayClicked()" title="Past day"><td>'+ddmmyy(day)+'</td><td>'+dayName(day)+'</td><td colspan="3" style="color:#999">Past day — can\'t be planned</td></tr>';
      return;
    }
    if(!entries.length){
      // only reachable when editing a plan that never had this (past) day — admin can add one
      rows+='<tr><td>'+ddmmyy(day)+'</td><td>'+dayName(day)+'</td><td colspan="3"><button class="btn btn-outline btn-sm" onclick="vpAddSameDay(\''+day+'\')">+ Add visit</button></td></tr>';
      return;
    }
    entries.forEach(({v,idx},i)=>{
      const noVisit=!isRealVisit(v);
      const noVisitLabel=noVisit?(NO_VISIT_OPTIONS.find(o=>o.kind===v.kind)||{}).label:'';
      const siteVal=noVisit?noVisitLabel:v.site;
      const siteInput=v.kind==='new_site'
        ?'<input class="form-input" placeholder="Type the new site name" value="'+esc(v.site)+'" onchange="vpNewSiteTyped('+idx+',this.value)">'
        :'<input class="form-input" list="vp-site-list" autocomplete="off" placeholder="Pick a project or type" value="'+esc(siteVal)+'" onchange="vpSiteChanged('+idx+',this.value)">';
      const reasonCell=noVisit
        ?'<span style="color:#aaa;font-size:12px">—</span>'
        :'<select class="form-input" onchange="vpReasonChanged('+idx+',this.value)"><option value="">Select a reason</option>'+VISIT_REASONS.map(r=>'<option'+(r===v.reason?' selected':'')+'>'+r+'</option>').join('')+'</select>'+
          (v.reason==='Other'?'<input class="form-input" style="margin-top:4px" placeholder="Type the reason" value="'+esc(v.reason_other)+'" onchange="vpReasonOtherTyped('+idx+',this.value)">':'');
      rows+='<tr>'+
        (i===0?'<td rowspan="'+entries.length+'">'+ddmmyy(day)+'</td><td rowspan="'+entries.length+'">'+dayName(day)+'</td>':'')+
        '<td>'+siteInput+(noVisit?'':'<label class="vp-newchk"><input type="checkbox"'+(v.kind==='new_site'?' checked':'')+' onchange="vpNewSiteToggled('+idx+',this.checked)"> 🆕 <b>New site (not in project list)</b></label>')+'</td>'+
        '<td>'+reasonCell+'</td>'+
        '<td style="white-space:nowrap">'+
          (i===0?'<button class="btn btn-outline btn-sm" '+(entries.length>=MAX_VISITS_PER_DAY?'disabled title="Max '+MAX_VISITS_PER_DAY+' visits a day"':'')+' onclick="vpAddSameDay(\''+day+'\')">+ Same Day</button> ':'')+
          (entries.length>1?'<button class="btn btn-outline btn-sm" title="Remove this visit" onclick="vpRemoveVisit('+idx+')">🗑</button>':'')+
        '</td></tr>';
    });
  });
  wrap.innerHTML=siteListHTML+
    (sup?'':'<div class="vp-hint">Select the employee first — the Site list shows the projects linked to them.</div>')+
    '<div style="overflow-x:auto"><table class="vp-table vp-form-table"><thead><tr><th style="width:80px">Date</th><th style="width:90px">Day</th><th>Site location</th><th style="width:240px">Reason / Task</th><th style="width:150px"></th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}

export function vpPastDayClicked(){ setVpError('You can\'t plan a past day.'); }
export function vpEmployeeChanged(val){
  const d=state.vpDraft; if(!d) return;
  const m=activeSupervisors().find(x=>x.name.toLowerCase()===String(val).trim().toLowerCase());
  const input=document.getElementById('vp-employee');
  if(!m){ d.supervisor_id=''; d.supervisor_name=''; if(input) input.value=''; setVpError(val?'Please pick the employee from the list.':''); }
  else {
    d.supervisor_id=m.id; d.supervisor_name=m.name; if(input) input.value=m.name; setVpError('');
    if(!d.base_city){ d.base_city=previousCity(m.id); const c=document.getElementById('vp-city'); if(c) c.value=d.base_city; }
    // the chosen employee's projects are different — site picks made for the previous employee no longer apply
    d.visits.forEach(v=>{ if(v.kind==='project'){ v.project_id=null; v.site=''; } });
  }
  renderVpVisits();
}
export function vpCityChanged(val){
  const d=state.vpDraft; if(!d) return;
  const c=INDIAN_CITIES.find(x=>x.toLowerCase()===String(val).trim().toLowerCase());
  const input=document.getElementById('vp-city');
  if(!c){ d.base_city=''; if(input) input.value=''; setVpError(val?'Please pick the city from the list.':''); }
  else { d.base_city=c; if(input) input.value=c; setVpError(''); }
}
export function vpFormWeekChanged(val){
  const d=state.vpDraft; if(!d||!val) return;
  const newWeek=mondayOf(val), today=todayYmd();
  if(!isAdmin()&&!supervisorWeekChoices(today).includes(newWeek)){ setVpError('That week can\'t be planned yet.'); renderVpForm(); return; }
  // carry the visits already typed over to the same weekdays of the new week
  const oldWeek=d.week_start;
  const offsetOf=ymd=>Math.round((new Date(ymd+'T00:00:00')-new Date(oldWeek+'T00:00:00'))/86400000);
  const moved=d.visits.map(v=>({...v,date:addDays(newWeek,offsetOf(v.date))}));
  d.week_start=newWeek;
  d.visits=isAdmin()?moved:moved.filter(v=>v.date>=today);
  if(isAdmin()){ blankWeek(newWeek).forEach(b=>{ if(!d.visits.some(v=>v.date===b.date)) d.visits.push(b); }); }
  else { blankWeek(newWeek).filter(b=>b.date>=today).forEach(b=>{ if(!d.visits.some(v=>v.date===b.date)) d.visits.push(b); }); }
  setVpError('');
  renderVpForm();
}
export function vpSiteChanged(idx,val){
  const d=state.vpDraft; if(!d) return; const v=d.visits[idx]; if(!v) return;
  const text=String(val).trim();
  const noVisit=NO_VISIT_OPTIONS.find(o=>o.label.toLowerCase()===text.toLowerCase());
  if(noVisit){ v.kind=noVisit.kind; v.site=''; v.project_id=null; v.reason=''; v.reason_other=''; setVpError(''); renderVpVisits(); return; }
  const p=projectsOfSupervisor(memberFor(d.supervisor_id)).find(x=>projectLabel(x).toLowerCase()===text.toLowerCase());
  v.kind='project';
  if(p){ v.project_id=p.id; v.site=projectLabel(p); setVpError(''); }
  else { v.project_id=null; v.site=''; if(text) setVpError('Please pick the site from the list (or tick "New site" to type a new one).'); }
  renderVpVisits();
}
export function vpNewSiteToggled(idx,checked){
  const d=state.vpDraft; if(!d) return; const v=d.visits[idx]; if(!v) return;
  v.kind=checked?'new_site':'project'; v.project_id=null; v.site='';
  renderVpVisits();
}
export function vpNewSiteTyped(idx,val){ const v=state.vpDraft&&state.vpDraft.visits[idx]; if(v) v.site=String(val).trim(); }
export function vpReasonChanged(idx,val){
  const v=state.vpDraft&&state.vpDraft.visits[idx]; if(!v) return;
  v.reason=val; if(val!=='Other') v.reason_other='';
  renderVpVisits();
}
export function vpReasonOtherTyped(idx,val){ const v=state.vpDraft&&state.vpDraft.visits[idx]; if(v) v.reason_other=String(val).trim(); }
export function vpAddSameDay(day){
  const d=state.vpDraft; if(!d) return;
  if(d.visits.filter(v=>v.date===day).length>=MAX_VISITS_PER_DAY){ setVpError('At most '+MAX_VISITS_PER_DAY+' visits can be planned on one day.'); return; }
  const b=blankVisit(day);
  // keep the day's entries together, new one last
  let at=d.visits.length; d.visits.forEach((v,i)=>{ if(v.date===day) at=i+1; });
  d.visits.splice(at,0,b);
  setVpError(''); renderVpVisits();
}
export function vpRemoveVisit(idx){
  const d=state.vpDraft; if(!d) return; const v=d.visits[idx]; if(!v) return;
  if(d.visits.filter(x=>x.date===v.date).length<=1) return; // a day always keeps at least one entry
  d.visits.splice(idx,1); renderVpVisits();
}

export async function saveVisitPlan(){
  const d=state.vpDraft; if(!d) return;
  const admin=isAdmin(), today=todayYmd(), isNew=!d.planId;
  const btn=document.getElementById('vp-save-btn');
  // typed-but-unblurred inputs: make sure the last field edited is captured
  if(document.activeElement&&document.activeElement.blur) document.activeElement.blur();
  d.visits.forEach(v=>{ if(v.kind==='new_site') v.site=String(v.site||'').trim(); });
  const err=validatePlan(d,{isAdmin:admin,today,cities:INDIAN_CITIES,isNew});
  if(err){ setVpError(err); return; }
  if(isNew&&existingPlan(d.supervisor_id,d.week_start)){
    setVpError(admin?'A plan for this employee and week already exists — use Edit Plan on it.':'Plan for this week already submitted. Contact admin to change it.');
    return;
  }
  setVpError('');
  const visits=d.visits.map(v=>({
    id:v.id||newVisitId(), date:v.date, kind:v.kind,
    project_id:v.kind==='project'?v.project_id:null,
    site:isRealVisit(v)?v.site:'', reason:isRealVisit(v)?v.reason:'', reason_other:isRealVisit(v)&&v.reason==='Other'?v.reason_other:'',
    status:v.status||'Planned', remark:v.remark||''
  })).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  btn.disabled=true;
  try{
    if(isNew){
      const {error}=await db.from('visit_plans').insert({supervisor_id:d.supervisor_id,supervisor_name:d.supervisor_name,base_city:d.base_city,week_start:d.week_start,visits}).select().single();
      if(error){
        const dup=error.code==='23505'||/duplicate key|unique/i.test(error.message||'');
        setVpError(dup?'Plan for this week already submitted. Contact admin to change it.':(error.message||'Could not save the plan.'));
        return;
      }
      logActivity('Visit plan submitted',d.supervisor_name+' — week of '+weekRangeLabel(d.week_start));
    } else {
      const res=await writePlan(d.planId,{base_city:d.base_city,visits});
      if(!res.ok){ setVpError(res.message); return; }
      logActivity('Visit plan edited',d.supervisor_name+' — week of '+weekRangeLabel(d.week_start));
    }
    await loadVisitPlans();
    state.vpFilters.week=d.week_start;
    state.vpDraft=null;
    closePanel('panel-visit-plan'); setTab('visitplanner');
  } finally { btn.disabled=false; }
}
