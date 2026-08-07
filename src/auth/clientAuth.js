import { state } from '../lib/state.js';
import { renderClientPortal } from '../sections/clientPortal/clientPortal.js';
import { showSection } from '../sections/navigation.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_MODE } from '../lib/config.js';

// Phase C: the access-code lookup moved server-side (client-login Edge Function, service
// role key) — the client no longer needs the full projects table in memory to log a client
// in. TEST_MODE keeps the original in-memory lookup since it has no live Supabase project.
export async function doClientLogin(){
  const name=document.getElementById('login-name').value.trim();
  const code=document.getElementById('login-code').value.trim().toUpperCase();
  const err=document.getElementById('login-error');
  if(!name){ err.classList.remove('hidden'); err.textContent='Please enter your name.'; return; }

  let proj;
  if(TEST_MODE){
    proj=state.projects.find(p=>p.accessCode===code);
    if(!proj){ err.classList.remove('hidden'); err.textContent='Invalid access code.'; return; }
  } else {
    let res, data;
    try{
      res=await fetch(SUPABASE_URL+'/functions/v1/client-login',{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY},
        body:JSON.stringify({name,accessCode:code})
      });
      data=await res.json();
    }catch(e){ console.error('client-login request failed',e); err.classList.remove('hidden'); err.textContent='Could not reach the server — check your connection.'; return; }
    if(!res.ok||!data.project){ err.classList.remove('hidden'); err.textContent=data.error||'Invalid access code.'; return; }
    proj=data.project;
    const idx=state.projects.findIndex(p=>p.id===proj.id);
    if(idx>=0) state.projects[idx]=proj; else state.projects.push(proj);
  }
  err.classList.add('hidden');
  state.loggedInClient={name,proj};
  showSection('client-portal');
  renderClientPortal(proj);
}
export function clientLogout(){ state.loggedInClient=null; showSection('client-login'); }
// Single-project Gantt bar for the client portal — same visual language as the team Gantt tab.
