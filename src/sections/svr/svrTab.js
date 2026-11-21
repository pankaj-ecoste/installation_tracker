import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { INDIAN_CITIES } from '../../lib/indianCities.js';
import { ROLES } from '../../lib/constants.js';
import { svrFullAccess, svrSupervisorAccess } from '../../lib/helpers.js';
import { logActivity } from '../../lib/activityLog.js';
import { countUnseen, markKeysSeen } from '../../lib/seenItems.js';
import { svrAttentionKeys } from '../../lib/attentionKeys.js';
import { selectAllRows } from '../../data/selectAllRows.js';
import { uploadFilesWithNames, docDisplayName } from '../../lib/uploads.js';
import { reverseGeocodeAddress } from '../requests/requestsTab.js';
import { todayYmd, longDate } from '../../lib/visitPlanner.js';
import {
  SVR_MAX_FILES, SVR_PERIODS, SVR_PROJECT_TYPES, svrClientSuggestions, svrCsv, svrDateTimeLabel, svrInRange,
  svrIsSimilar, svrMapUrl, svrPeriodRange, svrPersonCounts, svrValidate
} from '../../lib/svr.js';
import { closePanel, openPanel, setTab, showSection } from '../navigation.js';
import { updateBell } from '../alerts.js';

/* ══ SVR — Site Visit Report, "New Site" (plan.md v2-79) ══
   Supervisor: submits SVRs and sees only their own. Admin-level (Admin, Ops Manager, other ticked roles): everyone's,
   person filter + person-wise table. Edit / Delete: Admin only. Rows live in site_visit_reports (migration 0034);
   the database stamps submitter / time and enforces every rule again. */

const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const isFull=()=>svrFullAccess();
const isOwnOnly=()=>svrSupervisorAccess();
const isAdminRole=()=>!!state.currentUser&&state.currentUser.role==='admin';
export const canUseSVR=()=>isFull()||isOwnOnly();

/* ── data ── */
export async function loadSVRs(){
  if(!canUseSVR()){ state.svrs=[]; state.svrsLoaded=true; return true; }
  try{
    const {data,error}=await selectAllRows('site_visit_reports');
    if(error) throw error;
    state.svrs=(data||[]).map(r=>({...r,docs:Array.isArray(r.docs)?r.docs:[]}))
      .sort((a,b)=>a.created_at<b.created_at?1:a.created_at>b.created_at?-1:0);
    state.svrsLoaded=true;
    updateBell();
    return true;
  }catch(e){
    console.error('SVR: load failed',e);
    return false;
  }
}

/* ── badge / notifications (admin-level) ── */
export const unseenSVRCount=()=>state.currentUser?countUnseen('svr',state.currentUser.username,svrAttentionKeys()):0;
export function updateSVRBadge(){
  const el=document.getElementById('svr-count'); if(!el) return;
  const n=unseenSVRCount();
  if(n>0){ el.classList.remove('hidden'); el.textContent=n; } else el.classList.add('hidden');
}
export function buildSVRNotifHTML(){
  if(!isFull()||!state.currentUser) return '';
  const unseen=state.svrs.filter(r=>String(r.submitted_by_id)!==String(state.currentUser.id)&&countUnseen('svr',state.currentUser.username,['svr:'+r.id])>0);
  if(!unseen.length) return '';
  return '<div class="section-hdr">📍 New site visit reports <span class="count-pill" style="background:#dbe8f6;color:#1b5a9c">'+unseen.length+'</span></div>'+
    unseen.slice(0,20).map(r=>'<div class="alert-card"><div class="alert-header"><div class="alert-icon amber">📍</div><div class="alert-body"><div class="alert-proj">'+esc(r.site_name)+' — '+esc(r.client_name)+'</div><div class="alert-msg">New site reported by '+esc(r.submitted_by_name)+'</div><div class="alert-detail">'+esc(svrDateTimeLabel(r.created_at))+' · '+esc(r.city)+'</div></div></div>'+
      '<div class="alert-footer"><button class="btn btn-outline btn-sm" onclick="goToSVR()">View in SVR →</button></div></div>').join('');
}
export function goToSVR(){ showSection('team'); setTab('svr'); }

