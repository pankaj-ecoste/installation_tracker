import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { logActivity } from '../../lib/activityLog.js';
import { MS_MAIN, MS_MAINORDER_STEPS, MS_MOCKUP_STEPS, MS_POSTMOCKUP_STEPS, MS_PREMAINSURVEY_STEPS, MS_PREMOCKUP, MS_SAMPLING, NEELAM_WA, POSTPO_DOC_CATEGORIES, POSTPO_FIELDS, PREPO_FIELDS, SURVEY_FIELDS, VISIT_FIELDS, getAdminEmail, getManagementCcEmails, milestoneKeyFor, notifyByGmail, reqFieldGroup, reqTypeLabel } from '../../lib/constants.js';
import { canDo, daysDiff, fmtDate, visibleProjects } from '../../lib/helpers.js';
import { projectToRow, requestToRow, rowToProject, rowToRequest } from '../../lib/mappers.js';
import { fileUploadRowHTML, pickFilesOrWarn, uploadFiles } from '../../lib/uploads.js';
import { updateBell } from '../alerts.js';
import { renderDashboard } from '../dashboard/dashboardTab.js';
import { approvedVendors, recalcFinanceComputed } from '../finance/financeTab.js';
import { renderGantt, renderPipeline } from '../gantt/ganttTab.js';
import { renderMetrics } from '../metrics.js';
import { closePanel, openPanel, setTab, showSection } from '../navigation.js';
import { openEditProject } from '../projects/addEditProject.js';
import { renderProjects } from '../projects/projectCards.js';

