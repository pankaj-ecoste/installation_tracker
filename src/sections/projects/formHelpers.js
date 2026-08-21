import { state } from '../../lib/state.js';
import { syncProject } from '../../data/loadAllData.js';
import { logActivity } from '../../lib/activityLog.js';
import { MS_MAIN, MS_MAINORDER_STEPS, MS_MOCKUP_STEPS, MS_POSTMOCKUP_STEPS, MS_PREMAINSURVEY_STEPS, MS_PREMOCKUP, MS_SAMPLING, getAdminEmail, gmailComposeLink, milestoneKeyFor } from '../../lib/constants.js';
import { updateBell } from '../alerts.js';
import { renderFinance } from '../finance/financeTab.js';
import { renderMetrics } from '../metrics.js';
import { renderProjects } from './projectCards.js';

/* ══ DAYS AVAILABLE (auto-calculated from PO Date → Committed Completion) ══ */
export function computeDaysAvailable(poDate,committedDate){
  if(!poDate||!committedDate) return '';
  return Math.max(0,Math.round((new Date(committedDate)-new Date(poDate))/86400000));
}
export function renderDaysAvailable(){
  const el=document.getElementById('f-days-available'); if(!el) return;
  el.value=computeDaysAvailable(document.getElementById('f-po-date').value,document.getElementById('f-commit-date').value);
}

/* ══ MILESTONE TEMPLATES ══ */
export function onOrderTypeChange(){
  const type=document.getElementById('f-order-type').value;
  const hint=document.getElementById('f-ms-hint');
  if(!type){ hint.textContent='Select order type above to load templates'; state.formMilestones=[]; renderFormMilestones(); return; }
  const templates=type==='pre-mockup'?MS_PREMOCKUP:type==='mockup'?MS_MOCKUP_STEPS:type==='post-mockup'?MS_POSTMOCKUP_STEPS:type==='pre-main'?MS_PREMAINSURVEY_STEPS:type==='main'?MS_MAINORDER_STEPS:type==='sampling'?MS_SAMPLING:MS_MAIN;
  state.formMilestones=templates.map(label=>({label,planned:'',selected:true,key:milestoneKeyFor(label)}));
  hint.textContent=templates.length+' standard milestones loaded — set dates or uncheck to skip';
  renderFormMilestones();
}

export function renderFormMilestones(){
  const list=document.getElementById('f-milestones-list');
  if(!list) return;
  if(!state.formMilestones.length){ list.innerHTML='<div style="font-size:12px;color:#888">No milestones added yet.</div>'; return; }
  // header row
  list.innerHTML=
    '<div class="ms-row" style="display:flex;gap:8px;padding:4px 0 6px;border-bottom:2px solid #e0e0e0;font-size:11px;font-weight:600;color:#666;margin-bottom:4px">'+
      '<div style="width:20px;flex-shrink:0"></div>'+
      '<div class="ms-label" style="flex:2">Milestone</div>'+
      '<div style="width:140px;flex-shrink:0;text-align:center">📅 Planned date</div>'+
      '<div style="width:140px;flex-shrink:0;text-align:center">✅ Actual date</div>'+
      '<div style="width:60px;flex-shrink:0;text-align:center">Gap</div>'+
      '<div style="width:20px;flex-shrink:0"></div>'+
    '</div>'+
    state.formMilestones.map((m,i)=>{
      // compute gap if both dates exist
      let gapLabel='—', gapColor='#888';
      if(m.planned && m.actual){
        const g=Math.round((new Date(m.actual)-new Date(m.planned))/86400000);
        gapLabel=g===0?'On time':g<0?Math.abs(g)+'d early':g+'d late';
        gapColor=g<0?'#1a5e2a':g>0?'#cc3333':'#444';
        m.gap=g;
      } else { m.gap=null; }
      return '<div class="ms-row" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0">'+
        '<input type="checkbox" '+(m.selected?'checked':'')+' onchange="formMilestones['+i+'].selected=this.checked;renderFormMilestones()" style="width:16px;flex-shrink:0">'+
        '<div class="ms-label" style="flex:2;font-size:12px;color:'+(m.selected?'#1a1a1a':'#aaa')+'">'+m.label+'</div>'+
        '<input type="date" class="form-input ms-date" style="width:140px;padding:4px 8px;font-size:12px;flex-shrink:0" value="'+m.planned+'" '+(m.selected?'':'disabled')+' onchange="formMilestones['+i+'].planned=this.value;renderFormMilestones()">'+
        '<input type="date" class="form-input ms-date" style="width:140px;padding:4px 8px;font-size:12px;flex-shrink:0;'+(m.actual?'border-color:#1D9E75;background:#f0faf6':'')+'" value="'+(m.actual||'')+'" '+(m.selected?'':'disabled')+' onchange="formMilestones['+i+'].actual=this.value;renderFormMilestones()" placeholder="Leave blank if not done">'+
        '<div style="width:60px;flex-shrink:0;text-align:center;font-size:11px;font-weight:600;color:'+gapColor+'">'+gapLabel+'</div>'+
        '<button onclick="formMilestones.splice('+i+',1);renderFormMilestones()" style="background:none;border:none;cursor:pointer;color:#cc3333;font-size:16px;width:20px;flex-shrink:0;padding:0">×</button>'+
      '</div>';
    }).join('');
}

