import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { TEST_MODE } from '../../lib/config.js';
import { syncProject } from '../../data/loadAllData.js';
import { logActivity } from '../../lib/activityLog.js';
import { CHECKLIST_DEFS, CHECKLIST_TEMPLATES, checklistDoneItems, checklistTotalItems, isChecklistActive, milestoneKeyFor, notifyJMRUpload } from '../../lib/constants.js';
import { canDo, daysDiff, fmt, fmtDate } from '../../lib/helpers.js';
import { projectToRow, rowToProject } from '../../lib/mappers.js';
import { pickFilesOrWarn, uploadFiles } from '../../lib/uploads.js';
import { updateBell } from '../alerts.js';
import { renderDashboard } from '../dashboard/dashboardTab.js';
import { approvedVendors, renderFinance } from '../finance/financeTab.js';
import { renderGantt } from '../gantt/ganttTab.js';
import { renderMetrics } from '../metrics.js';
import { closePanel, openPanel } from '../navigation.js';
import { computeDaysAvailable, renderConstraintList, renderDaysAvailable, renderExistingMilestones, renderFormMilestones, renderProductQuickPicks, renderProductRows, renderTowerRows, renderUpdateConstraints, renderVendorRows } from './formHelpers.js';
import { renderProjects } from './projectCards.js';

/* ══ ADD/EDIT PROJECT ══ */
/* ══ CHECKLIST ══ */
export function renderChecklist(){
  const el=document.getElementById('u-checklist-list'); if(!el) return;
  if(!state.currentChecklist.length){ el.innerHTML='<div style="font-size:12px;color:#888">No checklist items yet — load a template or add items below.</div>'; return; }
  el.innerHTML=state.currentChecklist.map((item,i)=>
    '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:13px">'+
      '<input type="checkbox" '+(item.done?'checked':'')+' onchange="toggleChecklistItem('+i+')">'+
      '<span style="flex:1;'+(item.done?'text-decoration:line-through;color:#888':'')+'">'+item.text+'</span>'+
      '<button onclick="removeChecklistItem('+i+')" style="background:none;border:none;cursor:pointer;color:#cc3333;font-size:16px">×</button>'+
    '</div>'
  ).join('');
}
export function loadChecklistTemplate(){
  const name=document.getElementById('u-checklist-template').value; if(!name) return;
  const items=CHECKLIST_TEMPLATES[name]||[];
  state.currentChecklist=[...state.currentChecklist, ...items.map(text=>({text,done:false}))];
  renderChecklist();
}
export function addChecklistItem(){
  const inp=document.getElementById('u-checklist-item-txt'); const t=inp.value.trim(); if(!t) return;
  state.currentChecklist.push({text:t,done:false}); inp.value=''; renderChecklist();
}
export function toggleChecklistItem(i){ state.currentChecklist[i].done=!state.currentChecklist[i].done; renderChecklist(); }
export function removeChecklistItem(i){ state.currentChecklist.splice(i,1); renderChecklist(); }

/* ══ SNAG LIST ══ */
export function renderSnagList(){
  const el=document.getElementById('u-snag-list'); if(!el) return;
  if(!state.currentSnags.length){ el.innerHTML='<div style="font-size:12px;color:#888">No snags logged yet.</div>'; return; }
  const sevColor={'Minor':'#f0a500','Major':'#cc7a00','Critical':'#cc3333'};
  const statusColor={'open':'#cc3333','in-progress':'#f0a500','resolved':'#1D9E75'};
  const statusLabel={'open':'🔴 Open','in-progress':'🟡 In Progress','resolved':'✅ Resolved'};
  const nextLabel={'open':'→ In Progress','in-progress':'→ Resolved','resolved':'→ Reopen'};
  el.innerHTML=state.currentSnags.map((s,i)=>
    '<div class="constraint-item" style="border-left:3px solid '+(statusColor[s.status]||'#888')+'">'+
      '<div style="flex:1">'+
        (s.photoUrl?'<img src="'+s.photoUrl+'" style="width:36px;height:36px;object-fit:cover;border-radius:4px;float:left;margin-right:8px">':'')+
        '<div class="c-text">'+s.description+' <span class="badge" style="background:'+sevColor[s.severity]+'22;color:'+sevColor[s.severity]+'">'+s.severity+'</span></div>'+
        '<div class="c-meta">'+(s.location||'—')+' · Raised: '+s.raisedDate+(s.resolvedDate?' · Resolved: '+s.resolvedDate:'')+' · <span style="color:'+statusColor[s.status]+';font-weight:600">'+statusLabel[s.status]+'</span></div>'+
      '</div>'+
      '<button class="btn btn-sm btn-outline" onclick="cycleSnagStatus('+i+')">'+nextLabel[s.status]+'</button>'+
    '</div>'
  ).join('');
}
export function addSnag(){
  const desc=document.getElementById('u-snag-desc').value.trim(); if(!desc) return;
  const unitsAffected=parseInt(document.getElementById('u-units-affected').value)||0;
  if(unitsAffected<=0){
    const err=document.getElementById('u-error');
    if(err){ err.classList.remove('hidden'); document.getElementById('u-err-msg').textContent='Please enter "Units affected" before adding this snag — Severity is set from that.'; err.scrollIntoView({behavior:'smooth',block:'center'}); }
    return;
  }
  state.currentSnags.push({
    description:desc,
    location:document.getElementById('u-snag-location').value.trim(),
    severity:document.getElementById('u-snag-severity').value,
    unitsAffected,
    status:'open',
    raisedDate:new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
    raisedBy:state.currentUser?state.currentUser.name:'—',
    resolvedDate:'',
    photoUrl:state.pendingSnagPhotoUrl
  });
  document.getElementById('u-snag-desc').value='';
  document.getElementById('u-snag-location').value='';
  document.getElementById('u-units-affected').value='';
  document.getElementById('u-snag-severity').disabled=true;
  document.getElementById('u-snag-photo').value='';
  document.getElementById('u-snag-photo-list').textContent='';
  state.pendingSnagPhotoUrl='';
  renderSnagList();
}
export function cycleSnagStatus(i){
  const order=['open','in-progress','resolved'];
  const cur=state.currentSnags[i].status;
  const next=order[(order.indexOf(cur)+1)%order.length];
  state.currentSnags[i].status=next;
  state.currentSnags[i].resolvedDate=next==='resolved'?new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'';
  renderSnagList();
}

