import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { logActivity } from '../../lib/activityLog.js';
import { VENDOR_FIELDS, VENDOR_KYC_DOCS } from '../../lib/constants.js';
import { uploadFiles } from '../../lib/uploads.js';
import { openPanel, closePanel, setTab } from '../navigation.js';
import { fieldRowHTML } from '../requests/requestsTab.js';
import { renderNewVendors, updateNewVendorBadge } from './newVendorsTab.js';

/* ══ ADMIN EDITS A SUBMITTED VENDOR FORM (v2-44) ══
   Reuses VENDOR_FIELDS / VENDOR_KYC_DOCS so the edit form can never drift from the registration form.
   Company/Trade name are locked once the vendor is fully approved: projects, finance and requests
   link to a vendor by that name as plain text (see plan.md v2-44). Email is the vendor's login, so it
   is shown read-only. Editing never changes reviewed_by_admin / approved_by_shashank. */
const NAME_LOCKED_KEYS=['companyName','tradeName'];
const toColumn=key=>key.replace(/([A-Z])/g,'_$1').toLowerCase(); // camelCase key -> snake_case column
const isApproved=v=>!!(v.reviewed_by_admin&&v.approved_by_shashank);
const showEditError=msg=>{
  document.getElementById('vendedit-error').classList.remove('hidden');
  document.getElementById('vendedit-err-msg').textContent=msg;
};

export function openVendorEdit(userId){
  if(!state.currentUser||state.currentUser.role!=='admin') return;
  const v=state.vendorProfiles.find(x=>x.user_id===userId); if(!v) return;
  state.editingVendorId=userId;
  state.vendEditFiles={};
  state.vendEditDetails={};
  [...VENDOR_FIELDS,...VENDOR_KYC_DOCS].forEach(f=>{ state.vendEditDetails[f.key]=v[toColumn(f.key)]||''; });
  document.getElementById('vendedit-email').value=v.email||'';
  document.getElementById('vendedit-fields-list').innerHTML=VENDOR_FIELDS.map(f=>fieldRowHTML(f,state.vendEditDetails,'vendedit')).join('');
  const locked=isApproved(v);
  document.getElementById('vendedit-name-note').classList.toggle('hidden',!locked);
  if(locked) NAME_LOCKED_KEYS.forEach(k=>{ const el=document.getElementById('vendedit-'+k); if(el) el.disabled=true; });
  document.getElementById('vendedit-kyc-list').innerHTML=VENDOR_KYC_DOCS.map(d=>{
    const url=v[toColumn(d.key)];
    return '<div class="form-group" style="margin-bottom:10px">'+
      '<label class="form-label">'+d.label+'</label>'+
      '<div style="font-size:12px;margin-bottom:4px">'+(url?'<a href="'+url+'" target="_blank" style="color:#1D9E75">📄 View current file</a>':'<span style="color:#cc3333">❌ Missing</span>')+'</div>'+
      '<input type="file" id="vendedit-'+d.key+'" accept="image/*,.pdf,.doc,.docx" style="font-size:12px">'+
      '<div id="vendedit-'+d.key+'-list" style="font-size:11px;color:#1D9E75;margin-top:4px"></div>'+
    '</div>';
  }).join('');
  VENDOR_KYC_DOCS.forEach(d=>{
    const input=document.getElementById('vendedit-'+d.key);
    input.onchange=function(){
      const file=this.files[0];
      if(file){ state.vendEditFiles[d.key]=file; document.getElementById('vendedit-'+d.key+'-list').textContent='Selected: '+file.name; }
      else { delete state.vendEditFiles[d.key]; document.getElementById('vendedit-'+d.key+'-list').textContent=''; }
    };
  });
  document.getElementById('vendedit-error').classList.add('hidden');
  document.getElementById('vendedit-save-btn').disabled=false;
  openPanel('panel-vendor-edit');
}

export async function saveVendorEdit(){
  if(!state.currentUser||state.currentUser.role!=='admin') return;
  const v=state.vendorProfiles.find(x=>x.user_id===state.editingVendorId); if(!v) return;
  const saveBtn=document.getElementById('vendedit-save-btn');
  document.getElementById('vendedit-error').classList.add('hidden');
  const locked=isApproved(v);
  const editableFields=VENDOR_FIELDS.filter(f=>!(locked&&NAME_LOCKED_KEYS.includes(f.key)));
  const missing=editableFields.find(f=>f.required&&!String(state.vendEditDetails[f.key]||'').trim());
  if(missing){ showEditError('"'+missing.label+'" is required.'); return; }

  saveBtn.disabled=true;
  try{
    // Upload only the slots the admin actually picked. Any failed upload aborts before the row update,
    // so a vendor is never left half-saved.
    const newDocUrls={};
    for(const d of VENDOR_KYC_DOCS){
      const file=state.vendEditFiles[d.key];
      if(!file) continue;
      const urls=await uploadFiles([file],'vendor-kyc');
      if(!urls.length){ showEditError('Uploading "'+d.label+'" failed — nothing was saved. Check console.'); return; }
      newDocUrls[d.key]=urls[0];
    }
    const patch={}; const changedLabels=[];
    editableFields.forEach(f=>{
      const val=String(state.vendEditDetails[f.key]||'').trim();
      const col=toColumn(f.key);
      if(val!==(v[col]||'')){ patch[col]=val; changedLabels.push(f.label); }
    });
    VENDOR_KYC_DOCS.forEach(d=>{
      if(newDocUrls[d.key]){ patch[toColumn(d.key)]=newDocUrls[d.key]; changedLabels.push(d.label); }
    });
    if(!changedLabels.length){ showEditError('No changes to save.'); return; }
    // .select() so a row that RLS silently refuses to update (0 rows, no error) is caught, not shown as saved.
    const {data,error}=await db.from('vendor_profiles').update(patch).eq('user_id',v.user_id).select('user_id');
    if(error||!data||!data.length){ console.error('Supabase vendor_profiles update failed',error||'0 rows updated'); showEditError('Could not save the changes — check console.'); return; }
    Object.assign(v,patch);
    logActivity('Vendor details edited by Admin',(v.trade_name||v.company_name)+' — updated: '+changedLabels.join(', '));
    closeVendorEdit();
  }finally{ saveBtn.disabled=false; }
}

// closePanel() ends in showTeamDashboard(), which always lands on All Projects — send the admin
// back to the New Vendors tab they came from instead.
export function closeVendorEdit(){
  closePanel('panel-vendor-edit');
  setTab('newvendors');
  renderNewVendors(); updateNewVendorBadge();
}
