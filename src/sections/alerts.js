import { state } from '../lib/state.js';
import { syncProject } from '../data/loadAllData.js';
import { CHECKLIST_DEFS, TODAY, reqTypeLabel } from '../lib/constants.js';
import { canDo, daysDiff, fmt, fmtDate, needsFinanceReview, needsRABill, pct, visibleProjects } from '../lib/helpers.js';
import { openAddDPR } from './dpr/dprTab.js';
import { renderMetrics } from './metrics.js';
import { setTab, showSection } from './navigation.js';
import { openUpdate } from './projects/addEditProject.js';
import { renderProjects } from './projects/projectCards.js';
import { renderRequests } from './requests/requestsTab.js';

/* ══ ALERTS ══ */
export function computeAlerts(){
  const alerts=[];
  visibleProjects().forEach(p=>{
    if(p.status==='Completed'||p.status==='On Hold') return;
    if(p.committedDate&&new Date(p.committedDate)<TODAY){
      const d=daysDiff(p.committedDate,TODAY.toISOString().slice(0,10));
      alerts.push({type:'overdue',sev:'red',proj:p,msg:'Committed date passed '+d+' day'+(d>1?'s':'')+' ago',detail:pct(p.installedQty,p.plannedQty)+'% installed · Committed: '+fmtDate(p.committedDate)});
    } else if(p.committedDate){
      const d=daysDiff(TODAY.toISOString().slice(0,10),p.committedDate);
      if(d<=14&&pct(p.installedQty,p.plannedQty)<80)
        alerts.push({type:'atrisk',sev:'amber',proj:p,msg:'Deadline in '+d+' days — only '+pct(p.installedQty,p.plannedQty)+'% done',detail:'Target: '+fmtDate(p.committedDate)});
    }
    p.milestones.forEach(m=>{
      if(!m.actual&&m.planned&&new Date(m.planned)<TODAY){
        const d=daysDiff(m.planned,TODAY.toISOString().slice(0,10));
        alerts.push({type:'milestone',sev:'red',proj:p,ms:m,msg:'Milestone stalled: "'+m.label+'"',detail:'Planned '+fmtDate(m.planned)+' — '+d+'d overdue.'});
      }
    });
    p.constraints.filter(c=>c.status==='open').forEach(c=>{
      alerts.push({type:'constraint',sev:'amber',proj:p,c:c,msg:'Open constraint: "'+c.text+'"',detail:'Logged: '+c.date});
    });
    if(p.status==='In Progress'&&p.installedQty===0)
      alerts.push({type:'noprogress',sev:'amber',proj:p,msg:'No installation recorded yet',detail:'Project is "In Progress" but 0 units installed.'});
    if(needsRABill(p))
      alerts.push({type:'rabill',sev:'amber',proj:p,msg:'RA Bill to be generated — WCC uploaded',detail:'WCC uploaded and qty updated. RA bill amount not yet entered.'});
    if(needsFinanceReview(p))
      alerts.push({type:'financereview',sev:'amber',proj:p,msg:'JMR qty updated by installation team',detail:'JMR is now '+fmt(p.jmrQty)+'. Please review and update RA bill information under Finance.'});
    (p.snags||[]).filter(s=>s.status!=='resolved').forEach(s=>{
      alerts.push({type:'snag',sev:s.severity==='Critical'?'red':'amber',proj:p,msg:'Snag ('+s.severity+'): '+s.description,detail:(s.location||'—')+' · Raised: '+s.raisedDate});
    });
    // Recently dispatched material, not yet marked arrived — highlighted so the assigned
    // supervisor knows to expect it and acknowledge on arrival.
    state.materialLots.filter(l=>l.projId===p.id&&!l.actualArrival&&l.dispatchDate).forEach(l=>{
      const daysSinceDispatch=daysDiff(l.dispatchDate,TODAY.toISOString().slice(0,10));
      if(daysSinceDispatch>=0&&daysSinceDispatch<=7){
        const whenText=daysSinceDispatch===0?'today':daysSinceDispatch+' day(s) ago';
        alerts.push({type:'dispatch',sev:daysSinceDispatch>=3?'amber':'red',proj:p,lot:l,msg:'Material dispatched — '+l.lotNo,detail:'Dispatched '+whenText+'. Expected: '+(l.expectedArrival?fmtDate(l.expectedArrival):'—')});
      }
    });
    // DPR not being filled while the project is still active — this is what keeps Admin,
    // Ops Manager, and Finance aligned with what's actually happening on site, since they
    // don't see day-to-day progress any other way.
    if(p.status!=='Completed'){
      const projDprs=state.dprLog.filter(d=>d.projId===p.id);
      const lastDpr=projDprs.length?projDprs.reduce((latest,d)=>(!latest||d.date>latest.date)?d:latest,null):null;
      const daysSinceLastDpr=lastDpr?daysDiff(lastDpr.date,TODAY.toISOString().slice(0,10)):null;
      if(!lastDpr){
        alerts.push({type:'nodpr',sev:'amber',proj:p,msg:'No DPR ever submitted for this project',detail:'Project is "'+p.status+'" but no daily progress report has been logged yet.'});
      } else if(daysSinceLastDpr>=2){
        alerts.push({type:'nodpr',sev:daysSinceLastDpr>=5?'red':'amber',proj:p,msg:'DPR not submitted in '+daysSinceLastDpr+' days',detail:'Last DPR was on '+fmtDate(lastDpr.date)+'. Supervisor: '+(p.supervisor||'—')});
      }
    }
  });
  return alerts;
}

