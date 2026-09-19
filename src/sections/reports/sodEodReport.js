import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { TODAY } from '../../lib/config.js';

/* ══ SOD / EOD FOLLOW-UP TRACKER (admin only — see plan.md v2-42) ══
   One row per project per day (DB unique on log_date + project_name). Both SOD and EOD are
   required. Score per slot: Call / Email / WhatsApp = +1, Not Done = -1 (so a row is -2, 0 or +2).
   Remarks are mandatory when either slot is Not Done. A saved entry is locked: no edit, no delete
   (DB policies allow only select + insert, see migration 0019).
   The score column is DB-owned (generated); slotPts() below only mirrors it as a fallback for
   rows that don't carry a score yet (TEST_MODE mock has no generated columns). */
const OPTIONS=['Call','Email','WhatsApp','Not Done'];
const TABLE='sod_eod_log';

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
const slotPts=v=>v==='Not Done'?-1:1;
const rowScore=r=>r.score!=null?r.score:slotPts(r.sod)+slotPts(r.eod);
const notDoneSlots=r=>(r.sod==='Not Done'?1:0)+(r.eod==='Not Done'?1:0);
const scoreColor=n=>n>0?'#1D9E75':n<0?'#cc3333':'#a06a00';
const signed=n=>n<0?'−'+Math.abs(n):String(n);

// One project per project *name* (towers grouped, same as the dashboard's "Total projects" tile);
// counted while any of its towers is Not Started or In Progress.
function countedProjectNames(){
  const groups={};
  state.projects.forEach(p=>{ (groups[p.name]=groups[p.name]||[]).push(p); });
  return Object.keys(groups)
    .filter(n=>groups[n].some(p=>p.status==='Not Started'||p.status==='In Progress'))
    .sort((a,b)=>a.localeCompare(b));
}
// Today's project set: live counted projects, plus anything already logged today for a project that has since left
// Not Started/In Progress — keeps the numerator and the "/ max" denominator on the same set of projects.
function todayTotalNames(){
  const logged=state.sodEodLog.filter(r=>r.log_date===todayStr()).map(r=>r.project_name);
  return [...new Set([...countedProjectNames(),...logged])];
}
// A day's maximum score = 2 x the number of counted projects. Today uses the live count (matches the top card);
// any earlier day uses the count the database froze when that day's rows were saved (total_projects), so a later
// status change never rewrites history. Legacy rows without a snapshot fall back to the live count.
function dayMaxScore(day){
  if(day===todayStr()) return todayTotalNames().length*2;
  const snaps=state.sodEodLog.filter(r=>r.log_date===day&&r.total_projects!=null).map(r=>Number(r.total_projects));
  return (snaps.length?Math.max(...snaps):countedProjectNames().length)*2;
}
const findRow=(date,project)=>state.sodEodLog.find(r=>r.log_date===date&&r.project_name===project);
const optionsHTML=(sel)=>'<option value="">— select —</option>'+OPTIONS.map(o=>'<option value="'+o+'"'+(o===sel?' selected':'')+'>'+o+'</option>').join('');

