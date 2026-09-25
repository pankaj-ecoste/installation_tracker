/* ══ "NEEDS ATTENTION" KEYS (per tab) ══
   v2-48: for each badged tab, the list of items that currently need the user's attention, each
   with a stable key. The SAME list drives (a) the tab badge (only the unseen ones are counted),
   (b) marking them seen when the tab is opened, and (c) floating them to the top of the tab.
   A key changes when the item's state changes (e.g. a request moving New -> Visit Done), so it
   counts as new again. The rules below are the badge rules that existed before v2-48, unchanged. */
import { state } from './state.js';
import { canDo } from './helpers.js';

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
