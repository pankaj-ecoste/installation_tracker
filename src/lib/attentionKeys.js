/* ══ "NEEDS ATTENTION" KEYS (per tab) ══
   v2-48: for each badged tab, the list of items that currently need the user's attention, each
   with a stable key. The SAME list drives (a) the tab badge (only the unseen ones are counted),
   (b) marking them seen when the tab is opened, and (c) floating them to the top of the tab.
   A key changes when the item's state changes (e.g. a request moving New -> Visit Done), so it
   counts as new again. The rules below are the badge rules that existed before v2-48, unchanged. */
import { state } from './state.js';
import { canDo, needsFinanceReview, needsRABill, visibleProjects } from './helpers.js';
import { CHECKLIST_DEFS, TODAY } from './constants.js';

// Requests: Admin/Manager act on brand-new and visit-done requests; a Supervisor on requests
// just assigned to them. Every other role has no Requests badge (and so no top group).
export function requestAttentionKey(r){
  const u = state.currentUser; if(!u) return null;
  if(canDo('addProject') || canDo('manageTeam')) return (r.status === 'New' || r.status === 'Visit Done') ? r.id + ':' + r.status : null;
  if(u.role === 'supervisor') return (r.assignedSupervisor === u.username && r.status === 'Acknowledged') ? r.id + ':' + r.status : null;
  return null;
}
export function requestAttentionKeys(){
  return state.requests.map(requestAttentionKey).filter(Boolean);
}

/* ── the other four tabs (v2-48) ── */
// All Projects: every open snag on the projects this user can see. Snags have no id of their own
// (they are appended to the project and never removed, only resolved), so identity = project +
// position + start of the description.
export function snagAttentionKeys(){
  const keys = [];
  visibleProjects().forEach(p => (p.snags || []).forEach((s, i) => {
    if(s.status !== 'resolved') keys.push('snag:' + p.id + ':' + i + ':' + (s.description || '').slice(0, 24));
  }));
  return keys;
}
export const projectHasOpenSnag = p => (p.snags || []).some(s => s.status !== 'resolved');

// Finance: a project whose WCC is in but has no RA bill yet, or whose JMR changed since Finance last
// reviewed it. The JMR key includes the JMR figure, so a further JMR change counts as new again.
export function financeAttentionKeys(){
  const keys = [];
  visibleProjects().forEach(p => {
    if(needsRABill(p)) keys.push('ra:' + p.id);
    if(needsFinanceReview(p)) keys.push('jmr:' + p.id + ':' + (p.jmrQty || 0));
  });
  return keys;
}
export const projectNeedsFinanceAction = p => needsRABill(p) || needsFinanceReview(p);

// DPR Log: today's DPRs on visible projects (rule unchanged from before v2-48 — see plan.md v2-48
// for the note on its date comparison) plus checklists completed but not yet reviewed.
export function dprAttentionKeys(){
  const vp = visibleProjects();
  const keys = [];
  // DPR dates are saved as text ("21 Aug 2026"), so compare LOCAL calendar-date parts — comparing to
  // an ISO string never matched, and toISOString() shifts the day in IST (plan.md v2-48 follow-up).
  const localDay = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  const todayLocal = localDay(TODAY);
  state.dprLog.forEach((d, i) => {
    const parsed = new Date(d.date);
    if(isNaN(parsed) || localDay(parsed) !== todayLocal) return;
    if(vp.some(p => p.id === d.projId)) keys.push('dpr:' + (d.id != null ? d.id : i));
  });
  vp.forEach(p => CHECKLIST_DEFS.forEach(def => {
    if(p[def.completedField] && !p[def.reviewedField]) keys.push('chk:' + def.key + '-' + p.id);
  }));
  return keys;
}
export const projectHasChecklistAwaitingReview = p => CHECKLIST_DEFS.some(def => p[def.completedField] && !p[def.reviewedField]);

// New Vendors: forms not yet fully approved, keyed by which stage they are waiting at.
export function vendorAttentionKeys(){
  return state.vendorProfiles
    .filter(v => !(v.reviewed_by_admin && v.approved_by_shashank))
    .map(v => v.user_id + ':' + (v.reviewed_by_admin ? 'awaiting' : 'pending'));
}

// tab name (as passed to setTab) -> [seen-store module, keys function]
export const TAB_ATTENTION = {
  projects:   ['projects', snagAttentionKeys],
  dpr:        ['dpr', dprAttentionKeys],
  finance:    ['finance', financeAttentionKeys],
  newvendors: ['vendors', vendorAttentionKeys]
};