/* ══ QUICK ADD SNAG (from Finance tab, All Projects, or DPR) ══ */
export function openAddSnagForProject(projId){
  const ps=document.getElementById('snag-proj');
  ps.innerHTML=state.projects.map(p=>'<option value="'+p.id+'">'+p.name+' — '+p.tower+'</option>').join('');
  if(projId) ps.value=projId;
  document.getElementById('snag-desc').value='';
  document.getElementById('snag-location').value='';
  document.getElementById('snag-severity').value='Minor';
  document.getElementById('snag-severity').disabled=true;
  document.getElementById('snag-units-affected').value='';
  document.getElementById('snag-photo').value='';
  document.getElementById('snag-photo-list').textContent='';
  state.quickSnagPhotoUrl='';
  document.getElementById('snag-error').classList.add('hidden');
  document.getElementById('snag-photo').onchange=async function(){
    const file=this.files[0]; if(!file) return;
    document.getElementById('snag-photo-list').textContent='Uploading...';
    const urls=await uploadFiles([file],'snags');
    if(urls.length){ state.quickSnagPhotoUrl=urls[0]; document.getElementById('snag-photo-list').textContent='✓ Uploaded'; }
  };
  openPanel('panel-add-snag');
}
export async function saveSnagQuick(){
  const projId=parseInt(document.getElementById('snag-proj').value);
  const desc=document.getElementById('snag-desc').value.trim();
  const err=document.getElementById('snag-error');
  if(!projId){ err.classList.remove('hidden'); document.getElementById('snag-err-msg').textContent='Please select a project.'; return; }
  if(!desc){ err.classList.remove('hidden'); document.getElementById('snag-err-msg').textContent='Please enter a description.'; return; }
  const unitsAffected=parseInt(document.getElementById('snag-units-affected').value)||0;
  if(unitsAffected<=0){ err.classList.remove('hidden'); document.getElementById('snag-err-msg').textContent='Please enter "Units affected" before saving — Severity is set from that.'; return; }
  const p=state.projects.find(x=>x.id===projId); if(!p) return;
  const newSnag={
    description:desc,
    location:document.getElementById('snag-location').value.trim(),
    severity:document.getElementById('snag-severity').value,
    unitsAffected,
    status:'open',
    raisedDate:new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
    raisedBy:state.currentUser?state.currentUser.name:'—',
    resolvedDate:'',
    photoUrl:state.quickSnagPhotoUrl
  };
  p.snags=[...(p.snags||[]),newSnag];
  const result=await syncProject(p);
  if(!result.ok){
    p.snags=p.snags.slice(0,-1); // roll back the local add since it didn't actually save
    err.classList.remove('hidden');
    document.getElementById('snag-err-msg').textContent='Could not save — check console for the exact error. (Have you run the SQL to add the "snags" column on the projects table?)';
    return;
  }
  closePanel('panel-add-snag');
  renderProjects(); renderMetrics(); updateBell();
  if(state.activeTab==='finance') renderFinance();
}

