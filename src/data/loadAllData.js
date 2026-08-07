import { state } from '../lib/state.js';
import { db } from '../lib/supabaseClient.js';
import { dprToRow, lotToRow, memberToRow, projectToRow, rowToDpr, rowToFinanceRow, rowToLot, rowToMember, rowToProject, rowToRequest } from '../lib/mappers.js';
import { SEED_DPR, SEED_LOTS, SEED_PROJECTS, SEED_TEAM } from '../lib/seedData.js';

// Every column team_members has except pin/pin_hash — loadAllData() runs for every visitor,
// even before any login, so this list is what keeps the Phase C PIN hashing meaningful: a
// bare `select('*')` here would still broadcast every member's pin_hash (and, until it's
// dropped, the legacy plaintext pin column) to every browser tab regardless of the Edge
// Function hardening. Update this list if team_members ever grows a new non-secret column.
const TEAM_MEMBER_PUBLIC_COLUMNS = 'id,name,username,role,dept,wa,active,last_login,email';

/* Insert/update a single project row in Supabase to match its current
   local state. Called after ANY change to a project (edits, comments,
   constraint status changes, progress updates, etc). */
export async function syncProject(p){
  try{
    const {error}=await db.from('projects').update(projectToRow(p)).eq('id',p.id);
    if(error){ console.error('Supabase: failed to save project', error); return {ok:false,error}; }
    return {ok:true};
  }catch(e){ console.error('Supabase error', e); return {ok:false,error:e}; }
}

export async function loadAllData(){
  try{
    // PROJECTS
    let {data:projRows,error:projErr}=await db.from('projects').select('*').order('id');
    if(projErr) throw projErr;
    if(!projRows.length){
      const seedRows=SEED_PROJECTS.map(p=>({id:p.id,...projectToRow(p)}));
      const {error:seedErr}=await db.from('projects').insert(seedRows);
      if(seedErr) throw seedErr;
      ({data:projRows}=await db.from('projects').select('*').order('id'));
    }
    state.projects=projRows.map(rowToProject);
    state.nextId=state.projects.length?Math.max(...state.projects.map(p=>p.id))+1:1;

    // DPR LOG
    let {data:dprRows,error:dprErr}=await db.from('dpr_log').select('*').order('id',{ascending:false});
    if(dprErr) throw dprErr;
    if(!dprRows.length){
      const seedRows=SEED_DPR.map(d=>({id:d.id,...dprToRow(d)}));
      const {error:seedErr}=await db.from('dpr_log').insert(seedRows);
      if(seedErr) throw seedErr;
      ({data:dprRows}=await db.from('dpr_log').select('*').order('id',{ascending:false}));
    }
    state.dprLog=dprRows.map(rowToDpr);
    state.nextDprId=state.dprLog.length?Math.max(...state.dprLog.map(d=>d.id))+1:1;

    // TEAM MEMBERS (pin/pin_hash deliberately excluded — see TEAM_MEMBER_PUBLIC_COLUMNS above)
    let {data:memRows,error:memErr}=await db.from('team_members').select(TEAM_MEMBER_PUBLIC_COLUMNS).order('id');
    if(memErr) throw memErr;
    if(!memRows.length){
      const seedRows=SEED_TEAM.map(m=>({id:m.id,...memberToRow(m)}));
      const {error:seedErr}=await db.from('team_members').insert(seedRows);
      if(seedErr) throw seedErr;
      ({data:memRows}=await db.from('team_members').select(TEAM_MEMBER_PUBLIC_COLUMNS).order('id'));
    }
    state.teamMembers=memRows.map(rowToMember);
    state.nextMemberId=state.teamMembers.length?Math.max(...state.teamMembers.map(m=>m.id))+1:1;

    // MATERIAL LOTS
    let {data:lotRows,error:lotErr}=await db.from('material_lots').select('*').order('id');
    if(lotErr) throw lotErr;
    if(!lotRows.length){
      const seedRows=SEED_LOTS.map(l=>({id:l.id,...lotToRow(l)}));
      const {error:seedErr}=await db.from('material_lots').insert(seedRows);
      if(seedErr) throw seedErr;
      ({data:lotRows}=await db.from('material_lots').select('*').order('id'));
    }
    state.materialLots=lotRows.map(rowToLot);
    state.nextLotId=state.materialLots.length?Math.max(...state.materialLots.map(l=>l.id))+1:1;

    // REQUESTS (separate try/catch — if you haven't run the requests table SQL yet,
    // the rest of the app still works fine; this section just stays empty)
    try{
      const {data:reqRows,error:reqErr}=await db.from('requests').select('*').order('id',{ascending:false});
      if(reqErr) throw reqErr;
      state.requests=reqRows.map(rowToRequest);
      state.nextRequestId=state.requests.length?Math.max(...state.requests.map(r=>r.id))+1:1;
    }catch(e){
      console.warn('Requests table not found yet — run the requests SQL in Supabase to enable this feature.', e);
      state.requests=[]; state.nextRequestId=1;
    }

    // FINANCE LEDGER (also optional — separate try/catch)
    try{
      const {data:finRows,error:finErr}=await db.from('finance_ledger').select('*').order('id');
      if(finErr) throw finErr;
      state.financeLedger=finRows.map(rowToFinanceRow);
      state.nextFinanceId=state.financeLedger.length?Math.max(...state.financeLedger.map(f=>f.id))+1:1;
    }catch(e){
      console.warn('finance_ledger table not found yet — run the finance SQL in Supabase to enable this feature.', e);
      state.financeLedger=[]; state.nextFinanceId=1;
    }

    // VENDOR PROFILES (registered vendors, for dropdowns in the finance ledger)
    try{
      const {data:vRows,error:vErr}=await db.from('vendor_profiles').select('*').order('created_at');
      if(vErr) throw vErr;
      state.vendorProfiles=vRows;
    }catch(e){
      console.warn('vendor_profiles table not found yet.', e);
      state.vendorProfiles=[];
    }

    // ACTIVITY LOG (optional — separate try/catch)
    try{
      const {data:actRows,error:actErr}=await db.from('activity_log').select('*').order('created_at',{ascending:false});
      if(actErr) throw actErr;
      state.activityLog=actRows.map(r=>({eventType:r.event_type, message:r.message, createdAt:r.created_at}));
    }catch(e){
      console.warn('activity_log table not found yet — run the SQL to enable Recent Activity in Notifications.', e);
      state.activityLog=[];
    }

  }catch(e){
    console.error('Supabase load failed — check SUPABASE_URL/ANON_KEY and that tables exist.', e);
    alert('Could not connect to the database. Check the browser console for details, and make sure SUPABASE_URL / SUPABASE_ANON_KEY are set correctly at the top of the script.');
  }
}

