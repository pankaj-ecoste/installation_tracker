import { state } from '../../lib/state.js';
import { syncProject } from '../../data/loadAllData.js';
import { CHECKLIST_DEFS, TODAY, checklistDoneItems, checklistTotalItems } from '../../lib/constants.js';
import { canDo, fillCls, fmt, fmtDate, needsRABill, pct, statusBadge, visibleProjects } from '../../lib/helpers.js';
import { docLink, pickFilesOrWarn, uploadFilesWithNames } from '../../lib/uploads.js';
import { updateBell } from '../alerts.js';
import { renderDPR } from '../dpr/dprTab.js';

/* ══ PROJECT CARDS ══ */
export function renderProjects(){
  const sf=document.getElementById('f-status')?.value||'';
  const stf=document.getElementById('f-state')?.value||'';
  const sch=document.getElementById('f-search')?.value.toLowerCase()||'';
  const grid=document.getElementById('project-grid'); if(!grid) return;
  const filtered=visibleProjects().filter(p=>{
    if(sf&&p.status!==sf) return false;
    if(stf&&p.state!==stf) return false;
    if(sch&&!(p.name||'').toLowerCase().includes(sch)&&!(p.tower||'').toLowerCase().includes(sch)) return false;
    return true;
  });
  if(!filtered.length){ grid.innerHTML='<div class="empty">No projects to show.</div>'; return; }
  // Group by project name so towers/blocks show nested under their parent project —
  // matches the real hierarchy: Developer → Project → Sub-project (Tower/Block).
  const byProject={};
  const order=[];
  filtered.forEach(p=>{
    if(!byProject[p.name]){ byProject[p.name]=[]; order.push(p.name); }
    byProject[p.name].push(p);
  });
  grid.innerHTML=order.map(projName=>{
    const towers=byProject[projName];
    const dev=towers[0].developer;
    const totalPlanned=towers.reduce((a,p)=>a+(p.plannedQty||0),0);
    const totalInstalled=towers.reduce((a,p)=>a+(p.installedQty||0),0);
    return '<div style="margin-bottom:6px">'+
      '<div style="font-size:13px;font-weight:700;color:#444;padding:6px 4px;display:flex;align-items:center;gap:8px">'+
        '<span>🏗 '+dev+' — '+projName+'</span>'+
        (towers.length>1?'<span style="font-size:11px;font-weight:400;color:#888">'+towers.length+' sub-projects · '+pct(totalInstalled,totalPlanned)+'% overall installed</span>':'')+
      '</div>'+
      '<div style="display:flex;flex-direction:column;gap:10px;padding-left:'+(towers.length>1?'14px':'0')+';border-left:'+(towers.length>1?'2px solid #e0e0e0':'none')+'">'+
        towers.map(p=>renderCard(p)).join('')+
      '</div>'+
    '</div>';
  }).join('');
  // Wire project document uploads for any expanded card (input only exists in the DOM
  // when that project's detail view is open).
  filtered.forEach(p=>{
    if(!state.expanded[p.id]) return;
    const input=document.getElementById('proj-docs-upload-'+p.id);
    if(!input) return;
    input.onchange=async function(){
      const files=pickFilesOrWarn(this,50); if(!files) return;
      document.getElementById('proj-docs-upload-'+p.id+'-list').textContent='Uploading '+files.length+' file(s)...';
      const uploaded=await uploadFilesWithNames(files,'project-docs');
      p.projectDocs=[...(p.projectDocs||[]),...uploaded];
      await syncProject(p);
      renderProjects();
    };
  });
}

