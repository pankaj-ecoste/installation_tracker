import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { TODAY } from '../../lib/config.js';
import { MANAGERS, addDays, dprRow, mondayOf, sodEodRow, unassignedSupervisors, weekDays, weekTitle, weekPickerLabel, weeksInMonth } from '../../lib/installationScoring.js';
import { daySummary } from './sodEodReport.js';

/* ══ INSTALLATION SCORING REPORT (admin only, inside Reports — plan.md v2-58, v2-62) ══
   One row per manager for a Mon–Sun week (v2-62: Sunday added as Day 7 — previously Mon–Sat). Shashank and Aditya
   come from the DPRs their supervisors filed (actual installed qty vs the weekly projection that was locked for
   the week); Neelam comes from the SOD/EOD tracker (In Progress get / total, cumulative). All rules live in
   lib/installationScoring.js; this file is presentation, plus the admin's "who reports to whom" setup and the
   month→week jump picker. Read-only: it never writes DPR or SOD/EOD data. */

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
// Same "today" rule as the SOD/EOD report: a tab left open overnight still rolls over to the new day.
const todayStr=()=>{ const d=import.meta.env.VITE_TODAY_OVERRIDE?TODAY:new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); };
const num=n=>Number(n).toLocaleString('en-IN');
const pct=p=>p==null?'—':(Math.round(p*100)/100).toFixed(2)+'%';
const MAP_TABLE='report_team_map';

let host=null;          // the element the report renders into
let weekStart='';       // Monday (YYYY-MM-DD) of the week on screen
let teamMap={};         // {supervisor username (lower-case): 'shashank'|'aditya'}
let mapError=false;

