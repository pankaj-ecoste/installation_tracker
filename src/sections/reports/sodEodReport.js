import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { TODAY } from '../../lib/config.js';

/* ══ SOD / EOD FOLLOW-UP TRACKER (admin only — see plan.md v2-42 and v2-46) ══
   One row per project per day (DB unique on log_date + project_name). Both SOD and EOD are required.
   Options: Call / Email / WhatsApp = +1 each; "Other" (free text, required) = 0. No Not Done, no negatives —
   a row scores 0, 1 or 2. Remarks are always optional. A saved entry is locked: no edit, no delete
   (DB policies allow only select + insert, see migration 0019).
   Score is reported separately for In Progress and Not Started projects (plus the combined total). The score
   column and the per-row group / per-day project counts are DB-owned (generated column + insert trigger,
   migration 0022); slotPts() below only mirrors the score as a fallback for rows that don't carry one yet
   (the TEST_MODE mock has no generated columns or triggers). */
const OPTIONS=['Call','Email','WhatsApp','Other'];
const SCORING_OPTIONS=['Call','Email','WhatsApp'];
const TABLE='sod_eod_log';
const GROUPS=['In Progress','Not Started'];
// Maximum points per project for each group (1 per slot, 2 slots). One number per group so management can change
// a group's weight later without touching the rest of the code.
const MAX_PER_PROJECT={'In Progress':2,'Not Started':2};

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
// Local date parts, never toISOString() — that shifts a day in IST (see the DPR date gotcha in plan.md).
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
// TODAY is fixed when the page loads; a tab left open overnight must still roll over to the new day,
// so only honour TODAY when it was deliberately pinned via VITE_TODAY_OVERRIDE.
const todayStr=()=>ymd(import.meta.env.VITE_TODAY_OVERRIDE?TODAY:new Date());
function fmtDay(s){
  const [y,m,d]=s.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}
const slotPts=v=>SCORING_OPTIONS.includes(v)?1:0;
const rowScore=r=>r.score!=null?r.score:slotPts(r.sod)+slotPts(r.eod);
const otherSlots=r=>(r.sod==='Other'?1:0)+(r.eod==='Other'?1:0);
const slotText=(v,other)=>v==='Other'?'Other: '+(other||''):v;
const scoreColor=n=>n>0?'#1D9E75':'#a06a00';
const optionsHTML=()=>'<option value="">— select —</option>'+OPTIONS.map(o=>'<option value="'+o+'">'+(o==='Other'?'Other (type below)':o)+'</option>').join('');

// A project (grouped by name, towers together) is "In Progress" if any tower is In Progress, otherwise "Not Started"
// while any tower is Not Started. Null = not counted any more (all towers Completed / On Hold / CNC / Only Supply).
function liveGroup(name){
  const towers=state.projects.filter(p=>p.name===name);
  if(towers.some(p=>p.status==='In Progress')) return 'In Progress';
  if(towers.some(p=>p.status==='Not Started')) return 'Not Started';
  return null;
}
// One project per project *name* (towers grouped, same as the dashboard's "Total projects" tile).
function countedProjectNames(){
  return [...new Set(state.projects.map(p=>p.name))]
    .filter(n=>liveGroup(n)!==null)
    .sort((a,b)=>a.localeCompare(b));
}
// Today's project set: live counted projects, plus anything already logged today for a project that has since left
// Not Started/In Progress — keeps the numerator and the "/ max" denominator on the same set of projects.
function todayTotalNames(){
  const logged=state.sodEodLog.filter(r=>r.log_date===todayStr()).map(r=>r.project_name);
  return [...new Set([...countedProjectNames(),...logged])];
}
// A project already logged today keeps the group it had when it was logged (the database stamped it), so a status change
// later in the day doesn't move it between groups — matching how the day will read tomorrow. Projects not logged yet
// use their live group.
function todayGroupOf(name){
  const row=state.sodEodLog.find(r=>r.log_date===todayStr()&&r.project_name===name);
  return (row&&row.project_group)||liveGroup(name)||'Not Started';
}

