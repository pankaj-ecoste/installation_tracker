import { db } from '../../lib/supabaseClient.js';
import { state } from '../../lib/state.js';
import { syncProject } from '../../data/loadAllData.js';
import { logActivity } from '../../lib/activityLog.js';
import { CHECKLIST_DEFS, blankChecklistData, checklistDoneItems, checklistTotalItems, getAdminEmail, isChecklistActive, notifyByGmail } from '../../lib/constants.js';
import { canDo, daysDiff, fmt, fmtDate, visibleProjects } from '../../lib/helpers.js';
import { dprToRow, lotToRow, rowToDpr } from '../../lib/mappers.js';
import { pickFilesOrWarn, uploadFiles, uploadFilesWithNames } from '../../lib/uploads.js';
import { updateBell } from '../alerts.js';
import { renderMaterial } from '../material/materialTab.js';
import { renderMetrics } from '../metrics.js';
import { closePanel, openPanel } from '../navigation.js';
import { renderConstraintList } from '../projects/formHelpers.js';
import { renderAllChecklistDropdowns, renderProjects } from '../projects/projectCards.js';

/* ══ DPR ══ */
export function renderDPR(){
  const vp=visibleProjects();
  const visible=state.dprLog.filter(d=>vp.some(p=>(d.project||'').includes(p.name)));
  const el=document.getElementById('dpr-list');
  if(!visible.length){ el.innerHTML='<div class="empty">No DPRs found for your projects.</div>'; return; }
  // Average working per day, per project — computed from all DPR history for that project,
  // used to flag any day that comes in significantly below (or above) the norm.
  const avgPerDayByProj={};
  vp.forEach(p=>{
    const entries=state.dprLog.filter(d=>d.projId===p.id);
    if(!entries.length){ avgPerDayByProj[p.id]=0; return; }
    const total=entries.reduce((s,d)=>s+(d.products||[]).reduce((s2,r)=>s2+(r.todayInstalled||0),0),0);
    avgPerDayByProj[p.id]=Math.round(total/entries.length);
  });
  const checklistSectionsHtml=vp.filter(p=>CHECKLIST_DEFS.some(def=>p[def.dataField])).map(p=>
    '<div class="proj-card" style="cursor:default;margin-bottom:10px"><div class="proj-name" style="margin-bottom:4px">'+p.name+' — '+p.tower+'</div>'+renderAllChecklistDropdowns(p)+'</div>'
  ).join('');
  el.innerHTML=checklistSectionsHtml+visible.map(d=>{
    const hasConstraint=d.constraints&&d.constraints[0]!=='None';
    const borderColor=hasConstraint?'#cc3333':'#1D9E75';
    const totalToday=d.products?d.products.reduce((a,r)=>a+(r.todayInstalled||0),0):0;
    const avgPerDay=avgPerDayByProj[d.projId]||0;
    // Flag if today's work is less than 60% of the project's own average — a genuine dip,
    // not just normal day-to-day variation.
    const isBelowAvg=avgPerDay>0&&totalToday<avgPerDay*0.6;
    const productRows=d.products&&d.products.length?d.products.map(r=>`
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr 1.5fr;gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:12px">
        <div style="font-weight:500">${r.product||'—'}</div>
        <div style="text-align:center">${fmt(r.totalQty)}</div>
        <div style="text-align:center">${fmt(r.cumulativeTillYesterday)}</div>
        <div style="text-align:center;font-weight:700;color:#1D9E75">${fmt(r.todayInstalled)}</div>
        <div style="text-align:center;font-weight:700;color:${(r.balanceQty||0)>0?'#cc3333':'#1D9E75'}">${fmt(r.balanceQty||0)}</div>
        <div style="text-align:center;color:${(r.balancePct||0)>0?'#cc3333':'#1D9E75'}">${r.balancePct||0}%</div>
        <div style="color:#666;font-size:11px">${r.location||'—'}</div>
      </div>`).join(''):'';
    const productHeader=d.products&&d.products.length?`
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr 1.5fr;gap:6px;padding:4px 0;border-bottom:2px solid #e0e0e0;font-size:10px;font-weight:600;color:#666;text-transform:uppercase">
        <div>Product</div><div style="text-align:center">WO Qty</div><div style="text-align:center">Cum. till yest.</div>
        <div style="text-align:center">Today ✅</div><div style="text-align:center">Balance</div><div style="text-align:center">Bal %</div><div>Location</div>
      </div>`:'';
    return `<div class="dpr-card" style="border-left:4px solid ${borderColor}">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-weight:700;font-size:14px">${d.project}</div>
          <div style="font-size:12px;color:#666;margin-top:2px">DPR Date: ${d.date} &nbsp;·&nbsp; Day No: <b>${d.dayNo||'—'}</b> &nbsp;·&nbsp; Days left: <b>${d.daysLeft!=null?d.daysLeft:'—'}</b></div>
          <div style="font-size:12px;color:#666">Supervisor: ${d.supervisor}</div>
          ${(canDo('addDPR')||(state.currentUser&&state.currentUser.name===d.supervisor))?`<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="openEditDPR(${d.id})">✏️ Edit this DPR</button>`:''}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          <span class="badge bb">👷 Committed: ${d.committedMp||0} &nbsp;|&nbsp; Actual: ${d.actualMp||d.manpower||0}</span>
          <span class="badge ${hasConstraint?'br':'bg'}">${hasConstraint?'⚠ Constraints logged':'✅ No constraints'}</span>
          ${avgPerDay>0?`<span class="badge bgr">📊 Avg working/day: ${fmt(avgPerDay)}</span>`:''}
        </div>
      </div>
      <!-- Products table -->
      ${d.products&&d.products.length?`<div style="margin-bottom:10px">${productHeader}${productRows}<div style="font-size:12px;font-weight:600;color:${isBelowAvg?'#cc3333':'#1D9E75'};margin-top:6px;text-align:right">Total installed today: ${fmt(totalToday)} units${avgPerDay>0?` (avg: ${fmt(avgPerDay)}/day)`:''}</div></div>`:`<div style="font-size:13px;margin-bottom:8px;color:#666">${d.installed||'—'}</div>`}
      ${isBelowAvg?`<div style="background:#fff8e6;border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:12px"><span style="font-weight:600;color:#7a4f00">⚠ Below average: </span>Today's installed qty (${fmt(totalToday)}) is well under this project's average of ${fmt(avgPerDay)}/day — worth checking in with the site.</div>`:''}
      <!-- Constraints -->
      ${hasConstraint?`<div style="background:#fff5f5;border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:12px"><span style="font-weight:600;color:#cc3333">⚠ Constraint: </span>${d.constraints.join(', ')}</div>`:''}
      ${d.actionTaken?`<div style="font-size:12px;margin-bottom:4px"><span style="color:#666;font-weight:500">Action taken: </span>${d.actionTaken}</div>`:''}
      ${d.remarks?`<div style="font-size:12px;margin-bottom:4px"><span style="color:#666;font-weight:500">Remarks: </span>${d.remarks}</div>`:''}
      ${d.next&&d.next!=='—'?`<div style="font-size:12px;margin-bottom:4px"><span style="color:#666;font-weight:500">Next day plan: </span>${d.next}</div>`:''}
      ${d.photoUrls&&d.photoUrls.length?`<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${d.photoUrls.map(u=>`<img src="${u}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #e0e0e0">`).join('')}</div>`:''}
      ${d.reportPdfUrl?`<div style="margin-top:6px"><a href="${d.reportPdfUrl}" target="_blank" style="font-size:12px;color:#1D9E75">📄 Daily report PDF</a></div>`:''}
      <!-- Internal (only visible to team) -->
      ${(d.internalHindrance||d.nextDispatch||d.escalations)?`
      <div style="background:#f0f4ff;border-radius:6px;padding:8px 10px;margin-top:8px;font-size:12px;border-left:3px solid #185FA5">
        <div style="font-size:10px;font-weight:700;color:#185FA5;margin-bottom:4px;text-transform:uppercase">🔒 Internal only</div>
        ${d.internalHindrance?`<div><span style="color:#666">Internal hindrance: </span>${d.internalHindrance}</div>`:''}
        ${d.nextDispatch?`<div><span style="color:#666">Next dispatch: </span>${d.nextDispatch}</div>`:''}
        ${d.escalations?`<div><span style="color:#666">Escalations: </span>${d.escalations}</div>`:''}
      </div>`:''}
    </div>`;
  }).join('');
}

