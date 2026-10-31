import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { notifyByGmail } from '../../lib/constants.js';
import { logActivity } from '../../lib/activityLog.js';
import { todayYmd } from '../../lib/visitPlanner.js';
import { SUMMARY_STATUS, buildSummaryRows, installedTodayText, longDate, summaryEmailBody, summarySubject, summaryWhatsAppText } from '../../lib/summary.js';

/* ══ SUMMARY (admin only — see plan.md v2-70) ══
   Daily DPR summary for the Sales team. Admin picks a date, reviews the list, and sends each project's summary to
   its sales person by Gmail draft or WhatsApp. "Sent" = admin clicked the button (Gmail / wa.me can't report
   delivery); each click is stored in summary_sends so it survives a refresh and shows who sent it and when. */

const isAdmin=()=>!!state.currentUser&&state.currentUser.role==='admin';
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

async function loadSends(ymd){
  try{
    const {data,error}=await db.from('summary_sends').select('*').eq('summary_date',ymd).order('id',{ascending:false});
    if(error) throw error;
    state.summarySends=data||[]; state.summarySendsFor=ymd;
    return true;
  }catch(e){ console.error('Summary: could not load sent history',e); return false; }
}

export async function renderSummary(){
  const host=document.getElementById('summary-content'); if(!host) return;
  // Second guard on top of the hidden tab and setTab() — this content must never render for a non-admin.
  if(!isAdmin()){ host.innerHTML=''; return; }
  if(!state.summaryDate) state.summaryDate=todayYmd();
  if(state.summarySendsFor!==state.summaryDate){
    host.innerHTML='<div class="empty">Loading…</div>';
    const ok=await loadSends(state.summaryDate);
    if(!ok){ host.innerHTML='<div class="empty" style="color:#cc3333">Could not load the Summary. Check your connection and reopen this tab.</div>'; return; }
  }
  drawSummary();
}

const latestSend=(projId,channel)=>(state.summarySends||[]).find(s=>s.project_id===projId&&s.channel===channel);
const timeOf=iso=>{ try{ return new Date(iso).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true}); }catch(e){ return ''; } };
const sentLine=(icon,s)=>s?'<div style="font-size:11px;color:#1D9E75">'+icon+' Sent '+timeOf(s.sent_at||new Date().toISOString())+(s.sent_by_name?' · '+esc(s.sent_by_name):'')+'</div>':'';

function rows(){
  return buildSummaryRows(state.summaryDate,{projects:state.projects,dprLog:state.dprLog,members:state.teamMembers,ledger:state.financeLedger});
}
// Same status list as the All Projects filter. A row's status is its PROJECT status, not the day's progress status.
const STATUS_FILTERS=['Completed','In Progress','Not Started','On Hold'];
const visibleRows=()=>rows().filter(r=>!state.summaryStatus||r.projStatus===state.summaryStatus);

// Cc: Admin + Ops Manager — every active admin / manager with an email on file (Team tab), minus the To address.
const ccFor=to=>[...new Set((state.teamMembers||[]).filter(m=>m.active&&['admin','manager'].includes(m.role)&&String(m.email||'').trim()).map(m=>m.email.trim()))]
  .filter(e=>e.toLowerCase()!==String(to).toLowerCase()).join(',');
const noteOf=key=>((state.summaryNotes||{})[key]||'').trim();
const waUrl=(r,note)=>'https://wa.me/'+r.sales.number+'?text='+encodeURIComponent(summaryWhatsAppText(r,note));

