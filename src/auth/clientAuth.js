import { state } from '../lib/state.js';
import { renderClientPortal } from '../sections/clientPortal/clientPortal.js';
import { showSection } from '../sections/navigation.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_MODE } from '../lib/config.js';
import { saveClientSession, loadClientSession, clearClientSession } from '../lib/rememberMe.js';

// Phase C: the access-code lookup moved server-side (client-login Edge Function, service
// role key) — the client no longer needs the full projects table in memory to log a client
// in. TEST_MODE keeps the original in-memory lookup since it has no live Supabase project.
// v2-6: shared core so both the form submit (doClientLogin) and a "remembered" session restore
// on startup (restoreClientSession) go through the same lookup — the restore path never trusts
// stored project data directly, it always re-validates the access code against the server.
async function performClientLogin(name,code){
  if(TEST_MODE){
    const proj=state.projects.find(p=>p.accessCode===code);
    if(!proj) return {ok:false,error:'Invalid access code.'};
    return {ok:true,proj};
  }
  let res, data;
  try{
    res=await fetch(SUPABASE_URL+'/functions/v1/client-login',{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY},
      body:JSON.stringify({name,accessCode:code})
    });
    data=await res.json();
  }catch(e){ console.error('client-login request failed',e); return {ok:false,error:'Could not reach the server — check your connection.'}; }
  if(!res.ok||!data.project) return {ok:false,error:data.error||'Invalid access code.'};
  const proj=data.project;
  const idx=state.projects.findIndex(p=>p.id===proj.id);
  if(idx>=0) state.projects[idx]=proj; else state.projects.push(proj);
  return {ok:true,proj};
}

export async function doClientLogin(){
  const name=document.getElementById('login-name').value.trim();
  const code=document.getElementById('login-code').value.trim().toUpperCase();
  const remember=document.getElementById('login-remember').checked;
  const err=document.getElementById('login-error');
  if(!name){ err.classList.remove('hidden'); err.textContent='Please enter your name.'; return; }

  const result=await performClientLogin(name,code);
  if(!result.ok){ err.classList.remove('hidden'); err.textContent=result.error; return; }
  err.classList.add('hidden');
  if(remember) saveClientSession(name,code); else clearClientSession();
  state.loggedInClient={name,proj:result.proj};
  showSection('client-portal');
  renderClientPortal(result.proj);
}

// v2-6: restores a "remembered" client session on app startup, before the login screen would
// otherwise show. Re-validates the stored access code against the server rather than trusting
// stale local project data — a revoked/changed code silently falls back to the login screen.
// Returns true if a session was restored. See plan.md and main.js's init().
export async function restoreClientSession(){
  const saved=loadClientSession();
  if(!saved) return false;
  const result=await performClientLogin(saved.name,saved.accessCode);
  if(!result.ok){ clearClientSession(); return false; }
  state.loggedInClient={name:saved.name,proj:result.proj};
  showSection('client-portal');
  renderClientPortal(result.proj);
  return true;
}

export function clientLogout(){ state.loggedInClient=null; clearClientSession(); showSection('client-login'); }
// Single-project Gantt bar for the client portal — same visual language as the team Gantt tab.