/* ══ ADD DPR FORM ══ */
export function openAddDPR(){
  const vp=visibleProjects();
  if(!vp.length){ alert('No projects available. Add a project first.'); return; }
  state.editingDprId=null;
  state.dprPendingConstraints=[];
  openPanel('panel-add-dpr');
  document.getElementById('dpr-panel-title').textContent='Add Daily Progress Report';
  renderDPRForm(vp[0].id);
}
export function openEditDPR(id){
  const d=state.dprLog.find(x=>x.id===id); if(!d) return;
  if(!canDo('addDPR')&&d.supervisor!==(state.currentUser?state.currentUser.name:'')){ alert('You do not have permission to edit this DPR.'); return; }
  state.editingDprId=id;
  state.dprPendingConstraints=(d.constraints||[]).filter(c=>c!=='None');
  openPanel('panel-add-dpr');
  renderDPRForm(d.projId);
  // Prefill with the existing entry's values, on top of the fresh form the project
  // selector just built — this is what makes it an edit instead of a blank new entry.
  setTimeout(()=>{
    document.getElementById('dpr-date').value=new Date(d.date).toISOString().slice(0,10);
    document.getElementById('dpr-panel-title').textContent='Edit DPR — '+d.date;
    document.getElementById('dpr-supervisor').value=d.supervisor||'';
    document.getElementById('dpr-committed-mp').value=d.committedMp||0;
    document.getElementById('dpr-manpower').value=d.actualMp||d.manpower||0;
    document.getElementById('dpr-action').value=d.actionTaken||'';
    document.getElementById('dpr-remarks').value=d.remarks||'';
    document.getElementById('dpr-internal-hindrance').value=d.internalHindrance||'';
    document.getElementById('dpr-next-dispatch').value=d.nextDispatch||'';
    document.getElementById('dpr-escalations').value=d.escalations||'';
    document.getElementById('dpr-next').value=d.next||'';
    document.getElementById('dpr-no-constraints').checked=!(d.constraints&&d.constraints[0]!=='None');
    renderConstraintList('dpr-constraints-list',state.dprPendingConstraints,'removeDPRConstraint');
    // Bring the previously entered per-product figures back into the working array so
    // Supervisor is correcting THIS day's numbers, not starting from zero.
    (d.products||[]).forEach(saved=>{
      const row=state.dprProducts.find(r=>r.product===saved.product);
      if(row){ row.todayInstalled=saved.todayInstalled||0; row.location=saved.location||''; }
    });
    renderDPRProducts();
    // Restore previously uploaded photos/PDF — without this, saving an edit without
    // re-uploading would silently wipe them out, since the form resets these to empty
    // by default for a brand new DPR.
    state.dprPhotoUrls=[...(d.photoUrls||[])];
    document.getElementById('dpr-photos-list').textContent=state.dprPhotoUrls.length?state.dprPhotoUrls.length+' photo(s) already attached (upload more to add, existing ones are kept).':'';
    state.dprReportPdfUrl=d.reportPdfUrl||'';
    document.getElementById('dpr-report-pdf-list').textContent=state.dprReportPdfUrl?'✓ Already attached (choose a new file to replace).':'';
  },50);
}