export function updateBell(){
  const a=computeAlerts();
  const b=document.getElementById('bell-count');
  if(b){
    if(a.length>0){ b.classList.remove('hidden'); b.textContent=a.length; }
    else b.classList.add('hidden');
  }
  updateRequestsBadge();
  updateTabBadges();
}
// Same red-badge treatment as Requests, applied to the other places new activity shows up:
// All Projects (open snags), DPR log (today's submissions), Material (undelivered
// dispatches), Finance (RA bills pending generation) — all computed live from real data,
// no separate "seen/unseen" tracking needed.
export function setBadge(id,count){
  const el=document.getElementById(id); if(!el) return;
  if(count>0){ el.classList.remove('hidden'); el.textContent=count; }
  else el.classList.add('hidden');
}
export function updateTabBadges(){
  if(!state.currentUser) return;
  const vp=visibleProjects();
  const openSnagCount=vp.reduce((a,p)=>a+(p.snags||[]).filter(s=>s.status!=='resolved').length,0);
  setBadge('projects-count', openSnagCount);

  const todayStr=new Date().toISOString().slice(0,10);
  const dprToday=state.dprLog.filter(d=>d.date===todayStr&&vp.some(p=>p.id===d.projId)).length;
  const checklistsAwaitingReview=vp.reduce((a,p)=>a+CHECKLIST_DEFS.filter(def=>p[def.completedField]&&!p[def.reviewedField]).length,0);
  setBadge('dpr-count', dprToday+checklistsAwaitingReview);

  const undeliveredLots=state.materialLots.filter(l=>!l.actualArrival&&vp.some(p=>p.id===l.projId)).length;
  setBadge('material-count', undeliveredLots);

  const raBillPending=vp.filter(p=>needsRABill(p)).length;
  const financeReviewPending=vp.filter(p=>needsFinanceReview(p)).length;
  setBadge('finance-count', raBillPending+financeReviewPending);
}
// Highlights the Requests nav tab in red: new unacknowledged requests for Admin/Manager,
// or newly-assigned requests awaiting a visit/survey report for Supervisor.
export function updateRequestsBadge(){
  const badge=document.getElementById('requests-count');
  if(!badge||!state.currentUser) return;
  let count=0;
  if(canDo('addProject')||canDo('manageTeam')){
    // New unacknowledged requests AND visits/surveys completed but not yet reviewed —
    // both need Admin/Manager action, so both should show on the tab itself.
    count=state.requests.filter(r=>r.status==='New'||r.status==='Visit Done').length;
  } else if(state.currentUser.role==='supervisor'){
    count=state.requests.filter(r=>r.assignedSupervisor===state.currentUser.username&&r.status==='Acknowledged').length;
  }
  if(count>0){ badge.classList.remove('hidden'); badge.textContent=count; }
  else badge.classList.add('hidden');
}