// Editable list of milestones that already exist on the project — this is what was
// missing before: there was only a way to ADD new milestones, never edit the Actual
// date on ones already there (like the auto-created template from converting a request).
export function renderExistingMilestones(){
  const el=document.getElementById('u-existing-ms-list'); if(!el) return;
  if(!state.currentMilestones.length){ el.innerHTML='<div style="font-size:12px;color:#888">No milestones yet.</div>'; return; }
  el.innerHTML=
    '<div class="ms-row" style="display:flex;gap:8px;padding:4px 0 6px;border-bottom:2px solid #e0e0e0;font-size:11px;font-weight:600;color:#666;margin-bottom:4px">'+
      '<div class="ms-label" style="flex:2">Milestone</div><div style="width:140px;text-align:center">📅 Planned</div><div style="width:140px;text-align:center">✅ Actual</div><div style="width:60px;text-align:center">Gap</div>'+
    '</div>'+
    state.currentMilestones.map((m,i)=>{
      let gapLabel='Pending', gapColor='#888';
      if(m.planned&&m.actual){
        const g=Math.round((new Date(m.actual)-new Date(m.planned))/86400000);
        gapLabel=g===0?'On time':g<0?Math.abs(g)+'d early':g+'d late';
        gapColor=g<0?'#1a5e2a':g>0?'#cc3333':'#444';
      }
      return '<div class="ms-row" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0">'+
        '<div class="ms-label" style="flex:2;font-size:12px">'+m.label+'</div>'+
        '<input type="date" class="form-input ms-date" style="width:140px;padding:4px 8px;font-size:12px" value="'+(m.planned||'')+'" onchange="updateExistingMilestone('+i+',\'planned\',this.value)">'+
        '<input type="date" class="form-input ms-date" style="width:140px;padding:4px 8px;font-size:12px;'+(m.actual?'border-color:#1D9E75;background:#f0faf6':'')+'" value="'+(m.actual||'')+'" onchange="updateExistingMilestone('+i+',\'actual\',this.value)">'+
        '<div style="width:60px;text-align:center;font-size:11px;font-weight:600;color:'+gapColor+'">'+gapLabel+'</div>'+
      '</div>';
    }).join('');
}
export function updateExistingMilestone(i,field,value){
  state.currentMilestones[i][field]=value;
  if(state.currentMilestones[i].planned&&state.currentMilestones[i].actual){
    state.currentMilestones[i].gap=Math.round((new Date(state.currentMilestones[i].actual)-new Date(state.currentMilestones[i].planned))/86400000);
  } else state.currentMilestones[i].gap=null;
  renderExistingMilestones();
}
export function addMilestoneToForm(){ document.getElementById('f-custom-ms-row').style.display=''; document.getElementById('f-ms-label').value=''; document.getElementById('f-ms-planned').value=''; }
export function confirmAddMilestoneToForm(){
  const label=document.getElementById('f-ms-label').value.trim(); if(!label) return;
  state.formMilestones.push({label,planned:document.getElementById('f-ms-planned').value,selected:true});
  document.getElementById('f-custom-ms-row').style.display='none';
  renderFormMilestones();
}