// Everything one day's header / card needs. `split` is null when the day cannot be split by group (older rows logged
// before the group snapshot existed) — then only the combined score is shown.
//   Today: live project set (see todayGroupOf for which group each project is in), so it always equals the top card.
//   Earlier days: the group counts the database froze when the day's rows were saved (total_in_progress /
//   total_not_started), so a later status change never rewrites history.
function daySummary(day){
  const rows=state.sodEodLog.filter(r=>r.log_date===day);
  const score=rows.reduce((a,r)=>a+rowScore(r),0);
  if(day===todayStr()){
    const names=todayTotalNames();
    const groupOf={}; names.forEach(n=>{ groupOf[n]=todayGroupOf(n); });
    const split=GROUPS.map(g=>({
      group:g,
      count:names.filter(n=>groupOf[n]===g).length,
      score:rows.filter(r=>groupOf[r.project_name]===g).reduce((a,r)=>a+rowScore(r),0)
    }));
    split.forEach(s=>{ s.max=s.count*MAX_PER_PROJECT[s.group]; });
    return {rows,score,max:split.reduce((a,s)=>a+s.max,0),split,total:names.length,names};
  }
  const snapped=rows.length>0&&rows.every(r=>r.project_group&&r.total_in_progress!=null&&r.total_not_started!=null);
  if(snapped){
    const counts={'In Progress':Math.max(...rows.map(r=>Number(r.total_in_progress))),'Not Started':Math.max(...rows.map(r=>Number(r.total_not_started)))};
    const split=GROUPS.map(g=>({
      group:g,
      count:counts[g],
      max:counts[g]*MAX_PER_PROJECT[g],
      score:rows.filter(r=>r.project_group===g).reduce((a,r)=>a+rowScore(r),0)
    }));
    return {rows,score,max:split.reduce((a,s)=>a+s.max,0),split};
  }
  const snaps=rows.filter(r=>r.total_projects!=null).map(r=>Number(r.total_projects));
  return {rows,score,max:(snaps.length?Math.max(...snaps):countedProjectNames().length)*2,split:null};
}
const findRow=(date,project)=>state.sodEodLog.find(r=>r.log_date===date&&r.project_name===project);

const groupPillStyle=g=>g==='In Progress'?'background:#fff3cd;color:#7a4f00':'background:#e8e8e8;color:#444';

