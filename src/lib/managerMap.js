/* ══ Supervisor -> manager map (plan.md v2-71) ══
   Reads the EXISTING admin-only report_team_map table (migration 0026, edited from Reports -> Installation Scoring
   Report -> "Who reports to whom"), so there is one list to maintain for every report and the project export.
   Read-only here. RLS lets only an admin read it: for anyone else the load fails quietly and callers fall back to
   the default rule in managementOverview.js (ok:false tells them the list was not available).
   v2-73: gives up after `timeoutMs` (default 3 s) so a stalled network can never make the Export button, or the report,
   hang — the caller then simply uses the default rule. */
import { db } from './supabaseClient.js';

let cache=null;
export const getManagerMap=()=>cache;

export async function loadManagerMap(timeoutMs=3000){
  let timer;
  try{
    const timeout=new Promise(resolve=>{ timer=setTimeout(()=>resolve('timeout'),timeoutMs); });
    const res=await Promise.race([db.from('report_team_map').select('*'),timeout]);
    if(res==='timeout') throw new Error('report_team_map load timed out');
    const {data,error}=res;
    if(error) throw error;
    const m={}; (data||[]).forEach(r=>{ m[String(r.supervisor_username).toLowerCase()]=r.manager; });
    cache=m;
    return {map:m,ok:true};
  }catch(e){
    return {map:cache||{},ok:cache!=null};
  }finally{ clearTimeout(timer); }
}