export async function renderSodEodReport(el){
  state.sodEodFormDate=state.sodEodFormDate||todayStr();
  const names=countedProjectNames();
  el.innerHTML=
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">'+
      '<button class="btn btn-outline btn-sm" onclick="closeReport()">← All reports</button>'+
      '<h3 style="font-size:15px;font-weight:600">📞 SOD / EOD Follow-Up Tracker</h3>'+
    '</div>'+
    '<div id="sodeod-score"><div class="empty">Loading…</div></div>'+
    '<div class="proj-card" style="cursor:default;margin-bottom:14px">'+
      '<div class="proj-name" style="margin-bottom:10px">Log Follow-Up</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">'+
        '<div class="form-group"><label class="form-label">Date</label><input type="date" class="form-input" id="sodeod-date" value="'+state.sodEodFormDate+'" max="'+todayStr()+'" onchange="sodEodFormChanged()"></div>'+
        '<div class="form-group"><label class="form-label">Project</label><select class="form-input" id="sodeod-project" onchange="sodEodFormChanged()"><option value="">— select project —</option>'+names.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join('')+'</select></div>'+
        '<div class="form-group"><label class="form-label">SOD Follow-Up</label><select class="form-input" id="sodeod-sod" onchange="sodEodSlotChanged()">'+optionsHTML('')+'</select></div>'+
        '<div class="form-group"><label class="form-label">EOD Follow-Up</label><select class="form-input" id="sodeod-eod" onchange="sodEodSlotChanged()">'+optionsHTML('')+'</select></div>'+
      '</div>'+
      '<div class="form-group" style="margin-top:12px"><label class="form-label" id="sodeod-remarks-label">Remarks</label><input type="text" class="form-input" id="sodeod-remarks" placeholder="optional"></div>'+
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
  const todayRows=state.sodEodLog.filter(r=>r.log_date===today);
  const loggedNames=todayRows.map(r=>r.project_name);
  const totalNames=todayTotalNames();
  const total=totalNames.length;
  const score=todayRows.reduce((a,r)=>a+rowScore(r),0);
  const notDone=todayRows.reduce((a,r)=>a+notDoneSlots(r),0);
  const pending=totalNames.filter(n=>!loggedNames.includes(n)).sort((a,b)=>a.localeCompare(b));
  box.innerHTML=
    '<div class="section-hdr" style="margin-top:0">📊 Today\'s Completion Score <span style="font-size:11px;font-weight:400;color:#888">'+fmtDay(today)+'</span></div>'+
    '<div class="metrics">'+
      '<div class="metric"><div class="metric-label">Total Projects</div><div class="metric-val">'+total+'</div><div class="metric-sub">Not Started / In Progress</div></div>'+
      '<div class="metric"><div class="metric-label">Not Done Today</div><div class="metric-val" style="color:'+(notDone>0?'#cc3333':'#1D9E75')+'">'+notDone+'</div><div class="metric-sub">'+(notDone>0?'−'+notDone+' pts':'0 pts')+'</div></div>'+
      '<div class="metric"><div class="metric-label">Not Logged Yet</div><div class="metric-val" style="color:'+(pending.length>0?'#a06a00':'#1D9E75')+'">'+pending.length+'</div><div class="metric-sub">projects, 0 pts</div></div>'+
      '<div class="metric"><div class="metric-label">Score</div><div class="metric-val" style="color:'+scoreColor(score)+'">'+signed(score)+' / '+(total*2)+'</div><div class="metric-sub">max 2 per project</div></div>'+
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
    const dayRows=state.sodEodLog.filter(r=>r.log_date===day);
    const score=dayRows.reduce((a,r)=>a+rowScore(r),0);
    const notDone=dayRows.reduce((a,r)=>a+notDoneSlots(r),0);
    // Today's folder starts open; searching opens every matching folder; otherwise the admin's last click wins.
    const explicit=state.sodEodOpenDays[day];
    const open=explicit!==undefined?explicit:(q?true:day===today);
    return '<div class="proj-card" style="cursor:default;padding:0;margin-bottom:8px;overflow:hidden">'+
      '<div onclick="toggleSodEodDay(\''+day+'\')" style="cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px;background:'+(open?'#f4faf7':'#fff')+'">'+
        '<span style="font-weight:700;font-size:14px">'+(open?'📂':'📁')+' '+fmtDay(day)+(day===today?' <span class="badge bg">Today</span>':'')+'</span>'+
        '<span class="count-pill" style="background:#e8e8e8;color:#444">'+dayRows.length+' project'+(dayRows.length!==1?'s':'')+'</span>'+
        (notDone?'<span class="count-pill" style="background:#fde8e8;color:#8b1a1a">'+notDone+' Not Done</span>':'')+
        '<span class="count-pill" style="background:#e8f5f0;color:'+scoreColor(score)+'" title="Day score / maximum (2 per counted project)">'+signed(score)+' / '+dayMaxScore(day)+'</span>'+
      '</div>'+
      (open?'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'+
        '<thead><tr style="background:#f5f5f5;text-align:left">'+
          ['Project','SOD Follow-up','EOD Follow-up','Score','Remarks'].map(h=>'<th style="padding:8px 12px;font-weight:600;color:#555;white-space:nowrap">'+h+'</th>').join('')+
        '</tr></thead><tbody>'+
        list.map(r=>{
          const sc=rowScore(r);
          return '<tr style="border-top:1px solid #eee">'+
            '<td style="padding:8px 12px;font-weight:600">'+esc(r.project_name)+'</td>'+
            '<td style="padding:8px 12px;white-space:nowrap;color:'+(r.sod==='Not Done'?'#cc3333':'inherit')+'">'+esc(r.sod)+'</td>'+
            '<td style="padding:8px 12px;white-space:nowrap;color:'+(r.eod==='Not Done'?'#cc3333':'inherit')+'">'+esc(r.eod)+'</td>'+
            '<td style="padding:8px 12px;white-space:nowrap;font-weight:700;color:'+scoreColor(sc)+'">'+signed(sc)+' / 2</td>'+
            '<td style="padding:8px 12px;color:#666">'+(r.remarks?esc(r.remarks):'—')+'</td>'+
          '</tr>';
        }).join('')+
      '</tbody></table></div>':'')+
    '</div>';
  }).join('');
}

