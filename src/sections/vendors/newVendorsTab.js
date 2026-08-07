import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { logActivity } from '../../lib/activityLog.js';
import { TEST_MODE } from '../../lib/config.js';
import { VENDOR_KYC_DOCS, notifyByGmail } from '../../lib/constants.js';

/* ══ NEW VENDORS (admin review tab) ══ */
export function updateNewVendorBadge(){
  const badge=document.getElementById('newvendor-count');
  if(!badge) return;
  const count=state.vendorProfiles.filter(v=>!(v.reviewed_by_admin&&v.approved_by_shashank)).length;
  if(count>0){ badge.classList.remove('hidden'); badge.textContent=count; }
  else badge.classList.add('hidden');
}
export function renderNewVendors(){
  const el=document.getElementById('newvendors-content'); if(!el) return;
  const isAdmin=state.currentUser&&state.currentUser.role==='admin';
  const pending=state.vendorProfiles.filter(v=>!v.reviewed_by_admin);
  const awaitingShashank=state.vendorProfiles.filter(v=>v.reviewed_by_admin&&!v.approved_by_shashank);
  const approved=state.vendorProfiles.filter(v=>v.reviewed_by_admin&&v.approved_by_shashank);
  const detailLines=v=>'<div class="proj-sub">'+v.email+' · '+(v.vendor_type||'—')+' · GSTIN: '+(v.gstin||'—')+'</div>'+
    '<div style="font-size:12px;color:#666;margin-top:6px">PAN: '+(v.pan_number||'—')+' · Bank: '+(v.bank_name||'—')+' · Credit term: '+(v.credit_term||'—')+'</div>'+
    '<div style="font-size:12px;margin-top:6px">'+
      VENDOR_KYC_DOCS.map(d=>{
        const url=v[d.key.replace(/([A-Z])/g,'_$1').toLowerCase()]; // camelCase key -> snake_case column
        return url?'<a href="'+url+'" target="_blank" style="margin-right:10px;color:#1D9E75">📄 '+d.label+'</a>':'<span style="margin-right:10px;color:#cc3333">❌ '+d.label+' missing</span>';
      }).join('')+
    '</div>';

  // Finance gets a simplified, fully read-only view: Approved Vendor list only, nothing editable.
  if(!isAdmin){
    el.innerHTML=
      '<div style="font-size:12px;color:#888;margin-bottom:10px">👁 View-only — showing approved vendors only.</div>'+
      (TEST_MODE?'<div style="font-size:11px;color:#a06a00;background:#fff8e6;border-radius:6px;padding:8px 10px;margin-bottom:10px">⚠ Test mode is on — document links won\'t actually open since no file storage is connected yet. This will work once the app is connected to live Supabase Storage.</div>':'')+
      '<div class="section-hdr">✅ Approved Vendor <span class="count-pill" style="background:#d4edda;color:#1a5e2a">'+approved.length+'</span></div>'+
      (approved.length?approved.map(v=>'<div class="proj-card" style="cursor:default;border-left:4px solid #1D9E75">'+
        '<div class="proj-name">'+(v.trade_name||v.company_name)+' <span class="badge bg">✅ Approved Vendor</span></div>'+
        detailLines(v)+
      '</div>').join(''):'<div class="empty">No fully approved vendors yet.</div>');
    return;
  }

  el.innerHTML=
    (TEST_MODE?'<div style="font-size:11px;color:#a06a00;background:#fff8e6;border-radius:6px;padding:8px 10px;margin-bottom:10px">⚠ Test mode is on — document links below won\'t actually open since no file storage is connected yet. This will work once the app is connected to live Supabase Storage.</div>':'')+
    '<div class="section-hdr">🆕 New Vendor <span class="count-pill" style="background:#fff3cd;color:#7a4f00">'+pending.length+'</span></div>'+
    (pending.length?pending.map(v=>'<div class="proj-card" style="cursor:default;border-left:4px solid #f0a500">'+
      '<div class="proj-name">'+(v.trade_name||v.company_name)+' <span class="badge ba">🆕 New Vendor — Stage 1: Admin review</span></div>'+
      detailLines(v)+
      (isAdmin?'<div style="margin-top:10px"><button class="btn btn-green btn-sm" onclick="markVendorReviewed(\''+v.user_id+'\')">✅ Admin: Approve (sends to Shashank for final approval)</button></div>':'')+
    '</div>').join(''):'<div class="empty">No new vendor registrations awaiting admin review.</div>')+
    '<div class="section-hdr" style="margin-top:16px">📋 Reviewed by Admin — awaiting for approval <span class="count-pill" style="background:#d0e8f7;color:#0a3d6b">'+awaitingShashank.length+'</span></div>'+
    (awaitingShashank.length?awaitingShashank.map(v=>'<div class="proj-card" style="cursor:default;border-left:4px solid #0a3d6b">'+
      '<div class="proj-name">'+(v.trade_name||v.company_name)+' <span class="badge bb">📋 Stage 2: Awaiting Shashank\'s approval</span></div>'+
      detailLines(v)+
      (isAdmin?'<div style="margin-top:10px"><button class="btn btn-green btn-sm" onclick="markVendorApprovedByShashank(\''+v.user_id+'\')">✅ Approve as Shashank — make available for assignment</button></div>':'')+
    '</div>').join(''):'<div class="empty">No vendors currently waiting on Shashank\'s approval.</div>')+
    '<div class="section-hdr" style="margin-top:16px">✅ Approved Vendor <span class="count-pill" style="background:#d4edda;color:#1a5e2a">'+approved.length+'</span></div>'+
    (approved.length?approved.map(v=>'<div class="proj-card" style="cursor:default;border-left:4px solid #1D9E75">'+
      '<div class="proj-name">'+(v.trade_name||v.company_name)+' <span class="badge bg">✅ Approved Vendor</span></div>'+
      detailLines(v)+
      '<div style="font-size:11px;color:#888;margin-top:8px">Available in Contractor/Vendor dropdowns across the app.</div>'+
    '</div>').join(''):'<div class="empty">No fully approved vendors yet.</div>');
}
export async function markVendorReviewed(userId){
  const {error}=await db.from('vendor_profiles').update({reviewed_by_admin:true}).eq('user_id',userId);
  if(error){ console.error('Supabase update failed',error); return; }
  const v=state.vendorProfiles.find(x=>x.user_id===userId); if(v) v.reviewed_by_admin=true;
  if(v) logActivity('Vendor reviewed by Admin', (v.trade_name||v.company_name)+' — awaiting Shashank\'s approval');
  renderNewVendors(); updateNewVendorBadge();
}
export async function markVendorApprovedByShashank(userId){
  const {error}=await db.from('vendor_profiles').update({approved_by_shashank:true}).eq('user_id',userId);
  if(error){ console.error('Supabase update failed',error); return; }
  const v=state.vendorProfiles.find(x=>x.user_id===userId); if(v) v.approved_by_shashank=true;
  if(v){
    logActivity('Vendor approved', (v.trade_name||v.company_name)+' — now available for assignment');
    if(v.email){
      const vendorName=v.trade_name||v.company_name;
      const subject='Vendor registration approved — Ecoste Installation Tracker';
      const body='Dear '+vendorName+',\n\n'+
        'We are pleased to inform you that your vendor registration with Ecoste has been reviewed and approved.\n\n'+
        'Company: '+vendorName+'\n'+
        'GSTIN: '+(v.gstin||'—')+'\n\n'+
        'You are now an approved vendor in our system and may be assigned to upcoming projects. Our team will reach out with project details as and when required.\n\n'+
        'Thank you for your patience during the review process. We look forward to working with you.\n\n'+
        'Regards,\nEcoste Installation Team';
      notifyByGmail(v.email, subject, body);
    }
  }
  renderNewVendors(); updateNewVendorBadge();
}