/* ── list / report view ── */
function currentRange(){
  const f=state.svrFilters;
  return svrPeriodRange(f.period,todayYmd(),f.from,f.to);
}
function filteredSVRs(){
  const f=state.svrFilters, range=currentRange();
  return state.svrs.filter(r=>{
    if(!svrInRange(r,range)) return false;
    if(isFull()&&f.personId&&String(r.submitted_by_id)!==String(f.personId)) return false;
    return true;
  });
}
function statTile(label,value,color){
  return '<div class="vp-stat"><div class="vp-stat-l">'+label+'</div><div class="vp-stat-v" style="color:'+color+'">'+value+'</div></div>';
}
function entryCardHTML(r){
  const map=svrMapUrl(r);
  const loc=map
    ?'📍 <a href="'+esc(map)+'" target="_blank" rel="noopener" title="'+esc(r.location_text)+'">map</a>'
    :'📍 <span style="color:#b36b00">no location</span>';
  const docs=(r.docs||[]).map((doc,i)=>{
    const url=doc&&typeof doc==='object'?doc.url:doc;
    return '<a href="'+esc(url)+'" target="_blank" rel="noopener" class="svr-doc">📎 '+esc(docDisplayName(doc,i))+'</a>';
  }).join('');
  const contact=(r.contact_name||r.contact_mobile)?'<div class="svr-line"><b>Contact:</b> '+esc(r.contact_name||'—')+(r.contact_mobile?' · <a href="tel:'+esc(r.contact_mobile)+'">'+esc(r.contact_mobile)+'</a>':'')+'</div>':'';
  return '<div class="svr-entry">'+
    '<div class="svr-title">🔎 <b>'+esc(r.site_name)+'</b> <span class="svr-sub">· '+esc(r.client_name)+' · '+esc(r.project_type)+' · '+esc(r.city)+'</span></div>'+
    '<div class="svr-meta">'+esc(svrDateTimeLabel(r.created_at))+' · '+esc(r.submitted_by_name)+' · '+loc+'</div>'+
    contact+
    (r.remarks?'<div class="svr-line"><b>Next action:</b> '+esc(r.remarks)+'</div>':'')+
    (docs?'<div class="svr-docs">'+docs+'</div>':'')+
    (isAdminRole()?'<div class="svr-actions"><button class="btn btn-outline btn-sm" onclick="openSVRForm('+r.id+')">✎ Edit</button> <button class="btn btn-outline btn-sm" style="color:#c0392b;border-color:#e6aaaa" onclick="deleteSVR('+r.id+')">Delete</button></div>':'')+
  '</div>';
}