export function toggleChecklistDropdown(defKey,projId){ state.premockupChecklistExpanded[defKey+'-'+projId]=!state.premockupChecklistExpanded[defKey+'-'+projId]; renderProjects(); renderDPR(); }
// One checklist's dropdown — used identically in All Projects and DPR.
export function renderChecklistDropdown(def,p){
  const cl=p[def.dataField]||{};
  const totalItems=checklistTotalItems(def);
  const doneItems=checklistDoneItems(def,cl);
  const isOpen=!!state.premockupChecklistExpanded[def.key+'-'+p.id];
  const isComplete=totalItems>0&&doneItems===totalItems;
  const awaitingReview=isComplete&&!p[def.reviewedField];
  return '<div style="margin-top:10px" onclick="event.stopPropagation()">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px"><div class="ms-title">'+def.label+(awaitingReview?' <span class="badge br">Awaiting Admin review</span>':isComplete?' <span class="badge bg">✅ Complete</span>':'')+'</div>'+
      '<button class="btn btn-outline btn-sm" onclick="toggleChecklistDropdown(\''+def.key+'\','+p.id+')">📋 '+doneItems+'/'+totalItems+' complete '+(isOpen?'▲':'▼')+'</button>'+
    '</div>'+
    (isOpen?
      '<div style="margin-top:8px;background:#f5f5f3;border-radius:8px;padding:10px;max-height:280px;overflow-y:auto">'+
        '<div style="font-size:11px;color:#888;margin-bottom:8px">👁 View only here. To tick items, open "+ Add DPR" for this project — the checklist is editable there.</div>'+
        def.groups.map(g=>{
          const items=cl[g.key]||[];
          const gDone=items.filter(i=>i.done).length;
          return '<div style="margin-bottom:10px"><div style="font-size:12px;font-weight:700;color:#444;margin-bottom:4px">'+g.title+' ('+gDone+'/'+items.length+')</div>'+
            items.map(item=>'<div style="font-size:12px;padding:2px 0;color:'+(item.done?'#1D9E75':'#888')+'">'+(item.done?'✅':'⬜')+' '+item.text+'</div>').join('')+
          '</div>';
        }).join('')+
        (awaitingReview&&state.currentUser&&state.currentUser.role==='admin'?'<button class="btn btn-green btn-sm" onclick="acknowledgeChecklist(\''+def.key+'\','+p.id+')">✅ Acknowledge — mark reviewed</button>':'')+
      '</div>':'')+
  '</div>';
}
// Every checklist that has data on this project — shown regardless of current stage,
// per "don't remove checklist once added, whatever stage."
export function renderAllChecklistDropdowns(p){
  return CHECKLIST_DEFS.filter(def=>p[def.dataField]).map(def=>renderChecklistDropdown(def,p)).join('');
}
export async function acknowledgeChecklist(defKey,projId){
  const def=CHECKLIST_DEFS.find(d=>d.key===defKey); if(!def) return;
  const p=state.projects.find(x=>x.id===projId); if(!p) return;
  p[def.reviewedField]=true;
  await syncProject(p);
  renderProjects(); renderDPR(); updateBell();
}
export function renderCard(p){
  const isOpen=state.expanded[p.id];
  const pInst=pct(p.installedQty,p.plannedQty), pPay=pct(p.paymentCollected,p.raBillAmt);
  const isOverdue=p.committedDate&&new Date(p.committedDate)<TODAY&&p.status!=='Completed';
  const stalledMs=p.milestones.filter(m=>!m.actual&&m.planned&&new Date(m.planned)<TODAY).length;
  const raNeeded=needsRABill(p);
  const inProgressC=p.constraints.filter(c=>c.status==='in-progress').length;
  const openSnagCount=(p.snags||[]).filter(s=>s.status!=='resolved').length;
  const canEdit=canDo('editProject'), canDel=canDo('deleteProject'), canUpdate=canDo('updateProgress')||canDo('editFinance');
  const unitLabel=p.unit||'sqft';
  return '<div class="proj-card '+(isOpen?'expanded':'')+'" id="card-'+p.id+'">'+
    '<div class="proj-header" onclick="toggleCard('+p.id+')">'+
      '<div class="proj-main">'+
        '<div class="proj-name">'+p.name+' — '+p.tower+'</div>'+
        '<div class="proj-sub">'+p.developer+' · '+p.city+', '+p.state+(p.orderType?' · '+p.orderType.charAt(0).toUpperCase()+p.orderType.slice(1):'')+'</div>'+
        '<div class="proj-meta">'+
          statusBadge(p.status)+
          (isOverdue?'<span class="badge br">🚨 Overdue</span>':'')+
          (stalledMs>0?'<span class="badge br">⏰ '+stalledMs+' stalled</span>':'')+
          (p.constraintsOpen>0?'<span class="badge br">🔴 '+p.constraintsOpen+' open</span>':'')+
          (inProgressC>0?'<span class="badge ba">🟡 '+inProgressC+' in progress</span>':'')+
          (raNeeded?'<span class="badge ba">💰 RA bill needed</span>':'')+
          (openSnagCount>0?'<span class="badge br">🔧 '+openSnagCount+' snag(s)</span>':'')+
          '<span style="font-size:11px;color:#666">👤 '+p.supervisor+'</span>'+
          '<span style="font-size:10px;background:#f0f0f0;border:1px solid #ccc;border-radius:20px;padding:2px 7px;color:#555">🔑 '+p.accessCode+'</span>'+
        '</div>'+
      '</div>'+
      '<div class="proj-actions" onclick="event.stopPropagation()">'+
        (canUpdate?'<button class="icon-btn btn-sm" onclick="event.stopPropagation();openUpdate('+p.id+')">📊</button>':'')+
        (state.currentUser?'<button class="icon-btn btn-sm" title="Edit milestones" onclick="event.stopPropagation();openMilestonesPanel('+p.id+')">📅</button>':'')+
        (canEdit?'<button class="icon-btn btn-sm" onclick="event.stopPropagation();openEditProject('+p.id+')">✏️</button>':'')+
        (canDel?'<button class="icon-btn btn-sm danger" onclick="event.stopPropagation();askDelete('+p.id+')">🗑</button>':'')+
        '<button class="icon-btn btn-sm" onclick="event.stopPropagation();toggleCard('+p.id+')">'+(isOpen?'▲':'▼')+'</button>'+
      '</div>'+
    '</div>'+
    '<div class="progress-wrap"><div class="progress-label"><span>Installation ('+unitLabel+')</span><span>'+fmt(p.installedQty)+' / '+fmt(p.plannedQty)+' ('+pInst+'%)</span></div><div class="progress-bar"><div class="progress-fill '+fillCls(pInst)+'" style="width:'+pInst+'%"></div></div></div>'+
    (isOpen?renderDetail(p):'')+
  '</div>';
}

