/* ══ Read EVERY row of a table, newest id first (plan.md v2-72) ══
   Supabase / PostgREST returns at most 1000 rows per request by default, so a plain `select('*')` silently
   drops the oldest rows once a table passes 1000 (dpr_log had 748 in Nov 2026 and grows ~150/month). This reads in
   pages with keyset paging (`id < last id seen`, not offsets), so rows inserted or deleted while it is running cannot
   duplicate or skip anything.
   - Returns {data,error} like a plain query, so it drops into existing `const {data,error}=await ...` code.
   - If ANY page fails the whole call fails (never a silently partial list).
   - Stops on the first EMPTY page rather than a short one, so it stays correct even if the server's own row cap is lower
     than the page size.
   - The TEST_MODE mock client has no .limit() / .lt(): there it falls back to one plain query (the mock has no cap). */
import { db } from '../lib/supabaseClient.js';

const PAGE=1000, MAX_PAGES=200; // 200 pages = 200k rows, a runaway guard only

export async function selectAllRows(table){
  const first=db.from(table).select('*').order('id',{ascending:false});
  if(typeof first.limit!=='function'||typeof first.lt!=='function') return await first;
  const out=[]; let last=null;
  for(let page=0; page<MAX_PAGES; page++){
    let q=page===0?first:db.from(table).select('*').order('id',{ascending:false}).lt('id',last);
    const {data,error}=await q.limit(PAGE);
    if(error) return {data:null,error};
    if(!data||!data.length) break;
    out.push(...data);
    last=data[data.length-1].id;
  }
  return {data:out,error:null};
}