export async function renderSodEodReport(el){
  state.sodEodFormDate=state.sodEodFormDate||todayStr();
  const names=countedProjectNames();
  const slot=(id,label)=>'<div class="form-group"><label class="form-label">'+label+'</label>'+
    '<select class="form-input" id="sodeod-'+id+'" onchange="sodEodSlotChanged()">'+optionsHTML()+'</select>'+
    '<input type="text" class="form-input" id="sodeod-'+id+'-other" placeholder="Type what was done…" style="display:none;margin-top:6px"></div>';
  el.innerHTML=
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">'+
      '<button class="btn btn-outline btn-sm" onclick="closeReport()">← All reports</button>'+
      '<h3 style="font-size:15px;font-weight:600">📞 SOD / EOD Follow-Up Tracker</h3>'+
    '</div>'+
    '<div id="sodeod-score"><div class="empty">Loading…</div></div>'+
    '<div class="proj-card" style="cursor:default;margin-bottom:14px">'+
      '<div class="proj-name" style="margin-bottom:10px">Log Follow-Up</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;align-items:start">'+
        '<div class="form-group"><label class="form-label">Date</label><input type="date" class="form-input" id="sodeod-date" value="'+state.sodEodFormDate+'" max="'+todayStr()+'" onchange="sodEodFormChanged()"></div>'+
        '<div class="form-group"><label class="form-label">Project</label><select class="form-input" id="sodeod-project" onchange="sodEodFormChanged()"><option value="">— select project —</option>'+names.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join('')+'</select></div>'+
        slot('sod','SOD Follow-Up')+
        slot('eod','EOD Follow-Up')+
      '</div>'+
      '<div class="form-group" style="margin-top:12px"><label class="form-label">Remarks</label><input type="text" class="form-input" id="sodeod-remarks" placeholder="optional"></div>'+
      '<div style="display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap">'+
        '<button class="btn btn-green btn-sm" id="sodeod-save" onclick="saveSodEodEntry()">+ Add Entry</button>'+
        '<span id="sodeod-note" style="font-size:12px;color:#888"></span>'+
      '</div>'+
      '<div id="sodeod-msg" style="font-size:12px;margin-top:8px"></div>'+
    '</div>'+
    '<input type="text" class="form-input" id="sodeod-search" placeholder="Search project..." value="'+esc(state.sodEodSearch)+'" oninput="sodEodSearchChanged(this.value)" style="margin-bottom:10px">'+
    '<div id="sodeod-folders"></div>';

  try{
    const {data,error}=await db.from(TABLE).select('*').order('log_date',{ascending:false});
    if(error) throw error;
    state.sodEodLog=data||[];
  }catch(e){
    console.error('SOD/EOD load failed', e);
    document.getElementById('sodeod-score').innerHTML='<div class="empty" style="color:#cc3333">Could not load the SOD/EOD log. Check your connection and reopen this report.</div>';
    return;
  }
  sodEodFormChanged();
  refreshSodEod();
}

function refreshSodEod(){
  renderScoreCard();
  renderFolders();
}

function renderScoreCard(){
  const box=document.getElementById('sodeod-score'); if(!box) return;
  const today=todayStr();
  const s=daySummary(today);
  const loggedNames=s.rows.map(r=>r.project_name);
  const pending=s.names.filter(n=>!loggedNames.includes(n)).sort((a,b)=>a.localeCompare(b));
  const other=s.rows.reduce((a,r)=>a+otherSlots(r),0);
  const [ip,ns]=s.split;
  const tile=(label,val,sub,color)=>'<div class="metric"><div class="metric-label">'+label+'</div><div class="metric-val"'+(color?' style="color:'+color+'"':'')+'>'+val+'</div><div class="metric-sub">'+sub+'</div></div>';
  box.innerHTML=
    '<div class="section-hdr" style="margin-top:0">📊 Today\'s Completion Score <span style="font-size:11px;font-weight:400;color:#888">'+fmtDay(today)+'</span></div>'+
    '<div class="metrics">'+
      tile('Total Projects',s.total,'In Progress '+ip.count+' · Not Started '+ns.count)+
      tile('Not Logged Yet',pending.length,'projects, 0 pts',pending.length>0?'#a06a00':'#1D9E75')+
      tile('Other Today',other,'free text, 0 pts')+
      tile('In Progress',ip.score+' / '+ip.max,'max '+MAX_PER_PROJECT['In Progress']+' per project',scoreColor(ip.score))+
      tile('Not Started',ns.score+' / '+ns.max,'max '+MAX_PER_PROJECT['Not Started']+' per project',scoreColor(ns.score))+
      tile('Total Score',s.score+' / '+s.max,'both groups',scoreColor(s.score))+
    '</div>'+
    (pending.length?'<div style="font-size:12px;color:#888;margin:-4px 0 14px">Not logged yet: '+pending.map(esc).join(', ')+'</div>':'');
}