// What the Email and WhatsApp buttons will send, built by the very same functions the buttons use.
function previewHTML(r){
  if(!r.sales) return '<div style="color:#cc3333">No valid sales person — nothing can be sent for this project until its Sales owner is set.</div>';
  const note=noteOf(r.key);
  const box='background:#fff;border:1px solid #dde;border-radius:8px;padding:10px;white-space:pre-wrap;font-family:inherit;font-size:12px;margin:6px 0 0';
  const email=r.sales.email
    ?'<div style="font-size:12px"><b>To:</b> '+esc(r.sales.email)+'<br><b>Cc:</b> '+(esc(ccFor(r.sales.email))||'—')+'<br><b>Subject:</b> '+esc(summarySubject(r))+'</div><pre style="'+box+'">'+esc(summaryEmailBody(r,note))+'</pre>'
    :'<div style="color:#cc3333;font-size:12px">No email for '+esc(r.sales.name)+' in the Team tab.</div>';
  const wa=r.sales.number
    ?'<div style="font-size:12px"><b>To:</b> '+esc(r.sales.name)+' (+'+r.sales.number+')</div><pre style="'+box+'">'+esc(summaryWhatsAppText(r,note))+'</pre>'
    :'<div style="color:#cc3333;font-size:12px">No usable WhatsApp number for '+esc(r.sales.name)+' in the Team tab.</div>';
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">'+
    '<div><div style="font-weight:700;margin-bottom:4px">✉ Email</div>'+email+'</div>'+
    '<div><div style="font-weight:700;margin-bottom:4px">💬 WhatsApp</div>'+wa+'</div></div>';
}

function drawSummary(){
  const host=document.getElementById('summary-content'); if(!host) return;
  const list=visibleRows();
  const filed=list.filter(r=>r.filed).length, notFiled=list.length-filed;
  const missing=list.filter(r=>!r.sales).length;
  const head=
    '<div class="proj-card" style="margin-bottom:12px">'+
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">'+
        '<div><div class="proj-name">📨 DPR Summary For The Sales Team</div>'+
        '<div class="proj-sub">One summary per project, sent to its sales person by email or WhatsApp. '+filed+' filed · '+notFiled+' not filed'+(missing?' · <span style="color:#cc3333">'+missing+' without a sales person</span>':'')+'.</div></div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<select class="form-input" style="width:auto" onchange="summaryStatusChanged(this.value)">'+
            '<option value="">All statuses</option>'+STATUS_FILTERS.map(s=>'<option value="'+s+'"'+(state.summaryStatus===s?' selected':'')+'>'+s+'</option>').join('')+
          '</select>'+
          '<input type="date" class="form-input" style="width:auto" value="'+state.summaryDate+'" onchange="summaryDateChanged(this.value)">'+
        '</div>'+
      '</div>'+
    '</div>';
  const body=list.length
    ?'<div class="proj-card" style="overflow-x:auto"><table class="team-table"><thead><tr><th>Project</th><th>Today</th><th>Sales person</th><th>Note (optional)</th><th>Sent</th><th></th></tr></thead><tbody>'+
      list.map(r=>{
        const note=(state.summaryNotes||{})[r.key]||'';
        const em=r.sales&&r.sales.email, wa=r.sales&&r.sales.number;
        const why=!r.sales?'No valid sales person — set the Sales owner in Update Progress':'';
        const open=state.summaryPreview===r.key;
        return '<tr>'+
          '<td><div style="font-weight:600">'+esc(r.name)+' — '+esc(r.tower)+'</div><div class="proj-sub">'+esc(r.supervisor)+'</div></td>'+
          '<td><div style="font-weight:600;color:'+(r.statusKey==='ontrack'?'#1D9E75':r.statusKey==='slight'?'#b07a00':r.statusKey==='notfiled'?'#d9730d':'#c0392b')+'">'+r.status.emoji+' '+r.status.label+'</div>'+
            '<div class="proj-sub">'+(r.filed?esc(installedTodayText(r)):'No DPR on this date')+'</div></td>'+
          '<td>'+(r.sales?'<div>'+esc(r.sales.name)+'</div><div class="proj-sub">'+(esc(r.sales.email)||'<span style="color:#cc3333">no email</span>')+'</div>':'<span class="badge br" title="'+why+'">⚠ No sales person</span>')+'</td>'+
          '<td><input class="form-input" style="min-width:160px" placeholder="e.g. crane arriving tomorrow" value="'+esc(note)+'" oninput="summaryNoteChanged(\''+r.key+'\',this.value)"></td>'+
          '<td>'+(sentLine('✉',latestSend(r.projId,'email'))+sentLine('💬',latestSend(r.projId,'whatsapp'))||'<span class="proj-sub">Not sent</span>')+'</td>'+
          '<td style="white-space:nowrap"><button class="btn btn-outline btn-sm" onclick="summaryPreviewToggle(\''+r.key+'\')">👁 '+(open?'Hide':'Preview')+'</button> '+
            '<button class="btn btn-outline btn-sm" '+(em?'':'disabled title="'+(why||'No email for this sales person in the Team tab')+'"')+' onclick="summaryEmail(\''+r.key+'\')">✉ '+(latestSend(r.projId,'email')?'Resend':'Email')+'</button> '+
            '<button class="btn btn-outline btn-sm" '+(wa?'':'disabled title="'+(why||'No usable WhatsApp number for this sales person in the Team tab')+'"')+' onclick="summaryWhatsApp(\''+r.key+'\')">💬 '+(latestSend(r.projId,'whatsapp')?'Resend':'WhatsApp')+'</button></td>'+
        '</tr>'+(open?'<tr><td colspan="6" style="background:#f7f9f8"><div id="summary-preview">'+previewHTML(r)+'</div></td></tr>':'');
      }).join('')+
    '</tbody></table></div>'
    :'<div class="empty">'+(state.summaryStatus?'No '+state.summaryStatus+' project':'No project')+' filed a DPR on '+longDate(state.summaryDate)+(state.summaryStatus&&state.summaryStatus!=='In Progress'?'.':', and no In Progress project is waiting.')+'</div>';
  const legend='<div style="font-size:11px;color:#888;margin-top:10px">'+
    ['ontrack','slight','behind','notfiled'].map(k=>SUMMARY_STATUS[k].emoji+' '+SUMMARY_STATUS[k].label.toLowerCase()+' ('+SUMMARY_STATUS[k].note+')').join(' · ')+
    '. Email opens a Gmail draft (To the sales person, Cc Admin and Ops Manager); WhatsApp opens a chat with the sales person. "Sent" means you clicked the button.</div>';
  host.innerHTML='<style>#summary-content button:disabled{opacity:.4;cursor:not-allowed}</style>'+head+body+legend;
}

