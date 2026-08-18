import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_MODE } from './config.js';
import { dprToRow, lotToRow, memberToRow, projectToRow } from './mappers.js';
import { SEED_DPR, SEED_LOTS, SEED_PROJECTS, SEED_TEAM } from './seedData.js';

/* ══ DB CLIENT INIT ══
   In TEST_MODE, `db` is a small in-memory mock that mimics Supabase's exact API
   (.from().select/insert/update/delete/eq/order/single, .auth.*, .storage.*),
   so every existing save/load function in this app runs completely unchanged —
   no network calls, no Supabase project needed. Flip VITE_TEST_MODE to false
   once you're ready to connect the real database. */
export function makeMockClient(seedProjects, seedDpr, seedTeam, seedLots){
  const tables = {
    projects: seedProjects.map(p=>({id:p.id,...projectToRow(p)})),
    dpr_log: seedDpr.map(d=>({id:d.id,...dprToRow(d)})),
    team_members: seedTeam.map(m=>({id:m.id,...memberToRow(m)})),
    material_lots: seedLots.map(l=>({id:l.id,...lotToRow(l)})),
    requests: [], finance_ledger: [], vendor_profiles: []
  };
  function execQuery(table, s){
    if(!tables[table]) tables[table]=[];
    const rows=tables[table];
    if(s.op==='select'){
      let result=rows.filter(r=>s.filters.every(([c,v])=>r[c]===v));
      if(s.order){
        const {col,opts}=s.order;
        result=[...result].sort((a,b)=>{
          const av=a[col], bv=b[col];
          const cmp = av>bv?1:av<bv?-1:0;
          return (opts&&opts.ascending===false)?-cmp:cmp;
        });
      }
      if(s.single) return {data:result[0]||null, error:result[0]?null:{message:'No rows found (test mode)'}};
      return {data:result, error:null};
    }
    if(s.op==='insert'){
      const payload=Array.isArray(s.payload)?s.payload:[s.payload];
      const inserted=payload.map(p=>{
        const row={...p};
        if(row.id==null) row.id=(rows.length?Math.max(...rows.map(r=>r.id||0)):0)+1;
        if(table==='requests'&&!row.created_at) row.created_at=new Date().toISOString();
        rows.push(row);
        return row;
      });
      return {data:s.single?inserted[0]:inserted, error:null};
    }
    if(s.op==='update'){
      const matched=rows.filter(r=>s.filters.every(([c,v])=>r[c]===v));
      matched.forEach(r=>Object.assign(r,s.payload));
      return {data:matched, error:null};
    }
    if(s.op==='delete'){
      tables[table]=rows.filter(r=>!s.filters.every(([c,v])=>r[c]===v));
      return {data:null, error:null};
    }
    return {data:null, error:null};
  }
  function from(table){
    const s={op:null, payload:null, filters:[], order:null, single:false};
    const builder={
      select(){ if(!s.op) s.op='select'; return builder; },
      order(col,opts){ s.order={col,opts}; return builder; },
      eq(col,val){ s.filters.push([col,val]); return builder; },
      insert(payload){ s.op='insert'; s.payload=payload; return builder; },
      update(payload){ s.op='update'; s.payload=payload; return builder; },
      delete(){ s.op='delete'; return builder; },
      single(){ s.single=true; return builder; },
      then(resolve,reject){ try{ resolve(execQuery(table,s)); }catch(e){ (reject||resolve)({data:null,error:{message:String(e)}}); } }
    };
    return builder;
  }
  const _authUsers=[];
  const auth={
    async signUp({email,password}){
      if(_authUsers.find(u=>u.email===email)) return {data:null, error:{message:'Email already registered (test mode)'}};
      const id='test-user-'+Date.now();
      _authUsers.push({id,email,password});
      return {data:{user:{id,email}}, error:null};
    },
    async signInWithPassword({email,password}){
      const u=_authUsers.find(x=>x.email===email&&x.password===password);
      if(!u) return {data:null, error:{message:'Invalid login credentials (test mode — you need to register this vendor first)'}};
      return {data:{user:{id:u.id,email:u.email}}, error:null};
    },
    async signOut(){ return {error:null}; },
    // TEST_MODE never persists a vendor session (no real storage backing this mock), so there's
    // never anything to restore on startup — see restoreVendorSession() in vendorAuth.js.
    async getSession(){ return {data:{session:null}, error:null}; }
  };
  const storage={
    from(){ return {
      async upload(path){ return {data:{path}, error:null}; },
      getPublicUrl(path){ return {data:{publicUrl:'about:blank#test-file/'+path}}; }
    };}
  };
  return {from, auth, storage};
}

export let db = TEST_MODE
  ? makeMockClient(SEED_PROJECTS, SEED_DPR, SEED_TEAM, SEED_LOTS)
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ══ TEAM AUTH TOKEN ══
   Phase C: after a successful team-login Edge Function call, the client holds a short-lived
   JWT signed with the project's own JWT secret (not a Supabase Auth session — team login has
   its own username+PIN flow, see src/auth/teamAuth.js). Reconfiguring the single shared `db`
   export here — rather than threading the token through every call site — is what lets the
   ~230 existing `db.from(table)...` calls across the app stay completely untouched; `db` is a
   live ES module binding, so every importer sees the reconfigured client automatically. */
let currentTeamToken = null;
export function getTeamAuthToken(){ return currentTeamToken; }
export function setTeamAuthToken(token){
  currentTeamToken = token || null;
  if (TEST_MODE) return; // mock client has no concept of auth headers
  db = currentTeamToken
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${currentTeamToken}` } } })
    : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* ══ VENDOR "REMEMBER ME" ══
   v2-6 (see plan.md). Vendor login uses real Supabase Auth (auth.signInWithPassword), which
   persists to localStorage by default — that default is exactly right for a "remembered" login,
   so the remembered case needs no special handling. For an *unremembered* login we swap `db` to
   a client backed by a plain in-memory store instead, so the session token never touches
   localStorage and is gone on refresh, matching the Team/Client flows' unchecked behavior. Must
   be called before auth.signInWithPassword() so the resulting session lands in the right store. */
function makeMemoryStorage(){
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, v); },
    removeItem: k => { store.delete(k); }
  };
}
export function setVendorAuthStorage(remember){
  if (TEST_MODE) return; // mock client has no real auth session storage
  const authOpts = remember
    ? { persistSession: true }
    : { persistSession: true, storage: makeMemoryStorage() };
  const globalOpts = currentTeamToken ? { headers: { Authorization: `Bearer ${currentTeamToken}` } } : undefined;
  db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: authOpts, global: globalOpts });
}
