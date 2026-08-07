import { canDo, fmt, visibleProjects } from '../lib/helpers.js';
import { computeAlerts } from './alerts.js';

/* ══ METRICS ══ */
export function renderMetrics(){
  const vp=visibleProjects();
  // "Total projects" counts unique projects (grouping towers/blocks under their parent
  // project name), not every tower row — matches the Developer → Project → Tower hierarchy.
  const projectGroups={};
  vp.forEach(p=>{ if(!projectGroups[p.name]) projectGroups[p.name]=[]; projectGroups[p.name].push(p); });
  const total=Object.keys(projectGroups).length;
  const done=Object.values(projectGroups).filter(towers=>towers.every(p=>p.status==='Completed')).length;
  const ip=Object.values(projectGroups).filter(towers=>!towers.every(p=>p.status==='Completed')&&towers.some(p=>p.status==='In Progress'||p.status==='Completed')).length;
  const tInst=vp.reduce((a,p)=>a+p.installedQty,0);
  const tBill=vp.reduce((a,p)=>a+p.raBillAmt,0), tPaid=vp.reduce((a,p)=>a+p.paymentCollected,0);
  const openC=vp.reduce((a,p)=>a+p.constraintsOpen,0);
  const alerts=computeAlerts();
  const showFin=canDo('viewFinance');
  document.getElementById('metrics-row').innerHTML=
    '<div class="metric"><div class="metric-label">Total projects</div><div class="metric-val">'+total+'</div><div class="metric-sub">'+done+' completed</div></div>'+
    '<div class="metric"><div class="metric-label">In progress</div><div class="metric-val">'+ip+'</div><div class="metric-sub">'+(total-done-ip)+' not started</div></div>'+
    '<div class="metric"><div class="metric-label">Units installed</div><div class="metric-val">'+fmt(tInst)+'</div><div class="metric-sub">grille units</div></div>'+
    (showFin?'<div class="metric"><div class="metric-label">RA billed (₹)</div><div class="metric-val">'+fmt(Math.round(tBill/100000))+'L</div><div class="metric-sub">₹'+fmt(Math.round(tPaid/100000))+'L collected</div></div>':'')+
    '<div class="metric"><div class="metric-label">Open constraints</div><div class="metric-val" style="color:'+(openC>0?'#cc3333':'#1D9E75')+'">'+openC+'</div><div class="metric-sub">across sites</div></div>'+
    '<div class="metric clickable" onclick="showSection(\'notif\')"><div class="metric-label">Active alerts</div><div class="metric-val" style="color:'+(alerts.length>0?'#cc3333':'#1D9E75')+'">'+alerts.length+'</div><div class="metric-sub">'+(alerts.length>0?'Tap to view':'All clear ✅')+'</div></div>';
}

