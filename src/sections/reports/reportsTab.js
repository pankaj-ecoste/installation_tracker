import { state } from '../../lib/state.js';
import { renderSodEodReport } from './sodEodReport.js';

/* ══ REPORTS (admin only — see plan.md v2-42) ══
   REPORTS is the registry: to add another report later, write its own file that exports a
   render(el) function and add one line here. Nothing else in this file needs to change. */
export const REPORTS=[
  { id:'sod-eod', icon:'📞', title:'SOD / EOD Follow-Up Tracker', desc:'Daily start-of-day and end-of-day follow-up with each project, with a simple score.', render:renderSodEodReport }
];

export function renderReports(){
  const el=document.getElementById('reports-content'); if(!el) return;
  // Second guard on top of the hidden tab and setTab() — this content must never render for a non-admin.
  if(!state.currentUser||state.currentUser.role!=='admin'){ el.innerHTML=''; return; }
  const report=REPORTS.find(r=>r.id===state.activeReport);
  if(report){ report.render(el); return; }
  el.innerHTML=
    '<div style="font-size:12px;color:#888;margin-bottom:10px">👑 Admin only — pick a report.</div>'+
    REPORTS.map(r=>'<div class="proj-card" style="cursor:pointer;margin-bottom:10px" onclick="openReport(\''+r.id+'\')">'+
      '<div class="proj-name">'+r.icon+' '+r.title+'</div>'+
      '<div class="proj-sub">'+r.desc+'</div>'+
    '</div>').join('');
}

export function openReport(id){ state.activeReport=id; renderReports(); }
export function closeReport(){ state.activeReport=null; renderReports(); }