export function renderDPRForm(selectedProjId){
  const vp=visibleProjects();
  const body=document.getElementById('dpr-form-body');
  if(!body||!vp.length) return;
  const projId=selectedProjId||parseInt(document.getElementById('dpr-proj')?.value)||vp[0].id;
  const proj=state.projects.find(p=>p.id===projId)||vp[0];

  // build product rows: work-order qty + cumulative installed so far from prior DPRs
  state.dprProducts=(proj.products||[]).map(pr=>{
    const cum=state.dprLog.filter(d=>d.projId===proj.id).reduce((sum,d)=>{
      const row=(d.products||[]).find(r=>r.product===pr.name);
      return sum+(row?(row.todayInstalled||0):0);
    },0);
    // originalCumulative is kept alongside the editable cumulativeTillYesterday so that if
    // Supervisor corrects it (e.g. a past entry was wrong), the difference gets applied to
    // the project's overall Installed Qty too, not just this DPR's own display math.
    return {product:pr.name, totalQty:parseInt(pr.qty)||0, cumulativeTillYesterday:cum, originalCumulative:cum, todayInstalled:0, location:''};
  });

  // Initialize working state for every checklist that's currently active on this project
  // (either matches its stage, or already has data — so it never disappears).
  state.dprChecklistState={};
  CHECKLIST_DEFS.forEach(def=>{
    if(isChecklistActive(def,proj)){
      state.dprChecklistState[def.key]=proj[def.dataField]?JSON.parse(JSON.stringify(proj[def.dataField])):blankChecklistData(def);
    }
  });

  body.innerHTML=
    '<div class="form-card"><div class="form-card-title">DPR details</div>'+
      '<div class="form-row">'+
        '<div class="form-group"><label class="form-label">Project *</label>'+
          '<select class="form-input" id="dpr-proj" onchange="renderDPRForm(parseInt(this.value))">'+
            vp.map(p=>'<option value="'+p.id+'" '+(p.id===proj.id?'selected':'')+'>'+p.name+' — '+p.tower+'</option>').join('')+
          '</select>'+
        '</div>'+
        '<div class="form-group"><label class="form-label">DPR date</label><input class="form-input" type="date" id="dpr-date" value="'+new Date().toISOString().slice(0,10)+'" readonly disabled style="background:#f0f0f0"><div style="font-size:11px;color:#888;margin-top:2px">Always today\'s date — DPRs can\'t be backdated.</div></div>'+
      '</div>'+
      '<div class="form-row" style="margin-top:10px">'+
        '<div class="form-group"><label class="form-label">Supervisor</label><input class="form-input" id="dpr-supervisor" value="'+(proj.supervisor||'')+'"></div>'+
        '<div class="form-group"><label class="form-label">Day no. / Days left</label>'+
          '<div style="display:flex;gap:6px">'+
            '<input class="form-input" type="number" id="dpr-dayno" placeholder="Day no" min="0">'+
            '<input class="form-input" type="number" id="dpr-daysleft" placeholder="Days left" min="0">'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div class="form-row" style="margin-top:10px">'+
        '<div class="form-group"><label class="form-label">Committed manpower</label><input class="form-input" type="number" id="dpr-committed-mp" min="0" value="0"></div>'+
        '<div class="form-group"><label class="form-label">Manpower available today at site</label><input class="form-input" type="number" id="dpr-manpower" min="0" value="0"></div>'+
      '</div>'+
      '<div class="form-row" style="margin-top:10px">'+
        '<div class="form-group"><label class="form-label">Photos (up to 10 files)</label><input type="file" id="dpr-photos" multiple accept="image/*" style="font-size:12px"><div id="dpr-photos-list" style="font-size:11px;color:#1D9E75;margin-top:4px"></div></div>'+
        '<div class="form-group"><label class="form-label">Next day plan</label><input class="form-input" id="dpr-next" placeholder="e.g. Continue floor 12"></div>'+
      '</div>'+
    '</div>'+
    '<div class="form-card"><div class="form-card-title">Today\'s installation by product</div>'+
      '<div id="dpr-day-info" style="font-size:12px;color:#444;margin-bottom:10px;background:#f5f5f3;border-radius:6px;padding:8px 10px"></div>'+
      '<div id="dpr-products-list"></div>'+
    '</div>'+
    (CHECKLIST_DEFS.filter(def=>isChecklistActive(def,proj)).map(def=>
    '<div class="form-card"><div class="form-card-title">'+def.label+(def.mandatory?' <span class="badge br">⚠ Mandatory</span>':'')+'</div>'+
      '<div style="font-size:11px;color:#888;margin-bottom:10px">'+(def.mandatory?'Required before this milestone can move forward. ':'')+'Once filled in, this shows as a dropdown under All Projects and here in DPR.'+(def.advancesMilestoneLabel?' Completing it will automatically mark "'+def.advancesMilestoneLabel+'" done and send the report to Admin.':'')+'</div>'+
      '<div id="dpr-checklist-'+def.key+'"></div>'+
    '</div>').join(''))+
    '<div class="form-card"><div class="form-card-title">Constraints</div>'+
      '<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:8px"><input type="checkbox" id="dpr-no-constraints" onchange="toggleNoConstraints()"> No constraints today</label>'+
      '<div id="dpr-constraints-list" style="margin-bottom:10px"></div>'+
      '<div style="display:flex;gap:8px;align-items:flex-end">'+
        '<div class="form-group" style="flex:1;margin:0"><label class="form-label">Add constraint</label><input class="form-input" id="dpr-constraint-txt" placeholder="e.g. Material shortage"></div>'+
        '<button class="btn btn-outline btn-sm" onclick="addDPRConstraint()">+ Add</button>'+
      '</div>'+
    '</div>'+
    '<div class="form-card"><div class="form-card-title">Notes</div>'+
      '<div class="form-group" style="margin-bottom:10px"><label class="form-label">Action taken</label><input class="form-input" id="dpr-action" placeholder="e.g. Arranged alternate crane slot"></div>'+
      '<div class="form-group"><label class="form-label">Remarks</label><input class="form-input" id="dpr-remarks" placeholder="Any additional remarks"></div>'+
    '</div>'+
    '<div class="form-card"><div class="form-card-title">Material arrival acknowledgement</div>'+
      '<div style="font-size:11px;color:#888;margin-bottom:8px">If a material lot arrived today, acknowledge it here — this updates the Material tab automatically.</div>'+
      '<div class="form-group" style="margin-bottom:10px"><label class="form-label">Lot</label><select class="form-input" id="dpr-arrival-lot"><option value="">— No lot arrived today —</option></select></div>'+
      '<div class="form-row"><div class="form-group"><label class="form-label">Actual arrival date</label><input class="form-input" type="date" id="dpr-arrival-date" readonly disabled style="background:#f0f0f0"><div style="font-size:11px;color:#888;margin-top:2px">Always today\'s date.</div></div><div class="form-group"><label class="form-label">Condition on arrival</label><select class="form-input" id="dpr-arrival-condition"><option value="">— Select —</option><option value="good">Good</option><option value="partial">Partial damage</option><option value="damaged">Damaged</option></select></div></div>'+
      '<div class="form-row" style="margin-top:10px"><div class="form-group"><label class="form-label">Bundle count matched?</label><select class="form-input" id="dpr-arrival-bundle"><option value="">— Select —</option><option value="yes">Yes</option><option value="no">No</option></select></div><div class="form-group"><label class="form-label">Arrival notes</label><input class="form-input" id="dpr-arrival-notes" placeholder="e.g. 2 bundles wet, dried on site"></div></div>'+
      '<div class="form-group" style="margin-top:10px"><label class="form-label">Arrival photos (up to 10)</label>'+
        '<div style="font-size:11px;color:#888;margin-bottom:4px">Tap to open your camera directly (rear camera on phone), or choose existing photos. You can add multiple, one at a time or several together.</div>'+
        '<input type="file" id="dpr-arrival-photo" accept="image/*" capture="environment" multiple style="font-size:12px">'+
        '<div id="dpr-arrival-photo-list" style="font-size:11px;color:#1D9E75;margin-top:4px"></div>'+
      '</div>'+
      '<div class="form-group" style="margin-top:10px">'+
        '<label class="form-label">Click on button below for location</label>'+
        '<div style="font-size:11px;color:#cc3333;font-weight:600;margin-bottom:4px">⚠ Must be filled at project site only</div>'+
        '<button class="btn btn-outline btn-sm" onclick="captureDPRArrivalGeoLocation()">Click here</button>'+
        '<div id="dpr-arrival-geo-result" style="font-size:12px;color:#1D9E75;margin-top:6px"></div>'+
      '</div>'+
    '</div>'+
    '<div class="form-card"><div class="form-card-title">WCC upload (Work Completion Certificate)</div>'+
      '<div style="font-size:11px;color:#888;margin-bottom:8px">Upload the WCC once a scope of work is completed and quantities are confirmed above — this notifies Finance that an RA bill needs to be generated for this project.</div>'+
      '<input type="file" id="dpr-wcc-upload" accept="image/*,application/pdf" multiple style="font-size:12px">'+
      '<div id="dpr-wcc-upload-list" style="font-size:11px;color:#1D9E75;margin-top:4px"></div>'+
    '</div>'+
    '<div class="form-card"><div class="form-card-title">Log a snag (optional)</div>'+
      '<div style="font-size:11px;color:#888;margin-bottom:8px">Spot a defect or issue on site today? Log it here — it\'ll show up in All Projects, Finance, and Notifications immediately.</div>'+
      '<div class="form-group" style="margin-bottom:10px"><label class="form-label">Description</label><input class="form-input" id="dpr-snag-desc" placeholder="e.g. Grille misaligned on floor 4"></div>'+
      '<div class="form-row"><div class="form-group"><label class="form-label">Location</label><input class="form-input" id="dpr-snag-location" placeholder="e.g. Floor 4, East wing"></div><div class="form-group"><label class="form-label">Units affected</label><input class="form-input" type="number" min="0" id="dpr-snag-units-affected" placeholder="e.g. 25" oninput="updateSnagSeverityHint(\'dpr-snag-units-affected\',\'dpr-snag-severity\', projects.find(x=>x.id===parseInt(document.getElementById(\'dpr-proj\').value))?projects.find(x=>x.id===parseInt(document.getElementById(\'dpr-proj\').value)).installedQty:0)"></div></div>'+
      '<div class="form-group" style="margin-top:10px"><label class="form-label">Severity</label><select class="form-input" id="dpr-snag-severity" disabled title="Enter &quot;Units affected&quot; first — Severity is set automatically from that."><option>Minor</option><option>Major</option><option>Critical</option></select><div id="dpr-snag-severity-hint" style="font-size:11px;color:#a06a00;margin-top:3px">🔒 Enter "Units affected" above first — Severity unlocks automatically once that\'s filled in.</div></div>'+
      '<div class="form-group" style="margin-top:10px"><label class="form-label">Photo (optional)</label><input type="file" id="dpr-snag-photo" accept="image/*"><div id="dpr-snag-photo-list" style="font-size:11px;color:#1D9E75;margin-top:2px"></div></div>'+
      '<div class="form-group" style="margin-top:10px"><label class="form-label">Daily report PDF (for Gantt/reference)</label>'+
        '<div style="font-size:11px;color:#888;margin-bottom:4px">Attach a PDF of today\'s work report — required only if you\'re logging a snag below.</div>'+
        '<input type="file" id="dpr-report-pdf" accept="application/pdf" style="font-size:12px"><div id="dpr-report-pdf-list" style="font-size:11px;color:#1D9E75;margin-top:4px"></div>'+
      '</div>'+
    '</div>'+
    '<div class="form-card"><div class="form-card-title">🔒 Internal only (not shown to client)</div>'+
      '<div class="form-group" style="margin-bottom:10px"><label class="form-label">Internal hindrance</label><input class="form-input" id="dpr-internal-hindrance"></div>'+
      '<div class="form-group" style="margin-bottom:10px"><label class="form-label">Next dispatch</label><input class="form-input" id="dpr-next-dispatch"></div>'+
      '<div class="form-group"><label class="form-label">Escalations</label><input class="form-input" id="dpr-escalations"></div>'+
    '</div>';

  renderDPRProducts();
  CHECKLIST_DEFS.filter(def=>isChecklistActive(def,proj)).forEach(def=>renderDPRChecklist(def.key));
  state.dprPendingConstraints=[];
  renderConstraintList('dpr-constraints-list',state.dprPendingConstraints,'removeDPRConstraint');
  document.getElementById('dpr-no-constraints').checked=false;
  const lotSel=document.getElementById('dpr-arrival-lot');
  const projLots=state.materialLots.filter(l=>l.projId===proj.id);
  lotSel.innerHTML='<option value="">— No lot arrived today —</option>'+projLots.map(l=>'<option value="'+l.id+'">'+l.lotNo+(l.actualArrival?' (already marked arrived)':'')+'</option>').join('');
  document.getElementById('dpr-arrival-date').value=new Date().toISOString().slice(0,10);
  state.dprArrivalGeoLocation='';
  document.getElementById('dpr-arrival-geo-result').textContent='';
  state.dprArrivalPhotoUrls=[];
  document.getElementById('dpr-arrival-photo').value='';
  document.getElementById('dpr-arrival-photo-list').textContent='';
  document.getElementById('dpr-arrival-photo').onchange=async function(){
    const files=pickFilesOrWarn(this,10); if(!files) return;
    document.getElementById('dpr-arrival-photo-list').textContent='Uploading '+files.length+' file(s)...';
    const urls=await uploadFiles(files,'material-arrival');
    state.dprArrivalPhotoUrls=[...state.dprArrivalPhotoUrls,...urls];
    document.getElementById('dpr-arrival-photo-list').textContent=state.dprArrivalPhotoUrls.length+' photo(s) captured/uploaded';
  };
  state.dprWccUrls=[];
  document.getElementById('dpr-wcc-upload').value='';
  document.getElementById('dpr-wcc-upload-list').textContent='';
  document.getElementById('dpr-wcc-upload').onchange=async function(){
    const files=pickFilesOrWarn(this,10); if(!files) return;
    document.getElementById('dpr-wcc-upload-list').textContent='Uploading '+files.length+' file(s)...';
    const uploaded=await uploadFilesWithNames(files,'wcc-docs');
    state.dprWccUrls=[...state.dprWccUrls,...uploaded];
    document.getElementById('dpr-wcc-upload-list').textContent=state.dprWccUrls.length+' file(s) uploaded.';
  };
  document.getElementById('dpr-snag-desc').value='';
  document.getElementById('dpr-snag-location').value='';
  document.getElementById('dpr-snag-units-affected').value='';
  document.getElementById('dpr-snag-severity').disabled=true;
  document.getElementById('dpr-snag-photo').value='';
  document.getElementById('dpr-snag-photo-list').textContent='';
  state.dprSnagPhotoUrl='';
  document.getElementById('dpr-snag-photo').onchange=async function(){
    const file=this.files[0]; if(!file) return;
    document.getElementById('dpr-snag-photo-list').textContent='Uploading...';
    const urls=await uploadFiles([file],'snags');
    if(urls.length){ state.dprSnagPhotoUrl=urls[0]; document.getElementById('dpr-snag-photo-list').textContent='✓ Uploaded'; }
  };
  state.dprPhotoUrls=[];
  document.getElementById('dpr-photos').value='';
  document.getElementById('dpr-photos-list').textContent='';
  document.getElementById('dpr-photos').onchange=async function(){
    const files=pickFilesOrWarn(this,10); if(!files) return;
    document.getElementById('dpr-photos-list').textContent='Uploading '+files.length+' file(s)...';
    const urls=await uploadFiles(files,'dpr-photos');
    state.dprPhotoUrls=[...state.dprPhotoUrls,...urls];
    document.getElementById('dpr-photos-list').textContent=state.dprPhotoUrls.length+' photo(s) uploaded.';
  };
  state.dprReportPdfUrl='';
  document.getElementById('dpr-report-pdf').value='';
  document.getElementById('dpr-report-pdf-list').textContent='';
  document.getElementById('dpr-report-pdf').onchange=async function(){
    const file=this.files[0]; if(!file) return;
    document.getElementById('dpr-report-pdf-list').textContent='Uploading...';
    const urls=await uploadFiles([file],'dpr-reports');
    if(urls.length){ state.dprReportPdfUrl=urls[0]; document.getElementById('dpr-report-pdf-list').textContent='✓ Uploaded'; }
  };
}