function renderFolders(){
  const box=document.getElementById('sodeod-folders'); if(!box) return;
  const q=state.sodEodSearch.trim().toLowerCase();
  const rows=state.sodEodLog.filter(r=>!q||r.project_name.toLowerCase().includes(q));
  if(!rows.length){
    box.innerHTML='<div class="empty">'+(q?'No entries match "'+esc(state.sodEodSearch)+'".':'No entries yet — log the first follow-up above.')+'</div>';
    return;
  }
  const byDay={};
  rows.forEach(r=>{ (byDay[r.log_date]=byDay[r.log_date]||[]).push(r); });
  const today=todayStr();
  box.innerHTML=Object.keys(byDay).sort().reverse().map(day=>{
    const list=byDay[day].slice().sort((a,b)=>a.project_name.localeCompare(b.project_name));
    // Header always describes the whole day, even while a search narrows the rows listed below it.
    const sum=daySummary(day);
    // Today's folder starts open; searching opens every matching folder; otherwise the admin's last click wins.
    const explicit=state.sodEodOpenDays[day];
    const open=explicit!==undefined?explicit:(q?true:day===today);
    return '<div class="proj-card" style="cursor:default;padding:0;margin-bottom:8px;overflow:hidden">'+
      '<div onclick="toggleSodEodDay(\''+day+'\')" style="cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px;background:'+(open?'#f4faf7':'#fff')+'">'+
        '<span style="font-weight:700;font-size:14px">'+(open?'📂':'📁')+' '+fmtDay(day)+(day===today?' <span class="badge bg">Today</span>':'')+'</span>'+
        '<span class="count-pill" style="background:#e8e8e8;color:#444">'+sum.rows.length+' project'+(sum.rows.length!==1?'s':'')+'</span>'+
        (sum.split?sum.split.map(g=>'<span class="count-pill" style="'+groupPillStyle(g.group)+'" title="'+g.group+' projects: score / maximum ('+MAX_PER_PROJECT[g.group]+' per project)">'+g.group+' '+g.score+' / '+g.max+'</span>').join(''):'')+
        '<span class="count-pill" style="background:#e8f5f0;color:'+scoreColor(sum.score)+'" title="Day score / maximum">Total '+sum.score+' / '+sum.max+'</span>'+
      '</div>'+
      (open?'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'+
        '<thead><tr style="background:#f5f5f5;text-align:left">'+
          ['Project','SOD Follow-up','EOD Follow-up','Score','Remarks'].map(h=>'<th style="padding:8px 12px;font-weight:600;color:#555;white-space:nowrap">'+h+'</th>').join('')+
        '</tr></thead><tbody>'+
        list.map(r=>{
          const sc=rowScore(r);
          return '<tr style="border-top:1px solid #eee">'+
            '<td style="padding:8px 12px;font-weight:600">'+esc(r.project_name)+'</td>'+
            '<td style="padding:8px 12px;color:'+(r.sod==='Other'?'#a06a00':'inherit')+'">'+esc(slotText(r.sod,r.sod_other))+'</td>'+
            '<td style="padding:8px 12px;color:'+(r.eod==='Other'?'#a06a00':'inherit')+'">'+esc(slotText(r.eod,r.eod_other))+'</td>'+
            '<td style="padding:8px 12px;white-space:nowrap;font-weight:700;color:'+scoreColor(sc)+'">'+sc+' / 2</td>'+
            '<td style="padding:8px 12px;color:#666">'+(r.remarks?esc(r.remarks):'—')+'</td>'+
          '</tr>';
        }).join('')+
      '</tbody></table></div>':'')+
    '</div>';
  }).join('');
}

/* ══ FORM ══ */
const $=id=>document.getElementById(id);

// Show each slot's free-text box only while that slot is set to "Other".
export function sodEodSlotChanged(){
  ['sod','eod'].forEach(k=>{
    const sel=$('sodeod-'+k), input=$('sodeod-'+k+'-other');
    if(input) input.style.display=(sel&&sel.value==='Other')?'':'none';
  });
}

// A saved entry is final: show what was logged, read-only, and block saving another one for that date.
function setFormLocked(row){
  ['sodeod-sod','sodeod-eod','sodeod-sod-other','sodeod-eod-other','sodeod-remarks','sodeod-save'].forEach(id=>{ const el=$(id); if(el) el.disabled=!!row; });
  const note=$('sodeod-note');
  if(note) note.textContent=row?'🔒 Already logged for this date — saved entries are final and cannot be edited.':'';
}

