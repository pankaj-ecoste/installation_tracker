import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { syncProject } from '../../data/loadAllData.js';
import { logActivity } from '../../lib/activityLog.js';
import { FINANCE_FIELDS } from '../../lib/constants.js';
import { canDo, fmt, needsFinanceReview, needsRABill, visibleProjects } from '../../lib/helpers.js';
import { financeRowToRow, rowToFinanceRow } from '../../lib/mappers.js';
import { docLink, pickFilesOrWarn, uploadFilesWithNames } from '../../lib/uploads.js';
import { updateBell } from '../alerts.js';
import { renderDashboard } from '../dashboard/dashboardTab.js';
import { timelineMetric } from '../material/materialTab.js';
import { closePanel, openPanel } from '../navigation.js';
import { renderProjects } from '../projects/projectCards.js';
import { fieldRowHTML } from '../requests/requestsTab.js';

/* ══ FINANCE LEDGER ══ */
// Two-layer approval: Admin reviews first, then Shashank (Project Head) gives final approval.
// Only vendors that have cleared BOTH stages show up in Contractor/Vendor assignment dropdowns.
export function approvedVendors(){ return state.vendorProfiles.filter(v=>v.reviewed_by_admin&&v.approved_by_shashank); }

export function populateFinanceVendorDropdown(selected){
  const sel=document.getElementById('fin-contractor');
  const approved=approvedVendors();
  sel.innerHTML='<option value="">— Select vendor —</option>'+
    approved.map(v=>{ const name=v.trade_name||v.company_name||v.email; return '<option '+(selected===name?'selected':'')+'>'+name+'</option>'; }).join('')+
    (approved.length?'':'<option value="" disabled>No approved vendors yet — approve one in the New Vendors tab</option>');
}
export function openAddFinanceRow(){
  if(!canDo('addFinanceRow')){ alert('You do not have permission to add a finance ledger row.'); return; }
  state.editingFinanceId=null; state.finRowDetails={};
  document.getElementById('finance-panel-title').textContent='Add ledger row';
  const ps=document.getElementById('fin-proj');
  ps.innerHTML=state.projects.map(p=>'<option value="'+p.id+'">'+p.name+' — '+p.tower+'</option>').join('');
  populateFinanceVendorDropdown('');
  document.getElementById('fin-fields-list').innerHTML=FINANCE_FIELDS.map(f=>fieldRowHTML(f,state.finRowDetails,'fin')).join('');
  document.getElementById('fin-error').classList.add('hidden');
  onFinanceProjectChange();
  openPanel('panel-add-finance');
}
export function openAddFinanceRowForProject(projId){
  openAddFinanceRow();
  setTimeout(()=>{ const ps=document.getElementById('fin-proj'); if(ps){ ps.value=projId; onFinanceProjectChange(); } },10);
}
export function openEditFinanceRow(id){
  const row=state.financeLedger.find(f=>f.id===id); if(!row) return;
  state.editingFinanceId=id; state.finRowDetails={...row};
  document.getElementById('finance-panel-title').textContent='Edit ledger row';
  const ps=document.getElementById('fin-proj');
  ps.innerHTML=state.projects.map(p=>'<option value="'+p.id+'">'+p.name+' — '+p.tower+'</option>').join('');
  ps.value=row.projId;
  populateFinanceVendorDropdown(row.contractor);
  document.getElementById('fin-fields-list').innerHTML=FINANCE_FIELDS.map(f=>fieldRowHTML(f,state.finRowDetails,'fin')).join('');
  document.getElementById('fin-error').classList.add('hidden');
  recalcFinanceComputed();
  openPanel('panel-add-finance');
}
// Auto-fills project-derived fields when a project is picked — per the doc, everything
// EXCEPT RA bill info and Payment Given should auto-populate.
export function onFinanceProjectChange(){
  const projId=parseInt(document.getElementById('fin-proj').value);
  const p=state.projects.find(x=>x.id===projId);
  if(p){
    state.finRowDetails.product=(p.products&&p.products[0]?p.products[0].name:'')||state.finRowDetails.product||'';
    state.finRowDetails.location=p.city||state.finRowDetails.location||'';
    state.finRowDetails.boqQty=p.plannedQty||0;
    state.finRowDetails.woQty=p.soQty||p.plannedQty||0;
    document.getElementById('fin-fields-list').innerHTML=FINANCE_FIELDS.map(f=>fieldRowHTML(f,state.finRowDetails,'fin')).join('');
  }
  recalcFinanceComputed();
}
export function onFinanceFieldRecalc(){ recalcFinanceComputed(); }
// This runs on every keystroke in the finance form (see reqFieldChanged) to keep
// Contract value / Retention (5%) / Due payment / Unbilled amount / Due billing /
// Work status (installed vs SO qty) always in sync with what's typed.
export function recalcFinanceComputed(){
  const woRate=parseFloat(state.finRowDetails.woRate)||0;
  const woQty=parseFloat(state.finRowDetails.woQty)||0;
  const paymentGiven=parseFloat(state.finRowDetails.paymentGiven)||0;
  const unbilledQty=parseFloat(state.finRowDetails.unbilledQty)||0;
  const installationRate=parseFloat(state.finRowDetails.installationRate)||0;
  const contractValue=woRate*woQty;
  const retention=contractValue*0.05;
  const paymentPending=contractValue-(retention+paymentGiven);
  const unbilledAmt=unbilledQty*installationRate;
  const dueBilling=unbilledAmt*installationRate;
  state.finRowDetails.contractValue=contractValue;
  state.finRowDetails.retention=retention;
  state.finRowDetails.paymentPending=paymentPending;
  state.finRowDetails.unbilledAmt=unbilledAmt;
  state.finRowDetails.dueBilling=dueBilling;
  const projId=parseInt(document.getElementById('fin-proj')?.value);
  const p=state.projects.find(x=>x.id===projId);
  const workStatus=p?(fmt(p.installedQty)+' / '+fmt(p.soQty||p.plannedQty)+' sqft installed vs total SO qty'):'—';
  state.finRowDetails.workStatus=workStatus;
  const el=document.getElementById('fin-computed-list');
  if(el) el.innerHTML=
    '<div>Contract value: <b>₹'+fmt(contractValue)+'</b> (WO rate × WO qty)</div>'+
    '<div>Retention (5%): <b>₹'+fmt(retention)+'</b></div>'+
    '<div>Due payment: <b>₹'+fmt(paymentPending)+'</b> (contract value − (retention + payment given))</div>'+
    '<div>Unbilled amount to vendor: <b>₹'+fmt(unbilledAmt)+'</b> (unbilled qty × installation rate)</div>'+
    '<div>Due billing: <b>₹'+fmt(dueBilling)+'</b></div>'+
    '<div>Work status: <b>'+workStatus+'</b></div>';
}
export async function saveFinanceRow(){
  const projId=parseInt(document.getElementById('fin-proj').value);
  const contractor=document.getElementById('fin-contractor').value;
  const err=document.getElementById('fin-error');
  if(!projId){ err.classList.remove('hidden'); document.getElementById('fin-err-msg').textContent='Please select a project.'; return; }
  if(!contractor){ err.classList.remove('hidden'); document.getElementById('fin-err-msg').textContent='Please select a contractor/vendor.'; return; }
  recalcFinanceComputed();
  // coerce number-typed fields
  const numeric=['boqQty','woQty','woRate','contractValue','paymentGiven','retention','installationPaymentDue','paymentPending','raBillDueAmount','raBillBalance','billedQty','billedAmt','unbilledQty','unbilledAmt','installationRate','dueBilling','holdAmount'];
  numeric.forEach(k=>{ if(state.finRowDetails[k]!==undefined) state.finRowDetails[k]=parseFloat(state.finRowDetails[k])||0; });
  const rowData={projId,contractor,...state.finRowDetails};
  const proj=state.projects.find(x=>x.id===projId);
  if(state.editingFinanceId){
    const idx=state.financeLedger.findIndex(f=>f.id===state.editingFinanceId);
    state.financeLedger[idx]={...state.financeLedger[idx],...rowData};
    const {error}=await db.from('finance_ledger').update(financeRowToRow(state.financeLedger[idx])).eq('id',state.editingFinanceId);
    if(error){ console.error('Supabase update failed',error); err.classList.remove('hidden'); document.getElementById('fin-err-msg').textContent='Could not save — check console. (Has the finance_ledger table been created?)'; return; }
    logActivity('Finance ledger updated', (proj?proj.name+' — '+proj.tower:'Project')+' — '+contractor);
  } else {
    // No client-supplied id — finance_ledger.id is a real Postgres identity column, so letting
    // the database assign it atomically avoids two concurrent submissions colliding (see plan.md v2-4).
    const {data:inserted,error}=await db.from('finance_ledger').insert(financeRowToRow(rowData)).select().single();
    if(error){ console.error('Supabase insert failed',error); err.classList.remove('hidden'); document.getElementById('fin-err-msg').textContent='Could not save — check console. (Has the finance_ledger table been created?)'; return; }
    state.financeLedger.push(rowToFinanceRow(inserted));
    logActivity('Finance ledger row added', (proj?proj.name+' — '+proj.tower:'Project')+' — '+contractor);
  }
  closePanel('panel-add-finance');
  renderFinance();
  if(state.activeTab==='projects') renderProjects();
  if(state.activeTab==='dashboard') renderDashboard();
  updateBell(); // refreshes the Finance tab's red badge — without this, adding an RA bill
                // wouldn't clear the "RA bill needed" highlight until something else triggered it.
}
export function renderFinance(){
  const el=document.getElementById('finance-table-wrap'); if(!el) return;
  const vp=visibleProjects();
  if(!vp.length){ el.innerHTML='<div class="empty">No projects visible.</div>'; return; }
  const cols=[['product','Product'],['contractor','Contractor'],['woQty','WO qty'],['contractValue','Contract value'],['paymentGiven','Released to vendor'],['raBillStatus','RA bill status'],['raBillBalance','RA balance'],['workStatus','Status']];
  el.innerHTML=vp.map(p=>{
    const rows=state.financeLedger.filter(f=>f.projId===p.id);
    const totalContract=rows.reduce((a,f)=>a+(f.contractValue||0),0);
    const totalPaid=rows.reduce((a,f)=>a+(f.paymentGiven||0),0);
    return '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:16px;overflow:hidden">'+
      '<div style="background:#085041;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">'+
        '<div><div style="color:#fff;font-weight:700;font-size:14px">'+p.name+' — '+p.tower+'</div>'+
        '<div style="color:rgba(255,255,255,.7);font-size:12px">Vendor contract value ₹'+fmt(totalContract)+' · Paid to vendor ₹'+fmt(totalPaid)+'</div></div>'+
        (canDo('addFinanceRow')?'<button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.3)" onclick="openAddFinanceRowForProject('+p.id+')">+ Add RA Bill</button>':'')+
        '<button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.3);margin-left:6px" onclick="openAddSnagForProject('+p.id+')">🔧 Add snag</button>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0;border-bottom:1px solid #e0e0e0">'+
        timelineMetric('👤 Client — RA bills generated',(p.raBillHistory||[]).length,'#444')+
        timelineMetric('👤 Client — RA bill total (₹)',fmt(p.raBillAmt),'#185FA5')+
        timelineMetric('👤 Client — Collected (₹)',fmt(p.paymentCollected),p.paymentCollected<p.raBillAmt?'#cc3333':'#1D9E75')+
        timelineMetric('📋 JMR qty',fmt(p.jmrQty),'#444')+
        timelineMetric('📄 Total qty — PO',fmt(p.poQty||0),'#7a4f00')+
        timelineMetric('📐 Total qty — SO',fmt(p.soQty||p.plannedQty||0),'#7a4f00')+
        timelineMetric('🔧 Open snags',(p.snags||[]).filter(s=>s.status!=='resolved').length,(p.snags||[]).filter(s=>s.status!=='resolved').length>0?'#cc3333':'#1D9E75')+
      '</div>'+
      '<div style="padding:12px 16px;border-bottom:1px solid #e0e0e0;background:#fafafa">'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">'+
          '<div><label class="form-label" style="font-size:11px">📄 WCC documents (Work Completion Certificate)</label>'+
            '<input type="file" id="wcc-upload-'+p.id+'" accept="image/*,application/pdf" multiple style="font-size:11px">'+
            '<div id="wcc-upload-'+p.id+'-list" style="font-size:11px;color:#1D9E75;margin-top:2px"></div>'+
            ((p.wccDocs||[]).length?'<div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">'+(p.wccDocs||[]).map((doc,i)=>docLink(doc,i)).join('')+'</div>':'')+
          '</div>'+
          '<div><label class="form-label" style="font-size:11px">💰 RA Bill documents</label>'+
            '<input type="file" id="rabill-upload-'+p.id+'" accept="image/*,application/pdf" multiple style="font-size:11px">'+
            '<div id="rabill-upload-'+p.id+'-list" style="font-size:11px;color:#1D9E75;margin-top:2px"></div>'+
            ((p.raBillDocs||[]).length?'<div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">'+(p.raBillDocs||[]).map((doc,i)=>docLink(doc,i)).join('')+'</div>':'')+
          '</div>'+
        '</div>'+
      '</div>'+
      (needsRABill(p)?
        '<div style="background:#fff8e6;border-bottom:1px solid #e0e0e0;padding:10px 16px;font-size:12px">'+
          '<b style="color:#7a4f00">💰 RA bill needs to be generated</b> — WCC has been uploaded ('+(p.wccDocs||[]).length+' file(s)) and qty updated, but no RA bill amount has been entered yet for this project. '+
          '<button class="btn btn-outline btn-sm" style="margin-left:6px" onclick="openUpdate('+p.id+')">Set RA bill amount</button>'+
        '</div>':'')+
      (needsFinanceReview(p)?
        '<div style="background:#fde8e8;border-bottom:1px solid #e0e0e0;padding:10px 16px;font-size:12px">'+
          '<b style="color:#8b1a1a">⚠ JMR qty updated by installation team</b> — JMR is now '+fmt(p.jmrQty)+'. Please review and update RA bill information under the Finance section. '+
          '<button class="btn btn-outline btn-sm" style="margin-left:6px" onclick="openUpdate('+p.id+')">Review now</button>'+
        '</div>':'')+
      (((p.snags||[]).filter(s=>s.status!=='resolved').length>0)?
        '<div style="background:#fff5f5;border-bottom:1px solid #e0e0e0;padding:10px 16px;font-size:12px">'+
          '<b style="color:#cc3333">🔧 Open snags on this project:</b><br>'+
          (p.snags||[]).filter(s=>s.status!=='resolved').map(s=>'• '+s.description+' ('+s.severity+', '+s.location+')').join('<br>')+
        '</div>':'')+
      '<div style="overflow-x:auto">'+
        (rows.length?'<table class="team-table"><thead><tr>'+cols.map(c=>'<th>'+c[1]+'</th>').join('')+'<th>Edit</th></tr></thead><tbody>'+
          rows.map(f=>{
            const vendorProfile=state.vendorProfiles.find(v=>(v.trade_name||v.company_name)===f.contractor);
            const scopeNote=vendorProfile&&vendorProfile.scope_of_work?'<div style="font-size:10px;color:#888;margin-top:2px">Scope: '+vendorProfile.scope_of_work+'</div>':'';
            return '<tr>'+cols.map(c=>'<td>'+(typeof f[c[0]]==='number'?fmt(f[c[0]]):(f[c[0]]||'—'))+(c[0]==='contractor'?scopeNote:'')+'</td>').join('')+'<td><button class="icon-btn btn-sm" onclick="openEditFinanceRow('+f.id+')">✏️</button></td></tr>';
          }).join('')+
        '</tbody></table>'
        :'<div class="empty" style="padding:16px">No ledger rows yet for this project.</div>')+
      '</div>'+
    '</div>';
  }).join('');
  // Wire the WCC / RA Bill document uploads per project (dynamic IDs, so wired after render)
  vp.forEach(p=>{
    const wccInput=document.getElementById('wcc-upload-'+p.id);
    if(wccInput) wccInput.onchange=async function(){
      const files=pickFilesOrWarn(this,10); if(!files) return;
      document.getElementById('wcc-upload-'+p.id+'-list').textContent='Uploading '+files.length+' file(s)...';
      const uploaded=await uploadFilesWithNames(files,'wcc-docs');
      p.wccDocs=[...(p.wccDocs||[]),...uploaded];
      await syncProject(p);
      renderFinance();
    };
    const raInput=document.getElementById('rabill-upload-'+p.id);
    if(raInput) raInput.onchange=async function(){
      const files=pickFilesOrWarn(this,10); if(!files) return;
      document.getElementById('rabill-upload-'+p.id+'-list').textContent='Uploading '+files.length+' file(s)...';
      const uploaded=await uploadFilesWithNames(files,'ra-bill-docs');
      p.raBillDocs=[...(p.raBillDocs||[]),...uploaded];
      await syncProject(p);
      renderFinance();
    };
  });
}