// "Today is Day No" and "Days Left" — computed from Installation Commencement Date and
// Days Available, exactly matching the uploaded DPR sheet's own formulas.
export function dprDayNo(p){
  if(!p||!p.installCommencementDate) return null;
  return daysDiff(p.installCommencementDate, new Date().toISOString().slice(0,10))+1;
}
export function dprDaysLeft(p){
  const dayNo=dprDayNo(p);
  if(dayNo===null||!p.daysAvailable) return null;
  return Math.max(0,p.daysAvailable-dayNo);
}
export function divFmt(num,den,suffix){
  // Mirrors Excel's #DIV/0! behavior when the denominator isn't available yet, but shown
  // more legibly in-app.
  if(!den) return '#DIV/0!';
  return (suffix==='%'?Math.round((num/den)*100)+'%':Math.round(num/den).toLocaleString('en-IN'));
}
// Renders the 5-part Pre-Mockup checklist (A–E) inside the DPR form, with a running
// completion count per group so Supervisor can see progress at a glance.
export function renderDPRChecklist(defKey){
  const def=CHECKLIST_DEFS.find(d=>d.key===defKey); if(!def) return;
  const el=document.getElementById('dpr-checklist-'+defKey); if(!el) return;
  const checklistState=state.dprChecklistState[defKey]||{};
  el.innerHTML=def.groups.map(g=>{
    const items=checklistState[g.key]||[];
    const doneCount=items.filter(i=>i.done).length;
    return '<div style="margin-bottom:14px">'+
      '<div style="font-size:12px;font-weight:700;color:#444;margin-bottom:6px">'+g.title+' <span style="font-weight:400;color:#888">('+doneCount+'/'+items.length+')</span></div>'+
      items.map((item,i)=>
        '<label style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;cursor:pointer">'+
          '<input type="checkbox" '+(item.done?'checked':'')+' onchange="toggleDPRChecklistItem(\''+defKey+'\',\''+g.key+'\','+i+')"> '+item.text+
        '</label>'
      ).join('')+
    '</div>';
  }).join('');
}
export function toggleDPRChecklistItem(defKey,groupKey,idx){
  state.dprChecklistState[defKey][groupKey][idx].done=!state.dprChecklistState[defKey][groupKey][idx].done;
  renderDPRChecklist(defKey);
}
export function renderDPRProducts(){
  const el=document.getElementById('dpr-products-list'); if(!el) return;
  const projId=parseInt(document.getElementById('dpr-proj').value);
  const p=state.projects.find(x=>x.id===projId);
  const dayNo=dprDayNo(p), daysLeft=dprDaysLeft(p);
  document.getElementById('dpr-day-info').innerHTML=p?
    'Today is Day No: <b>'+(dayNo!==null?dayNo:'—')+'</b> &nbsp;·&nbsp; Days left: <b>'+(daysLeft!==null?daysLeft:'—')+'</b> &nbsp;·&nbsp; Days available: <b>'+(p.daysAvailable||'—')+'</b>'
    +(dayNo===null?'<div style="color:#cc3333;margin-top:2px">Set "Date of installation commencement" on the project to compute Day No / Days Left.</div>':'')
    :'';
  if(!state.dprProducts.length){ el.innerHTML='<div style="font-size:12px;color:#888">No products defined for this project. Add products via the project edit form first.</div>'; return; }
  el.innerHTML='<div style="overflow-x:auto"><table class="team-table" style="font-size:11px;white-space:nowrap">'+
    '<thead><tr>'+
      '<th>Product</th><th>Total qty (PO/WO)</th><th>Daily targeted qty</th><th>Cum. till yesterday</th><th>Today\'s installed qty</th><th>Location</th>'+
      '<th>Daily target achievement %</th><th>Total cumulative installed</th><th>Avg per day</th><th>Balance qty</th><th>Balance %</th><th>Required avg/day to catch up</th>'+
    '</tr></thead><tbody>'+
    state.dprProducts.map((r,i)=>{
      const dailyTarget=p&&p.daysAvailable?Math.round(r.totalQty/p.daysAvailable):0;
      const totalCumulative=r.cumulativeTillYesterday+(r.todayInstalled||0);
      const balanceQty=Math.max(0,r.totalQty-totalCumulative);
      const balancePct=r.totalQty>0?Math.round((balanceQty/r.totalQty)*100):0;
      return '<tr>'+
        '<td>'+r.product+'</td>'+
        '<td style="text-align:center">'+fmt(r.totalQty)+'</td>'+
        '<td style="text-align:center">'+(p&&p.daysAvailable?fmt(dailyTarget):'#DIV/0!')+'</td>'+
        '<td style="text-align:center;min-width:80px"><input class="form-input" type="number" min="0" style="text-align:center;padding:4px" value="'+r.cumulativeTillYesterday+'" oninput="dprProducts['+i+'].cumulativeTillYesterday=parseInt(this.value)||0;updateDPRProductDerived('+i+')"></td>'+
        '<td style="text-align:center;min-width:80px"><input class="form-input" type="number" min="0" style="text-align:center;padding:4px" value="'+r.todayInstalled+'" oninput="dprProducts['+i+'].todayInstalled=parseInt(this.value)||0;updateDPRProductDerived('+i+')"></td>'+
        '<td style="min-width:110px"><input class="form-input" style="padding:4px" placeholder="e.g. Floor 12" value="'+r.location+'" oninput="dprProducts['+i+'].location=this.value"></td>'+
        '<td style="text-align:center" id="dpr-prod-achv-'+i+'">'+(dailyTarget?divFmt(r.todayInstalled||0,dailyTarget,'%'):'#DIV/0!')+'</td>'+
        '<td style="text-align:center;font-weight:600" id="dpr-prod-cum-'+i+'">'+fmt(totalCumulative)+'</td>'+
        '<td style="text-align:center" id="dpr-prod-avg-'+i+'">'+(dayNo?divFmt(totalCumulative,dayNo):'#DIV/0!')+'</td>'+
        '<td style="text-align:center;font-weight:600;color:'+(balanceQty>0?'#cc3333':'#1D9E75')+'" id="dpr-prod-bal-'+i+'">'+fmt(balanceQty)+'</td>'+
        '<td style="text-align:center;color:'+(balancePct>0?'#cc3333':'#1D9E75')+'" id="dpr-prod-balpct-'+i+'">'+balancePct+'%</td>'+
        '<td style="text-align:center" id="dpr-prod-reqavg-'+i+'">'+(daysLeft?divFmt(balanceQty,daysLeft):'#DIV/0!')+'</td>'+
      '</tr>';
    }).join('')+
    '</tbody></table></div>'+
    '<div style="font-size:11px;color:#888;margin-top:6px">"#DIV/0!" shows exactly where the source sheet would too — fill in Days Available / Installation Commencement Date on the project to resolve these.</div>';
}
// Recomputes just one product row's derived columns and updates those cells directly —
// used instead of a full re-render on every keystroke, since rebuilding the whole table
// while a Supervisor is typing destroys the input's focus and makes typing feel broken
// (each digit needing a fresh click back into the field).
export function updateDPRProductDerived(i){
  const projId=parseInt(document.getElementById('dpr-proj').value);
  const p=state.projects.find(x=>x.id===projId);
  const dayNo=dprDayNo(p), daysLeft=dprDaysLeft(p);
  const r=state.dprProducts[i]; if(!r) return;
  const dailyTarget=p&&p.daysAvailable?Math.round(r.totalQty/p.daysAvailable):0;
  const totalCumulative=r.cumulativeTillYesterday+(r.todayInstalled||0);
  const balanceQty=Math.max(0,r.totalQty-totalCumulative);
  const balancePct=r.totalQty>0?Math.round((balanceQty/r.totalQty)*100):0;
  const set=(id,html)=>{ const el=document.getElementById(id); if(el) el.innerHTML=html; };
  set('dpr-prod-achv-'+i, dailyTarget?divFmt(r.todayInstalled||0,dailyTarget,'%'):'#DIV/0!');
  set('dpr-prod-cum-'+i, fmt(totalCumulative));
  set('dpr-prod-avg-'+i, dayNo?divFmt(totalCumulative,dayNo):'#DIV/0!');
  const balEl=document.getElementById('dpr-prod-bal-'+i);
  if(balEl){ balEl.innerHTML=fmt(balanceQty); balEl.style.color=balanceQty>0?'#cc3333':'#1D9E75'; }
  const balPctEl=document.getElementById('dpr-prod-balpct-'+i);
  if(balPctEl){ balPctEl.innerHTML=balancePct+'%'; balPctEl.style.color=balancePct>0?'#cc3333':'#1D9E75'; }
  set('dpr-prod-reqavg-'+i, daysLeft?divFmt(balanceQty,daysLeft):'#DIV/0!');
}