function dayDelta(delta){ return mondayOf(addDays(weekStart,delta*7)); }
const monthKeyOf=monday=>addDays(monday,5).slice(0,7); // 'YYYY-MM' of the week's bucketed month (its Saturday)
const weekOptionsFor=monday=>{ const [y,m]=monthKeyOf(monday).split('-').map(Number); return weeksInMonth(y,m-1); };
function monthOptions(){ // the current month plus the previous 23 — never a future month (matches "Next week" being disabled past this week)
  const [cy,cm]=todayStr().split('-').map(Number);
  const out=[];
  for(let i=0;i<24;i++){
    let y=cy,m=cm-1-i; while(m<0){ m+=12; y--; }
    out.push({key:y+'-'+pad(m+1),label:new Date(y,m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'})});
  }
  return out;
}

export async function renderInstallationScoringReport(el){
  host=el;
  weekStart=weekStart||mondayOf(todayStr());
  host.innerHTML=
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">'+
      '<button class="btn btn-outline btn-sm" onclick="closeReport()">← All reports</button>'+
      '<h3 style="font-size:15px;font-weight:600">📊 Installation Scoring Report</h3>'+
    '</div><div class="empty">Loading…</div>';
  try{
    const {data,error}=await db.from('sod_eod_log').select('*').order('log_date',{ascending:false});
    if(error) throw error;
    state.sodEodLog=data||[];
  }catch(e){
    console.error('Scoring report: SOD/EOD load failed',e);
    host.innerHTML+='<div class="empty" style="color:#cc3333">Could not load the report data. Check your connection and reopen this report.</div>';
    return;
  }
  try{
    const {data,error}=await db.from(MAP_TABLE).select('*');
    if(error) throw error;
    teamMap={}; (data||[]).forEach(r=>{ teamMap[String(r.supervisor_username).toLowerCase()]=r.manager; });
    mapError=false;
  }catch(e){ console.error('Scoring report: team map load failed',e); teamMap={}; mapError=true; }
  draw();
}

function draw(){
  if(!host) return;
  const thisMonday=mondayOf(todayStr());
  const days=weekDays(weekStart);
  const dayHead=days.map((d,i)=>{
    const dt=new Date(Number(d.slice(0,4)),Number(d.slice(5,7))-1,Number(d.slice(8,10)));
    return '<th style="'+TH+'">Day '+(i+1)+'<div style="font-size:10px;font-weight:500;color:#555">'+dt.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})+'</div></th>';
  }).join('');

  const members=state.teamMembers||[];
  const rows=MANAGERS.map(m=>{
    const r=dprRow(m.key,weekStart,state.dprLog,members,teamMap);
    return '<tr style="background:#e2efda">'+
      '<td style="'+TD+'font-weight:600;text-align:left">'+esc(m.label)+'</td>'+
      '<td style="'+TD+'">'+(r.target==null?'':num(r.target))+'</td>'+
      '<td style="'+TD+'">'+(r.nextWeek==null?'':num(r.nextWeek))+'</td>'+
      r.days.map(v=>'<td style="'+TD+'">'+(v==null?'':num(v))+'</td>').join('')+
      '<td style="'+TD+'font-weight:700">'+pct(r.pct)+'</td>'+
      '<td style="'+TD+'font-weight:700">'+(r.days.some(v=>v!==null)?num(r.sum):'')+'</td></tr>';
  });

  const dayScore=day=>{
    if(!state.sodEodLog.some(r=>r.log_date===day)) return null;
    const s=daySummary(day); const ip=s.split&&s.split.find(g=>g.group==='In Progress');
    return ip?{get:ip.score,total:ip.max}:null;
  };
  const n=sodEodRow(weekStart,dayScore);
  rows.push('<tr style="background:#ddebf7">'+
    '<td style="'+TD+'font-weight:600;text-align:left">Neelam</td>'+
    '<td colspan="2" style="'+TD+'">'+(n.total>0?n.get+' / '+n.total:'')+'</td>'+
    n.days.map(c=>'<td style="'+TD+'">'+(c?c.get+' / '+c.total:'')+'</td>').join('')+
    '<td style="'+TD+'font-weight:700">'+pct(n.pct)+'</td>'+
    '<td style="'+TD+'font-weight:700">'+(n.days.some(c=>c)?n.get:'')+'</td></tr>');

  const unassigned=unassignedSupervisors(weekStart,state.dprLog,members,teamMap);
  const supervisors=members.filter(m=>m.role==='supervisor'&&m.active);

  host.innerHTML=
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">'+
      '<button class="btn btn-outline btn-sm" onclick="closeReport()">← All reports</button>'+
      '<h3 style="font-size:15px;font-weight:600">📊 Installation Scoring Report</h3>'+
    '</div>'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">'+
      '<button class="btn btn-outline btn-sm" onclick="scoringWeekShift(-1)">◀ Previous week</button>'+
      '<button class="btn btn-outline btn-sm" onclick="scoringWeekShift(1)"'+(weekStart>=thisMonday?' disabled':'')+'>Next week ▶</button>'+
      (weekStart!==thisMonday?'<button class="btn btn-outline btn-sm" onclick="scoringWeekThis()">This week</button>':'')+
      '<span style="color:#ccc;font-size:12px">|</span>'+
      '<label style="font-size:12px;color:#666">Jump to:</label>'+
      '<select id="scoring-month-pick" class="form-input" style="width:auto;padding:4px 8px" onchange="scoringMonthPicked(this.value)">'+
        monthOptions().map(o=>'<option value="'+o.key+'"'+(o.key===monthKeyOf(weekStart)?' selected':'')+'>'+esc(o.label)+'</option>').join('')+
      '</select>'+
      '<select id="scoring-week-pick" class="form-input" style="width:auto;padding:4px 8px" onchange="scoringWeekPicked(this.value)">'+
        '<option value="">— pick a week —</option>'+
        weekOptionsFor(weekStart).map(mo=>'<option value="'+mo+'"'+(mo===weekStart?' selected':'')+'>'+esc(weekPickerLabel(mo))+'</option>').join('')+
      '</select>'+
    '</div>'+
    '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:720px;font-size:13px;background:#fff">'+
      '<thead>'+
        '<tr><th colspan="'+(days.length+5)+'" style="'+TH+'font-size:14px;text-align:left;background:#fff">'+esc(weekTitle(weekStart))+'</th></tr>'+
        '<tr><th rowspan="2" style="'+TH+'">Name</th><th colspan="2" style="'+TH+'font-size:15px">Target</th><th colspan="'+days.length+'" style="'+TH+'font-size:15px">Achievement</th><th rowspan="2" style="'+TH+'">Total %</th><th rowspan="2" style="'+TH+'">Total Achieved</th></tr>'+
        '<tr><th style="'+TH+'">Weekly Committed</th><th style="'+TH+'">Next Week Projection</th>'+dayHead+'</tr>'+
      '</thead><tbody>'+rows.join('')+'</tbody></table></div>'+
    '<div style="font-size:11px;color:#777;margin-top:8px;line-height:1.5">'+
      'Shashank &amp; Aditya: sq ft installed per day by their whole team (from DPRs); Target = the team weekly committed qty (sum of the daily today-projection figures, Monday up to the latest day); Total % = installed ÷ Weekly Committed. Next Week Projection = the team total of the next-week figures filed that week (latest per project). '+
      'Neelam: SOD/EOD In Progress score / maximum, cumulative through the week. Total Achieved = the sum of Day 1 to Day 7 (sq ft installed; for Neelam, points scored). Days with no entries stay blank and are left out.'+
    '</div>'+
    (unassigned.length?'<div style="font-size:12px;color:#a06a00;background:#fff8e6;border-radius:6px;padding:8px 10px;margin-top:10px">⚠ DPRs this week from supervisors not assigned to a manager (not counted in any row): <b>'+unassigned.map(esc).join(', ')+'</b>. Assign them below.</div>':'')+
    '<details style="margin-top:14px"'+(mapError||unassigned.length?' open':'')+'>'+
      '<summary style="cursor:pointer;font-size:13px;font-weight:600">⚙ Who reports to whom (admin)</summary>'+
      (mapError?'<div style="font-size:12px;color:#cc3333;margin:8px 0">Could not load the team setup — the database update for this report may not be applied yet.</div>':'')+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin-top:10px">'+
        supervisors.map(s=>{
          const u=String(s.username).toLowerCase(); const cur=teamMap[u]||'';
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:8px 10px">'+
            '<span style="font-size:13px">'+esc(s.name)+'</span>'+
            '<select class="form-input" style="width:auto;padding:4px 8px" onchange="scoringSetManager(\''+esc(u).replace(/'/g,'')+'\',this.value)">'+
              '<option value=""'+(cur?'':' selected')+'>— not assigned —</option>'+
              MANAGERS.map(m=>'<option value="'+m.key+'"'+(cur===m.key?' selected':'')+'>'+esc(m.label)+'</option>').join('')+
            '</select></div>';
        }).join('')+
      '</div>'+
    '</details>';
}

const TH='border:1px solid #333;background:#ffff00;padding:8px 10px;text-align:center;font-weight:700;';
const TD='border:1px solid #333;padding:9px 10px;text-align:center;';

export function scoringWeekShift(delta){ weekStart=dayDelta(delta); draw(); }
export function scoringWeekThis(){ weekStart=mondayOf(todayStr()); draw(); }

// Month→week picker (v2-62): picking a month only rebuilds the week dropdown's own options, in place, without
// touching the displayed report — the report only jumps once a week is actually picked from that list.
export function scoringMonthPicked(ym){
  const sel=document.getElementById('scoring-week-pick'); if(!sel) return;
  const [y,m]=ym.split('-').map(Number);
  sel.innerHTML='<option value="">— pick a week —</option>'+
    weeksInMonth(y,m-1).map(mo=>'<option value="'+mo+'">'+weekPickerLabel(mo)+'</option>').join('');
}
export function scoringWeekPicked(monday){
  if(!monday) return;
  weekStart=monday; draw();
}

// Admin picks which manager a supervisor reports to. Blank = remove the assignment. Updates the screen only after the
// database accepted it, so what is shown is always what is stored.
export async function scoringSetManager(username,manager){
  const u=String(username).toLowerCase();
  try{
    let res;
    if(!manager) res=await db.from(MAP_TABLE).delete().eq('supervisor_username',u);
    else if(teamMap[u]) res=await db.from(MAP_TABLE).update({manager,updated_at:new Date().toISOString()}).eq('supervisor_username',u);
    else res=await db.from(MAP_TABLE).insert({supervisor_username:u,manager});
    if(res.error) throw res.error;
    if(manager) teamMap[u]=manager; else delete teamMap[u];
  }catch(e){ console.error('Scoring report: could not save team setup',e); alert('Could not save — check your connection and try again.'); }
  draw();
}
