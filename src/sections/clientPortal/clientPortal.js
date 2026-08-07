import { state } from '../../lib/state.js';
import { TODAY } from '../../lib/constants.js';
import { daysDiff, fmt, fmtDate, pct } from '../../lib/helpers.js';

export function clientGanttHTML(p){
  const months=9;
  const startDt=new Date(TODAY); startDt.setDate(1); startDt.setMonth(startDt.getMonth()-2);
  const endDt=new Date(startDt); endDt.setMonth(endDt.getMonth()+months);
  const totalDays=daysDiff(startDt.toISOString().slice(0,10),endDt.toISOString().slice(0,10));
  const mHeaders=[]; let cur=new Date(startDt);
  while(cur<endDt){ mHeaders.push(cur.toLocaleDateString('en-IN',{month:'short',year:'2-digit'})); cur.setMonth(cur.getMonth()+1); }
  const ppRaw=d=>{ if(!d) return null; const days=daysDiff(startDt.toISOString().slice(0,10),d); return (days/totalDays)*100; };
  const pp=d=>{ const v=ppRaw(d); return v===null?null:Math.max(0,Math.min(100,v)); };
  const instPct=pct(p.installedQty,p.plannedQty);
  const sp=pp(p.startDate||p.committedDate), ep=pp(p.actualDate||p.committedDate);
  const fw=sp!==null&&ep!==null?Math.max(1,ep-sp):0, fl=sp||0, pw=fw*(instPct/100);
  // Plots both planned (◆) and, once achieved, actual (✓) dates so the gap is visible.
  const msHtml=p.milestones.map(m=>{
    let out='';
    const plannedRaw=ppRaw(m.planned);
    if(plannedRaw!==null&&plannedRaw>=0&&plannedRaw<=100){
      const late=!m.actual&&m.planned&&new Date(m.planned)<TODAY;
      out+='<div class="gr-milestone" style="left:'+plannedRaw+'%;color:'+(late?'#cc3333':'#1D9E75')+'" title="'+m.label+' — Planned '+fmtDate(m.planned)+(late?' — OVERDUE':'')+'">◆</div>';
    }
    const actualRaw=ppRaw(m.actual);
    if(actualRaw!==null&&actualRaw>=0&&actualRaw<=100){
      out+='<div class="gr-milestone" style="left:'+actualRaw+'%;color:#185FA5" title="'+m.label+' — Achieved '+fmtDate(m.actual)+'">✓</div>';
    }
    return out;
  }).join('');
  return '<div style="font-size:13px;font-weight:600;margin-bottom:8px">'+p.name+' — '+p.tower+'</div>'+
    '<div class="gantt-wrap">'+
    '<div class="gantt-table">'+
    '<div class="gantt-header"><div class="gh-label" style="min-width:90px">Progress</div><div class="gh-months">'+mHeaders.map(m=>'<div class="gh-month">'+m+'</div>').join('')+'</div></div>'+
    '<div class="gantt-row"><div class="gr-label" style="min-width:90px"><div class="gr-name">'+instPct+'% installed</div></div>'+
      '<div class="gr-track">'+
        (sp!==null&&ep!==null?'<div class="gr-bar" style="left:'+fl+'%;width:'+fw+'%;background:#e0e0e0;opacity:.4"></div><div class="gr-bar" style="left:'+fl+'%;width:'+pw+'%;background:#1D9E75">'+(pw>8?'<div class="gr-bar-label">'+instPct+'%</div>':'')+'</div>':'')+
        msHtml+
      '</div>'+
    '</div></div></div>';
}
export function renderClientPortal(p){
  const pInst=pct(p.installedQty,p.plannedQty), pPay=pct(p.paymentCollected,p.raBillAmt), pJMR=pct(p.jmrQty,p.plannedQty);
  const phases=[
    {label:"Request intake",detail:"Project registered",done:true,active:false},
    {label:"Site validation",detail:"Site readiness confirmed",done:true,active:false},
    {label:"Measurement & design",detail:"Sizing complete, preview approved",done:pInst>0,active:pInst===0&&p.status!=='Not Started'},
    {label:"Production",detail:"Material dispatched & received on site",done:pInst>0,active:pInst===0&&p.status!=='Not Started'},
    {label:"Installation",detail:pInst+'% installed ('+fmt(p.installedQty)+' units)',done:pInst>=100,active:pInst>0&&pInst<100},
    {label:"JMR & handover",detail:pJMR+'% JMR achieved',done:pJMR>=100,active:pInst>=100&&pJMR<100},
    {label:"Billing & payment",detail:'₹'+fmt(p.paymentCollected)+' of ₹'+fmt(p.raBillAmt)+' collected',done:pPay>=100,active:pJMR>=100&&pPay<100}
  ];
  const tl=phases.map((ph,i)=>
    '<div class="tl-item">'+
      '<div class="tl-dc"><div class="tl-dot '+(ph.done?'done':ph.active?'active':'pend')+'"></div>'+(i<phases.length-1?'<div class="tl-line"></div>':'')+'</div>'+
      '<div class="tl-cnt"><div class="tl-phase">'+ph.label+'</div><div class="tl-detail">'+ph.detail+'</div></div>'+
      '<div style="flex-shrink:0">'+(ph.done?'<span class="badge bg">✓ Done</span>':ph.active?'<span class="badge ba">Active</span>':'<span class="badge bgr">Pending</span>')+'</div>'+
    '</div>'
  ).join('');
  const msHtml=p.milestones.length?p.milestones.map(m=>{
    const isStalled=!m.actual&&m.planned&&new Date(m.planned)<TODAY;
    return '<div class="ms-row">'+
      '<div class="ms-dot '+(m.gap!==null&&m.gap<=0?'md':isStalled?'mm':'mp')+'">'+(m.gap!==null&&m.gap<=0?'✓':isStalled?'⚠':'○')+'</div>'+
      '<div class="ms-lbl">'+m.label+'</div>'+
      '<div class="ms-date">'+fmtDate(m.planned)+'</div>'+
      '<div class="ms-gap '+(isStalled?'g-late':'g-ok')+'">'+(isStalled?'Pending':m.gap===0?'On time':m.gap<0?Math.abs(m.gap)+'d early':(m.gap||0)+'d late')+'</div>'+
    '</div>';
  }).join(''):'<div style="font-size:12px;color:#888;padding:6px 0">No milestones yet.</div>';
  const cmHtml=p.comments.map(c=>'<div class="comment"><div>'+c.text+'</div><div class="comment-meta">'+c.author+' · '+c.time+'</div></div>').join('');
  const initials=state.loggedInClient.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('c-avatar').textContent=initials;
  document.getElementById('c-welcome').textContent='Hello, '+state.loggedInClient.name;
  document.getElementById('c-badge').textContent='🔑 '+p.accessCode;
  document.getElementById('client-portal-body').innerHTML=
    '<div class="c-header"><h2>'+p.name+' — '+p.tower+'</h2><p>'+p.developer+' · '+p.city+' · Supervisor: '+p.supervisor+'</p></div>'+
    '<div class="c-stats">'+
      '<div class="metric"><div class="metric-label">Installed</div><div class="metric-val">'+pInst+'%</div><div class="metric-sub">'+fmt(p.installedQty)+' units</div></div>'+
      '<div class="metric"><div class="metric-label">JMR done</div><div class="metric-val">'+pJMR+'%</div><div class="metric-sub">'+fmt(p.jmrQty)+' units</div></div>'+
      '<div class="metric"><div class="metric-label">Payment</div><div class="metric-val">'+pPay+'%</div><div class="metric-sub">₹'+fmt(Math.round(p.paymentCollected/1000))+'K</div></div>'+
    '</div>'+
    '<div class="proj-card" style="margin-bottom:12px;cursor:default"><h3 style="margin-bottom:10px;font-size:14px;font-weight:600">Project timeline</h3>'+tl+'</div>'+
    '<div class="proj-card" style="margin-bottom:12px;cursor:default"><h3 style="margin-bottom:10px;font-size:14px;font-weight:600">Gantt chart</h3>'+clientGanttHTML(p)+'</div>'+
    (p.milestones.length?'<div class="proj-card" style="margin-bottom:12px;cursor:default"><h3 style="margin-bottom:8px;font-size:14px;font-weight:600">Milestones</h3>'+msHtml+'</div>':'')+
    '<div class="proj-card" style="margin-bottom:12px;cursor:default"><h3 style="margin-bottom:8px;font-size:14px;font-weight:600">Running bill</h3>'+
      ((p.raBillHistory||[]).length?
        '<table style="width:100%;font-size:12px;border-collapse:collapse">'+
        '<thead><tr><th style="text-align:left;padding:4px 0;color:#666">Bill #</th><th style="text-align:left;padding:4px 0;color:#666">Date</th><th style="text-align:right;padding:4px 0;color:#666">Status</th></tr></thead><tbody>'+
        (p.raBillHistory||[]).map(b=>'<tr><td style="padding:4px 0;border-top:1px solid #f0f0f0">#'+b.billNumber+'</td><td style="padding:4px 0;border-top:1px solid #f0f0f0">'+fmtDate(b.date)+'</td><td style="padding:4px 0;border-top:1px solid #f0f0f0;text-align:right"><span class="badge '+(p.raBillReady?'bg':'ba')+'">'+(p.raBillReady?'Ready':'Processing')+'</span></td></tr>').join('')+
        '</tbody></table>'
        :'<div style="font-size:12px;color:#888">No bills to show yet.</div>')+
    '</div>'+
    '<div class="proj-card" style="cursor:default;margin-bottom:20px"><h3 style="margin-bottom:8px;font-size:14px;font-weight:600">Updates & messages</h3>'+
      '<div class="comment-list" style="margin-bottom:8px">'+(cmHtml||'<div style="font-size:12px;color:#888">No updates yet.</div>')+'</div>'+
      '<div class="ci-row"><input id="client-msg" placeholder="Leave feedback or a question..."><button class="btn btn-green btn-sm" onclick="sendClientMsg('+p.id+')">Send</button></div>'+
    '</div>';
}
export function sendClientMsg(id){
  const inp=document.getElementById('client-msg'); if(!inp||!inp.value.trim()) return;
  const p=state.projects.find(x=>x.id===id); if(!p) return;
  p.comments.push({author:state.loggedInClient?state.loggedInClient.name:'Client',text:inp.value.trim(),time:new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})});
  renderClientPortal(p);
}

