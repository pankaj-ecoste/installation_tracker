// v2-75: "Lost" marker. A flag on the request and on its linked project (never a change of request type),
// so un-marking restores everything as it was. Setting it on either side updates both.
import { state } from './state.js';
import { logActivity } from './activityLog.js';
import { syncProject } from '../data/loadAllData.js';
import { updateRequestFields, renderRequests } from '../sections/requests/requestsTab.js';
import { renderProjects } from '../sections/projects/projectCards.js';

// Admin + Sales (the 'viewer' role) only.
export function canMarkLost(){ const u=state.currentUser; return !!u&&(u.role==='admin'||u.role==='viewer'); }

export function lostBadgeHTML(isLost){ return isLost?'<span class="badge br">❌ Lost</span>':''; }

// kind: 'request' | 'project'
export function lostSelectHTML(kind,id,isLost){
  if(!canMarkLost()) return '';
  return '<select class="form-input" style="width:auto;padding:2px 6px;font-size:12px" title="Mark as Lost" onclick="event.stopPropagation()" onchange="setLost(\''+kind+'\','+id+',this.value===\'lost\')">'+
    '<option value="active"'+(isLost?'':' selected')+'>Active</option><option value="lost"'+(isLost?' selected':'')+'>Lost</option></select>';
}

export async function setLost(kind,id,value){
  if(!canMarkLost()) return;
  let req=null, proj=null;
  if(kind==='request'){
    req=state.requests.find(r=>r.id===id);
    proj=req&&req.linkedProjectId?state.projects.find(p=>p.id===req.linkedProjectId):null;
  } else {
    proj=state.projects.find(p=>p.id===id);
    req=proj?state.requests.find(r=>r.linkedProjectId===proj.id):null;
  }
  if(!req&&!proj) return;
  if(req) await updateRequestFields(req.id,{isLost:value});
  if(proj){ proj.isLost=value; await syncProject(proj); }
  logActivity(value?'Marked Lost':'Lost removed', (req?req.requestNumber:'')+(req&&proj?' / ':'')+(proj?proj.name+' — '+proj.tower:''));
  renderRequests(); renderProjects();
}