export function summaryDateChanged(v){ if(!v) return; state.summaryDate=v; renderSummary(); }
export function summaryStatusChanged(v){ state.summaryStatus=v||''; state.summaryPreview=''; drawSummary(); }
export function summaryPreviewToggle(key){ state.summaryPreview=state.summaryPreview===key?'':key; drawSummary(); }
// Typing a note must not redraw the table (it would steal focus), so it is stored and only the open preview refreshes.
export function summaryNoteChanged(key,v){
  state.summaryNotes=state.summaryNotes||{}; state.summaryNotes[key]=v;
  if(state.summaryPreview===key){
    const el=document.getElementById('summary-preview'), r=rowByKey(key);
    if(el&&r) el.innerHTML=previewHTML(r);
  }
}

const rowByKey=key=>rows().find(r=>r.key===key);

async function recordSend(r,channel,note){
  const {data,error}=await db.from('summary_sends').insert({project_id:r.projId,summary_date:r.ymd,channel,note:note||''}).select().single();
  if(error||!data){ console.error('Summary: could not record send',error); alert('The draft was opened, but the "sent" mark could not be saved: '+(error?error.message:'unknown error')); return; }
  state.summarySends=[data,...(state.summarySends||[])];
  logActivity('Summary sent',r.name+' — '+r.tower+' — '+channel+' to '+(r.sales?r.sales.name:'?')+' for '+longDate(r.ymd));
  drawSummary();
}

export function summaryEmail(key){
  if(!isAdmin()) return;
  const r=rowByKey(key); if(!r||!r.sales||!r.sales.email) return;
  const note=noteOf(key);
  notifyByGmail(r.sales.email,summarySubject(r),summaryEmailBody(r,note),ccFor(r.sales.email));
  recordSend(r,'email',note);
}

export function summaryWhatsApp(key){
  if(!isAdmin()) return;
  const r=rowByKey(key); if(!r||!r.sales||!r.sales.number) return;
  const note=noteOf(key);
  window.open(waUrl(r,note),'_blank');
  recordSend(r,'whatsapp',note);
}