/* ══ VENDOR ROWS ══ */
export function renderTowerRows(){
  const list=document.getElementById('f-towers-list'); if(!list) return;
  if(state.editingId){
    // Editing an existing project — it already IS one tower/block row, so the count field above
    // is just an editable reference number now (no side effects) and never drives row generation.
    list.innerHTML='<div class="form-group"><label class="form-label">Tower / Block</label><input class="form-input" placeholder="e.g. B-Wing" value="'+(state.formTowers[0]?state.formTowers[0].name:'')+'" oninput="formTowers[0].name=this.value"></div>';
    return;
  }
  const count=Math.max(1,parseInt(document.getElementById('f-tower-count').value)||1);
  // resize formTowers to match count, defaulting new entries to "Tower N"
  while(state.formTowers.length<count) state.formTowers.push({name:'Tower '+(state.formTowers.length+1)});
  while(state.formTowers.length>count) state.formTowers.pop();
  if(count===1){
    list.innerHTML='<div class="form-group"><label class="form-label">Tower / Block</label><input class="form-input" placeholder="e.g. B-Wing" value="'+state.formTowers[0].name+'" oninput="formTowers[0].name=this.value"></div>';
  } else {
    list.innerHTML='<div style="font-size:11px;color:#888;margin-bottom:6px">This will create '+count+' separate sub-projects (one per tower/block), each starting as "Not Started".</div>'+
      state.formTowers.map((t,i)=>'<input class="form-input" style="margin-bottom:6px" placeholder="Tower '+(i+1)+'" value="'+t.name+'" oninput="formTowers['+i+'].name=this.value">').join('');
  }
}
export function renderVendorRows(){
  const list=document.getElementById('f-vendors-list'); if(!list) return;
  list.innerHTML=state.formVendors.map((v,i)=>
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">'+
      '<input class="form-input" style="flex:2" placeholder="Vendor name" value="'+v.name+'" oninput="formVendors['+i+'].name=this.value">'+
      '<input class="form-input" style="flex:1" placeholder="Role (e.g. Civil)" value="'+v.role+'" oninput="formVendors['+i+'].role=this.value">'+
      (state.formVendors.length>1?'<button onclick="formVendors.splice('+i+',1);renderVendorRows()" style="background:none;border:none;cursor:pointer;color:#cc3333;font-size:18px;flex-shrink:0">×</button>':'<span style="width:22px"></span>')+
    '</div>'
  ).join('');
}
export function addVendorRow(){ if(state.formVendors.length>=5) return; state.formVendors.push({name:'',role:''}); renderVendorRows(); }

/* ══ PRODUCT ROWS ══ */
// Standard product sizes — quick-add buttons so you don't have to type "18mm Board" etc.
// every time. "+ Add product" still covers anything custom/non-standard.
export const STANDARD_PRODUCT_SIZES=['18mm','12mm','8mm','24mm'];
export const STANDARD_PRODUCT_TYPES=['Board','Grille'];
export const FRAME_TYPES=['MS Frame','Aluminum Frame','GI Frame'];
export function renderProductQuickPicks(){
  const el=document.getElementById('f-product-quickpicks'); if(!el) return;
  const combos=[];
  STANDARD_PRODUCT_SIZES.forEach(size=>STANDARD_PRODUCT_TYPES.forEach(t=>combos.push(size+' '+t)));
  combos.push(...FRAME_TYPES);
  el.innerHTML=combos.map(name=>'<button type="button" class="btn btn-outline btn-sm" onclick="quickAddProduct(\''+name+'\')">+ '+name+'</button>').join('');
}
export function quickAddProduct(name){
  // Fill the first empty row if there is one, otherwise add a new row.
  const emptyIdx=state.formProducts.findIndex(p=>!p.name.trim());
  if(emptyIdx>=0) state.formProducts[emptyIdx].name=name;
  else state.formProducts.push({name,qty:''});
  renderProductRows();
}
export function renderProductRows(){
  const list=document.getElementById('f-products-list'); if(!list) return;
  const unit='sqft';
  list.innerHTML=state.formProducts.map((pr,i)=>
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">'+
      '<input class="form-input" style="flex:2" placeholder="Product name (e.g. 18mm Jali)" value="'+pr.name+'" oninput="formProducts['+i+'].name=this.value">'+
      '<input class="form-input" type="number" style="flex:1" placeholder="Qty" value="'+pr.qty+'" oninput="formProducts['+i+'].qty=this.value" min="0">'+
      '<span style="font-size:12px;color:#666;flex-shrink:0;white-space:nowrap">'+unit+'</span>'+
      (state.formProducts.length>1?'<button onclick="formProducts.splice('+i+',1);renderProductRows()" style="background:none;border:none;cursor:pointer;color:#cc3333;font-size:18px;flex-shrink:0">×</button>':'<span style="width:22px"></span>')+
    '</div>'
  ).join('');
}
export function addProductRow(){ state.formProducts.push({name:'',qty:''}); renderProductRows(); }