// New requests and overdue-review requests, surfaced at the top of Notifications —
// separate from the project-based alerts since requests aren't tied to a project yet.
export function buildRequestActivityHTML(){
  const newReqs=state.requests.filter(r=>r.status==='New');
  // Every request sitting at "Visit Done" needs review — shown immediately, not just once
  // overdue. This is what actually notifies Admin the moment a Supervisor finishes a visit.
  const awaitingReview=state.requests.filter(r=>r.status==='Visit Done'&&r.actualVisitDate);
  let html='';
  if(newReqs.length){
    html+='<div class="section-hdr">🆕 New requests <span class="count-pill" style="background:#d4edda;color:#1a5e2a">'+newReqs.length+'</span></div>';
    html+=newReqs.map(r=>'<div class="alert-card"><div class="alert-header"><div class="alert-icon amber">🆕</div><div class="alert-body"><div class="alert-proj">'+r.requestNumber+' — '+(r.details.developerName||r.details.projectName||'—')+'</div><div class="alert-msg">New '+reqTypeLabel(r.requestType)+' request needs acknowledgment</div><div class="alert-detail">Logged by '+r.createdBy+'</div></div></div>'+
      '<div class="alert-footer"><button class="btn btn-outline btn-sm" onclick="goToRequestCard('+r.id+')">View in Requests →</button></div>'+
    '</div>').join('');
  }
  if(awaitingReview.length){
    html+='<div class="section-hdr">⏳ Awaiting your review <span class="count-pill" style="background:#fde8e8;color:#8b1a1a">'+awaitingReview.length+'</span></div>';
    html+=awaitingReview.map(r=>{
      const hoursSince=Math.floor((Date.now()-new Date(r.actualVisitDate).getTime())/3600000);
      const isOverdue=hoursSince>24;
      return '<div class="alert-card"><div class="alert-header"><div class="alert-icon '+(isOverdue?'red':'amber')+'">'+(isOverdue?'🚨':'✅')+'</div><div class="alert-body"><div class="alert-proj">'+r.requestNumber+' — '+(r.details.developerName||r.details.projectName||'—')+'</div><div class="alert-msg">'+(isOverdue?'Visit done but not yet reviewed':'Visit/survey completed by '+(r.assignedSupervisor||'supervisor')+' — ready for review')+'</div><div class="alert-detail">'+hoursSince+'h since visit completed'+(isOverdue?' (overdue)':'')+'</div></div></div>'+
        '<div class="alert-footer"><button class="btn btn-outline btn-sm" onclick="goToRequestCard('+r.id+')">View in Requests →</button></div>'+
      '</div>';
    }).join('');
  }
  // Consolidated view across ALL checklist types on ALL projects — so Admin doesn't have
  // to expand each project individually to find what's waiting on them.
  const vpForChecklists=visibleProjects();
  const pendingChecklists=[];
  vpForChecklists.forEach(p=>CHECKLIST_DEFS.forEach(def=>{
    if(p[def.completedField]&&!p[def.reviewedField]) pendingChecklists.push({p,def});
  }));
  if(pendingChecklists.length){
    html+='<div class="section-hdr">📋 Checklists awaiting review <span class="count-pill" style="background:#fde8e8;color:#8b1a1a">'+pendingChecklists.length+'</span></div>';
    html+=pendingChecklists.map(({p,def})=>{
      const hoursSince=Math.floor((Date.now()-new Date(p[def.completedField]).getTime())/3600000);
      return '<div class="alert-card"><div class="alert-header"><div class="alert-icon amber">📋</div><div class="alert-body"><div class="alert-proj">'+p.name+' — '+p.tower+'</div><div class="alert-msg">'+def.label+' — fully completed, ready for review</div><div class="alert-detail">'+hoursSince+'h since completed'+'</div></div></div>'+
      '<div class="alert-footer"><button class="btn btn-outline btn-sm" onclick="goToDPRChecklist('+p.id+')">View in DPR →</button>'+
        (state.currentUser&&state.currentUser.role==='admin'?'<button class="btn btn-green btn-sm" onclick="acknowledgeChecklist(\''+def.key+'\','+p.id+')">✅ Acknowledge</button>':'')+
      '</div></div>';
    }).join('');
  }
  const recent=(state.activityLog||[]).slice(0,15);
  if(recent.length){
    html+='<div class="section-hdr">📋 Recent activity</div>';
    html+='<div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:4px 14px;margin-bottom:10px">'+
      recent.map(a=>'<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:12px"><b>'+a.eventType+':</b> '+a.message+' <span style="color:#888">· '+new Date(a.createdAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</span></div>').join('')+
    '</div>';
  }
  return html;
}
// Routes each alert type to wherever it's actually actioned — a dispatch alert belongs on
// the Material tab (at that lot), an RA-bill/JMR alert on Finance (the same "Set RA bill
// amount"/"Review now" panel Finance's own inline banner uses), a missing-DPR alert straight
// into the Add DPR form for that project — instead of always dumping every alert onto the
// generic Team > Projects card, which is only the right destination for project-level alerts
// (overdue, at-risk, milestone, constraint, no-progress, snag).
function alertViewButtonHTML(a){
  if(a.type==='dispatch') return '<button class="btn btn-outline btn-sm" onclick="goToMaterialLot('+a.proj.id+','+(a.lot?a.lot.id:'null')+')">View in Material →</button>';
  if(a.type==='rabill'||a.type==='financereview') return '<button class="btn btn-outline btn-sm" onclick="goToFinanceProject('+a.proj.id+')">View in Finance →</button>';
  if(a.type==='nodpr') return '<button class="btn btn-outline btn-sm" onclick="goToDPRForProject('+a.proj.id+')">Fill DPR →</button>';
  return '<button class="btn btn-outline btn-sm" onclick="goToProject('+a.proj.id+')">View project →</button>';
}

export function buildNotifHTML(){
  const alerts=computeAlerts();
  const iconMap={overdue:'🚨',atrisk:'⚠️',milestone:'⏰',constraint:'🔴',rabill:'💰',noprogress:'📊',snag:'🔧',dispatch:'📦',nodpr:'📝',financereview:'⚠️'};
  const reqSectionHTML=buildRequestActivityHTML();
  if(!alerts.length){
    return reqSectionHTML+'<div class="no-alerts"><div style="font-size:48px;margin-bottom:12px">✅</div><div style="font-size:16px;font-weight:700;margin-bottom:6px">All clear!</div><div style="font-size:13px;color:#888">No stalled milestones, overdue projects or open constraints.</div></div>';
  }
  const red=alerts.filter(a=>a.sev==='red');
  const amber=alerts.filter(a=>a.sev==='amber');
  let html=reqSectionHTML;
  function cardHTML(a){
    const waMsg=encodeURIComponent('Hi '+a.proj.supervisor+',\n\nAlert — '+a.proj.name+' '+a.proj.tower+':\n'+a.msg+'\n'+a.detail+'\n\n— Ecoste Ops');
    const waLink='https://wa.me/'+(a.proj.supervisorWA||'91XXXXXXXXXX')+'?text='+waMsg;
    return '<div class="alert-card">'+
      '<div class="alert-header">'+
        '<div class="alert-icon '+(a.sev==='red'?'red':'amber')+'">'+(iconMap[a.type]||'⚠️')+'</div>'+
        '<div class="alert-body">'+
          '<div class="alert-proj">'+a.proj.name+' — '+a.proj.tower+'</div>'+
          (a.type==='rabill'?'<span class="badge" style="background:#e8f0fe;color:#1a3a8f;margin-bottom:4px;display:inline-block">💰 For Finance Team</span><br>':'')+
          '<div class="alert-msg">'+a.msg+'</div>'+
          '<div class="alert-detail">'+a.detail+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="alert-footer">'+
        '<a class="wa-btn" href="'+waLink+'" target="_blank">📲 WhatsApp '+a.proj.supervisor+'</a>'+
        alertViewButtonHTML(a)+
        (a.type==='constraint'?'<button class="btn btn-amber btn-sm" onclick="quickSolve('+a.proj.id+',\''+a.c.text.replace(/'/g,"\\'")+'\')">✅ Mark solved</button>':'')+
      '</div>'+
    '</div>';
  }
  if(red.length){
    html+='<div class="section-hdr">🔴 Critical <span class="count-pill" style="background:#fde8e8;color:#8b1a1a">'+red.length+'</span></div>';
    html+=red.map(a=>cardHTML(a)).join('');
  }
  if(amber.length){
    html+='<div class="section-hdr">🟡 Warnings <span class="count-pill" style="background:#fff3cd;color:#7a4f00">'+amber.length+'</span></div>';
    html+=amber.map(a=>cardHTML(a)).join('');
  }
  return html;
}

export function quickSolve(projId,text){
  const p=state.projects.find(x=>x.id===projId); if(!p) return;
  const c=p.constraints.find(x=>x.text===text); if(!c) return;
  c.status='solved'; p.constraintsOpen=p.constraints.filter(x=>x.status==='open').length;
  syncProject(p);
  updateBell(); renderMetrics(); renderProjects();
  const el=document.getElementById('notif-body-inner');
  if(el) el.innerHTML=buildNotifHTML();
}

export function goToProject(id){
  showSection('team'); setTab('projects'); state.expanded[id]=true; renderProjects();
  setTimeout(()=>{ const el=document.getElementById('card-'+id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },200);
}

// Briefly outlines the target element so it's obvious what the click landed on, not just
// which tab — same treatment for every deep-link below.
function flashHighlight(el){
  if(!el) return;
  el.classList.add('nav-highlight');
  setTimeout(()=>el.classList.remove('nav-highlight'),2000);
}

export function goToMaterialLot(projId,lotId){
  showSection('team'); setTab('material');
  setTimeout(()=>{
    const el=document.getElementById(lotId?('lot-'+lotId):('mat-proj-'+projId))||document.getElementById('mat-proj-'+projId);
    if(el){ el.scrollIntoView({behavior:'smooth',block:'start'}); flashHighlight(el); }
  },250);
}

export function goToFinanceProject(projId){
  showSection('team'); setTab('finance');
  setTimeout(()=>openUpdate(projId),250);
}

export function goToDPRForProject(projId){
  showSection('team'); setTab('dpr');
  setTimeout(()=>openAddDPR(projId),250);
}

export function goToRequestCard(reqId){
  showSection('team'); setTab('requests');
  const sf=document.getElementById('req-f-status');
  if(sf&&sf.value){ sf.value=''; renderRequests(); }
  setTimeout(()=>{
    const el=document.getElementById('req-card-'+reqId);
    if(el){ el.scrollIntoView({behavior:'smooth',block:'start'}); flashHighlight(el); }
  },250);
}

export function goToDPRChecklist(projId){
  showSection('team'); setTab('dpr');
  setTimeout(()=>{
    const el=document.getElementById('dpr-checklist-'+projId);
    if(el){ el.scrollIntoView({behavior:'smooth',block:'start'}); flashHighlight(el); }
  },250);
}

export function copyDigest(){
  const alerts=computeAlerts();
  if(!alerts.length){ alert('No alerts to copy.'); return; }
  const text='ECOSTE ALERT DIGEST — '+new Date().toLocaleDateString('en-IN')+'\n\n'+
    alerts.map((a,i)=>(i+1)+'. ['+a.sev.toUpperCase()+'] '+a.proj.name+' — '+a.proj.tower+'\n   '+a.msg+'\n   '+a.detail).join('\n\n');
  navigator.clipboard.writeText(text).then(()=>alert('Digest copied!'));
}