// Date or project changed: if that project already has an entry for the date, show it locked; else a clean form.
export function sodEodFormChanged(){
  const dateEl=$('sodeod-date'); if(!dateEl) return;
  state.sodEodFormDate=dateEl.value||state.sodEodFormDate;
  const project=$('sodeod-project').value;
  const row=project?findRow(dateEl.value,project):null;
  $('sodeod-sod').value=row?row.sod:'';
  $('sodeod-eod').value=row?row.eod:'';
  $('sodeod-sod-other').value=row&&row.sod_other?row.sod_other:'';
  $('sodeod-eod-other').value=row&&row.eod_other?row.eod_other:'';
  $('sodeod-remarks').value=row&&row.remarks?row.remarks:'';
  setFormLocked(row);
  sodEodSlotChanged();
  const msg=$('sodeod-msg'); if(msg) msg.textContent='';
}

export function toggleSodEodDay(day){
  const q=state.sodEodSearch.trim();
  const current=state.sodEodOpenDays[day]!==undefined?state.sodEodOpenDays[day]:(q?true:day===todayStr());
  state.sodEodOpenDays[day]=!current;
  renderFolders();
}

export function sodEodSearchChanged(v){
  state.sodEodSearch=v||'';
  renderFolders();
}

export async function saveSodEodEntry(){
  const msg=$('sodeod-msg');
  const fail=t=>{ msg.style.color='#cc3333'; msg.textContent=t; };
  const date=$('sodeod-date').value;
  const project=$('sodeod-project').value;
  const sod=$('sodeod-sod').value;
  const eod=$('sodeod-eod').value;
  const sodOther=$('sodeod-sod-other').value.trim();
  const eodOther=$('sodeod-eod-other').value.trim();
  const remarks=$('sodeod-remarks').value.trim();
  if(!date) return fail('Please pick a date.');
  if(date>todayStr()) return fail('Date cannot be in the future.');
  if(!project) return fail('Please select a project.');
  if(!sod||!eod) return fail('Both SOD and EOD follow-up are required — pick one for each (choose "Other" and type it if it was something else).');
  if(sod==='Other'&&!sodOther) return fail('Type what was done for SOD (you chose Other).');
  if(eod==='Other'&&!eodOther) return fail('Type what was done for EOD (you chose Other).');
  if(findRow(date,project)) return fail('This project is already logged for this date — saved entries are final and cannot be edited.');

  const btn=$('sodeod-save');
  btn.disabled=true;
  try{
    // project_group / total_* / score are stamped by the database — never sent from here.
    const res=await db.from(TABLE).insert({
      log_date:date, project_name:project, sod, eod,
      sod_other:sod==='Other'?sodOther:null, eod_other:eod==='Other'?eodOther:null,
      remarks:remarks||null, created_by:state.currentUser?state.currentUser.id:null
    }).select().single();
    if(res.error) throw res.error;
    state.sodEodLog.push(Array.isArray(res.data)?res.data[0]:res.data);
    // Newly logged day opens so the admin sees what they just saved.
    state.sodEodOpenDays[date]=true;
    $('sodeod-project').value='';
    $('sodeod-sod').value='';
    $('sodeod-eod').value='';
    $('sodeod-sod-other').value='';
    $('sodeod-eod-other').value='';
    $('sodeod-remarks').value='';
    sodEodSlotChanged();
    msg.style.color='#1D9E75';
    msg.textContent='✅ Saved — '+project+' · '+fmtDay(date);
    refreshSodEod();
  }catch(e){
    console.error('SOD/EOD save failed', e);
    fail('Could not save — '+((e&&e.message)||'please try again')+'. If this project was already logged for this date, reopen the report to see it.');
  }finally{
    btn.disabled=false;
  }
}
