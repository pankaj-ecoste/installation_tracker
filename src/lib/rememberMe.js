/* ══ REMEMBER ME ══
   v2-6: shared localStorage helpers for the Team and Client "Remember me" checkboxes (see
   plan.md). Vendor login persists through Supabase Auth's own session storage instead — see
   setVendorAuthStorage() in supabaseClient.js — so it has no entry here. */
const TEAM_KEY = 'ecoste_team_session';
const CLIENT_KEY = 'ecoste_client_session';
const REMEMBER_DAYS = 30;

function expiresAtFromNow(){ return Date.now() + REMEMBER_DAYS*24*60*60*1000; }

function readEntry(key){
  const raw = localStorage.getItem(key);
  if(!raw) return null;
  let parsed;
  try{ parsed = JSON.parse(raw); }catch{ localStorage.removeItem(key); return null; }
  if(!parsed || !parsed.expiresAt || parsed.expiresAt < Date.now()){ localStorage.removeItem(key); return null; }
  return parsed;
}

export function saveTeamSession(token, member){
  localStorage.setItem(TEAM_KEY, JSON.stringify({ token, member, expiresAt: expiresAtFromNow() }));
}
export function loadTeamSession(){ return readEntry(TEAM_KEY); }
export function clearTeamSession(){ localStorage.removeItem(TEAM_KEY); }

export function saveClientSession(name, accessCode){
  localStorage.setItem(CLIENT_KEY, JSON.stringify({ name, accessCode, expiresAt: expiresAtFromNow() }));
}
export function loadClientSession(){ return readEntry(CLIENT_KEY); }
export function clearClientSession(){ localStorage.removeItem(CLIENT_KEY); }