export function openAddProject(){
  alert('New projects can only be created by converting a Post-PO request. Go to the Requests tab, find the request, and click "Convert to Project" once it\'s Reviewed.');
  return;
  // Unreachable — kept only so openEditProject (which reuses this panel's reset logic
  // indirectly) still has a valid reference point if ever needed again.
  state.editingId=null; state.pendingConstraints=[];
  state.formMilestones=[]; state.formVendors=[{name:'',role:''}]; state.formProducts=[{name:'',qty:''}]; state.formTowers=[{name:''}];
  document.getElementById('proj-panel-title').textContent='Add new project';
  ['f-name','f-dev','f-city','f-state-inp','f-code','f-commit-date','f-start-date','f-drive','f-po-qty','f-so-qty'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('f-tower-count').value='1';
  document.getElementById('f-tower-count').disabled=false;
  document.getElementById('f-status-sel').value='Not Started';
  document.getElementById('f-order-type').value='';
  document.getElementById('f-ms-hint').textContent='Select order type above to load templates';
  document.getElementById('f-milestones-list').innerHTML='';
  document.getElementById('f-custom-ms-row').style.display='none';
  document.getElementById('f-error').classList.add('hidden');
  renderConstraintList('proj-constraints-list',state.pendingConstraints,'removeFormConstraint');
  renderVendorRows(); renderProductRows(); renderTowerRows();
  openPanel('panel-add-proj');
}

export async function openEditProject(id){
  // The app loads all data once at startup and never re-fetches, so this tab's local copy
  // of the project can be stale if anyone (including this same user, in another tab) saved
  // changes to it since then. Re-fetch this one project's current row before populating the
  // edit form, so it never shows out-of-date values regardless of how long this tab's been open.
  if(!TEST_MODE){
    const {data:row,error}=await db.from('projects').select('*').eq('id',id).single();
    if(!error&&row){
      const idx=state.projects.findIndex(x=>x.id===id);
      if(idx>=0) state.projects[idx]={...rowToProject(row),id};
    }
  }
  const p=state.projects.find(x=>x.id===id); if(!p) return;
  state.editingId=id; state.pendingConstraints=p.constraints.map(c=>c.text);
  state.formMilestones=(p.milestones||[]).map(m=>({label:m.label,planned:m.planned||'',actual:m.actual||'',gap:m.gap!=null?m.gap:null,selected:true}));
  state.formVendors=p.vendors&&p.vendors.length?p.vendors.map(v=>({...v})):[{name:p.vendor||'',role:''}];
  state.formProducts=p.products&&p.products.length?p.products.map(pr=>({...pr})):[{name:'',qty:String(p.plannedQty||'')}];
  state.formTowers=[{name:p.tower||''}];
  document.getElementById('proj-panel-title').textContent='Edit project';
  document.getElementById('f-name').value=p.name;
  document.getElementById('f-tower-count').value=String(p.towerCount||1);
  document.getElementById('f-dev').value=p.developer;
  document.getElementById('f-city').value=p.city;
  document.getElementById('f-state-inp').value=p.state;
  document.getElementById('f-code').value=p.accessCode;
  document.getElementById('f-status-sel').value=p.status;
  document.getElementById('f-po-qty').value=p.poQty||0;
  document.getElementById('f-so-qty').value=p.soQty||0;
  document.getElementById('f-commit-date').value=p.committedDate||'';
  document.getElementById('f-start-date').value=p.startDate||'';
  document.getElementById('f-drive').value=p.driveLink||'';
  document.getElementById('f-order-type').value=p.orderType||'';
  document.getElementById('f-po-date').value=p.poDate||'';
  renderDaysAvailable();
  document.getElementById('f-material-first-lot').value=p.materialFirstLotDate||'';
  document.getElementById('f-install-commencement').value=p.installCommencementDate||'';
  document.getElementById('f-ms-hint').textContent=state.formMilestones.length?state.formMilestones.length+' milestones loaded':'Select order type to load templates';
  document.getElementById('f-custom-ms-row').style.display='none';
  document.getElementById('f-error').classList.add('hidden');
  renderConstraintList('proj-constraints-list',state.pendingConstraints,'removeFormConstraint');
  renderFormMilestones(); renderVendorRows(); renderProductRows(); renderProductQuickPicks(); renderTowerRows();
  openPanel('panel-add-proj');
}

export async function saveProject(){
  const name=document.getElementById('f-name').value.trim();
  const code=document.getElementById('f-code').value.trim().toUpperCase();
  if(!name){ showFormErr('Project name is required.'); return; }
  if(!code){ showFormErr('Client access code is required.'); return; }
  const cObjs=state.pendingConstraints.map(t=>({text:t,status:'open',date:fmtDate(new Date().toISOString().slice(0,10))}));
  const selectedMs=state.formMilestones.filter(m=>m.selected).map(m=>({label:m.label,planned:m.planned,actual:m.actual||'',gap:m.gap!=null?m.gap:null,key:m.key||milestoneKeyFor(m.label)}));
  const vendors=state.formVendors.filter(v=>v.name.trim());
  const products=state.formProducts.filter(pr=>pr.name.trim());
  const unit='sqft';
  const totalPlanned=products.reduce((a,pr)=>a+(parseInt(pr.qty)||0),0)||0;
  const baseData={
    name,
    developer:document.getElementById('f-dev').value.trim()||'—',
    city:document.getElementById('f-city').value.trim()||'—',
    state:document.getElementById('f-state-inp').value.trim()||'—',
    vendor:vendors.map(v=>v.name).join(', ')||'—',
    vendors, products, unit,
    orderType:document.getElementById('f-order-type').value,
    poDate:document.getElementById('f-po-date').value,
    daysAvailable:computeDaysAvailable(document.getElementById('f-po-date').value,document.getElementById('f-commit-date').value)||0,
    materialFirstLotDate:document.getElementById('f-material-first-lot').value,
    installCommencementDate:document.getElementById('f-install-commencement').value,
    driveLink:document.getElementById('f-drive').value.trim(),
    status:document.getElementById('f-status-sel').value,
    plannedQty:totalPlanned,
    poQty:parseInt(document.getElementById('f-po-qty').value)||0,
    soQty:parseInt(document.getElementById('f-so-qty').value)||0,
    raBillQty:0,
    constraintsOpen:cObjs.filter(c=>c.status==='open').length,
    constraints:cObjs,
    committedDate:document.getElementById('f-commit-date').value,
    startDate:document.getElementById('f-start-date').value,
    actualDate:'',
    createdBy:state.currentUser?state.currentUser.username:'admin'
  };
  const towerCount=parseInt(document.getElementById('f-tower-count').value)||1;

  if(state.editingId){
    const existing=state.projects.find(p=>p.id===state.editingId);
    const tower=state.formTowers[0].name.trim()||'—';
    const dupe=state.projects.find(p=>p.accessCode===code&&p.id!==state.editingId);
    if(dupe){ showFormErr('Code "'+code+'" already used.'); return; }
    const data={
      ...baseData, accessCode:code, tower, towerCount,
      supervisor:existing?.supervisor||'—', supervisorWA:existing?.supervisorWA||'',
      installedQty:existing?.installedQty||0, jmrQty:existing?.jmrQty||0,
      raBillAmt:existing?.raBillAmt||0, paymentCollected:existing?.paymentCollected||0,
      raBillReady:existing?.raBillReady||false
    };
    const idx=state.projects.findIndex(p=>p.id===state.editingId);
    const previous=state.projects[idx];
    state.projects[idx]={...state.projects[idx],...data,milestones:selectedMs};
    const result=await syncProject(state.projects[idx]);
    if(!result.ok){
      state.projects[idx]=previous; // roll back the local change — it never actually reached the database
      showFormErr('Could not save — check console for the exact error. Your changes were not saved; please try again.');
      return;
    }
    closePanel('panel-add-proj');
    renderMetrics(); renderProjects(); updateBell();
    return;
  }

  // Creating new — one project per tower/block entry (usually just 1, but can be several at once)
  const towerNames=state.formTowers.map(t=>t.name.trim()).filter(Boolean);
  if(!towerNames.length) towerNames.push('—');
  // Validate all generated access codes are free before inserting any
  for(let i=0;i<towerNames.length;i++){
    const thisCode=towerNames.length>1?(code+'-'+towerNames[i].toUpperCase().replace(/[^A-Z0-9]/g,'')):code;
    if(state.projects.find(p=>p.accessCode===thisCode)){ showFormErr('Code "'+thisCode+'" already used.'); return; }
  }
  for(let i=0;i<towerNames.length;i++){
    const thisCode=towerNames.length>1?(code+'-'+towerNames[i].toUpperCase().replace(/[^A-Z0-9]/g,'')):code;
    const data={
      ...baseData, accessCode:thisCode, tower:towerNames[i], towerCount:1,
      supervisor:'—', supervisorWA:'',
      installedQty:0, jmrQty:0, raBillAmt:0, paymentCollected:0, raBillReady:false
    };
    const newProj={...data,milestones:selectedMs,comments:[]};
    // No client-supplied id — projects.id is a real Postgres identity column, so letting the
    // database assign it atomically avoids two concurrent submissions colliding (see plan.md v2-4).
    const {data:inserted,error}=await db.from('projects').insert(projectToRow(newProj)).select().single();
    if(error){ console.error('Supabase insert failed',error); showFormErr('Could not save "'+towerNames[i]+'" to database — check console.'); return; }
    state.projects.push(rowToProject(inserted));
  }
  closePanel('panel-add-proj');
  renderMetrics(); renderProjects(); updateBell();
}

export function showFormErr(msg){ document.getElementById('f-error').classList.remove('hidden'); document.getElementById('f-err-msg').textContent=msg; }

/* ══ DELETE ══ */
export function askDelete(id){ state.deletingId=id; const p=state.projects.find(x=>x.id===id); document.getElementById('confirm-msg').textContent='Delete "'+p.name+' — '+p.tower+'"?'; openPanel('panel-confirm'); }
export async function confirmDelete(){
  const {error}=await db.from('projects').delete().eq('id',state.deletingId);
  if(error){ console.error('Supabase delete failed',error); alert('Could not delete from database — check console.'); return; }
  state.projects=state.projects.filter(p=>p.id!==state.deletingId); closePanel('panel-confirm'); state.expanded={}; renderMetrics(); renderProjects(); updateBell();
}

/* ══ UPDATE ══ */
// Milestones are open to every team member regardless of role — Sales, Supervisor, Finance,
// and Dispatch Head can all log planned/actual milestone dates so each can play their part,
// while the rest of Update Progress (installed qty, vendor, finance amounts) stays properly
// gated to the roles that already had access to those specific fields.
export function openMilestonesPanel(projId){
  if(!state.currentUser){ alert('Please log in first.'); return; }
  const p=state.projects.find(x=>x.id===projId); if(!p) return;
  state.updatingId=projId;
  state.pendingMilestones=[];
  state.currentMilestones=(p.milestones||[]).map(m=>({...m}));
  document.getElementById('milestones-panel-title').textContent='Milestones — '+p.name+' '+p.tower;
  document.getElementById('dm-ms-label').value=''; document.getElementById('dm-ms-planned').value=''; document.getElementById('dm-ms-actual').value='';
  document.getElementById('dm-add-milestone-card').classList.toggle('hidden', !canDo('addMilestone'));
  renderExistingMilestonesStandalone();
  renderPendingMsStandalone();
  openPanel('panel-edit-milestones');
}
// Dedicated milestone-panel renderers — separate from the ones used inside Update Progress,
// since they target different (previously colliding) element IDs. Both read/write the
// same shared state (currentMilestones/pendingMilestones), so behavior stays identical.
export function renderExistingMilestonesStandalone(){
  const el=document.getElementById('dm-existing-ms-list'); if(!el) return;
  if(!state.currentMilestones.length){ el.innerHTML='<div style="font-size:12px;color:#888">No milestones yet.</div>'; return; }
  el.innerHTML=
    '<div style="display:flex;gap:8px;padding:4px 0 6px;border-bottom:2px solid #e0e0e0;font-size:11px;font-weight:600;color:#666;margin-bottom:4px">'+
      '<div style="flex:2">Milestone</div><div style="width:140px;text-align:center">📅 Planned</div><div style="width:140px;text-align:center">✅ Actual</div><div style="width:60px;text-align:center">Gap</div>'+
    '</div>'+
    state.currentMilestones.map((m,i)=>{
      let gapLabel='Pending', gapColor='#888';
      if(m.planned&&m.actual){
        const g=Math.round((new Date(m.actual)-new Date(m.planned))/86400000);
        gapLabel=g===0?'On time':g<0?Math.abs(g)+'d early':g+'d late';
        gapColor=g<0?'#1a5e2a':g>0?'#cc3333':'#444';
      }
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0">'+
        '<div style="flex:2;font-size:12px">'+m.label+'</div>'+
        '<input type="date" class="form-input" style="width:140px;padding:4px 8px;font-size:12px" value="'+(m.planned||'')+'" onchange="updateExistingMilestoneStandalone('+i+',\'planned\',this.value)">'+
        '<input type="date" class="form-input" style="width:140px;padding:4px 8px;font-size:12px;'+(m.actual?'border-color:#1D9E75;background:#f0faf6':'')+'" value="'+(m.actual||'')+'" onchange="updateExistingMilestoneStandalone('+i+',\'actual\',this.value)">'+
        '<div style="width:60px;text-align:center;font-size:11px;font-weight:600;color:'+gapColor+'">'+gapLabel+'</div>'+
      '</div>';
    }).join('');
}
export function updateExistingMilestoneStandalone(i,field,value){
  state.currentMilestones[i][field]=value;
  if(state.currentMilestones[i].planned&&state.currentMilestones[i].actual){
    state.currentMilestones[i].gap=Math.round((new Date(state.currentMilestones[i].actual)-new Date(state.currentMilestones[i].planned))/86400000);
  } else state.currentMilestones[i].gap=null;
  renderExistingMilestonesStandalone();
}
export function addMilestoneStandalone(){
  if(!canDo('addMilestone')){ alert('You do not have permission to add new milestones — you can still edit the planned/actual dates on existing ones.'); return; }
  const lbl=document.getElementById('dm-ms-label').value.trim();
  const planned=document.getElementById('dm-ms-planned').value;
  const actual=document.getElementById('dm-ms-actual').value;
  if(!lbl) return;
  const gap=planned&&actual?daysDiff(planned,actual):null;
  state.pendingMilestones.push({label:lbl,planned,actual,gap,key:milestoneKeyFor(lbl)});
  renderPendingMsStandalone();
  document.getElementById('dm-ms-label').value=''; document.getElementById('dm-ms-planned').value=''; document.getElementById('dm-ms-actual').value='';
}
export function renderPendingMsStandalone(){
  const el=document.getElementById('dm-ms-list'); if(!el) return;
  el.innerHTML=state.pendingMilestones.map((m,i)=>
    '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:#f5f5f3;border-radius:6px;font-size:12px">'+
      '<div style="flex:1">'+m.label+' — Planned: '+(m.planned?fmtDate(m.planned):'—')+(m.actual?' · Actual: '+fmtDate(m.actual):'')+'</div>'+
      '<button onclick="pendingMilestones.splice('+i+',1);renderPendingMsStandalone()" style="background:none;border:none;cursor:pointer;color:#cc3333;font-size:16px">×</button>'+
    '</div>'
  ).join('');
}
export async function saveMilestonesOnly(){
  const idx=state.projects.findIndex(p=>p.id===state.updatingId); if(idx<0) return;
  const newOnes=canDo('addMilestone')?state.pendingMilestones:[];
  state.projects[idx].milestones=[...state.currentMilestones,...newOnes];
  const result=await syncProject(state.projects[idx]);
  if(!result.ok){ alert('Could not save — check console.'); return; }
  closePanel('panel-edit-milestones');
  renderProjects(); renderMetrics();
  if(state.activeTab==='gantt') renderGantt();
}
export function openUpdate(id){
  if(!state.currentUser){ alert('Please log in first.'); return; }
  // Milestone editing is now open to the whole team (per request) — everything else in
  // this panel (installed qty, supervisor, vendor, finance fields) stays individually
  // gated by its own canDo() check further down, so this only widens milestone access.
  const p=state.projects.find(x=>x.id===id); if(!p) return;
  state.updatingId=id; state.pendingMilestones=[];
  state.currentMilestones=(p.milestones||[]).map(m=>({...m}));
  state.currentSnags=(p.snags||[]).map(s=>({...s}));
  state.pendingSnagPhotoUrl='';
  document.getElementById('u-snag-desc').value='';
  document.getElementById('u-snag-location').value='';
  document.getElementById('u-units-affected').value='';
  document.getElementById('u-snag-severity').disabled=true;
  document.getElementById('u-snag-photo').value='';
  document.getElementById('u-snag-photo-list').textContent='';
  document.getElementById('u-snag-photo').onchange=async function(){
    const file=this.files[0]; if(!file) return;
    document.getElementById('u-snag-photo-list').textContent='Uploading...';
    const urls=await uploadFiles([file],'snags');
    if(urls.length){ state.pendingSnagPhotoUrl=urls[0]; document.getElementById('u-snag-photo-list').textContent='✓ Uploaded'; }
  };
  renderSnagList();
  renderExistingMilestones();
  document.getElementById('update-panel-title').textContent='Update — '+p.name+' '+p.tower;
  const supEl=document.getElementById('u-supervisor');
  const supervisorOptions=state.teamMembers.filter(m=>m.role==='supervisor'&&m.active);
  supEl.innerHTML='<option value="">— Unassigned —</option>'+supervisorOptions.map(m=>'<option value="'+m.username+'">'+m.name+'</option>').join('');
  const currentSupMatch=supervisorOptions.find(m=>m.username===p.supervisor||m.name===p.supervisor);
  supEl.value=currentSupMatch?currentSupMatch.username:'';
  const uVendEl=document.getElementById('u-vendor');
  uVendEl.innerHTML='<option value="">— Unassigned —</option>'+approvedVendors().map(v=>{ const name=v.trade_name||v.company_name; return '<option '+((p.vendor===name)?'selected':'')+'>'+name+'</option>'; }).join('');
  if(p.vendor&&p.vendor!=='—'&&!approvedVendors().some(v=>(v.trade_name||v.company_name)===p.vendor)){
    uVendEl.innerHTML+='<option selected>'+p.vendor+'</option>'; // preserve an existing free-text/legacy vendor value
  }
  const uCreatedByEl=document.getElementById('u-created-by');
  const salesMembers=state.teamMembers.filter(m=>m.role==='viewer');
  uCreatedByEl.innerHTML=salesMembers.map(m=>'<option value="'+m.username+'" '+(p.createdBy===m.username?'selected':'')+'>'+m.name+'</option>').join('');
  if(!salesMembers.some(m=>m.username===p.createdBy)){
    uCreatedByEl.innerHTML+='<option value="'+p.createdBy+'" selected>'+p.createdBy+' (current)</option>';
  }
  document.getElementById('u-installed').value=p.installedQty;
  document.getElementById('u-jmr').value=p.jmrQty;
  document.getElementById('u-status').value=p.status;
  document.getElementById('u-bill-amt').value=p.raBillAmt;
  document.getElementById('u-paid').value=p.paymentCollected;
  document.getElementById('u-bill-qty').value=p.raBillQty||0;
  document.getElementById('u-ra-ready').value=p.raBillReady?'true':'false';
  document.getElementById('u-actual-date').value=p.actualDate||'';
  document.getElementById('u-ms-label').value='';
  document.getElementById('u-ms-planned').value='';
  document.getElementById('u-ms-actual').value='';
  document.getElementById('u-ms-list').innerHTML='';
  document.getElementById('u-constraint-txt').value='';
  document.getElementById('u-jmr-files').value='';
  document.getElementById('u-jmr-files-list').textContent='';
  state.jmrUploadedUrls=[];
  document.getElementById('u-jmr-files').onchange=async function(){
    const files=pickFilesOrWarn(this,5); if(!files) return;
    document.getElementById('u-jmr-files-list').textContent='Uploading '+files.length+' file(s)...';
    const urls=await uploadFiles(files,'jmr-reports');
    state.jmrUploadedUrls=[...state.jmrUploadedUrls,...urls];
    document.getElementById('u-jmr-files-list').textContent=state.jmrUploadedUrls.length+' file(s) uploaded.';
    notifyJMRUpload(p, urls);
  };
  const canInstall=canDo('updateProgress');
  const canFin=canDo('editFinance');
  const sections={install:canInstall,finance:canFin,constraint:canInstall,milestone:canInstall};
  Object.entries(sections).forEach(([s,show])=>{ const el=document.getElementById('u-'+s+'-section'); if(el) el.style.display=show?'':'none'; });
  renderUpdateConstraints(p);
  state.currentChecklist=[...(p.checklist||[])];
  openPanel('panel-update');
}

export function addMilestone(){
  if(!canDo('addMilestone')){ alert('You do not have permission to add new milestones — you can still edit the planned/actual dates on existing ones.'); return; }
  const lbl=document.getElementById('u-ms-label').value.trim();
  const planned=document.getElementById('u-ms-planned').value;
  const actual=document.getElementById('u-ms-actual').value;
  if(!lbl) return;
  const gap=planned&&actual?daysDiff(planned,actual):null;
  state.pendingMilestones.push({label:lbl,planned,actual,gap,key:milestoneKeyFor(lbl)});
  renderPendingMs();
  document.getElementById('u-ms-label').value=''; document.getElementById('u-ms-planned').value=''; document.getElementById('u-ms-actual').value='';
}

export function renderPendingMs(){
  document.getElementById('u-ms-list').innerHTML=state.pendingMilestones.map((m,i)=>
    '<div style="display:flex;align-items:center;gap:8px;background:#f5f5f3;border:1px solid #e0e0e0;border-radius:6px;padding:6px 10px;font-size:12px">'+
      '<div style="flex:1">'+m.label+'</div>'+
      '<div style="color:#666">'+fmtDate(m.actual||m.planned)+'</div>'+
      '<div style="font-weight:600;min-width:52px;text-align:right;color:'+(m.gap===null?'#888':m.gap<0?'#1a5e2a':m.gap>0?'#cc3333':'#444')+'">'+
        (m.gap===null?'Pending':m.gap===0?'On time':m.gap<0?Math.abs(m.gap)+'d early':m.gap+'d late')+
      '</div>'+
      '<button onclick="pendingMilestones.splice('+i+',1);renderPendingMs()" style="background:none;border:none;cursor:pointer;color:#cc3333;font-size:16px">×</button>'+
    '</div>'
  ).join('');
}

export async function saveUpdate(){
  const idx=state.projects.findIndex(p=>p.id===state.updatingId); if(idx<0) return;
  const p=state.projects[idx];
  const installed=parseInt(document.getElementById('u-installed').value)||0;
  const newStatus=document.getElementById('u-status').value;
  const err=document.getElementById('u-error');
  err.classList.add('hidden');
  // Guard rail: a project can't be marked Completed unless the installed qty actually
  // reaches the planned qty, AND the Handover checklist (if attached) is fully ticked off.
  // This stops a project from being marked done while work or handover steps are still open.
  if(newStatus==='Completed'){
    if(p.plannedQty>0&&installed<p.plannedQty){
      err.classList.remove('hidden');
      document.getElementById('u-err-msg').textContent='Cannot mark Completed — installed qty ('+installed+') is still less than planned qty ('+p.plannedQty+'). Update installed qty to match first.';
      return;
    }
    const handoverDef=CHECKLIST_DEFS.find(d=>d.key==='handover');
    if(isChecklistActive(handoverDef,p)){
      const handoverTotal=checklistTotalItems(handoverDef);
      const handoverDone=checklistDoneItems(handoverDef,p.handoverChecklist);
      if(handoverDone<handoverTotal){
        err.classList.remove('hidden');
        document.getElementById('u-err-msg').textContent='Cannot mark Completed — the Handover Checklist isn\'t finished yet ('+handoverDone+'/'+handoverTotal+' items done). Fill it in via the DPR tab first.';
        return;
      }
    } else if((p.milestones||[]).some(m=>m.key==='payment-received-closed')){
      // The milestone exists on this project's template but hasn't been marked done yet —
      // that's the actual prerequisite blocking the Handover Checklist from even appearing.
      err.classList.remove('hidden');
      document.getElementById('u-err-msg').textContent='Cannot mark Completed — mark the "Payment received from customer and project closed" milestone done first. That unlocks the Handover Checklist, which then needs to be filled in via DPR before Completing.';
      return;
    }
    // If the project's milestone template doesn't include that milestone at all (not a
    // Main Order project), the Handover Checklist was never reachable — don't block
    // Completion on something that can never be filled in.
  }
  const jmr=parseInt(document.getElementById('u-jmr').value)||0;
  const billAmt=parseInt(document.getElementById('u-bill-amt').value)||0;
  const paid=parseInt(document.getElementById('u-paid').value)||0;
  const billQty=parseInt(document.getElementById('u-bill-qty').value)||0;
  const oldJmr=p.jmrQty||0;
  const newJmr=canDo('updateProgress')?jmr:oldJmr;
  // Per the workflow doc: "RA bill to be generated as many times as JMR is updated" —
  // every time JMR qty goes up, that's automatically logged as another RA bill instance.
  let raBillHistory=p.raBillHistory||[];
  if(newJmr>oldJmr){
    logActivity('JMR updated', p.name+' — '+p.tower+' — JMR qty now '+newJmr);
    // RA bill is no longer auto-generated from a JMR update — that trigger moved to
    // WCC upload + quantity update in the DPR instead (see saveDPR).
  }
  state.projects[idx]={
    ...p,
    supervisor:canDo('updateProgress')?(document.getElementById('u-supervisor').value.trim()||p.supervisor):p.supervisor,
    vendor:canDo('updateProgress')?(document.getElementById('u-vendor').value||'—'):p.vendor,
    createdBy:canDo('updateProgress')?(document.getElementById('u-created-by').value||p.createdBy):p.createdBy,
    installedQty:canDo('updateProgress')?installed:p.installedQty,
    jmrQty:newJmr,
    raBillHistory,
    jmrDocs:state.jmrUploadedUrls.length?[...(p.jmrDocs||[]),...state.jmrUploadedUrls]:(p.jmrDocs||[]),
    checklist:state.currentChecklist,
    snags:state.currentSnags,
    status:canDo('updateProgress')?document.getElementById('u-status').value:p.status,
    actualDate:canDo('updateProgress')?document.getElementById('u-actual-date').value:p.actualDate,
    raBillAmt:canDo('editFinance')?billAmt:p.raBillAmt,
    paymentCollected:canDo('editFinance')?paid:p.paymentCollected,
    raBillQty:canDo('editFinance')?billQty:p.raBillQty,
    raBillReady:canDo('editFinance')?(document.getElementById('u-ra-ready').value==='true'):p.raBillReady,
    // Whenever someone with Finance access saves here, mark that they've reviewed figures
    // at this JMR level — this is what "Finance section reviewed since last JMR update" means.
    financeLastReviewedJmr:canDo('editFinance')?newJmr:p.financeLastReviewedJmr,
    constraintsOpen:p.constraints.filter(c=>c.status==='open').length,
    milestones:[...state.currentMilestones,...state.pendingMilestones]
  };
  if(p.status!=='Completed'&&state.projects[idx].status==='Completed') logActivity('Project completed', p.name+' — '+p.tower);
  if((p.raBillAmt||0)===0&&billAmt>0) logActivity('RA bill amount set', p.name+' — '+p.tower+' — ₹'+fmt(billAmt));
  if(p.status==='Not Started'&&state.projects[idx].status==='In Progress') logActivity('Installation started', p.name+' — '+p.tower);
  await syncProject(state.projects[idx]);
  closePanel('panel-update'); renderMetrics(); renderProjects(); updateBell();
  if(state.activeTab==='finance') renderFinance();
  if(state.activeTab==='dashboard') renderDashboard();
}

/* ══ COMMENTS ══ */
export function addComment(id){
  const inp=document.getElementById('ci-'+id); if(!inp||!inp.value.trim()) return;
  const p=state.projects.find(x=>x.id===id); if(!p) return;
  const author=state.currentUser?state.currentUser.name.split(' ')[0]:'Team';
  p.comments.push({author,text:inp.value.trim(),time:new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})});
  syncProject(p);
  state.expanded[id]=true; renderProjects();
}

