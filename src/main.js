import './styles/app.css';
import { installDomGlobals } from './utils/domGlobals.js';
import { state } from './lib/state.js';
import { loadAllData } from './data/loadAllData.js';
import { showTeamDashboard, restoreTeamSession } from './auth/teamAuth.js';
import { restoreClientSession } from './auth/clientAuth.js';
import { restoreVendorSession } from './auth/vendorAuth.js';

installDomGlobals();

/* ══ INIT ══ */
(async function init(){
  document.querySelectorAll('.page-section,.page-panel').forEach(el=>{ el.classList.remove('open'); el.classList.add('hidden'); });
  const cl=document.getElementById('section-client-login');
  if(cl){ cl.classList.remove('hidden'); cl.classList.add('open'); }
  document.getElementById('tbr-client').classList.remove('hidden');
  document.getElementById('tbr-team').classList.add('hidden');
  await loadAllData();
  // v2-6 "Remember me" (see plan.md): before falling back to the client-login screen, check
  // for a remembered session in priority order team > client > vendor — at most one of these
  // flows is ever logged in at a time, so first match wins. Each restore*() call is a no-op
  // (returns false) if nothing valid is stored.
  if(restoreTeamSession()){ showTeamDashboard(); }
  else if(await restoreClientSession()){ /* restoreClientSession already shows the client portal */ }
  else if(await restoreVendorSession()){ /* restoreVendorSession already shows the vendor portal */ }
  else if(state.currentUser){ showTeamDashboard(); } // dead in practice today, kept for safety
})();
