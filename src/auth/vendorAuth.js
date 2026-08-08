import { state } from '../lib/state.js';
import { db } from '../lib/supabaseClient.js';
import { VENDOR_FIELDS, VENDOR_KYC_DOCS } from '../lib/constants.js';
import { fileUploadRowHTML, uploadFiles } from '../lib/uploads.js';
import { closePanel, openPanel, showSection } from '../sections/navigation.js';
import { fieldRowHTML } from '../sections/requests/requestsTab.js';
import { renderVendorPortal } from '../sections/vendorPortal/vendorPortal.js';
import { updateNewVendorBadge } from '../sections/vendors/newVendorsTab.js';

/* ══ VENDOR PORTAL ══ */
export function openVendorRegister(){
  state.vendRegDetails={};
  state.vendRegFiles={};
  document.getElementById('vendreg-email').value='';
  document.getElementById('vendreg-password').value='';
  document.getElementById('vendreg-fields-list').innerHTML=VENDOR_FIELDS.map(f=>fieldRowHTML(f,state.vendRegDetails,'vend')).join('');
  document.getElementById('vendreg-kyc-list').innerHTML=VENDOR_KYC_DOCS.map(d=>fileUploadRowHTML('vendreg-'+d.key,d.label,1)).join('');
  // KYC files are staged here, not uploaded yet — the 'vendor-kyc' storage folder requires a
  // real Supabase Auth session (auth.uid()), which doesn't exist until signUp() below succeeds.
  // Uploading on file-select (the original flow) would hit the storage RLS policy every time.
  VENDOR_KYC_DOCS.forEach(d=>{
    const inputId='vendreg-'+d.key;
    document.getElementById(inputId).onchange=function(){
      const files=Array.from(this.files).slice(0,1);
      if(files.length){ state.vendRegFiles[d.key]=files[0]; document.getElementById(inputId+'-list').textContent='Selected: '+files[0].name; }
    };
  });
  document.getElementById('vendreg-error').classList.add('hidden');
  openPanel('panel-vendor-register');
}
export async function vendorRegister(){
  const email=document.getElementById('vendreg-email').value.trim();
  const password=document.getElementById('vendreg-password').value;
  const err=document.getElementById('vendreg-error');
  if(!email||password.length<6){ err.classList.remove('hidden'); document.getElementById('vendreg-err-msg').textContent='Email and a password (6+ characters) are required.'; return; }
  const missingField=VENDOR_FIELDS.find(f=>f.required&&!String(state.vendRegDetails[f.key]||'').trim());
  if(missingField){ err.classList.remove('hidden'); document.getElementById('vendreg-err-msg').textContent='"'+missingField.label+'" is required.'; return; }
  const missingDoc=VENDOR_KYC_DOCS.find(d=>!state.vendRegFiles[d.key]);
  if(missingDoc){ err.classList.remove('hidden'); document.getElementById('vendreg-err-msg').textContent='Please upload: '+missingDoc.label; return; }
  const {data,error}=await db.auth.signUp({email,password});
  if(error){ console.error('Supabase auth signUp failed',error); err.classList.remove('hidden'); document.getElementById('vendreg-err-msg').textContent=error.message; return; }
  const userId=data.user?data.user.id:null;
  if(userId){
    // Only now does a real auth.uid() exist, so only now can the vendor-kyc storage policy
    // allow these uploads (see the staging note in openVendorRegister above).
    for(const d of VENDOR_KYC_DOCS){
      const urls=await uploadFiles([state.vendRegFiles[d.key]],'vendor-kyc');
      if(urls.length) state.vendRegDetails[d.key]=urls[0];
    }
    const missingUpload=VENDOR_KYC_DOCS.find(d=>!state.vendRegDetails[d.key]);
    if(missingUpload){ err.classList.remove('hidden'); document.getElementById('vendreg-err-msg').textContent='Account created, but uploading "'+missingUpload.label+'" failed — check console.'; return; }
    const row={
      user_id:userId, email,
      company_name:state.vendRegDetails.companyName||'', trade_name:state.vendRegDetails.tradeName||'',
      constitution:state.vendRegDetails.constitution||'', vendor_type:state.vendRegDetails.vendorType||'',
      phone:state.vendRegDetails.phone||'', gstin:state.vendRegDetails.gstin||'', registered_address:state.vendRegDetails.registeredAddress||'',
      pan_number:state.vendRegDetails.panNumber||'', pan_name:state.vendRegDetails.panName||'',
      last_year_turnover:state.vendRegDetails.lastYearTurnover||'', main_items:state.vendRegDetails.mainItems||'',
      credit_term:state.vendRegDetails.creditTerm||'',
      bank_name:state.vendRegDetails.bankName||'', account_no:state.vendRegDetails.accountNo||'', ifsc_code:state.vendRegDetails.ifscCode||'',
      msme_doc_url:state.vendRegDetails.msmeDocUrl||'', gst_doc_url:state.vendRegDetails.gstDocUrl||'',
      pan_doc_url:state.vendRegDetails.panDocUrl||'', tan_doc_url:state.vendRegDetails.tanDocUrl||'', cheque_doc_url:state.vendRegDetails.chequeDocUrl||'',
      scope_of_work:state.vendRegDetails.scopeOfWork||'',
      reviewed_by_admin:false
    };
    const {error:profErr}=await db.from('vendor_profiles').insert(row);
    if(profErr){ console.error('Supabase vendor_profiles insert failed',profErr); err.classList.remove('hidden'); document.getElementById('vendreg-err-msg').textContent='Account created, but saving company details failed — check console. (Has the vendor_profiles table been created?)'; return; }
    // Keep the in-memory list in sync immediately, so the admin's New Vendors tab
    // shows this registration right away without needing a full page reload.
    state.vendorProfiles.push(row);
    updateNewVendorBadge();
  }
  alert('Registration submitted. If email confirmation is enabled in your Supabase project, check your inbox to confirm before logging in.');
  closePanel('panel-vendor-register');
  showSection('vendor-login');
}
export async function vendorLogin(){
  const email=document.getElementById('vend-email').value.trim();
  const password=document.getElementById('vend-password').value;
  const err=document.getElementById('vend-error');
  const {data,error}=await db.auth.signInWithPassword({email,password});
  if(error){ err.classList.remove('hidden'); err.textContent=error.message; return; }
  const {data:profile,error:profErr}=await db.from('vendor_profiles').select('*').eq('user_id',data.user.id).single();
  state.currentVendor={user:data.user, profile:profErr?null:profile};
  showSection('vendor-portal');
  renderVendorPortal();
}
export async function vendorLogout(){ await db.auth.signOut(); state.currentVendor=null; showSection('vendor-login'); }