export function toggleCard(id){ state.expanded[id]=!state.expanded[id]; renderProjects(); }

export function renderDetail(p){
  const pInst=pct(p.installedQty,p.plannedQty), pPay=pct(p.paymentCollected,p.raBillAmt), pJMR=pct(p.jmrQty,p.plannedQty);
  const showFin=canDo('viewFinance');
  const unitLabel=p.unit||'sqft';
  const sColor={'open':'#cc3333','in-progress':'#f0a500','solved':'#1D9E75'};
  const sLabel={'open':'🔴 Open','in-progress':'🟡 In Progress','solved':'✅ Solved'};
  const msHtml=p.milestones.length?p.milestones.map(m=>{
    const isStalled=!m.actual&&m.planned&&new Date(m.planned)<TODAY;
    const gc=m.gap===null?(isStalled?'g-late':'g-pend'):m.gap<0?'g-early':m.gap>2?'g-late':'g-ok';
    const gl=m.gap===null?(isStalled?'⏰ Stalled':'Pending'):m.gap===0?'On time':m.gap<0?Math.abs(m.gap)+'d early':m.gap+'d late';
    return '<div class="ms-row" style="'+(isStalled?'background:#fff5f5;border-radius:4px;padding:5px 8px;':'')+'">'+
      '<div class="ms-dot '+(m.gap!==null&&m.gap<=0?'md':isStalled?'mm':'mp')+'">'+(m.gap!==null&&m.gap<=0?'✓':isStalled?'⚠':'○')+'</div>'+
      '<div class="ms-lbl">'+m.label+(isStalled?'<span style="color:#cc3333;font-size:10px;margin-left:4px">STALLED</span>':'')+'</div>'+
      '<div class="ms-date">'+fmtDate(m.planned)+'</div>'+
      '<div class="ms-gap '+gc+'">'+gl+'</div>'+
    '</div>';
  }).join(''):'<div style="font-size:12px;color:#888;padding:6px 0">No milestones. Use Update to add.</div>';
  const cHtml=p.constraints&&p.constraints.length?p.constraints.map(c=>
    '<div class="constraint-item '+(c.status==='open'?'open-c':c.status==='in-progress'?'in-progress-c':'solved-c')+'">'+
      '<div style="flex:1"><div class="c-text">'+c.text+'</div><div class="c-meta">Raised: '+c.date+(c.solvedDate?' · Solved: '+c.solvedDate:'')+' · <span style="color:'+sColor[c.status]+';font-weight:600">'+sLabel[c.status]+'</span></div>'+
      (c.nextAction?'<div class="c-meta" style="margin-top:2px">Next action: '+c.nextAction+'</div>':'')+
      '</div>'+
    '</div>').join(''):'<div style="font-size:12px;color:#888">No constraints.</div>';
  const snagSevColor={'Minor':'#f0a500','Major':'#cc7a00','Critical':'#cc3333'};
  const snagStatusColor={'open':'#cc3333','in-progress':'#f0a500','resolved':'#1D9E75'};
  const snagStatusLabel={'open':'🔴 Open','in-progress':'🟡 In Progress','resolved':'✅ Resolved'};
  const snagNextLabel={'open':'→ In Progress','in-progress':'→ Resolved','resolved':'→ Reopen'};
  const snagHtml=p.snags&&p.snags.length?p.snags.map((s,i)=>
    '<div class="constraint-item" style="border-left:3px solid '+(snagStatusColor[s.status]||'#888')+'">'+
      (s.photoUrl?'<img src="'+s.photoUrl+'" style="width:32px;height:32px;object-fit:cover;border-radius:4px;margin-right:8px">':'')+
      '<div style="flex:1"><div class="c-text">'+s.description+' <span class="badge" style="background:'+(snagSevColor[s.severity]||'#888')+'22;color:'+(snagSevColor[s.severity]||'#888')+'">'+s.severity+'</span></div>'+
      '<div class="c-meta">'+(s.location||'—')+' · Raised: '+s.raisedDate+(s.resolvedDate?' · Resolved: '+s.resolvedDate:'')+' · <span style="color:'+(snagStatusColor[s.status]||'#888')+';font-weight:600">'+(snagStatusLabel[s.status]||s.status)+'</span></div></div>'+
      '<div style="display:flex;gap:6px;flex-shrink:0">'+
        '<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();escalateSnag('+p.id+','+i+')">📧 Escalate</button>'+
        '<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();cycleSnagStatusOnProject('+p.id+','+i+')">'+snagNextLabel[s.status]+'</button>'+
      '</div>'+
    '</div>').join(''):'<div style="font-size:12px;color:#888">No snags logged.</div>';
  const vendorHtml=p.vendors&&p.vendors.length?p.vendors.map(v=>'<span class="badge bgr">'+v.name+(v.role?' ('+v.role+')':'')+'</span>').join(' '):'<span style="font-size:12px;color:#888">'+p.vendor+'</span>';
  const productHtml=p.products&&p.products.length?p.products.map(pr=>'<div style="font-size:12px;padding:3px 0;border-bottom:1px solid #f0f0f0">'+pr.name+' — <b>'+fmt(pr.qty)+'</b> '+unitLabel+'</div>').join(''):'';
  const cmHtml=p.comments.map(c=>'<div class="comment"><div>'+c.text+'</div><div class="comment-meta">'+c.author+' · '+c.time+'</div></div>').join('');
  return '<div class="detail-panel">'+
    '<div class="detail-grid" style="grid-template-columns:1fr">'+
      '<div class="detail-section"><div class="ds-title">Installation</div>'+
        '<div class="detail-row"><span class="dr-label">Planned</span><span class="dr-val">'+fmt(p.plannedQty)+' '+unitLabel+'</span></div>'+
        '<div class="detail-row"><span class="dr-label">Installed</span><span class="dr-val">'+fmt(p.installedQty)+' '+unitLabel+' ('+pInst+'%)</span></div>'+
        '<div class="detail-row"><span class="dr-label">JMR achieved</span><span class="dr-val">'+fmt(p.jmrQty)+' ('+pJMR+'%)</span></div>'+
        '<div class="detail-row"><span class="dr-label">Committed</span><span class="dr-val">'+fmtDate(p.committedDate)+'</span></div>'+
        '<div class="detail-row"><span class="dr-label">Supervisor</span><span class="dr-val">'+p.supervisor+'</span></div>'+
        '<div class="detail-row"><span class="dr-label">Vendors</span><span class="dr-val" style="text-align:right">'+vendorHtml+'</span></div>'+
      '</div>'+
      (showFin?'<div class="detail-section"><div class="ds-title">Finance summary</div>'+
        '<div class="detail-row"><span class="dr-label">RA bill amount</span><span class="dr-val">₹'+fmt(p.raBillAmt||0)+'</span></div>'+
        '<div class="detail-row"><span class="dr-label">Amount collected</span><span class="dr-val">₹'+fmt(p.paymentCollected||0)+'</span></div>'+
        '<div class="detail-row"><span class="dr-label">Unbilled amount to vendor</span><span class="dr-val">₹'+fmt(Math.max(0,state.financeLedger.filter(f=>f.projId===p.id).reduce((a,f)=>a+(f.contractValue||0)-(f.paymentGiven||0),0)))+'</span></div>'+
        '<div class="detail-row"><span class="dr-label">Released to vendor</span><span class="dr-val">₹'+fmt(state.financeLedger.filter(f=>f.projId===p.id).reduce((a,f)=>a+(f.paymentGiven||0),0))+'</span></div>'+
      '</div>':'')+
    '</div>'+
    (productHtml?'<div style="margin-top:10px"><div class="ms-title">Products</div>'+productHtml+'</div>':'')+
    '<div style="margin-top:10px"><div class="ms-title">Milestones</div>'+msHtml+'</div>'+
    '<div style="margin-top:10px"><div class="ms-title">Constraints</div>'+cHtml+'</div>'+
    renderAllChecklistDropdowns(p)+
    '<div style="margin-top:10px"><div style="display:flex;justify-content:space-between;align-items:center"><div class="ms-title">Snag list</div>'+(canDo('updateProgress')?'<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openAddSnagForProject('+p.id+')">🔧 Add snag</button>':'')+'</div>'+snagHtml+'</div>'+
    '<div style="margin-top:10px" onclick="event.stopPropagation()"><div class="ms-title">Project documents (up to 50 files)</div>'+
      '<div style="font-size:11px;color:#888;margin-bottom:4px">Site surveys, WO/PO, drawings, approvals, JMR, measurement sheets, client sign-offs — anything relevant to this project.</div>'+
      '<input type="file" id="proj-docs-upload-'+p.id+'" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" multiple style="font-size:12px">'+
      '<div id="proj-docs-upload-'+p.id+'-list" style="font-size:11px;color:#1D9E75;margin-top:4px"></div>'+
      ((p.projectDocs||[]).length?
        '<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="event.stopPropagation();toggleProjectDocs('+p.id+')">📎 View documents ('+p.projectDocs.length+') '+(state.projectDocsExpanded[p.id]?'▲':'▼')+'</button>'+
        (state.projectDocsExpanded[p.id]?
          '<div style="margin-top:6px;background:#f5f5f3;border-radius:8px;padding:6px;max-height:220px;overflow-y:auto">'+
            p.projectDocs.map((doc,i)=>docLink(doc,i,'display:block;padding:6px 8px;font-size:12px;color:#1a1a1a;border-bottom:1px solid #e5e5e3;text-decoration:none')).join('')+
          '</div>':'')
        :'<div style="font-size:11px;color:#888;margin-top:4px">No documents uploaded yet.</div>')+
    '</div>'+
    '<div class="comment-box"><div class="cb-title">Notes & feedback</div>'+
      '<div class="comment-list">'+(cmHtml||'<div style="font-size:12px;color:#888">No notes yet.</div>')+'</div>'+
      '<div class="ci-row"><input id="ci-'+p.id+'" placeholder="Add a note..." onkeydown="if(event.key===\'Enter\')addComment('+p.id+')"><button class="btn btn-green btn-sm" onclick="addComment('+p.id+')">Post</button></div>'+
    '</div>'+
  '</div>';
}

