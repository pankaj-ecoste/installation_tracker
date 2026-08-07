import { state } from '../lib/state.js';
import { showTeamDashboard } from '../auth/teamAuth.js';
import { canDo } from '../lib/helpers.js';
import { buildNotifHTML, updateBell } from './alerts.js';
import { renderClientPortal } from './clientPortal/clientPortal.js';
import { renderDashboard } from './dashboard/dashboardTab.js';
import { renderDPR } from './dpr/dprTab.js';
import { renderFinance } from './finance/financeTab.js';
import { renderGantt, renderPipeline } from './gantt/ganttTab.js';
import { renderMaterial } from './material/materialTab.js';
import { renderRequests } from './requests/requestsTab.js';
import { renderTeamMgmt } from './team/teamMgmtTab.js';
import { renderNewVendors } from './vendors/newVendorsTab.js';

/* ══ SECTION MANAGEMENT ══ */
export function showSection(name){
  ['team-login','team','notif','client-login','client-portal','vendor-login','vendor-portal'].forEach(s=>{
    const el=document.getElementById('section-'+s);
    if(el){ el.classList.remove('open'); el.classList.add('hidden'); }
  });
  document.querySelectorAll('.page-panel').forEach(el=>el.classList.remove('open'));
  const target=document.getElementById('section-'+name);
  if(target){ target.classList.remove('hidden'); target.classList.add('open'); }
  const tC=document.getElementById('tbr-client');
  const tT=document.getElementById('tbr-team');
  if(name==='team'||name==='notif'){
    tC.classList.add('hidden'); tT.classList.remove('hidden');
  } else if(name==='client-login'||name==='client-portal'||name==='vendor-login'||name==='vendor-portal'){
    tC.classList.remove('hidden'); tT.classList.add('hidden');
  } else {
    tC.classList.add('hidden'); tT.classList.add('hidden');
  }
  if(name==='notif'){
    setTimeout(()=>{
      const el=document.getElementById('notif-body-inner');
      if(el) el.innerHTML=buildNotifHTML();
      updateBell();
    }, 30);
  }
}

export function openPanel(id){
  document.querySelectorAll('.page-section,.page-panel').forEach(el=>{
    el.classList.remove('open'); el.classList.add('hidden');
  });
  const el=document.getElementById(id);
  if(el){ el.classList.remove('hidden'); el.classList.add('open'); }
  // Warn on browser refresh/close/back if the Add/Edit Project form is open with unsaved changes.
  if(id==='panel-add-proj'){
    window.onbeforeunload=()=>'You have an unsaved project form open. Leaving now will lose your changes.';
  }
}

export function closePanel(id){
  const el=document.getElementById(id);
  if(el) el.classList.remove('open');
  if(id==='panel-add-proj') window.onbeforeunload=null;
  if(state.currentUser) showTeamDashboard();
  else showClientSection();
}
export function showClientSection(){
  if(state.loggedInClient){ showSection('client-portal'); renderClientPortal(state.loggedInClient.proj); }
  else showSection('client-login');
}


/* ══ TABS ══ */
export function setTab(t){
  if(t==='gantt'&&!canDo('viewGantt')) t='projects';
  if(t==='dpr'&&!canDo('viewDPR')) t='projects';
  if(t==='team'&&!canDo('manageTeam')) t='projects';
  if(t==='finance'&&!canDo('viewFinance')) t='projects';
  if(t==='dashboard'&&!canDo('viewFinance')) t='projects';
  if(t==='newvendors'&&(!state.currentUser||!['admin','finance'].includes(state.currentUser.role))) t='projects';
  state.activeTab=t;
  ['projects','requests','gantt','pipeline','dpr','material','team','finance','dashboard','newvendors'].forEach(x=>{
    const tab=document.getElementById('tab-'+x); if(tab) tab.classList.toggle('active',x===t);
    const view=document.getElementById('tab-'+x+'-view'); if(view) view.classList.toggle('hidden',x!==t);
  });
  if(t==='requests') renderRequests();
  if(t==='gantt') renderGantt();
  if(t==='pipeline') renderPipeline();
  if(t==='dpr') renderDPR();
  if(t==='material') renderMaterial();
  if(t==='team') renderTeamMgmt();
  if(t==='finance') renderFinance();
  if(t==='dashboard') renderDashboard();
  if(t==='newvendors') renderNewVendors();
}