/* ══ FORM ══ */
const needsRemarks=()=>document.getElementById('sodeod-sod').value==='Not Done'||document.getElementById('sodeod-eod').value==='Not Done';

// Remarks label/placeholder follow the rule: mandatory when SOD or EOD is Not Done, otherwise optional.
export function sodEodSlotChanged(){
  const req=needsRemarks();
  const label=document.getElementById('sodeod-remarks-label'), input=document.getElementById('sodeod-remarks');
  if(label) label.textContent=req?'Remarks (required)':'Remarks';
  if(input) input.placeholder=req?'Required — why was it not done?':'optional';
}

// A saved entry is final: show what was logged, read-only, and block saving another one for that date.
function setFormLocked(row){
  ['sodeod-sod','sodeod-eod','sodeod-remarks','sodeod-save'].forEach(id=>{ const el=document.getElementById(id); if(el) el.disabled=!!row; });
  const note=document.getElementById('sodeod-note');
  if(note) note.textContent=row?'🔒 Already logged for this date — saved entries are final and cannot be edited.':'';
}

// Date or project changed: if that project already has an entry for the date, show it locked; else a clean form.
export function sodEodFormChanged(){
  const dateEl=document.getElementById('sodeod-date'); if(!dateEl) return;
  state.sodEodFormDate=dateEl.value||state.sodEodFormDate;
  const project=document.getElementById('sodeod-project').value;
  const row=project?findRow(dateEl.value,project):null;
  document.getElementById('sodeod-sod').value=row?row.sod:'';
  document.getElementById('sodeod-eod').value=row?row.eod:'';
  document.getElementById('sodeod-remarks').value=row&&row.remarks?row.remarks:'';
  setFormLocked(row);
  sodEodSlotChanged();
  const msg=document.getElementById('sodeod-msg'); if(msg) msg.textContent='';
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
  const msg=document.getElementById('sodeod-msg');
  const fail=t=>{ msg.style.color='#cc3333'; msg.textContent=t; };
  const date=document.getElementById('sodeod-date').value;
  const project=document.getElementById('sodeod-project').value;
  const sod=document.getElementById('sodeod-sod').value;
  const eod=document.getElementById('sodeod-eod').value;
  const remarks=document.getElementById('sodeod-remarks').value.trim();
  if(!date) return fail('Please pick a date.');
  if(date>todayStr()) return fail('Date cannot be in the future.');
  if(!project) return fail('Please select a project.');
  if(!sod||!eod) return fail('Both SOD and EOD follow-up are required — pick one for each (use "Not Done" if it was not done).');
  if(findRow(date,project)) return fail('This project is already logged for this date — saved entries are final and cannot be edited.');
  if((sod==='Not Done'||eod==='Not Done')&&!remarks) return fail('Remarks are required when SOD or EOD is Not Done — say why it was not done.');

  const btn=document.getElementById('sodeod-save');
  btn.disabled=true;
  try{
    const res=await db.from(TABLE).insert({log_date:date,project_name:project,sod,eod,remarks:remarks||null,created_by:state.currentUser?state.currentUser.id:null}).select().single();
    if(res.error) throw res.error;
    state.sodEodLog.push(Array.isArray(res.data)?res.data[0]:res.data);
    // Newly logged day opens so the admin sees what they just saved.
    state.sodEodOpenDays[date]=true;
    document.getElementById('sodeod-project').value='';
    document.getElementById('sodeod-sod').value='';
    document.getElementById('sodeod-eod').value='';
    document.getElementById('sodeod-remarks').value='';
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
