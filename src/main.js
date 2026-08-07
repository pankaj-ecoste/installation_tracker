import './styles/app.css';
import { installDomGlobals } from './utils/domGlobals.js';
import { state } from './lib/state.js';
import { loadAllData } from './data/loadAllData.js';
import { showTeamDashboard } from './auth/teamAuth.js';

installDomGlobals();

/* ══ INIT ══ */
(async function init(){
  document.querySelectorAll('.page-section,.page-panel').forEach(el=>{ el.classList.remove('open'); el.classList.add('hidden'); });
  const cl=document.getElementById('section-client-login');
  if(cl){ cl.classList.remove('hidden'); cl.classList.add('open'); }
  document.getElementById('tbr-client').classList.remove('hidden');
  document.getElementById('tbr-team').classList.add('hidden');
  await loadAllData();
  // if the client-login screen or team dashboard need fresh data rendered now that it's loaded:
  if(state.currentUser) showTeamDashboard();
})();