export async function saveDPR(){
  const projId=parseInt(document.getElementById('dpr-proj').value);
  const p=state.projects.find(x=>x.id===projId);
  const err=document.getElementById('dpr-error');
  if(err) err.classList.add('hidden');
  const dprSnagDescCheck=document.getElementById('dpr-snag-desc').value.trim();
  if(dprSnagDescCheck&&!state.dprReportPdfUrl){
    if(err){ err.classList.remove('hidden'); document.getElementById('dpr-err-msg').textContent='Daily report PDF is required when logging a snag — please attach it before saving this DPR.'; err.scrollIntoView({behavior:'smooth',block:'center'}); }
    return;
  }
  const dprUnitsAffectedCheck=parseInt(document.getElementById('dpr-snag-units-affected').value)||0;
  if(dprSnagDescCheck&&dprUnitsAffectedCheck<=0){
    if(err){ err.classList.remove('hidden'); document.getElementById('dpr-err-msg').textContent='Please enter "Units affected" for the snag before saving — Severity is set from that.'; err.scrollIntoView({behavior:'smooth',block:'center'}); }
    return;
  }
  const noC=document.getElementById('dpr-no-constraints').checked;
  // Bug fix: if the user typed a constraint but forgot to click "+ Add",
  // it was being silently dropped and the DPR incorrectly saved as "no constraints".
  const leftoverTxt=document.getElementById('dpr-constraint-txt').value.trim();
  if(leftoverTxt && !noC && !state.dprPendingConstraints.includes(leftoverTxt)){
    state.dprPendingConstraints.push(leftoverTxt);
  }
  const cList=noC?['None']:(state.dprPendingConstraints.length?state.dprPendingConstraints:['None']);
  const productsOut=state.dprProducts.map(r=>{
    const balanceQty=Math.max(0,r.totalQty-r.cumulativeTillYesterday-r.todayInstalled);
    const balancePct=r.totalQty>0?Math.round((balanceQty/r.totalQty)*100):0;
    return {...r,balanceQty,balancePct};
  });
  const newDpr={
    projId,
    project:p?(p.name+' — '+p.tower):'Unknown',
    date:fmtDate(document.getElementById('dpr-date').value),
    supervisor:document.getElementById('dpr-supervisor').value.trim()||'—',
    dayNo:parseInt(document.getElementById('dpr-dayno').value)||null,
    daysLeft:document.getElementById('dpr-daysleft').value?parseInt(document.getElementById('dpr-daysleft').value):null,
    committedMp:parseInt(document.getElementById('dpr-committed-mp').value)||0,
    actualMp:parseInt(document.getElementById('dpr-manpower').value)||0,
    manpower:parseInt(document.getElementById('dpr-manpower').value)||0,
    photos:state.dprPhotoUrls.length,
    photoUrls:state.dprPhotoUrls,
    reportPdfUrl:state.dprReportPdfUrl,
    products:productsOut,
    constraints:cList,
    actionTaken:document.getElementById('dpr-action').value.trim(),
    remarks:document.getElementById('dpr-remarks').value.trim(),
    internalHindrance:document.getElementById('dpr-internal-hindrance').value.trim(),
    nextDispatch:document.getElementById('dpr-next-dispatch').value.trim(),
    escalations:document.getElementById('dpr-escalations').value.trim(),
    next:document.getElementById('dpr-next').value.trim()||'—',
    framingMaterial:'',
    sectionSize:''
  };
  // If editing, capture what this entry contributed before, so the project rollup can be
  // corrected by the difference rather than double-counting the new figures on top.
  let oldTotalTodayForEdit=0;
  if(state.editingDprId){
    const oldEntry=state.dprLog.find(x=>x.id===state.editingDprId);
    if(oldEntry) oldTotalTodayForEdit=(oldEntry.products||[]).reduce((a,r)=>a+(r.todayInstalled||0),0);
  }
  let savedDpr;
  if(state.editingDprId){
    const {data:updated,error}=await db.from('dpr_log').update(dprToRow(newDpr)).eq('id',state.editingDprId).select().single();
    if(error){ console.error('Supabase update failed',error); alert('Could not save DPR changes — check console.'); return; }
    savedDpr=rowToDpr(updated);
    const idx=state.dprLog.findIndex(x=>x.id===state.editingDprId);
    if(idx>=0) state.dprLog[idx]=savedDpr; else state.dprLog.unshift(savedDpr);
    logActivity('DPR updated', (p?p.name+' — '+p.tower:'Project')+' — corrected daily report for '+newDpr.date);
  } else {
    // No client-supplied id — dpr_log.id is a real Postgres identity column, so letting the
    // database assign it atomically avoids two concurrent submissions colliding (see plan.md v2-4).
    const {data:inserted,error}=await db.from('dpr_log').insert(dprToRow(newDpr)).select().single();
    if(error){ console.error('Supabase insert failed',error); alert('Could not save DPR to database — check console.'); return; }
    savedDpr=rowToDpr(inserted);
    state.dprLog.unshift(savedDpr);
    logActivity('DPR submitted', (p?p.name+' — '+p.tower:'Project')+' — daily report for '+newDpr.date);
  }
  if(p){
    CHECKLIST_DEFS.filter(def=>state.dprChecklistState[def.key]).forEach(def=>{
      const newState=state.dprChecklistState[def.key];
      // Detect newly-100%-complete BEFORE overwriting, so we only notify once, not on every save.
      const totalItems=checklistTotalItems(def);
      const oldDone=checklistDoneItems(def,p[def.dataField]);
      const wasComplete=totalItems>0&&oldDone===totalItems;
      p[def.dataField]=newState;
      const doneItems=checklistDoneItems(def,newState);
      const isNowComplete=totalItems>0&&doneItems===totalItems;
      const editorName=state.currentUser?state.currentUser.name:'Someone';
      if(isNowComplete&&!wasComplete){
        p[def.completedField]=new Date().toISOString();
        p[def.reviewedField]=false;
        logActivity(def.label+' completed', p.name+' — '+p.tower+' — all '+totalItems+' items done by '+editorName+'. Ready for Admin review.');
        const adminEmail=getAdminEmail();
        if(adminEmail){
          notifyByGmail(adminEmail, def.label+' completed — '+p.name+' — '+p.tower,
            'Hi Admin,\n\n'+editorName+' has fully completed the '+def.label+' for the following project:\n\n'+
            'Project: '+p.name+' — '+p.tower+'\n'+'Developer: '+(p.developer||'—')+'\n'+
            'All '+totalItems+' checklist items are now complete — ready for your review.\n\n'+
            'Regards,\nEcoste Installation Team');
        }
        if(p.salesPersonEmail){
          const subject=def.label+' completed — '+p.name+' — '+p.tower;
          const body='Hi '+(p.salesPersonName||'there')+',\n\n'+
            'The '+def.label+' for your project has been fully completed by the site team.\n\n'+
            'Project: '+p.name+' — '+p.tower+'\n'+
            'Developer: '+(p.developer||'—')+'\n'+
            'Supervisor: '+(p.supervisor||'—')+'\n'+
            'All '+totalItems+' checklist items are now complete.\n\n'+
            'This project is now ready to move forward. Our team will be in touch with next steps.\n\n'+
            'Regards,\nEcoste Installation Team';
          notifyByGmail(p.salesPersonEmail, subject, body);
        }
        // Milestone auto-advance: some checklists (e.g. General Work Policy) represent an
        // action whose completion literally IS the next milestone — mark it done automatically
        // instead of making someone do it manually right after submitting the checklist.
        if(def.advancesMilestoneKey&&Array.isArray(p.milestones)){
          const msIdx=p.milestones.findIndex(m=>m.key===def.advancesMilestoneKey&&!m.actual);
          if(msIdx>=0){
            const today=new Date().toISOString().slice(0,10);
            p.milestones[msIdx].actual=today;
            p.milestones[msIdx].gap=p.milestones[msIdx].planned?daysDiff(p.milestones[msIdx].planned,today):null;
            logActivity('Milestone advanced', p.name+' — '+p.tower+' — "'+p.milestones[msIdx].label+'" auto-marked done after '+def.label+' was submitted.');
          }
        }
      }
      // Logged (visible under Notifications → Recent Activity) every time, with who made
      // the edit — this is the running edit log for Admin to see, whether or not it's
      // finished. Checklists are never locked: Supervisor can keep editing before AND
      // after submission/review, and this log just keeps tracking each change.
      logActivity(def.label+' updated', p.name+' — '+p.tower+' — '+doneItems+'/'+totalItems+' items complete, edited by '+editorName);
    });
    if(Object.keys(state.dprChecklistState).length) await syncProject(p);
  }
  if(cList.length&&cList[0]!=='None') logActivity('Constraint added', (p?p.name+' — '+p.tower:'Project')+' — '+cList.length+' constraint(s) logged via DPR');
  // roll product totals up into project's installed qty
  if(p){
      const rawTotalToday=productsOut.reduce((a,r)=>a+(r.todayInstalled||0),0);
      // When editing an existing DPR, only the CHANGE since the original submission should
      // roll into the project total — otherwise the original day's qty gets double-counted
      // on top of the correction.
      const totalToday=state.editingDprId?(rawTotalToday-oldTotalTodayForEdit):rawTotalToday;
      // If Supervisor corrected a product's "Cumulative till yesterday" (different from what
      // the system auto-computed from DPR history), that correction needs to reach the
      // project's overall Installed Qty too — not just this DPR sheet's own display math.
      const correctionDelta=productsOut.reduce((a,r)=>a+((r.cumulativeTillYesterday||0)-(r.originalCumulative!=null?r.originalCumulative:r.cumulativeTillYesterday)),0);
      if(totalToday!==0||correctionDelta!==0){
      const wasNotStarted=p.status==='Not Started';
      p.installedQty=Math.max(0,Math.min(p.plannedQty,p.installedQty+totalToday+correctionDelta));
      if(correctionDelta!==0) logActivity('Installed qty corrected', p.name+' — '+p.tower+' — cumulative figure adjusted by '+(correctionDelta>0?'+':'')+correctionDelta+' units by '+(state.currentUser?state.currentUser.name:'Supervisor'));
      if(wasNotStarted){ p.status='In Progress'; logActivity('Installation started', p.name+' — '+p.tower); }
      // NEW workflow: RA bill generation is now triggered by WCC upload + quantity update
      // together (not by JMR anymore). WCC upload alone, with no qty change, doesn't trigger
      // it — both need to happen in the same DPR.
      if(state.dprWccUrls.length){
        p.wccDocs=[...(p.wccDocs||[]),...state.dprWccUrls];
        const raBillHistory=[...(p.raBillHistory||[]),{
          billNumber:(p.raBillHistory||[]).length+1,
          date:new Date().toISOString().slice(0,10),
          trigger:'WCC uploaded + qty updated',
          qty:totalToday
        }];
        p.raBillHistory=raBillHistory;
        logActivity('WCC uploaded — RA bill to be generated', p.name+' — '+p.tower+' — qty '+fmt(totalToday)+'. Finance: please update RA bill amount and upload the RA bill file.');
      }
      await syncProject(p);
    } else if(state.dprWccUrls.length){
      // WCC uploaded but no qty change this DPR — still save the WCC file to the project,
      // just don't trigger the RA bill notification since qty wasn't actually updated.
      p.wccDocs=[...(p.wccDocs||[]),...state.dprWccUrls];
      await syncProject(p);
    }
  }
  // Material arrival acknowledgement — updates the corresponding lot, per the workflow doc
  const arrivalLotId=parseInt(document.getElementById('dpr-arrival-lot').value);
  if(arrivalLotId){
    const lotIdx=state.materialLots.findIndex(l=>l.id===arrivalLotId);
    if(lotIdx>=0){
      const lotUpdate={
        actualArrival:document.getElementById('dpr-arrival-date').value,
        condition:document.getElementById('dpr-arrival-condition').value,
        bundleMatched:document.getElementById('dpr-arrival-bundle').value,
        arrivalNotes:document.getElementById('dpr-arrival-notes').value.trim(),
        arrivalGeoLocation:state.dprArrivalGeoLocation,
        arrivalPhotoUrls:state.dprArrivalPhotoUrls,
        arrivalAckedAt:new Date().toISOString()
      };
      state.materialLots[lotIdx]={...state.materialLots[lotIdx],...lotUpdate};
      const {error:lotErr}=await db.from('material_lots').update(lotToRow(state.materialLots[lotIdx])).eq('id',arrivalLotId);
      if(lotErr) console.error('Supabase material_lots update failed',lotErr);
      logActivity('Material arrival acknowledged', (p?p.name+' — '+p.tower:'Project')+' — lot '+state.materialLots[lotIdx].lotNo);
      // Material received & acknowledged by site supervisor is also a trigger for RA bill
      // generation, same as a JMR update — logged as its own RA bill history entry.
      if(p&&lotUpdate.condition){
        const raBillHistory=[...(p.raBillHistory||[]),{
          billNumber:(p.raBillHistory||[]).length+1,
          date:new Date().toISOString().slice(0,10),
          trigger:'Material received & acknowledged',
          lotNo:state.materialLots[lotIdx].lotNo
        }];
        p.raBillHistory=raBillHistory;
        logActivity('RA bill generated', p.name+' — '+p.tower+' — bill #'+raBillHistory.length+' (material received)');
        await syncProject(p);
      }
    }
  }
  // Snag logged as part of today's DPR — added straight to the project's snag list.
  const dprSnagDesc=document.getElementById('dpr-snag-desc').value.trim();
  if(dprSnagDesc&&p){
    p.snags=[...(p.snags||[]),{
      description:dprSnagDesc,
      location:document.getElementById('dpr-snag-location').value.trim(),
      severity:document.getElementById('dpr-snag-severity').value,
      unitsAffected:parseInt(document.getElementById('dpr-snag-units-affected').value)||0,
      status:'open',
      raisedDate:new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
      raisedBy:state.currentUser?state.currentUser.name:'—',
      resolvedDate:'',
      photoUrl:state.dprSnagPhotoUrl
    }];
    await syncProject(p);
  }
  closePanel('panel-add-dpr');
  if(state.activeTab==='dpr') renderDPR();
  if(state.activeTab==='material') renderMaterial();
  renderMetrics(); renderProjects(); updateBell();
}

