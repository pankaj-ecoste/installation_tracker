import { state } from './state.js';
import { ROLES } from './constants.js';
import { renderProjects } from '../sections/projects/projectCards.js';

export function toggleProjectDocs(projId){ state.projectDocsExpanded[projId]=!state.projectDocsExpanded[projId]; renderProjects(); }

/* ══ HELPERS ══ */
export const fmt = n => Number(n||0).toLocaleString('en-IN');
export const pct = (a,b) => b>0 ? Math.round((a/b)*100) : 0;
export const fillCls = p => p>=100?'fg':p>=50?'fa':'fr';
export const fmtDate = d => { if(!d) return '—'; try { return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); } catch(e) { return d; }};
export const daysDiff = (a,b) => Math.round((new Date(b)-new Date(a))/86400000);
export const canDo = action => state.currentUser && ROLES[state.currentUser.role] && ROLES[state.currentUser.role].can[action];
// RA bill trigger changed: used to be "JMR qty updated" — now it's "WCC uploaded but RA
// bill amount not yet set", since Finance generates the RA bill after WCC + qty confirmation.
export const needsRABill = p => (p.wccDocs&&p.wccDocs.length>0) && p.raBillAmt===0 && !p.raBillReady;
// Finance section is mandatory to keep current — every time Admin updates JMR, Finance
// needs to come back and re-confirm/update the figures for that project.
export const needsFinanceReview = p => (p.jmrQty||0) > 0 && (p.jmrQty||0)!==(p.financeLastReviewedJmr||0);
// Snag severity classification, agreed across the whole team: under 10% of installed units
// affected → Minor; 10-60% → Major; above 60% → Critical. Auto-suggested whenever "units
// affected" is entered, but Supervisor/Admin can still override the dropdown manually.
export const SNAG_SEVERITY_RULE_TEXT='Auto severity: <10% of installed units affected = Minor · 10–60% = Major · >60% = Critical';
export function suggestSnagSeverity(unitsAffected,installedQty){
  if(!installedQty||!unitsAffected) return null;
  const pctAffected=(unitsAffected/installedQty)*100;
  if(pctAffected>60) return 'Critical';
  if(pctAffected>=10) return 'Major';
  return 'Minor';
}
export function updateSnagSeverityHint(unitsFieldId,severityFieldId,installedQty){
  const unitsInput=document.getElementById(unitsFieldId);
  const sevSelect=document.getElementById(severityFieldId);
  const msgEl=document.getElementById(severityFieldId+'-hint');
  if(!unitsInput||!sevSelect) return;
  const units=parseInt(unitsInput.value)||0;
  if(units<=0){
    // No units entered yet — keep Severity locked so it can't be set ahead of the data
    // that's supposed to justify it. Shown as a visible message, not just a hover tooltip,
    // so it's clear on mobile too and nobody thinks the field is just broken.
    sevSelect.disabled=true;
    sevSelect.title='Enter "Units affected" first — Severity is set automatically from that.';
    if(msgEl){ msgEl.textContent='🔒 Enter "Units affected" above first — Severity unlocks automatically once that\'s filled in.'; msgEl.style.color='#a06a00'; }
    return;
  }
  const suggestion=suggestSnagSeverity(units,installedQty);
  sevSelect.disabled=false;
  sevSelect.title='Auto severity: <10% of installed units affected = Minor · 10–60% = Major · >60% = Critical. You can still override this once unlocked.';
  if(msgEl){ msgEl.textContent='✓ Unlocked — suggested from % of installed units affected. You can still change it.'; msgEl.style.color='#1D9E75'; }
  if(suggestion) sevSelect.value=suggestion;
}

export function statusBadge(s){
  if(s==='Completed') return '<span class="badge bg">✓ '+s+'</span>';
  if(s==='In Progress') return '<span class="badge ba">⟳ '+s+'</span>';
  return '<span class="badge bgr">○ '+s+'</span>';
}

export function visibleProjects(){
  if(!state.currentUser) return state.projects;
  if(canDo('viewAll')) return state.projects;
  // The "supervisor" field on a project has historically been stored inconsistently —
  // sometimes the login username, sometimes the display name (e.g. via free-text entry).
  // Match against both so a Supervisor never loses visibility into their own project
  // over a formatting mismatch.
  return state.projects.filter(p=>p.createdBy===state.currentUser.username||p.supervisor===state.currentUser.username||p.supervisor===state.currentUser.name);
}