export async function renderSVR(){
  const host=document.getElementById('svr-content'); if(!host) return;
  if(!canUseSVR()){ host.innerHTML=''; return; }
  if(!state.svrsLoaded){
    host.innerHTML='<div class="empty">Loading…</div>';
    const ok=await loadSVRs();
    if(!ok){ host.innerHTML='<div class="empty" style="color:#cc3333">Could not load site visit reports. Check your connection and reopen this tab.</div>'; return; }
    if(state.activeTab==='svr'&&state.currentUser) markKeysSeen('svr',state.currentUser.username,svrAttentionKeys());
    updateSVRBadge(); updateBell();
  }
  drawSVR();
}
function drawSVR(){
  const host=document.getElementById('svr-content'); if(!host) return;
  const full=isFull(), f=state.svrFilters;
  const list=filteredSVRs();
  const people=svrPersonCounts(list);
  // Person filter: everyone who has ever submitted, plus active supervisors / ops managers.
  const personMap=new Map();
  state.teamMembers.filter(m=>m.active&&(m.role==='supervisor'||m.role==='manager')).forEach(m=>personMap.set(String(m.id),m.name));
  state.svrs.forEach(r=>{ if(!personMap.has(String(r.submitted_by_id))) personMap.set(String(r.submitted_by_id),r.submitted_by_name); });
  const persons=[...personMap.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const custom=f.period==='custom';
  host.innerHTML=
    '<div class="svr-wrap">'+
    '<div style="font-size:15px;font-weight:700;margin-bottom:8px">SVR — New Site</div>'+
    '<button class="btn svr-new-btn" onclick="openSVRForm()">+ New Site</button>'+
    '<div class="svr-filters">'+
      '<select class="form-input" id="svr-f-period" onchange="svrFilterChanged()">'+SVR_PERIODS.map(p=>'<option value="'+p.key+'"'+(p.key===f.period?' selected':'')+'>'+p.label+'</option>').join('')+'</select>'+
      (full?'<select class="form-input" id="svr-f-person" onchange="svrFilterChanged()"><option value="">Everyone</option>'+persons.map(([id,name])=>'<option value="'+esc(id)+'"'+(id===String(f.personId)?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select>':'')+
    '</div>'+
    (custom?'<div class="svr-filters"><input type="date" class="form-input" id="svr-f-from" value="'+esc(f.from)+'" onchange="svrFilterChanged()" title="From"><input type="date" class="form-input" id="svr-f-to" value="'+esc(f.to)+'" onchange="svrFilterChanged()" title="To"></div>':'')+
    '<div class="svr-stats">'+statTile('NEW SITES',list.length,'#1b5a9c')+statTile('PEOPLE ACTIVE',people.length,'#1a5e2a')+'</div>'+
    (full?'<div class="svr-box"><div class="svr-box-h">Person-Wise New Sites</div>'+
      (people.length
        ?'<table class="vp-table svr-table"><thead><tr><th>Submitted by</th><th style="width:120px">New sites</th></tr></thead><tbody>'+people.map(p=>'<tr><td><b>'+esc(p.name)+'</b></td><td>'+p.count+'</td></tr>').join('')+'</tbody></table>'
        :'<div class="empty" style="padding:14px">No new sites in this period.</div>')+
      '</div>':'')+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 6px"><div style="font-size:13px;font-weight:700">Recent entries</div>'+
      (list.length?'<button class="btn btn-outline btn-sm" onclick="exportSVR()">⬇ Export CSV</button>':'')+'</div>'+
    (list.length?list.map(entryCardHTML).join(''):'<div class="empty">'+(full?'No site visit reports in this period.':'You have no site visit reports in this period. Tap "+ New Site" to add one.')+'</div>')+
    '</div>';
}
export function svrFilterChanged(){
  const f=state.svrFilters;
  const p=document.getElementById('svr-f-period'), per=document.getElementById('svr-f-person');
  const from=document.getElementById('svr-f-from'), to=document.getElementById('svr-f-to');
  if(p) f.period=p.value;
  if(per) f.personId=per.value;
  if(from) f.from=from.value;
  if(to) f.to=to.value;
  if(f.period==='custom'&&!f.from&&!f.to){ const r=svrPeriodRange('month',todayYmd()); f.from=r.from; f.to=r.to; }
  drawSVR();
}
export function exportSVR(){
  const list=filteredSVRs(); if(!list.length) return;
  const blob=new Blob([svrCsv(list)],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  const r=currentRange(); a.download='svr_new_sites_'+(r.from||'start')+'_to_'+(r.to||'today')+'.csv'; a.click();
}
export async function deleteSVR(id){
  if(!isAdminRole()) return;
  const r=state.svrs.find(x=>x.id===id); if(!r) return;
  if(!confirm('Delete the site visit report "'+r.site_name+'" by '+r.submitted_by_name+'? This cannot be undone.')) return;
  const {data,error}=await db.from('site_visit_reports').delete().eq('id',id).select();
  if(error||(data&&!data.length)){ alert('Could not delete the report.'+(error?' '+error.message:'')); await loadSVRs(); drawSVR(); return; }
  state.svrs=state.svrs.filter(x=>x.id!==id);
  logActivity('SVR deleted',r.site_name+' — '+r.submitted_by_name);
  drawSVR(); updateBell(); updateSVRBadge();
}

/* ── form (new, or Admin edit) ── */
function setSvrError(msg){
  const e=document.getElementById('svr-error'); if(!e) return;
  if(msg){ e.classList.remove('hidden'); document.getElementById('svr-err-msg').textContent=msg; } else e.classList.add('hidden');
}
export function openSVRForm(id){
  if(!canUseSVR()) return;
  let d;
  if(id){
    if(!isAdminRole()) return;
    const r=state.svrs.find(x=>x.id===id); if(!r) return;
    d={id:r.id,site_name:r.site_name,client_name:r.client_name,project_type:r.project_type,city:r.city,contact_name:r.contact_name||'',contact_mobile:r.contact_mobile||'',remarks:r.remarks||'',docs:(r.docs||[]).slice(),created_at:r.created_at,submitted_by_name:r.submitted_by_name,location_text:r.location_text,lat:r.lat,lng:r.lng};
  } else {
    d={id:null,site_name:'',client_name:'',project_type:'',city:'',contact_name:'',contact_mobile:'',remarks:'',docs:[]};
  }
  state.svrDraft=d;
  document.getElementById('svr-panel-title').textContent=id?'Edit Site Visit Report':'New Site';
  document.getElementById('svr-save-btn').textContent=id?'Save Changes':'Submit New Site';
  setSvrError('');
  renderSVRForm();
  openPanel('panel-svr');
}
export function closeSVRForm(){ state.svrDraft=null; closePanel('panel-svr'); setTab('svr'); }

function renderSVRForm(){
  const d=state.svrDraft, body=document.getElementById('svr-form-body'); if(!d||!body) return;
  const u=state.currentUser||{};
  const roleLabel=(ROLES[u.role]||{}).label||u.role||'';
  const editing=!!d.id;
  const head=editing
    ?'<div class="svr-head">🗓 <b>'+esc(svrDateTimeLabel(d.created_at))+'</b> &nbsp; 👤 <b>'+esc(d.submitted_by_name)+'</b> &nbsp; 📍 '+(svrMapUrl(d)?'<a href="'+esc(svrMapUrl(d))+'" target="_blank" rel="noopener">'+esc(d.location_text||'map')+'</a>':'no location')+'</div>'
    :'<div class="svr-head">🗓 <b>'+esc(longDate(todayYmd()))+'</b> &nbsp; 👤 <b>'+esc(roleLabel+' ('+(u.name||'')+')')+'</b> &nbsp; 📍 GPS and time are recorded when you submit</div>';
  const clients=svrClientSuggestions(state.requests,state.projects,state.svrs);
  const existing=d.docs.map((doc,i)=>'<div class="svr-file-row"><span>📎 '+esc(docDisplayName(doc,i))+'</span><button class="btn btn-outline btn-sm" title="Remove" onclick="svrRemoveDoc('+i+')">✕</button></div>').join('');
  body.innerHTML=head+
    '<div class="form-card svr-form">'+
      '<div class="form-group"><label class="form-label">New Site / Project Name *</label><input class="form-input" id="svr-site" maxlength="150" placeholder="e.g. Skyline Heights, Thane" value="'+esc(d.site_name)+'"></div>'+
      '<div class="form-group"><label class="form-label">Client / Builder Name *</label><input class="form-input" id="svr-client" list="svr-client-list" maxlength="150" autocomplete="off" placeholder="Pick from the list or type a new name" value="'+esc(d.client_name)+'">'+
        '<datalist id="svr-client-list">'+clients.map(c=>'<option value="'+esc(c)+'"></option>').join('')+'</datalist></div>'+
      '<div class="form-group"><label class="form-label">Project Type *</label><select class="form-input" id="svr-type"><option value="">— Select —</option>'+SVR_PROJECT_TYPES.map(t=>'<option'+(t===d.project_type?' selected':'')+'>'+t+'</option>').join('')+'</select></div>'+
      '<div class="form-group"><label class="form-label">City *</label><input class="form-input" id="svr-city" list="svr-city-list" autocomplete="off" placeholder="Type a city and pick from the list" value="'+esc(d.city)+'">'+
        '<datalist id="svr-city-list">'+INDIAN_CITIES.map(c=>'<option value="'+esc(c)+'"></option>').join('')+'</datalist></div>'+
      '<div class="form-row">'+
        '<div class="form-group"><label class="form-label">Site Contact Person</label><input class="form-input" id="svr-cname" maxlength="100" placeholder="Optional" value="'+esc(d.contact_name)+'"></div>'+
        '<div class="form-group"><label class="form-label">Contact Mobile</label><input class="form-input" id="svr-cmobile" inputmode="numeric" maxlength="10" placeholder="10 digits (optional)" value="'+esc(d.contact_mobile)+'" oninput="this.value=this.value.replace(/[^0-9]/g,\'\')"></div>'+
      '</div>'+
      (editing?'':'<div class="form-group"><label class="form-label">Site Location</label><div class="svr-gps">📍 Captured automatically from your phone when you submit</div></div>')+
      '<div class="form-group"><label class="form-label">📎 Photos / Documents * (up to '+SVR_MAX_FILES+')</label>'+existing+
        '<input type="file" id="svr-files" multiple accept="image/*,application/pdf" style="font-size:13px" onchange="svrFilesPicked()"><div id="svr-files-note" style="font-size:11px;color:#666;margin-top:4px"></div></div>'+
      '<div class="form-group"><label class="form-label">Remarks / Next Action</label><input class="form-input" id="svr-remarks" maxlength="500" placeholder="e.g. Meet builder Monday" value="'+esc(d.remarks)+'"></div>'+
    '</div>';
}
function readFormInto(d){
  const v=id=>{ const el=document.getElementById(id); return el?String(el.value).trim():''; };
  d.site_name=v('svr-site'); d.client_name=v('svr-client'); d.project_type=v('svr-type');
  const cityTyped=v('svr-city');
  d.city=INDIAN_CITIES.find(c=>c.toLowerCase()===cityTyped.toLowerCase())||cityTyped;
  d.contact_name=v('svr-cname'); d.contact_mobile=v('svr-cmobile'); d.remarks=v('svr-remarks');
}
function pickedFiles(){ const el=document.getElementById('svr-files'); return el?Array.from(el.files||[]):[]; }
export function svrFilesPicked(){
  const d=state.svrDraft; if(!d) return;
  const n=pickedFiles().length, total=n+d.docs.length;
  const note=document.getElementById('svr-files-note');
  if(note) note.textContent=total>SVR_MAX_FILES?('Too many files: '+total+' (limit '+SVR_MAX_FILES+').'):(n?n+' file'+(n>1?'s':'')+' selected':'');
  if(note) note.style.color=total>SVR_MAX_FILES?'#cc3333':'#666';
}
export function svrRemoveDoc(i){
  const d=state.svrDraft; if(!d) return;
  readFormInto(d);
  d.docs.splice(i,1);
  renderSVRForm();
}

function captureLocation(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){ reject(new Error('Location capture is not supported on this device/browser — an SVR cannot be submitted without it.')); return; }
    navigator.geolocation.getCurrentPosition(
      async pos=>{
        const lat=pos.coords.latitude, lng=pos.coords.longitude;
        const address=await reverseGeocodeAddress(lat,lng);
        resolve({lat,lng,text:lat.toFixed(6)+', '+lng.toFixed(6)+(address?' — '+address:'')});
      },
      err=>reject(new Error('Location access is required to submit an SVR. Please allow location access when your browser asks, then tap "Submit New Site" again. ('+err.message+')')),
      {enableHighAccuracy:true, timeout:15000}
    );
  });
}

// Similar sites already reported (by anyone — via the database function) or already a project. Best-effort:
// if the lookup fails the submit still goes ahead.
async function similarSites(name){
  const hits=[];
  state.projects.filter(p=>svrIsSimilar(p.name,name)).slice(0,3).forEach(p=>hits.push('Project: '+p.name+(p.developer?' ('+p.developer+')':'')));
  let fromDb=null;
  try{
    const {data,error}=await db.rpc('svr_similar_sites',{p_name:name});
    if(!error&&Array.isArray(data)) fromDb=data;
  }catch(e){ /* ignore */ }
  const rows=fromDb||state.svrs.filter(r=>svrIsSimilar(r.site_name,name)).slice(0,5);
  rows.forEach(r=>hits.push('SVR: '+r.site_name+' — by '+r.submitted_by_name+' on '+svrDateTimeLabel(r.created_at)));
  return hits;
}

export async function saveSVR(){
  const d=state.svrDraft; if(!d) return;
  if(document.activeElement&&document.activeElement.blur) document.activeElement.blur();
  readFormInto(d);
  const files=pickedFiles();
  const err=svrValidate({...d,fileCount:d.docs.length+files.length},{cities:INDIAN_CITIES});
  if(err){ setSvrError(err); return; }
  setSvrError('');
  const btn=document.getElementById('svr-save-btn');
  const label=btn.textContent;
  btn.disabled=true;
  try{
    if(!d.id){
      const hits=await similarSites(d.site_name);
      if(hits.length&&!confirm('A similar site may already be reported:\n\n'+hits.join('\n')+'\n\nSubmit this new site anyway?')) return;
      btn.textContent='Getting location…';
      let loc;
      try{ loc=await captureLocation(); }catch(e){ setSvrError(e.message); return; }
      d.lat=loc.lat; d.lng=loc.lng; d.location_text=loc.text;
    }
    let docs=d.docs.slice();
    if(files.length){
      btn.textContent='Uploading files…';
      const up=await uploadFilesWithNames(files,'svr-photos');
      if(up.length<files.length){ setSvrError((files.length-up.length)+' of '+files.length+' files could not be uploaded. Please check your connection and try again.'); return; }
      docs=docs.concat(up);
    }
    btn.textContent='Saving…';
    const row={site_name:d.site_name,client_name:d.client_name,project_type:d.project_type,city:d.city,contact_name:d.contact_name,contact_mobile:d.contact_mobile,remarks:d.remarks,docs};
    if(!d.id){
      // submitter / time are stamped by the database; GPS travels with the row (the trigger requires it)
      const ins={...row,report_type:'new_site',lat:d.lat,lng:d.lng,location_text:d.location_text,
        submitted_by_id:state.currentUser.id,submitted_by_name:state.currentUser.name,created_at:new Date().toISOString()};
      const {error}=await db.from('site_visit_reports').insert(ins).select().single();
      if(error){ setSvrError(error.message||'Could not submit the report.'); return; }
      logActivity('SVR submitted',d.site_name+' — '+d.client_name);
    } else {
      const {data,error}=await db.from('site_visit_reports').update(row).eq('id',d.id).select();
      if(error){ setSvrError(error.message||'Could not save.'); return; }
      if(!data||!data.length){ setSvrError('Could not save — you may not have permission, or the report no longer exists.'); return; }
      logActivity('SVR edited',d.site_name+' — '+d.client_name);
    }
    await loadSVRs();
    state.svrDraft=null;
    closePanel('panel-svr'); setTab('svr');
  } finally { btn.disabled=false; btn.textContent=label; }
}
