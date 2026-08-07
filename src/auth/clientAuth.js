import { state } from '../lib/state.js';
import { renderClientPortal } from '../sections/clientPortal/clientPortal.js';
import { showSection } from '../sections/navigation.js';

export function doClientLogin(){
  const name=document.getElementById('login-name').value.trim();
  const code=document.getElementById('login-code').value.trim().toUpperCase();
  const err=document.getElementById('login-error');
  if(!name){ err.classList.remove('hidden'); err.textContent='Please enter your name.'; return; }
  const proj=state.projects.find(p=>p.accessCode===code);
  if(!proj){ err.classList.remove('hidden'); err.textContent='Invalid access code.'; return; }
  err.classList.add('hidden');
  state.loggedInClient={name,proj};
  showSection('client-portal');
  renderClientPortal(proj);
}
export function clientLogout(){ state.loggedInClient=null; showSection('client-login'); }
// Single-project Gantt bar for the client portal — same visual language as the team Gantt tab.