/* ══ CONSTRAINTS ══ */
export function renderConstraintList(cid,list,removeFn){
  const el=document.getElementById(cid); if(!el) return;
  if(!list.length){ el.innerHTML='<div style="font-size:12px;color:#888;padding:4px 0">No constraints added.</div>'; return; }
  el.innerHTML=list.map((c,i)=>'<div style="display:flex;align-items:center;gap:8px;background:#fff3cd;border:1px solid #f0d080;border-radius:6px;padding:7px 10px;margin-bottom:6px;font-size:12px"><span style="flex:1">⚠ '+c+'</span><button onclick="'+removeFn+'('+i+')" style="background:none;border:none;cursor:pointer;color:#cc3333;font-size:16px">×</button></div>').join('');
}
export function addConstraintToForm(){ const inp=document.getElementById('f-constraint-txt'); const t=inp.value.trim(); if(!t) return; state.pendingConstraints.push(t); inp.value=''; renderConstraintList('proj-constraints-list',state.pendingConstraints,'removeFormConstraint'); }
export function removeFormConstraint(i){ state.pendingConstraints.splice(i,1); renderConstraintList('proj-constraints-list',state.pendingConstraints,'removeFormConstraint'); }
export function addDPRConstraint(){ const inp=document.getElementById('dpr-constraint-txt'); const t=inp.value.trim(); if(!t) return; state.dprPendingConstraints.push(t); inp.value=''; renderConstraintList('dpr-constraints-list',state.dprPendingConstraints,'removeDPRConstraint'); }
export function removeDPRConstraint(i){ state.dprPendingConstraints.splice(i,1); renderConstraintList('dpr-constraints-list',state.dprPendingConstraints,'removeDPRConstraint'); }
export function toggleNoConstraints(){ const c=document.getElementById('dpr-no-constraints').checked; document.getElementById('dpr-constraint-txt').disabled=c; if(c){ state.dprPendingConstraints=[]; renderConstraintList('dpr-constraints-list',state.dprPendingConstraints,'removeDPRConstraint'); }}
export function addUpdateConstraint(){ const inp=document.getElementById('u-constraint-txt'); const t=inp.value.trim(); if(!t) return; const p=state.projects.find(x=>x.id===state.updatingId); if(!p) return; p.constraints.push({text:t,status:'open',date:new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),nextAction:'',solvedDate:''}); inp.value=''; renderUpdateConstraints(p); logActivity('Constraint added', p.name+' — '+p.tower+' — '+t); }
export function cycleConstraintStatus(projId,idx){
  const p=state.projects.find(x=>x.id===projId); if(!p) return;
  const order=['open','in-progress','solved']; const cur=p.constraints[idx].status;
  const next=order[(order.indexOf(cur)+1)%order.length];
  p.constraints[idx].status=next;
  // Auto-track the solved date when a constraint ticket is closed out — cleared again if reopened.
  if(next==='solved') p.constraints[idx].solvedDate=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  else p.constraints[idx].solvedDate='';
  p.constraintsOpen=p.constraints.filter(c=>c.status==='open').length;
  syncProject(p); renderUpdateConstraints(p); updateBell(); renderMetrics(); renderProjects();
}
export function editConstraintNextAction(projId,idx){
  const p=state.projects.find(x=>x.id===projId); if(!p) return;
  const val=prompt('Next action for this constraint:', p.constraints[idx].nextAction||'');
  if(val===null) return;
  p.constraints[idx].nextAction=val.trim();
  syncProject(p); renderUpdateConstraints(p);
}
export function renderUpdateConstraints(p){
  const el=document.getElementById('u-constraints-list'); if(!el) return;
  if(!p.constraints.length){ el.innerHTML='<div style="font-size:12px;color:#888">No constraints.</div>'; return; }
  const sColor={'open':'#cc3333','in-progress':'#f0a500','solved':'#1D9E75'};
  const sLabel={'open':'Open','in-progress':'In Progress','solved':'Solved'};
  const sEmoji={'open':'🔴','in-progress':'🟡','solved':'✅'};
  const nLabel={'open':'→ In Progress','in-progress':'→ Solved','solved':'→ Reopen'};
  el.innerHTML=p.constraints.map((c,i)=>
    '<div class="constraint-item '+(c.status==='open'?'open-c':c.status==='in-progress'?'in-progress-c':'solved-c')+'" style="flex-wrap:wrap">'+
      '<div style="flex:1;min-width:200px">'+
        '<div class="c-text">'+sEmoji[c.status]+' '+c.text+'</div>'+
        '<div class="c-meta">Date raised: '+c.date+(c.solvedDate?' · Solved: '+c.solvedDate:'')+' · <span style="color:'+sColor[c.status]+';font-weight:600">'+sLabel[c.status]+'</span></div>'+
        '<div class="c-meta" style="margin-top:2px">Next action: <span style="color:#444">'+(c.nextAction||'—')+'</span> <a href="#" onclick="event.preventDefault();editConstraintNextAction('+p.id+','+i+')" style="color:#1D9E75">✏️ edit</a></div>'+
      '</div>'+
      '<div style="display:flex;gap:6px;flex-shrink:0">'+
        '<button class="btn btn-sm btn-outline" onclick="escalateConstraint('+p.id+','+i+')" title="Escalate to internal team">📧 Escalate</button>'+
        '<button class="btn btn-sm btn-outline" onclick="cycleConstraintStatus('+p.id+','+i+')">'+nLabel[c.status]+'</button>'+
      '</div>'+
    '</div>'
  ).join('');
}
// Per the doc: escalation goes to the internal team by default (not the vendor),
// but there's an option to also loop in a vendor if this constraint needs their input.
export function escalateConstraint(projId, idx){
  const p=state.projects.find(x=>x.id===projId); if(!p) return;
  const c=p.constraints[idx]; if(!c) return;
  const includeVendor=confirm('Also loop in a vendor on this escalation?');
  let vendorEmail='';
  if(includeVendor) vendorEmail=prompt('Vendor email address:')||'';
  const subject='Escalation — '+p.name+' '+p.tower+' — '+c.text.slice(0,50);
  const body='Constraint escalation\n\nProject: '+p.name+' — '+p.tower+'\nSupervisor: '+p.supervisor+'\nConstraint: '+c.text+'\nStatus: '+c.status+'\nLogged: '+c.date+'\n\nPlease advise on next steps.';
  const link=gmailComposeLink(getAdminEmail(), subject, body)+(vendorEmail?'&cc='+encodeURIComponent(vendorEmail):'');
  window.open(link,'_blank');
}
// Snag actions that work directly wherever the snag list is shown (All Projects, Finance tab) —
// these operate on the real persisted project and sync immediately, unlike the Update Progress
// panel's snag editor which only saves when you click "Save changes" there.
export function escalateSnag(projId, idx){
  const p=state.projects.find(x=>x.id===projId); if(!p) return;
  const s=(p.snags||[])[idx]; if(!s) return;
  const supervisorMember=state.teamMembers.find(m=>m.name===p.supervisor);
  const supervisorEmail=supervisorMember&&supervisorMember.email?supervisorMember.email:'';
  const subject='Snag escalation — '+p.name+' '+p.tower+' — '+s.description.slice(0,50);
  const body='Snag escalation\n\nProject: '+p.name+' — '+p.tower+'\nSupervisor: '+p.supervisor+'\nSeverity: '+s.severity+'\nDescription: '+s.description+'\nLocation: '+(s.location||'—')+'\nStatus: '+s.status+'\nRaised: '+s.raisedDate+(s.raisedBy?' by '+s.raisedBy:'')+'\n\nPlease advise on next steps.';
  // Always escalates to Admin and Supervisor — never to the vendor.
  const link=gmailComposeLink(getAdminEmail(), subject, body)+(supervisorEmail?'&cc='+encodeURIComponent(supervisorEmail):'');
  window.open(link,'_blank');
}
export async function cycleSnagStatusOnProject(projId, idx){
  const p=state.projects.find(x=>x.id===projId); if(!p) return;
  const order=['open','in-progress','resolved'];
  const cur=(p.snags||[])[idx]; if(!cur) return;
  const next=order[(order.indexOf(cur.status)+1)%order.length];
  cur.status=next;
  cur.resolvedDate=next==='resolved'?new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'';
  const result=await syncProject(p);
  if(!result.ok){ alert('Could not save — check console.'); return; }
  renderProjects(); renderMetrics(); updateBell();
  if(state.activeTab==='finance') renderFinance();
}

