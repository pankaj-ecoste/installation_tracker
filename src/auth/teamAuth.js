import { state } from '../lib/state.js';
import { ROLES } from '../lib/constants.js';
import { canDo, visibleProjects } from '../lib/helpers.js';
import { updateBell } from '../sections/alerts.js';
import { renderMetrics } from '../sections/metrics.js';
import { setTab, showClientSection, showSection } from '../sections/navigation.js';
import { renderProjects } from '../sections/projects/projectCards.js';
import { updateNewVendorBadge } from '../sections/vendors/newVendorsTab.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_MODE } from '../lib/config.js';
import { setTeamAuthToken } from '../lib/supabaseClient.js';
import { saveTeamSession, loadTeamSession, clearTeamSession } from '../lib/rememberMe.js';

/* ══ TEAM AUTH ══ */
export function showTeamLogin(){
  showSection('team-login');
  document.getElementById('tbr-client').classList.add('hidden');
  document.getElementById('tbr-team').classList.add('hidden');
}

// Phase C: PIN verification moved server-side (bcrypt, via the team-login Edge Function) —
// this no longer compares plaintext PINs in the browser. TEST_MODE keeps the original
// in-memory check since it has no live Supabase project to call.
export async function teamLogin(){
  const user=document.getElementById('tl-user').value.trim().toLowerCase();
  const pass=document.getElementById('tl-pass').value.trim();
  const remember=document.getElementById('tl-remember').checked;
  const err=document.getElementById('tl-error');
  if(!user||!pass){ err.classList.remove('hidden'); err.textContent='Please enter username and PIN.'; return; }

  let member;
  if(TEST_MODE){
    member=state.teamMembers.find(m=>m.username===user&&m.pin===pass&&m.active);
    if(!member){ err.classList.remove('hidden'); err.textContent='Invalid username or PIN.'; return; }
    member.lastLogin=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
    // TEST_MODE has no live Supabase project to sign a real token against, so "remember me"
    // just stores the in-memory member directly — dev-only convenience, see plan.md v2-6.
    if(remember) saveTeamSession(null,member); else clearTeamSession();
  } else {
    let res, data;
    try{
      res=await fetch(SUPABASE_URL+'/functions/v1/team-login',{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY},
        body:JSON.stringify({username:user,pin:pass,remember})
      });
      data=await res.json();
    }catch(e){ console.error('team-login request failed',e); err.classList.remove('hidden'); err.textContent='Could not reach the server — check your connection.'; return; }
    if(!res.ok||!data.token){ err.classList.remove('hidden'); err.textContent=data.error||'Invalid username or PIN.'; return; }
    setTeamAuthToken(data.token);
    const idx=state.teamMembers.findIndex(m=>m.id===data.member.id);
    if(idx>=0){ Object.assign(state.teamMembers[idx],data.member); member=state.teamMembers[idx]; }
    else { member=data.member; state.teamMembers.push(member); }
    if(remember) saveTeamSession(data.token,member); else clearTeamSession();
  }
  err.classList.add('hidden');
  state.currentUser=member;
  document.getElementById('tl-user').value='';
  document.getElementById('tl-pass').value='';
  showTeamDashboard();
}

// v2-6: restores a "remembered" team session on app startup, before the login screen would
// otherwise show. Returns true if a session was restored. See plan.md and main.js's init().
export function restoreTeamSession(){
  const saved=loadTeamSession();
  if(!saved) return false;
  if(!TEST_MODE){
    if(!saved.token) return false;
    setTeamAuthToken(saved.token);
  }
  const idx=state.teamMembers.findIndex(m=>m.id===saved.member.id);
  if(idx>=0){ Object.assign(state.teamMembers[idx],saved.member); state.currentUser=state.teamMembers[idx]; }
  else { state.teamMembers.push(saved.member); state.currentUser=saved.member; }
  return true;
}

export function showTeamDashboard(){
  showSection('team');
  if(state.currentUser){
    document.getElementById('user-name-display').textContent=state.currentUser.name.split(' ')[0];
    const role=ROLES[state.currentUser.role];
    const rd=document.getElementById('role-display');
    rd.textContent=role.emoji+' '+role.label;
    rd.className=''; rd.style.cssText='font-size:11px;padding:3px 8px;border-radius:20px;border:1px solid #ccc;background:#f0f0f0';
  }
  // nav tab visibility
  const tabs={gantt:'viewGantt',dpr:'viewDPR','team-mgmt':'manageTeam',finance:'viewFinance',dashboard:'viewFinance'};
  Object.entries(tabs).forEach(([tab,perm])=>{
    const el=document.getElementById('tab-'+tab);
    if(el) el.style.display=canDo(perm)?'':'none';
  });
  const newVendTab=document.getElementById('tab-newvendors');
  if(newVendTab) newVendTab.style.display=(state.currentUser&&['admin','finance'].includes(state.currentUser.role))?'':'none';
  updateNewVendorBadge();
  // Material tab — Admin/Dispatch Head can manage; Supervisor gets view-only access
  // (right to view, not edit — the addLot permission still blocks adding/editing lots).
  const matTab=document.getElementById('tab-material');
  if(matTab) matTab.style.display=(canDo('manageDispatch')||state.currentUser&&state.currentUser.role==='supervisor')?'':'none';
  const addBtn=document.getElementById('btn-add-proj');
  if(addBtn) addBtn.style.display=canDo('addProject')?'':'none';
  const dprBtn=document.getElementById('btn-add-dpr');
  if(dprBtn) dprBtn.style.display=canDo('addDPR')?'':'none';
  const reqBtn=document.getElementById('btn-add-request');
  if(reqBtn) reqBtn.style.display=canDo('addRequest')?'':'none';
  const lotBtn=document.getElementById('btn-add-lot');
  if(lotBtn) lotBtn.style.display=canDo('addLot')?'':'none';
  const finRowBtn=document.getElementById('btn-add-finance-row');
  if(finRowBtn) finRowBtn.style.display=canDo('addFinanceRow')?'':'none';

  // scope banner
  const banner=document.getElementById('scope-banner');
  if(banner&&state.currentUser){
    const isAll=canDo('viewAll');
    const myCount=visibleProjects().length;
    banner.style.display='block';
    if(isAll){
      banner.style.cssText='display:block;font-size:12px;padding:6px 20px;border-bottom:1px solid #e0e0e0;background:#e8f5f0;color:#0a5e3a';
      banner.innerHTML='👑 '+state.currentUser.name.split(' ')[0]+' — viewing <b>all '+state.projects.length+' projects</b>';
    } else {
      banner.style.cssText='display:block;font-size:12px;padding:6px 20px;border-bottom:1px solid #e0e0e0;background:#f0f4ff;color:#1a3a8f';
      banner.innerHTML='👤 '+state.currentUser.name.split(' ')[0]+' — viewing <b>your '+myCount+' project'+(myCount!==1?'s':'')+'</b> &nbsp;<span style="color:#888;font-weight:400">only</span>';
    }
  }
  updateBell();
  state.activeTab='projects'; // always reset to a safe, known tab on login — otherwise whatever
  setTab('projects');   // tab/content the PREVIOUS user was on stays rendered underneath.
  renderMetrics(); renderProjects();
}

export function lockTeam(){ state.currentUser=null; setTeamAuthToken(null); clearTeamSession(); showClientSection(); }
export function backToClient(){ showClientSection(); }