/* ══ REQUESTS ══ */
export function fieldRowHTML(f, valObj, idPrefix){
  const val=String(valObj[f.key]!=null?valObj[f.key]:'');
  const inputId=idPrefix+'-'+f.key;
  const inputHtml=f.type==='select'
    ? '<select class="form-input" id="'+inputId+'" data-key="'+f.key+'" onchange="reqFieldChanged(this,\''+idPrefix+'\')">'+
        '<option value="">— Select —</option>'+
        f.options.map(o=>'<option '+(val===o?'selected':'')+'>'+o+'</option>').join('')+
      '</select>'
    : f.type==='phone'
    ? '<input class="form-input" type="tel" inputmode="numeric" maxlength="10" id="'+inputId+'" data-key="'+f.key+'" value="'+val.replace(/"/g,'&quot;')+'" oninput="this.value=this.value.replace(/[^0-9]/g,\'\').slice(0,10);reqFieldChanged(this,\''+idPrefix+'\')" placeholder="10-digit mobile number">'
    : f.type==='numeric'
    ? '<input class="form-input" type="text" inputmode="numeric" id="'+inputId+'" data-key="'+f.key+'" value="'+val.replace(/"/g,'&quot;')+'" oninput="this.value=this.value.replace(/[^0-9]/g,\'\');reqFieldChanged(this,\''+idPrefix+'\')" placeholder="'+(f.placeholder||f.label)+'">'
    : f.type==='uppercase'
    ? '<input class="form-input" type="text" style="text-transform:uppercase" id="'+inputId+'" data-key="'+f.key+'" value="'+val.replace(/"/g,'&quot;')+'" oninput="this.value=this.value.toUpperCase();reqFieldChanged(this,\''+idPrefix+'\')" placeholder="'+(f.placeholder||f.label)+'">'
    : '<input class="form-input" type="'+(f.type==='date'?'date':f.type==='number'?'number':'text')+'" id="'+inputId+'" data-key="'+f.key+'" value="'+val.replace(/"/g,'&quot;')+'" oninput="reqFieldChanged(this,\''+idPrefix+'\')" placeholder="'+(f.placeholder||f.label)+'">';
  return '<div class="form-group" style="margin-bottom:10px"><label class="form-label">'+f.label+(f.required?' *':'')+'</label>'+inputHtml+'</div>';
}
// Reverse-geocodes coordinates into a human-readable address via OpenStreetMap's free
// Nominatim API (no key/billing setup needed). Best-effort only — if it's slow, offline, or
// rate-limited, the caller still has the coordinates already captured, so this never blocks
// or fails the location capture itself, just the address text appended alongside it.
export async function reverseGeocodeAddress(lat, lng){
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(), 6000);
    const res=await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng+'&zoom=18&addressdetails=1', {signal:controller.signal, headers:{'Accept-Language':'en'}});
    clearTimeout(timeout);
    if(!res.ok) return null;
    const data=await res.json();
    return data && data.display_name ? data.display_name : null;
  }catch(e){ return null; }
}
export function captureDPRArrivalGeoLocation(){
  const resultEl=document.getElementById('dpr-arrival-geo-result');
  if(!navigator.geolocation){ resultEl.style.color='#cc3333'; resultEl.textContent='Geolocation not supported on this device/browser.'; return; }
  resultEl.style.color='#888'; resultEl.textContent='Getting location...';
  navigator.geolocation.getCurrentPosition(
    async pos=>{
      const lat=pos.coords.latitude, lng=pos.coords.longitude;
      const coords=lat.toFixed(6)+', '+lng.toFixed(6);
      state.dprArrivalGeoLocation=coords;
      resultEl.style.color='#1D9E75';
      resultEl.textContent='📍 Captured: '+coords+' — looking up address...';
      const address=await reverseGeocodeAddress(lat,lng);
      const combined=address?coords+' — '+address:coords;
      state.dprArrivalGeoLocation=combined;
      resultEl.textContent='📍 Captured: '+combined;
    },
    err=>{ resultEl.style.color='#cc3333'; resultEl.textContent='Could not get location — '+err.message+'. Make sure location access is allowed and you are at the site.'; },
    {enableHighAccuracy:true, timeout:10000}
  );
}
export function captureGeoLocation(){
  const resultEl=document.getElementById('req-geo-result');
  if(!navigator.geolocation){ resultEl.style.color='#cc3333'; resultEl.textContent='Geolocation not supported on this device/browser.'; return; }
  resultEl.style.color='#888'; resultEl.textContent='Getting location...';
  navigator.geolocation.getCurrentPosition(
    async pos=>{
      const lat=pos.coords.latitude, lng=pos.coords.longitude;
      const coords=lat.toFixed(6)+', '+lng.toFixed(6);
      state.reqVisitDetails.geoLocation=coords;
      resultEl.style.color='#1D9E75';
      resultEl.textContent='📍 Captured: '+coords+' — looking up address...';
      const address=await reverseGeocodeAddress(lat,lng);
      const combined=address?coords+' — '+address:coords;
      state.reqVisitDetails.geoLocation=combined;
      resultEl.textContent='📍 Captured: '+combined;
    },
    err=>{ resultEl.style.color='#cc3333'; resultEl.textContent='Could not get location — '+err.message+'. Make sure location access is allowed and you are at the site.'; },
    {enableHighAccuracy:true, timeout:10000}
  );
}
export function reqFieldChanged(el,idPrefix){
  const key=el.dataset.key;
  const target = idPrefix==='req'?state.reqDetails : idPrefix==='reqv'?state.reqVisitDetails : idPrefix==='fin'?state.finRowDetails : idPrefix==='vend'?state.vendRegDetails : null;
  if(target) target[key]=el.value;
  if(idPrefix==='fin') recalcFinanceComputed();
}

export function renderRequestFields(){
  const type=document.getElementById('req-type').value;
  const group=reqFieldGroup(type);
  const subType=document.getElementById('req-postpo-type').value;
  const allFields=group==='order'?POSTPO_FIELDS:group==='survey'?SURVEY_FIELDS:PREPO_FIELDS;
  // Framing Material / Section size only apply when Installation type = "With frame" —
  // hidden (and not required) entirely for "Without frame".
  const fields=allFields.filter(f=>(!f.conditionalOn||f.conditionalOn===subType)&&(!f.onlyFor||f.onlyFor===type));
  document.getElementById('req-fields-title').textContent=reqTypeLabel(type)+' details';
  document.getElementById('req-postpo-type-row').classList.toggle('hidden', group!=='order');
  document.getElementById('req-fields-list').innerHTML=fields.map(f=>fieldRowHTML(f,state.reqDetails,'req')).join('');
  // No backdating on any date field in the request form.
  const today=new Date().toISOString().slice(0,10);
  fields.forEach(f=>{ if(f.type==='date'){ const el=document.getElementById('req-'+f.key); if(el) el.min=today; } });

  // Document upload (up to 2), per the doc
  document.getElementById('req-doc-upload').innerHTML=fileUploadRowHTML('req-docs','Document upload',5);
  document.getElementById('req-docs').onchange=async function(){
    const files=pickFilesOrWarn(this,5); if(!files) return;
    document.getElementById('req-docs-list').textContent='Uploading '+files.length+' file(s)...';
    const urls=await uploadFiles(files,'requests');
    state.reqDetails.documentUrls=[...(state.reqDetails.documentUrls||[]),...urls];
    document.getElementById('req-docs-list').textContent=state.reqDetails.documentUrls.length+' file(s) uploaded.';
  };

  // Post-PO documents — bifurcated into 3 real upload categories instead of one combined link field
  const postpoDocEl=document.getElementById('req-postpo-doc-upload');
  postpoDocEl.classList.toggle('hidden', group!=='order');
  if(group==='order'){
    postpoDocEl.innerHTML=POSTPO_DOC_CATEGORIES.map(c=>fileUploadRowHTML(c.id,c.label+' *',5)).join('');
    POSTPO_DOC_CATEGORIES.forEach(c=>{
      document.getElementById(c.id).onchange=async function(){
        const files=pickFilesOrWarn(this,5); if(!files) return;
        document.getElementById(c.id+'-list').textContent='Uploading '+files.length+' file(s)...';
        const urls=await uploadFiles(files,c.folder);
        state.reqDetails[c.id]=[...(state.reqDetails[c.id]||[]),...urls];
        document.getElementById(c.id+'-list').textContent=state.reqDetails[c.id].length+' file(s) uploaded.';
      };
    });
  }

  // Sampling / Main Order Size Survey — upload the matching PO (only the one matching the
  // selected survey type is actually required; the other stays optional/hidden).
  const surveyDocEl=document.getElementById('req-survey-doc-upload');
  surveyDocEl.classList.toggle('hidden', group!=='survey');
  if(group==='survey'){
    surveyDocEl.innerHTML=fileUploadRowHTML('req-sample-po','Upload Sample PO (optional)',3);
    const el=document.getElementById('req-sample-po');
    el.onchange=async function(){
      const files=pickFilesOrWarn(this,3); if(!files) return;
      document.getElementById('req-sample-po-list').textContent='Uploading '+files.length+' file(s)...';
      const urls=await uploadFiles(files,'req-sample-po');
      state.reqDetails['req-sample-po']=[...(state.reqDetails['req-sample-po']||[]),...urls];
      document.getElementById('req-sample-po-list').textContent=state.reqDetails['req-sample-po'].length+' file(s) uploaded.';
    };
  }

  // Visit report — never shown to Sales/Viewer at all (not just read-only), per the spec.
  // Only makes sense once a request already exists and is being edited by staff who can see it.
  const visitCard=document.getElementById('req-visit-card');
  const salesCanSeeVisit=!(state.currentUser&&state.currentUser.role==='viewer');
  if(state.editingRequestId&&salesCanSeeVisit){
    document.getElementById('req-visit-card').querySelector('.form-card-title').textContent=group==='survey'?'Survey report (filled by site supervisor after survey)':'Visit report (filled by site supervisor after visit)';
    const isSamplingType=type==='sampling-survey';
    document.getElementById('req-visit-required-banner').innerHTML=isSamplingType
      ? '⚠ Sampling requests have lighter requirements — the visit report fields below are optional for Sampling.'
      : '⚠ <b>Required to mark this visit done:</b> Visit remarks, Measurement — area, and at least 1 photo. Fill these in and Save before clicking "Mark visit done." <span style="opacity:.8">(Geo location is optional for now.)</span>';
    visitCard.classList.remove('hidden');
    document.getElementById('req-visit-fields-list').innerHTML=VISIT_FIELDS.map(f=>fieldRowHTML(f,state.reqVisitDetails,'reqv')).join('');
    // Visit photos (up to 10), per the doc
    document.getElementById('req-visit-photo-upload').innerHTML=fileUploadRowHTML('req-visit-photos','Visit photos *',10);
    document.getElementById('req-visit-photos').onchange=async function(){
      const files=pickFilesOrWarn(this,10); if(!files) return;
      document.getElementById('req-visit-photos-list').textContent='Uploading '+files.length+' file(s)...';
      const urls=await uploadFiles(files,'visit-reports');
      state.reqVisitDetails.visitPhotoUrls=[...(state.reqVisitDetails.visitPhotoUrls||[]),...urls];
      document.getElementById('req-visit-photos-list').textContent=state.reqVisitDetails.visitPhotoUrls.length+' photo(s) uploaded.';
    };
    document.getElementById('req-geo-result').textContent=state.reqVisitDetails.geoLocation?('📍 Captured: '+state.reqVisitDetails.geoLocation):'';
  } else {
    visitCard.classList.add('hidden');
  }
}

export function openAddRequest(){
  if(!canDo('addRequest')){ alert('You do not have permission to create a new request.'); return; }
  state.editingRequestId=null; state.reqDetails={}; state.reqVisitDetails={};
  // Auto-fill sales name/email from the logged-in user, per the workflow spec —
  // sales team shouldn't have to retype their own name/email every time.
  if(state.currentUser){
    state.reqDetails.salesName=state.currentUser.name;
    if(state.currentUser.email) state.reqDetails.salesEmail=state.currentUser.email;
  }
  document.getElementById('request-panel-title').textContent='New request';
  document.getElementById('req-type').value='pre-mockup';
  document.getElementById('req-postpo-type').value='';
  document.getElementById('req-error').classList.add('hidden');
  renderRequestFields();
  openPanel('panel-add-request');
}

export function openEditRequest(id){
  const r=state.requests.find(x=>x.id===id); if(!r) return;
  state.editingRequestId=id;
  state.reqDetails={...r.details}; state.reqVisitDetails={...r.details}; // visit fields stored in same details blob
  document.getElementById('request-panel-title').textContent='Edit request — '+r.requestNumber;
  document.getElementById('req-type').value=r.requestType;
  document.getElementById('req-postpo-type').value=r.requestSubType||'';
  document.getElementById('req-error').classList.add('hidden');
  renderRequestFields();
  openPanel('panel-add-request');
}

export function genRequestNumber(type){
  const group=reqFieldGroup(type);
  const prefix=group==='order'?'PPO':group==='survey'?'SUR':'PRE';
  const n=state.requests.filter(r=>r.requestType===type).length+1;
  return prefix+'-'+String(n).padStart(4,'0');
}

export async function saveRequest(){
  const type=document.getElementById('req-type').value;
  const subType=document.getElementById('req-postpo-type').value;
  const group=reqFieldGroup(type);
  const createdBy=state.currentUser?state.currentUser.username:(state.reqDetails.salesName||'sales');
  const err=document.getElementById('req-error');
  const mergedDetails={...state.reqDetails,...state.reqVisitDetails};
  if(group==='order'&&!subType){ err.classList.remove('hidden'); document.getElementById('req-err-msg').textContent='Please select an Installation type.'; return; }
  const fieldSet=(group==='order'?POSTPO_FIELDS:group==='survey'?SURVEY_FIELDS:PREPO_FIELDS).filter(f=>(!f.conditionalOn||f.conditionalOn===subType)&&(!f.onlyFor||f.onlyFor===type));
  const missingField=fieldSet.find(f=>f.required&&!String(mergedDetails[f.key]||'').trim());
  if(missingField){ err.classList.remove('hidden'); document.getElementById('req-err-msg').textContent='"'+missingField.label+'" is required.'; return; }
  if(group==='order'){
    const missingDoc=POSTPO_DOC_CATEGORIES.find(c=>!mergedDetails[c.id]||!mergedDetails[c.id].length);
    if(missingDoc){ err.classList.remove('hidden'); document.getElementById('req-err-msg').textContent='Please upload at least one file under "'+missingDoc.label+'".'; return; }
  }
  // Sample PO upload is optional for Sampling Survey requests — not blocking save.

  if(state.editingRequestId){
    const idx=state.requests.findIndex(r=>r.id===state.editingRequestId);
    const updated={...state.requests[idx], requestSubType:group==='order'?subType:'', details:mergedDetails};
    const {error}=await db.from('requests').update(requestToRow(updated)).eq('id',state.editingRequestId);
    if(error){ console.error('Supabase update failed',error); err.classList.remove('hidden'); document.getElementById('req-err-msg').textContent='Could not save — check console.'; return; }
    state.requests[idx]=updated;
  } else {
    const newReq={
      requestNumber:genRequestNumber(type), requestType:type, requestSubType:group==='order'?subType:'', status:'New', createdBy,
      assignedSupervisor:'', plannedVisitDate:'', actualVisitDate:'', plannedDateLocked:false,
      details:mergedDetails, checklist:[], linkedProjectId:null
    };
    // No client-supplied id — requests.id is a real Postgres identity column, so letting the
    // database assign it atomically avoids two concurrent submissions both computing the same
    // "next" id and colliding on the primary key (see plan.md v2-4 for the incident this fixed).
    const {data:inserted,error}=await db.from('requests').insert(requestToRow(newReq)).select().single();
    if(error){ console.error('Supabase insert failed',error); err.classList.remove('hidden'); document.getElementById('req-err-msg').textContent='Could not save — check console. (Have you run the requests table SQL in Supabase yet?)'; return; }
    const savedReq=rowToRequest(inserted);
    state.requests.unshift(savedReq);
    logActivity('New request', savedReq.requestNumber+' — '+reqTypeLabel(type)+' request logged by '+createdBy);
    notifyManagementNewRequest(savedReq);
  }
  closePanel('panel-add-request');
  renderRequests();
}
// v2-18: fires on every new request save (all 7 types) — opens a pre-filled Gmail compose tab
// to the primary admin, Cc'ing the rest of management, so staff just has to hit Send. Uses only
// fields common to all 3 field groups (visit/order/survey) since this covers every request type.
export function notifyManagementNewRequest(r){
  const d=r.details||{};
  const label=reqTypeLabel(r.requestType);
  const project=d.developerName||d.projectName||'—';
  const subject='New '+label+' request — '+r.requestNumber+' — '+project;
  const body='A new '+label+' request has been raised in the Installation Tracker.\n\n'+
    'Request number: '+r.requestNumber+'\n'+
    'Type: '+label+'\n'+
    'Raised by: '+(d.salesName||r.createdBy)+'\n'+
    'Developer/Project: '+project+'\n'+
    'Client representative: '+(d.contactPerson||'—')+(d.mobile?' ('+d.mobile+')':'')+'\n'+
    'Location: '+(d.locationForVisit||'—')+', '+(d.city||'—')+', '+(d.state||'—')+'\n\n'+
    'Please review and act on this request in the app:\n'+window.location.origin+'\n\n'+
    'Regards,\nEcoste Installation Tracker';
  notifyByGmail(getAdminEmail(), subject, body, getManagementCcEmails());
}

export function notifyProjectTeamNewRequest(r){
  const d=r.details||{};
  const salesName=d.salesName||r.createdBy;
  const salesEmail=d.salesEmail||'';
  const subject='New Pre-PO request — '+r.requestNumber+' — '+(d.developerName||'—');
  const body='A new Pre-PO request has been submitted.\n\n'+
    'Request number: '+r.requestNumber+'\n'+
    'Sales person: '+salesName+'\n'+
    'Developer: '+(d.developerName||'—')+'\n'+
    'Client representative: '+(d.contactPerson||'—')+' ('+(d.mobile||'—')+')\n'+
    'Location: '+(d.locationForVisit||'—')+', '+(d.city||'—')+', '+(d.state||'—')+'\n'+
    'Objective of visit: '+(d.objectiveOfVisit||'—')+'\n\n'+
    'Please acknowledge and assign a site supervisor in the app.\n\n'+
    'Regards,\n'+salesName+(salesEmail?'\n'+salesEmail:'');
  notifyByGmail(getAdminEmail(), subject, body);
  // Acknowledgment back to the sales person confirming their request went through.
  if(salesEmail){
    const ackSubject='Your Pre-PO request has been submitted — '+r.requestNumber;
    const ackBody='Hi '+salesName+',\n\n'+
      'Thank you — your Pre-PO request has been submitted successfully and is now with our Project Team for review.\n\n'+
      'Request number: '+r.requestNumber+'\n'+
      'Developer: '+(d.developerName||'—')+'\n'+
      'Location: '+(d.locationForVisit||'—')+', '+(d.city||'—')+', '+(d.state||'—')+'\n\n'+
      'You can track the status of this request in the app at any time.\n\n'+
      'Regards,\nEcoste Installation Team';
    notifyByGmail(salesEmail, ackSubject, ackBody);
  }
}

export function notifyNewRequest(r){
  const summary='New '+r.requestType.toUpperCase()+' request '+r.requestNumber+' logged by '+r.createdBy+'.\nProject/Developer: '+(r.details.developerName||r.details.projectName||'—')+'\nPlease review in the app.';
  window.open('https://wa.me/'+NEELAM_WA+'?text='+encodeURIComponent(summary),'_blank');
  notifyByGmail(getAdminEmail(), 'New '+r.requestType.toUpperCase()+' request: '+r.requestNumber, summary);
}

export function renderRequests(){
  const sf=document.getElementById('req-f-status')?.value||'';
  const el=document.getElementById('request-list'); if(!el) return;
  // Admin/Manager/Finance/Dispatch Head see the full queue (they need to see brand-new
  // unassigned requests to acknowledge/report on them). Supervisor only sees a request
  // once Admin has actually assigned it to them — a "New" unassigned request shouldn't
  // show up on their screen yet. Sales/Viewer only sees what they personally submitted.
  let visible=state.requests;
  if(state.currentUser&&state.currentUser.role==='supervisor'){
    visible=state.requests.filter(r=>r.assignedSupervisor===state.currentUser.username);
  } else if(state.currentUser&&state.currentUser.role==='viewer'){
    visible=state.requests.filter(r=>r.createdBy===state.currentUser.username||r.assignedSupervisor===state.currentUser.username);
  }
  const filtered=visible.filter(r=>(!sf||r.status===sf));
  if(!filtered.length){ el.innerHTML='<div class="empty">No requests yet'+(state.requests.length===0&&visible.length===0?' — or the requests table hasn\'t been created in Supabase yet.':'.')+'</div>'; return; }
  el.innerHTML=filtered.map(r=>renderRequestCard(r)).join('');
}

export const REQ_STATUS_COLOR={'New':'bb','Acknowledged':'ba','Visit Done':'bg','Reviewed':'bg','Converted to Project':'bgr'};

export function sendVisitReportEmail(id){
  const r=state.requests.find(x=>x.id===id); if(!r) return;
  const d=r.details||{};
  const supervisorName=r.assignedSupervisor||'the assigned site supervisor';
  const devName=d.developerName||'—';
  const projName=d.projectNameKnown||d.projectName||'—';
  const salesEmail=d.salesEmail||'';
  const salesName=d.salesName||'Sales Team';
  if(!salesEmail){ alert('This request has no sales team email on file — cannot send. Please edit the request and fill in "Sales team email" first.'); return; }
  const subject='Site visit completed — '+devName+' — '+projName+' — '+r.requestNumber;
  const body=
    'Hi '+salesName+',\n\n'+
    'This is to confirm the site visit for the request below has been completed by '+supervisorName+' (Site Supervisor).\n\n'+
    'Request number: '+r.requestNumber+'\n'+
    'Developer: '+devName+'\n'+
    'Project: '+projName+'\n'+
    'Visit date: '+(r.actualVisitDate?fmtDate(r.actualVisitDate):'—')+'\n'+
    'Contact: '+(d.contactPerson||'—')+'\n'+
    'Location: '+(d.locationForVisit||'—')+'\n\n'+
    'Visit findings:\n'+
    'Measurement — Area: '+(d.measurementArea||'—')+'\n'+
    'Section size: '+(d.sectionSize||'—')+'\n'+
    'Framing material: '+(d.framingMaterial||'—')+'\n'+
    'Grill size & thickness: '+(d.grillSizeThickness||'—')+'\n'+
    'Quantity: '+(d.qty||'—')+'\n'+
    'Installation type: '+(d.installationType||'—')+'\n'+
    'Site readiness: '+(d.siteReadinessStatus||'—')+'\n'+
    'Outcome / remarks: '+(d.visitRemarks||'—')+'\n'+
    'Potential hindrance: '+(d.potentialHindrance||'—')+'\n\n'+
    'Next action needed from you:\n'+
    'Please confirm whether Sampling or a Main Order Size Survey is needed next — reply to this email to let us know, and our team will move forward with processing.\n\n'+
    'Regards,\nEcoste Installation Team';
  notifyByGmail(salesEmail, subject, body);
  logActivity('Visit report sent', r.requestNumber+' — sent to sales team ('+salesName+')');
}

export function tatBadge(r){
  if(reqFieldGroup(r.requestType)!=='visit'||!r.details.ackedAt||r.status==='Visit Done'||r.status==='Reviewed'||r.status==='Converted to Project') return '';
  const hoursLeft=24-((Date.now()-new Date(r.details.ackedAt).getTime())/3600000);
  if(hoursLeft<0) return '<span class="badge br">🚨 TAT breached — visit overdue</span>';
  return '<span class="badge ba">⏱ TAT: '+Math.ceil(hoursLeft)+'h left for visit</span>';
}
// Time elapsed between "Visit Done" and Admin marking it "Reviewed" — highlighted if
// it's been sitting unreviewed too long (using the same 24h TAT window).
export function reviewWaitBadge(r){
  if(r.status!=='Visit Done'||!r.actualVisitDate) return '';
  const hoursSince=(Date.now()-new Date(r.actualVisitDate).getTime())/3600000;
  const over=hoursSince>24;
  return '<span class="badge '+(over?'br':'ba')+'">'+(over?'🚨 Awaiting review — ':'⏳ Awaiting review: ')+Math.floor(hoursSince)+'h since visit'+(over?' (overdue)':'')+'</span>';
}

export function toggleRequestTimeline(id){ state.requestTimelineExpanded[id]=!state.requestTimelineExpanded[id]; renderRequests(); }
export function fmtDateTime(iso){ if(!iso) return ''; const dt=new Date(iso); return fmtDate(dt.toISOString().slice(0,10))+' '+dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }
// Gap between a target timestamp and when it actually happened — used for the SLA-based
// stages (no real "planned" date exists for these, so a standard SLA window is the target).
export function slaGap(targetIso, actualIso){
  if(!actualIso) return {text:'Pending', color:'#888'};
  if(!targetIso) return {text:'—', color:'#888'};
  const diffH=(new Date(actualIso)-new Date(targetIso))/3600000;
  if(Math.abs(diffH)<1) return {text:'On time', color:'#444'};
  return diffH<0?{text:Math.round(-diffH)+'h early',color:'#1a5e2a'}:{text:Math.round(diffH)+'h late',color:'#cc3333'};
}
// Full Planned-vs-Actual-vs-Gap timeline across every stage of a request's life, from
// creation through conversion. Stage 2 (visit date) uses real business-set dates; the
// other stages don't have a natural "planned" date, so a standard SLA target is used instead.
export function renderRequestStageTimeline(r){
  const d=r.details||{};
  const targetAck=r.createdAt?new Date(new Date(r.createdAt).getTime()+24*3600000).toISOString():null;
  const targetReview=r.actualVisitDate?new Date(new Date(r.actualVisitDate).getTime()+24*3600000).toISOString():null;
  const targetConvert=r.reviewedAt?new Date(new Date(r.reviewedAt).getTime()+48*3600000).toISOString():null;
  const visitGap=(r.plannedVisitDate&&r.actualVisitDate)?(()=>{ const g=daysDiff(r.plannedVisitDate,r.actualVisitDate); return g===0?{text:'On time',color:'#444'}:g<0?{text:Math.abs(g)+'d early',color:'#1a5e2a'}:{text:g+'d late',color:'#cc3333'}; })():{text:r.actualVisitDate?'—':'Pending',color:'#888'};
  const rows=[
    {stage:'Request created \u2192 Acknowledged',planned:'Within 24h (SLA)',actual:d.ackedAt?fmtDateTime(d.ackedAt):'Pending',gap:slaGap(targetAck,d.ackedAt)},
    {stage:'Acknowledged \u2192 Visit/Survey done',planned:r.plannedVisitDate?fmtDate(r.plannedVisitDate):'—',actual:r.actualVisitDate?fmtDate(r.actualVisitDate):'Pending',gap:visitGap},
    {stage:'Visit/Survey done \u2192 Reviewed',planned:'Within 24h (SLA)',actual:r.reviewedAt?fmtDateTime(r.reviewedAt):'Pending',gap:slaGap(targetReview,r.reviewedAt)},
    {stage:'Reviewed \u2192 Converted to project',planned:'Within 48h (SLA)',actual:r.convertedAt?fmtDateTime(r.convertedAt):'Pending',gap:slaGap(targetConvert,r.convertedAt)}
  ];
  return '<div style="overflow-x:auto;margin-top:10px">'+
    '<table class="team-table"><thead><tr><th>Stage</th><th>Planned / Target</th><th>Actual</th><th>Gap</th></tr></thead><tbody>'+
    rows.map(row=>'<tr><td>'+row.stage+'</td><td style="color:#666">'+row.planned+'</td><td style="'+(row.actual==='Pending'?'color:#888':'color:#1D9E75;font-weight:600')+'">'+row.actual+'</td><td style="color:'+row.gap.color+';font-weight:600">'+row.gap.text+'</td></tr>').join('')+
    '</tbody></table>'+
    '<div style="font-size:11px;color:#888;margin-top:6px">"Planned/Target" for the Acknowledge and Review/Convert stages is a standard SLA window (no business-set date exists for those) \u2014 only the Visit/Survey date is a real planned date entered by Admin.</div>'+
  '</div>';
}

export function renderRequestCard(r){
  const d=r.details||{};
  const group=reqFieldGroup(r.requestType);
  const title=group==='order'?(d.projectName||'Untitled request'):group==='survey'?(d.projectNameKnown||d.developerName||'Untitled survey request'):(d.developerName||'Untitled request');
  const sub=group==='order'?(d.customerName||''):(d.contactPerson||'');
  const canAck=canDo('addProject')||canDo('manageTeam');
  // Per the spec: once a Sales/Viewer submits a request, they can only VIEW its status —
  // no editing, no visit report actions, nothing. Everyone else keeps normal access.
  const isSalesViewer=state.currentUser&&state.currentUser.role==='viewer';
  const linkedProject=r.linkedProjectId?state.projects.find(p=>p.id===r.linkedProjectId):null;
  return '<div class="proj-card" style="cursor:default">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">'+
      '<div>'+
        '<div class="proj-name">'+title+' <span style="font-weight:400;color:#888;font-size:12px">· '+r.requestNumber+'</span></div>'+
        '<div class="proj-sub">'+sub+' · Logged by '+r.createdBy+'</div>'+
        '<div class="proj-meta">'+
          '<span class="badge '+(group==='order'?'bb':group==='survey'?'bg':'ba')+'">'+reqTypeLabel(r.requestType)+'</span>'+
          (r.requestSubType?'<span class="badge bgr">'+r.requestSubType+'</span>':'')+
          '<span class="badge '+(REQ_STATUS_COLOR[r.status]||'bgr')+'">'+r.status+'</span>'+
          tatBadge(r)+
          reviewWaitBadge(r)+
          (r.assignedSupervisor?'<span style="font-size:11px;color:#666">👤 '+r.assignedSupervisor+'</span>':'')+
          (r.plannedVisitDate?'<span style="font-size:11px;color:#666">📅 Visit: '+fmtDate(r.plannedVisitDate)+(r.plannedDateLocked?' 🔒':'')+'</span>':'')+
        '</div>'+
      '</div>'+
      '<div style="display:flex;gap:6px;flex-shrink:0">'+
        (!isSalesViewer&&r.plannedDateLocked&&state.currentUser&&state.currentUser.role==='admin'?'<button class="icon-btn btn-sm" title="Change planned date (admin only)" onclick="changePlannedDate('+r.id+')">🔓📅</button>':'')+
        (isSalesViewer?'<button class="icon-btn btn-sm" title="View only" onclick="viewRequestReadOnly('+r.id+')">👁</button>':'<button class="icon-btn btn-sm" onclick="openEditRequest('+r.id+')">✏️</button>')+
      '</div>'+
    '</div>'+
    // Sales-visible status summary — Project name, Developer, Location, State, and committed
    // completion date, per the spec, shown right on the card so sales doesn't need to dig in.
    (isSalesViewer?'<div style="background:#f5f5f3;border-radius:6px;padding:8px 10px;margin-top:8px;font-size:12px;color:#444">'+
      '<div><b>Project:</b> '+(linkedProject?linkedProject.name+' — '+linkedProject.tower:(d.projectName||d.projectNameKnown||'—'))+'</div>'+
      '<div><b>Developer:</b> '+(d.developerName||'—')+'</div>'+
      '<div><b>Location:</b> '+(d.locationForVisit||'—')+'</div>'+
      '<div><b>State:</b> '+(d.state||'—')+'</div>'+
      '<div><b>Committed completion:</b> '+(linkedProject?fmtDate(linkedProject.committedDate):'Not yet committed')+'</div>'+
    '</div>':'')+
    (isSalesViewer?'':
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid #f0f0f0">'+
      (r.status==='New'&&canAck?'<button class="btn btn-outline btn-sm" onclick="acknowledgeRequest('+r.id+')">✅ Acknowledge & assign</button>':'')+
      (r.status==='Acknowledged'?'<button class="btn btn-outline btn-sm" onclick="openEditRequest('+r.id+')">📝 '+(group==='survey'?'Fill survey report':'Fill visit report')+'</button><button class="btn btn-outline btn-sm" onclick="advanceRequestStatus('+r.id+',\'Visit Done\')">Mark '+(group==='survey'?'survey':'visit')+' done</button>':'')+
      (r.status==='Visit Done'&&canAck?'<button class="btn btn-outline btn-sm" onclick="advanceRequestStatus('+r.id+',\'Reviewed\')">🔍 Mark reviewed</button><button class="btn btn-outline btn-sm" onclick="sendVisitReportEmail('+r.id+')">📧 Send visit report to sales team</button>':'')+
      (r.status==='Reviewed'&&canDo('addProject')?'<button class="btn btn-green btn-sm" onclick="convertRequestToProject('+r.id+')">➜ Convert to project(s)</button>':'')+
      '<button class="btn btn-outline btn-sm" onclick="toggleRequestTimeline('+r.id+')">⏱ '+(state.requestTimelineExpanded[r.id]?'Hide':'View')+' stage timeline</button>'+
    '</div>'+
    (state.requestTimelineExpanded[r.id]?renderRequestStageTimeline(r):''))+
  '</div>';
}
// Read-only view for Sales/Viewer — same panel, but every field disabled and no Save button,
// so the visit report and all details are visible without being editable.
export function viewRequestReadOnly(id){
  openEditRequest(id);
  setTimeout(()=>{
    document.querySelectorAll('#panel-add-request input, #panel-add-request select').forEach(el=>el.disabled=true);
    document.querySelectorAll('#panel-add-request .panel-footer button').forEach(btn=>{ if(!btn.textContent.includes('Back')&&!btn.textContent.includes('Cancel')) btn.style.display='none'; });
  },20);
}

export async function updateRequestFields(id, fields){
  const idx=state.requests.findIndex(r=>r.id===id); if(idx<0) return;
  state.requests[idx]={...state.requests[idx],...fields};
  const {error}=await db.from('requests').update(requestToRow(state.requests[idx])).eq('id',id);
  if(error) console.error('Supabase update failed',error);
  renderRequests();
  updateBell(); // refreshes both the notification count AND the Requests tab red badge —
                // without this, a status change (e.g. Visit Done) wouldn't be reflected
                // until some unrelated action happened to trigger a refresh.
}

export function acknowledgeRequest(id){
  state.ackRequestId=id;
  const supEl=document.getElementById('ack-supervisor');
  const supervisors=state.teamMembers.filter(m=>m.role==='supervisor'&&m.active);
  supEl.innerHTML=supervisors.length?supervisors.map(m=>'<option value="'+m.username+'">'+m.name+'</option>').join(''):'<option value="">No supervisors found — add one under Team</option>';
  const vendEl=document.getElementById('ack-vendor');
  vendEl.innerHTML='<option value="">— None yet —</option>'+approvedVendors().map(v=>{ const name=v.trade_name||v.company_name; return '<option value="'+name+'">'+name+'</option>'; }).join('');
  document.getElementById('ack-planned-date').value='';
  document.getElementById('ack-planned-date').min=new Date().toISOString().slice(0,10);
  document.getElementById('ack-error').classList.add('hidden');
  openPanel('panel-acknowledge');
}
export async function confirmAcknowledge(){
  const supervisor=document.getElementById('ack-supervisor').value;
  const vendor=document.getElementById('ack-vendor').value;
  const plannedDate=document.getElementById('ack-planned-date').value;
  const err=document.getElementById('ack-error');
  if(!supervisor){ err.classList.remove('hidden'); document.getElementById('ack-err-msg').textContent='Please select a supervisor.'; return; }
  if(!plannedDate){ err.classList.remove('hidden'); document.getElementById('ack-err-msg').textContent='Please select a planned visit date.'; return; }
  if(plannedDate<new Date().toISOString().slice(0,10)){ err.classList.remove('hidden'); document.getElementById('ack-err-msg').textContent='Planned visit date cannot be in the past.'; return; }
  const r=state.requests.find(x=>x.id===state.ackRequestId);
  const newDetails={...(r?r.details:{}), ackedAt:new Date().toISOString(), assignedVendor:vendor};
  await updateRequestFields(state.ackRequestId,{status:'Acknowledged', assignedSupervisor:supervisor, plannedVisitDate:plannedDate, plannedDateLocked:true, details:newDetails});
  sendAssignmentEmails(r, supervisor, vendor, plannedDate);
  closePanel('panel-acknowledge');
}
// Notifies the assigned site supervisor and (if picked) vendor by email — one professional,
// info-complete message each, sent as soon as admin assigns them to a request.
export function sendAssignmentEmails(r, supervisorUsername, vendorName, plannedDate){
  if(!r) return;
  const d=r.details||{};
  const devName=d.developerName||'—';
  const projName=d.projectNameKnown||d.projectName||'—';
  const supMember=state.teamMembers.find(m=>m.username===supervisorUsername);
  if(supMember&&supMember.email){
    const subject='New site assignment — '+devName+' — '+projName+' — '+r.requestNumber;
    const body='Hi '+supMember.name+',\n\n'+
      'You have been assigned as the site supervisor for the following request:\n\n'+
      'Request number: '+r.requestNumber+'\n'+
      'Request type: '+reqTypeLabel(r.requestType)+(r.requestSubType?' — '+r.requestSubType:'')+'\n'+
      'Developer: '+devName+'\n'+
      'Project: '+projName+'\n'+
      'Location: '+(d.locationForVisit||'—')+', '+(d.city||'—')+', '+(d.state||'—')+'\n'+
      'Client representative: '+(d.contactPerson||'—')+' ('+(d.mobile||'—')+')\n'+
      'Planned visit date: '+fmtDate(plannedDate)+'\n\n'+
      'Please plan your site visit accordingly and submit your DPR and visit report through the app once completed.\n\n'+
      'Regards,\nEcoste Installation Team';
    notifyByGmail(supMember.email, subject, body);
  }
  if(vendorName){
    const vendorProfile=state.vendorProfiles.find(v=>(v.trade_name||v.company_name)===vendorName);
    if(vendorProfile&&vendorProfile.email){
      const subject='New project assignment — '+devName+' — '+projName+' — '+r.requestNumber;
      const body='Hi '+(vendorProfile.trade_name||vendorProfile.company_name)+',\n\n'+
        'You have been assigned to the following project:\n\n'+
        'Request number: '+r.requestNumber+'\n'+
        'Developer: '+devName+'\n'+
        'Project: '+projName+'\n'+
        'Location: '+(d.locationForVisit||'—')+', '+(d.city||'—')+', '+(d.state||'—')+'\n'+
        'Scope: '+(d.scope||'—')+'\n'+
        'Framing type: '+(d.framingType||'—')+' · Section size: '+(d.sectionSize||'—')+'\n'+
        'Total qty (as per SO): '+(d.totalQtySO||'—')+'\n'+
        'Planned site visit date: '+fmtDate(plannedDate)+'\n\n'+
        'Please coordinate with our site supervisor and reach out if you need any further details.\n\n'+
        'Regards,\nEcoste Installation Team';
      notifyByGmail(vendorProfile.email, subject, body);
    }
  }
}
export function changePlannedDate(id){
  if(!state.currentUser||state.currentUser.role!=='admin'){ alert('Only Admin can change the planned date once it has been set.'); return; }
  const newDate=prompt('New planned visit date (YYYY-MM-DD)?'); if(!newDate) return;
  updateRequestFields(id,{plannedVisitDate:newDate});
}
export function advanceRequestStatus(id,newStatus){
  if(newStatus==='Visit Done'){
    const r=state.requests.find(x=>x.id===id); if(!r) return;
    const d=r.details||{};
    // Sampling requests skip the full site-visit-report rigor — only Main Order Size Survey
    // (and Pre-PO/Post-PO) require it, since sampling is a lighter-weight process.
    const isSampling=r.requestType==='sampling-survey';
    const missing=[];
    if(!isSampling){
      if(!d.visitRemarks||!d.visitRemarks.trim()) missing.push('Visit remarks / outcome');
      if(!d.measurementArea) missing.push('Measurement — area');
      // Geo-location temporarily not enforced as mandatory — browser geolocation often
      // doesn't work in sandboxed/preview testing contexts. Re-enable once live in production
      // if you want it strictly required again: if(!d.geoLocation) missing.push('Geo location (capture it on site)');
      if(!d.visitPhotoUrls||!d.visitPhotoUrls.length) missing.push('Visit photo upload');
    }
    if(missing.length){
      // Don't rely on alert() alone — some preview/embedded contexts silently swallow it,
      // which makes the button look completely broken with zero feedback. Open the actual
      // visit report form and show a visible banner right there instead.
      openEditRequest(id);
      setTimeout(()=>{
        const err=document.getElementById('req-error');
        if(err){
          err.classList.remove('hidden');
          document.getElementById('req-err-msg').textContent='Please fill in and Save these before marking the visit done: '+missing.join(', ')+'.';
          err.scrollIntoView({behavior:'smooth',block:'center'});
        }
      },30);
      return;
    }
  }
  const extra=newStatus==='Visit Done'?{actualVisitDate:new Date().toISOString().slice(0,10)}:newStatus==='Reviewed'?{reviewedAt:new Date().toISOString()}:{};
  updateRequestFields(id,{status:newStatus,...extra});
  const rForLog=state.requests.find(x=>x.id===id);
  if(rForLog){
    if(newStatus==='Visit Done') logActivity('Visit report submitted', rForLog.requestNumber+' — visit/survey marked done');
    if(newStatus==='Reviewed') logActivity('Visit report reviewed', rForLog.requestNumber+' — marked as viewed by admin');
  }
}

export function convertRequestToProject(id){
  const r=state.requests.find(x=>x.id===id); if(!r) return;
  const accessCode=r.requestNumber.replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  if(state.projects.find(p=>p.accessCode===accessCode)){ alert('A project with access code "'+accessCode+'" already exists — this request may already be converted.'); return; }
  convertRequestToProject._targetId=id;
  document.getElementById('convert-ms-planned').value=r.plannedVisitDate||new Date().toISOString().slice(0,10);
  document.getElementById('convert-ms-actual').value=r.actualVisitDate||'';
  document.getElementById('convert-error').classList.add('hidden');
  openPanel('panel-convert-request');
}
export async function confirmConvertRequestToProject(){
  const id=convertRequestToProject._targetId;
  const r=state.requests.find(x=>x.id===id); if(!r) return;
  const d=r.details||{};
  const name=d.projectName||d.developerName||('Project from '+r.requestNumber);
  const today=new Date().toISOString().slice(0,10);
  const commit=new Date(); commit.setDate(commit.getDate()+90);
  const accessCode=r.requestNumber.replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  // Auto-add the standard milestone template so the project isn't starting empty —
  // only the first milestone (the site visit that already happened) needs dates confirmed here;
  // the rest stay blank and get filled in as work progresses via Update Progress.
  const plannedDate=document.getElementById('convert-ms-planned').value||'';
  const actualDate=document.getElementById('convert-ms-actual').value||'';
  const gap=(plannedDate&&actualDate)?daysDiff(plannedDate,actualDate):null;
  const isSampling=r.requestType==='sampling-survey';
  // Order type on the resulting project follows the request type directly where it maps
  // 1:1 (mockup/post-mockup/main-order/post-main-order/sampling); visit-stage requests
  // (pre-mockup, pre-main-survey) don't set an order type yet — that gets chosen once the
  // actual order comes in.
  const orderTypeMap={'pre-mockup':'pre-mockup','mockup':'mockup','post-mockup':'post-mockup','main-order':'main','post-main-order':'post-main','sampling-survey':'sampling'};
  const orderTypeForProject=orderTypeMap[r.requestType]||'';
  const template=r.requestType==='pre-mockup'?MS_PREMOCKUP:r.requestType==='mockup'?MS_MOCKUP_STEPS:isSampling?MS_SAMPLING:r.requestType==='post-mockup'?MS_POSTMOCKUP_STEPS:r.requestType==='pre-main-survey'?MS_PREMAINSURVEY_STEPS:r.requestType==='main-order'?MS_MAINORDER_STEPS:MS_MAIN;
  const milestones=template.map((label,i)=>i===0?{label,planned:plannedDate,actual:actualDate,gap,key:milestoneKeyFor(label)}:{label,planned:'',actual:'',gap:null,key:milestoneKeyFor(label)});
  const newProj={
    accessCode, createdBy:r.createdBy||(state.currentUser?state.currentUser.username:'admin'),
    name, tower:d.towerBlock||'—', developer:d.developerName||'—', city:d.city||'—',
    state:d.state||'—', supervisor:r.assignedSupervisor||'—',
    vendor:(r.details&&r.details.assignedVendor)||'—', supervisorWA:'', status:'Not Started',
    plannedQty:parseInt(d.totalQtySO)||0, installedQty:0, raBillQty:0, raBillAmt:0, paymentCollected:0, jmrQty:0,
    constraintsOpen:0, raBillReady:false, startDate:r.plannedVisitDate||today, committedDate:commit.toISOString().slice(0,10),
    actualDate:'', driveLink:'', unit:'sqft', orderType:orderTypeForProject, vendors:[], products:[], constraints:[], milestones, comments:[],
    poQty:0, soQty:parseInt(d.totalQtySO)||0,
    salesPersonName:d.salesName||r.createdBy||'—',
    salesPersonEmail:d.salesEmail||'',
    framingMaterial:d.framingMaterial||'', sectionSize:d.sectionSize||'',
    sourceRequestType:reqTypeLabel(r.requestType)
  };
  // Create the project immediately on click — no separate "Save" step to forget or lose via back button.
  // No client-supplied id — projects.id is a real Postgres identity column, so letting the
  // database assign it atomically avoids two concurrent submissions colliding (see plan.md v2-4).
  const {data:inserted,error}=await db.from('projects').insert(projectToRow(newProj)).select().single();
  if(error){ console.error('Supabase insert failed',error); document.getElementById('convert-error').classList.remove('hidden'); document.getElementById('convert-err-msg').textContent='Could not create the project — check console.'; return; }
  const createdProject=rowToProject(inserted);
  state.projects.push(createdProject);
  await updateRequestFields(id,{status:'Converted to Project', linkedProjectId:createdProject.id, convertedAt:new Date().toISOString()});
  logActivity('Project converted', r.requestNumber+' → '+createdProject.name+' — '+createdProject.tower);
  renderMetrics(); renderProjects(); updateBell();
  closePanel('panel-convert-request');
  showSection('team'); setTab('projects');
  openEditProject(createdProject.id);
}

export function exportProjectsCSV(){
  const vp=visibleProjects();
  if(!vp.length){ alert('No projects to export.'); return; }
  const cols=['accessCode','name','tower','developer','city','state','status','supervisor','plannedQty','installedQty','jmrQty','poQty','soQty','startDate','committedDate','daysAvailable','installCommencementDate'];
  const header=['Access Code','Project Name','Tower/Block','Developer','City','State','Status','Supervisor','Planned Qty (sqft)','Installed Qty (sqft)','JMR Qty','PO Qty','SO Qty','Start Date','Committed Date','Days Available','Installation Commencement Date'];
  const rows=[header.join(',')].concat(vp.map(p=>cols.map(c=>'"'+String(p[c]||'').replace(/"/g,'""')+'"').join(',')));
  const blob=new Blob([rows.join('\n')],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='projects_export.csv'; a.click();
}

// Simple CSV parser — handles quoted fields with embedded commas.
export function parseCSV(text){
  const lines=text.split(/\r?\n/).filter(l=>l.trim());
  const parseLine=line=>{
    const out=[]; let cur=''; let inQuotes=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){ if(inQuotes&&line[i+1]==='"'){ cur+='"'; i++; } else inQuotes=!inQuotes; }
      else if(ch===','&&!inQuotes){ out.push(cur); cur=''; }
      else cur+=ch;
    }
    out.push(cur);
    return out;
  };
  const header=parseLine(lines[0]).map(h=>h.trim());
  return lines.slice(1).map(line=>{
    const vals=parseLine(line);
    const obj={};
    header.forEach((h,i)=>{ obj[h]=(vals[i]||'').trim(); });
    return obj;
  });
}

export async function importProjectsCSV(input){
  const file=input.files[0]; if(!file) return;
  const text=await file.text();
  let rows;
  try{ rows=parseCSV(text); }catch(e){ alert('Could not read that CSV file.'); return; }
  if(!rows.length){ alert('No rows found in that CSV.'); return; }
  // Expects headers matching the export format: Access Code, Project Name, Tower/Block, Developer, City, State, Status, Supervisor, Planned Qty (sqft), Installed Qty (sqft), JMR Qty, PO Qty, SO Qty, Start Date, Committed Date, Days Available, Installation Commencement Date
  if(!confirm('Import '+rows.length+' project(s) from this CSV?')) { input.value=''; return; }
  let created=0, skipped=0;
  for(const row of rows){
    const accessCode=(row['Access Code']||'').toUpperCase();
    const name=row['Project Name']||'';
    if(!accessCode||!name){ skipped++; continue; }
    if(state.projects.find(p=>p.accessCode===accessCode)){ skipped++; continue; }
    const newProj={
      accessCode, createdBy:state.currentUser?state.currentUser.username:'admin',
      name, tower:row['Tower/Block']||'—', developer:row['Developer']||'—', city:row['City']||'—', state:row['State']||'—',
      supervisor:row['Supervisor']||'—', vendor:'—', supervisorWA:'', status:row['Status']||'Not Started',
      plannedQty:parseInt(row['Planned Qty (sqft)'])||0, installedQty:parseInt(row['Installed Qty (sqft)'])||0,
      raBillQty:0, raBillAmt:0, paymentCollected:0, jmrQty:parseInt(row['JMR Qty'])||0,
      constraintsOpen:0, raBillReady:false, startDate:row['Start Date']||'', committedDate:row['Committed Date']||'',
      actualDate:'', driveLink:'', unit:'sqft', orderType:'', vendors:[], products:[], constraints:[], milestones:[], comments:[],
      poQty:parseInt(row['PO Qty'])||0, soQty:parseInt(row['SO Qty'])||0,
      daysAvailable:parseInt(row['Days Available'])||0, installCommencementDate:row['Installation Commencement Date']||''
    };
    // No client-supplied id — projects.id is a real Postgres identity column, so letting the
    // database assign it atomically avoids two concurrent submissions colliding (see plan.md v2-4).
    const {data:inserted,error}=await db.from('projects').insert(projectToRow(newProj)).select().single();
    if(error){ console.error('Supabase insert failed for row',row,error); skipped++; continue; }
    state.projects.push(rowToProject(inserted));
    created++;
  }
  input.value='';
  renderMetrics(); renderProjects(); updateBell();
  if(state.activeTab==='gantt') renderGantt();
  if(state.activeTab==='pipeline') renderPipeline();
  if(state.activeTab==='dashboard') renderDashboard();
  alert('Imported '+created+' project(s) — added to the app under All Projects, Gantt, and Pipeline.'+(skipped?' Skipped '+skipped+' (duplicate access code or missing required fields).':''));
}

export function exportRequestsCSV(){
  if(!state.requests.length){ alert('No requests to export.'); return; }
  const cols=['requestNumber','requestType','status','createdBy','assignedSupervisor','plannedVisitDate','actualVisitDate'];
  const rows=[cols.join(',')].concat(state.requests.map(r=>cols.map(c=>'"'+String(r[c]||'').replace(/"/g,'""')+'"').join(',')));
  const blob=new Blob([rows.join('\n')],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='requests_export.csv'; a.click();
}

