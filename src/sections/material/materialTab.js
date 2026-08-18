import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { logActivity } from '../../lib/activityLog.js';
import { canDo, fmt, fmtDate, visibleProjects } from '../../lib/helpers.js';
import { lotToRow, rowToLot } from '../../lib/mappers.js';
import { uploadFiles } from '../../lib/uploads.js';
import { updateBell } from '../alerts.js';
import { closePanel, openPanel } from '../navigation.js';

/* ══ MATERIAL MOVEMENT ══ */
export function getInstalledForProject(projId){
  // sum all DPR today's installed for this project
  const entries=state.dprLog.filter(d=>d.projId===projId);
  const byProduct={};
  entries.forEach(d=>{
    if(d.products) d.products.forEach(r=>{
      byProduct[r.product]=(byProduct[r.product]||0)+(r.todayInstalled||0);
    });
  });
  const totalInstalled=Object.values(byProduct).reduce((a,v)=>a+v,0);
  // days since first DPR
  const dates=entries.map(d=>new Date(d.date)).filter(d=>!isNaN(d)).sort((a,b)=>a-b);
  const daysSinceFirst=dates.length>1?Math.max(1,Math.round((dates[dates.length-1]-dates[0])/86400000)+1):entries.length||1;
  return{totalInstalled,daysSinceFirst,byProduct};
}

export function getTotalDispatched(projId){
  const lots=state.materialLots.filter(l=>l.projId===projId&&l.actualArrival);
  let total=0;
  lots.forEach(l=>l.items.forEach(it=>total+=(it.qtyDispatched||0)));
  return total;
}

export function renderMaterial(){
  const el=document.getElementById('material-list'); if(!el) return;
  const sch=document.getElementById('mat-search')?.value.toLowerCase()||'';
  const allVp=visibleProjects();
  if(!allVp.length){el.innerHTML='<div class="empty">No projects visible.</div>';return;}
  const vp=allVp.filter(p=>!sch||(p.name||'').toLowerCase().includes(sch)||(p.tower||'').toLowerCase().includes(sch));
  if(!vp.length){el.innerHTML='<div class="empty">No projects match your search.</div>';return;}

  let html='';
  vp.forEach(p=>{
    const lots=state.materialLots.filter(l=>l.projId===p.id);
    const totalDispatched=getTotalDispatched(p.id);
    const soQty=p.soQty||p.plannedQty||0;
    const remaining=Math.max(0,soQty-totalDispatched);
    const unitLabel='sqft';

    html+='<div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:16px;overflow:hidden">'
      // Project header
      +'<div style="background:#085041;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">'
        +'<div><div style="color:#fff;font-weight:700;font-size:14px">'+p.name+' — '+p.tower+'</div>'
        +'<div style="color:rgba(255,255,255,.7);font-size:12px">'+p.city+'</div></div>'
        +(canDo('addLot')?'<button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.3)" onclick="openAddLotForProject('+p.id+')">+ Add lot</button>':'')
      +'</div>'

      // Qty summary — SO qty, dispatched, remaining only (installed-qty tracking lives on the Dashboard tab)
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0;border-bottom:1px solid #e0e0e0">'
        +timelineMetric('📐 Total qty (as per SO)',fmt(soQty)+' '+unitLabel,'#444')
        +timelineMetric('📦 Total dispatched',fmt(totalDispatched)+' '+unitLabel,'#185FA5')
        +timelineMetric('⏳ Remaining to dispatch',fmt(remaining)+' '+unitLabel,remaining>0?'#cc3333':'#1D9E75')
      +'</div>'

      // Lots list
      +'<div style="padding:12px 16px">'
        +'<div style="font-size:12px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Lot tracker</div>'
        +(lots.length?lots.map(lot=>renderLotCard(lot,p)).join(''):'<div style="font-size:12px;color:#888;padding:8px 0">No lots dispatched yet. Click "+ Add lot" to log a dispatch.</div>')
      +'</div>'
    +'</div>';
  });
  el.innerHTML=html;
}

export function timelineMetric(label,val,color){
  return '<div style="padding:12px 16px;border-right:1px solid #f0f0f0">'
    +'<div style="font-size:10px;color:#888;margin-bottom:3px">'+label+'</div>'
    +'<div style="font-size:15px;font-weight:700;color:'+color+'">'+val+'</div>'
  +'</div>';
}

export function renderLotCard(lot,p){
  const arrived=!!lot.actualArrival;
  const condColor=lot.condition==='good'?'#1D9E75':lot.condition==='partial'?'#f0a500':'#cc3333';
  const condLabel=lot.condition==='good'?'✅ Good':lot.condition==='partial'?'⚠️ Partial damage':lot.condition==='damaged'?'🔴 Damaged':'—';
  const totalQty=lot.items.reduce((a,it)=>a+(it.qtyDispatched||0),0);
  const unitLabel='sqft';
  // Highlight if this lot's arrival was acknowledged via DPR in the last 2 days
  const recentlyUpdated=lot.arrivalAckedAt&&(Date.now()-new Date(lot.arrivalAckedAt).getTime())<2*86400000;

  return '<div style="border:1px solid '+(recentlyUpdated?'#f0a500':'#e0e0e0')+';border-radius:8px;margin-bottom:8px;overflow:hidden;'+(recentlyUpdated?'box-shadow:0 0 0 1px #f0a500':'')+'">'
    // Lot header
    +'<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f5f5f3;border-bottom:1px solid #e0e0e0">'
      +'<div style="font-weight:700;font-size:13px;flex:1">'+lot.lotNo+'</div>'
      +'<span class="badge '+(arrived?'bg':'ba')+'">'+( arrived?'📦 Arrived':'🚛 In transit')+'</span>'
      +(recentlyUpdated?'<span class="badge" style="background:#fff3cd;color:#7a4f00">🆕 Updated via DPR</span>':'')
      +(lot.condition?'<span class="badge" style="background:#f5f5f3;border:1px solid #e0e0e0;color:'+condColor+'">'+condLabel+'</span>':'')
      +(state.currentUser&&state.currentUser.role==='admin'?'<button class="icon-btn btn-sm" onclick="openEditLot('+lot.id+')" title="Edit">✏️</button>':'')
    +'</div>'
    // Lot body
    +'<div style="padding:10px 14px;font-size:12px">'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:8px">'
        +'<div><span style="color:#888">Dispatched: </span><b>'+fmtDate(lot.dispatchDate)+'</b></div>'
        +'<div><span style="color:#888">Expected: </span><b>'+fmtDate(lot.expectedArrival)+'</b></div>'
        +'<div><span style="color:#888">Arrived: </span><b>'+(lot.actualArrival?fmtDate(lot.actualArrival):'⏳ Awaiting')+'</b></div>'
        +'<div><span style="color:#888">Vehicle: </span><b>'+( lot.vehicle||'—')+'</b></div>'
        +'<div><span style="color:#888">Bundle matched: </span><b>'+(lot.bundleMatched==='yes'?'✅ Yes':lot.bundleMatched==='no'?'❌ No':'—')+'</b></div>'
        +'<div><span style="color:#888">Storage: </span><b>'+(lot.storage||'—')+'</b></div>'
        +(lot.arrivalGeoLocation?'<div><span style="color:#888">Arrival GPS: </span><b>📍 '+lot.arrivalGeoLocation+'</b></div>':'')
        +(lot.arrivalPhotoUrls&&lot.arrivalPhotoUrls.length?'<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">'+lot.arrivalPhotoUrls.map(u=>'<a href="'+u+'" target="_blank"><img src="'+u+'" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #e0e0e0"></a>').join('')+'</div>':'')
        +(lot.lrCopyUrl||lot.ewayBillUrl||lot.deliveryChalanUrl||lot.lrCopyReceivingUrl||lot.packingListUrl||lot.otherDocumentUrl?
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">'
            +(lot.lrCopyUrl?'<a href="'+lot.lrCopyUrl+'" target="_blank" style="font-size:12px;color:#1D9E75">📄 LR copy</a>':'')
            +(lot.ewayBillUrl?'<a href="'+lot.ewayBillUrl+'" target="_blank" style="font-size:12px;color:#1D9E75">📄 E-way bill</a>':'')
            +(lot.deliveryChalanUrl?'<a href="'+lot.deliveryChalanUrl+'" target="_blank" style="font-size:12px;color:#1D9E75">📄 Delivery chalan</a>':'')
            +(lot.lrCopyReceivingUrl?'<a href="'+lot.lrCopyReceivingUrl+'" target="_blank" style="font-size:12px;color:#1D9E75">📄 LR copy receiving</a>':'')
            +(lot.packingListUrl?'<a href="'+lot.packingListUrl+'" target="_blank" style="font-size:12px;color:#1D9E75">📄 Packing list</a>':'')
            +(lot.otherDocumentUrl?'<a href="'+lot.otherDocumentUrl+'" target="_blank" style="font-size:12px;color:#1D9E75">📄 Other</a>':'')
          +'</div>':'')
      +'</div>'
      // Items table
      +'<div style="border-top:1px solid #f0f0f0;padding-top:8px">'
        +'<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:4px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:4px">'
          +'<div>Product</div><div style="text-align:center">Bundles</div><div style="text-align:center">Qty ('+unitLabel+')</div>'
        +'</div>'
        +lot.items.map(it=>'<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:4px;padding:3px 0;border-bottom:1px solid #f5f5f3">'
          +'<div>'+it.product+'</div>'
          +'<div style="text-align:center">'+it.bundleCount+'</div>'
          +'<div style="text-align:center;font-weight:700">'+fmt(it.qtyDispatched)+'</div>'
        +'</div>').join('')
        +'<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:4px;padding:4px 0;font-weight:700;color:#1D9E75">'
          +'<div>Total</div><div></div><div style="text-align:center">'+fmt(totalQty)+' '+unitLabel+'</div>'
        +'</div>'
      +'</div>'
      +(lot.arrivalNotes?'<div style="margin-top:6px;color:#888">Notes: '+lot.arrivalNotes+'</div>':'')
    +'</div>'
  +'</div>';
}

/* ── Lot document upload fields (v2-7): 5 fields alongside the existing LR copy field,
   same camera-first/optional behavior, wired the same way for each. ── */
const LOT_DOC_FIELDS=[
  {id:'lot_eway_bill', folder:'eway-bills', stateKey:'lotEwayBillUrl', lotKey:'ewayBillUrl'},
  {id:'lot_delivery_chalan', folder:'delivery-chalans', stateKey:'lotDeliveryChalanUrl', lotKey:'deliveryChalanUrl'},
  {id:'lot_lr_copy_receiving', folder:'lr-copies-receiving', stateKey:'lotLrCopyReceivingUrl', lotKey:'lrCopyReceivingUrl'},
  {id:'lot_packing_list', folder:'packing-lists', stateKey:'lotPackingListUrl', lotKey:'packingListUrl'},
  {id:'lot_other_document', folder:'other-documents', stateKey:'lotOtherDocumentUrl', lotKey:'otherDocumentUrl'}
];
function resetLotDocField(id, folder, stateKey, existingUrl){
  state[stateKey]=existingUrl||'';
  const input=document.getElementById(id); if(!input) return;
  input.value='';
  const list=document.getElementById(id+'-list');
  if(list) list.textContent=existingUrl?'✓ Already uploaded — choose a file to replace':'';
  input.onchange=async function(){
    const file=this.files[0]; if(!file) return;
    if(list) list.textContent='Uploading...';
    const urls=await uploadFiles([file],folder);
    if(urls.length){ state[stateKey]=urls[0]; if(list) list.textContent='✓ Uploaded'; }
  };
}

/* ── Lot form helpers ── */
export function renderLotItems(){
  const el=document.getElementById('lot_items_list'); if(!el) return;
  el.innerHTML=state.lotItems.map((it,i)=>
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">'
      +'<input class="form-input" style="flex:2" placeholder="Product name" value="'+(it.product||'')+'" oninput="lotItems['+i+'].product=this.value">'
      +'<input class="form-input" type="number" style="flex:1" placeholder="Bundles" value="'+(it.bundleCount||'')+'" oninput="lotItems['+i+'].bundleCount=+this.value" min="0">'
      +'<input class="form-input" type="number" style="flex:1" placeholder="Qty dispatched" value="'+(it.qtyDispatched||'')+'" oninput="lotItems['+i+'].qtyDispatched=+this.value" min="0">'
      +(state.lotItems.length>1?'<button onclick="lotItems.splice('+i+',1);renderLotItems()" style="background:none;border:none;cursor:pointer;color:#cc3333;font-size:18px">×</button>':'<span style="width:22px"></span>')
    +'</div>'
  ).join('');
}

export function addLotItemRow(){state.lotItems.push({product:'',bundleCount:0,qtyDispatched:0});renderLotItems();}

export function openAddLot(){
  if(!canDo('addLot')){ alert('You do not have permission to add a lot dispatch.'); return; }
  state.editingLotId=null; state.lotItems=[{product:'',bundleCount:0,qtyDispatched:0}];
  const title=document.getElementById('lot-panel-title');
  if(title) title.textContent='Add lot dispatch';
  const vp=visibleProjects();
  if(!vp.length){ alert('No projects available. Add a project first.'); return; }
  const ps=document.getElementById('lot_proj');
  if(ps) ps.innerHTML=vp.map(p=>'<option value="'+p.id+'">'+p.name+' — '+p.tower+'</option>').join('');
  ['lot_no','lot_vehicle','lot_driver','lot_dispatch_notes','lot_storage','lot_arrival_notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['lot_dispatch_date','lot_expected_arrival','lot_actual_arrival'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['lot_condition','lot_bundle_matched'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  state.lotLrCopyUrl='';
  document.getElementById('lot_lr_copy').value='';
  document.getElementById('lot_lr_copy-list').textContent='';
  document.getElementById('lot_lr_copy').onchange=async function(){
    const file=this.files[0]; if(!file) return;
    document.getElementById('lot_lr_copy-list').textContent='Uploading...';
    const urls=await uploadFiles([file],'lr-copies');
    if(urls.length){ state.lotLrCopyUrl=urls[0]; document.getElementById('lot_lr_copy-list').textContent='✓ Uploaded'; }
  };
  LOT_DOC_FIELDS.forEach(f=>resetLotDocField(f.id,f.folder,f.stateKey,''));
  document.getElementById('lot-error').classList.add('hidden');
  renderLotItems();
  openPanel('panel-add-lot');
  setTimeout(showRemainingToDispatch,10);
}

export function openAddLotForProject(projId){
  openAddLot();
  setTimeout(()=>{
    const ps=document.getElementById('lot_proj');
    if(ps){ ps.value=projId; showRemainingToDispatch(); }
  },10);
}

export function showRemainingToDispatch(){
  const projId=parseInt(document.getElementById('lot_proj')?.value); if(!projId) return;
  const p=state.projects.find(x=>x.id===projId); if(!p) return;
  const dispatched=getTotalDispatched(projId);
  const soQty=p.soQty||p.plannedQty||0;
  const poQty=p.poQty||0;
  const remainingSO=Math.max(0,soQty-dispatched);
  const remainingPO=poQty?Math.max(0,poQty-dispatched):null;
  let banner=document.getElementById('lot-remaining-banner');
  if(!banner){
    banner=document.createElement('div');
    banner.id='lot-remaining-banner';
    banner.style.cssText='background:#f0faf6;border:1px solid #b0dece;border-radius:6px;padding:8px 10px;font-size:12px;margin-bottom:10px';
    document.getElementById('lot_proj').closest('.form-card').prepend(banner);
  }
  banner.innerHTML='📦 <b>'+fmt(remainingSO)+' '+(p.unit||'sqft')+'</b> remaining to dispatch out of <b>'+fmt(soQty)+'</b> total SO qty ('+fmt(dispatched)+' already dispatched).'+
    (remainingPO!==null?'<br>📄 <b>'+fmt(remainingPO)+' '+(p.unit||'sqft')+'</b> remaining vs <b>'+fmt(poQty)+'</b> total PO qty.':'');
}

export function openEditLot(id){
  if(!state.currentUser||state.currentUser.role!=='admin'){ alert('Only Admin can edit a lot once it has been dispatched.'); return; }
  const lot=state.materialLots.find(l=>l.id===id); if(!lot) return;
  state.editingLotId=id;
  state.lotItems=lot.items.map(it=>({...it}));
  const title=document.getElementById('lot-panel-title');
  if(title) title.textContent='Edit lot — '+lot.lotNo;
  const vp=visibleProjects();
  const ps=document.getElementById('lot_proj');
  if(ps){ ps.innerHTML=vp.map(p=>'<option value="'+p.id+'">'+p.name+' — '+p.tower+'</option>').join(''); ps.value=lot.projId; }
  const sv=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||'';};
  sv('lot_no',lot.lotNo); sv('lot_vehicle',lot.vehicle); sv('lot_driver',lot.driver);
  sv('lot_dispatch_notes',lot.dispatchNotes); sv('lot_dispatch_date',lot.dispatchDate);
  sv('lot_expected_arrival',lot.expectedArrival); sv('lot_actual_arrival',lot.actualArrival);
  sv('lot_condition',lot.condition); sv('lot_bundle_matched',lot.bundleMatched);
  sv('lot_storage',lot.storage); sv('lot_arrival_notes',lot.arrivalNotes);
  state.lotLrCopyUrl=lot.lrCopyUrl||'';
  document.getElementById('lot_lr_copy').value='';
  document.getElementById('lot_lr_copy-list').textContent=state.lotLrCopyUrl?'✓ Already uploaded — choose a file to replace':'';
  document.getElementById('lot_lr_copy').onchange=async function(){
    const file=this.files[0]; if(!file) return;
    document.getElementById('lot_lr_copy-list').textContent='Uploading...';
    const urls=await uploadFiles([file],'lr-copies');
    if(urls.length){ state.lotLrCopyUrl=urls[0]; document.getElementById('lot_lr_copy-list').textContent='✓ Uploaded'; }
  };
  LOT_DOC_FIELDS.forEach(f=>resetLotDocField(f.id,f.folder,f.stateKey,lot[f.lotKey]));
  document.getElementById('lot-error').classList.add('hidden');
  renderLotItems();
  openPanel('panel-add-lot');
}

export async function saveLot(){
  const g=id=>{const el=document.getElementById(id);return el?el.value:'';};
  const projIdRaw=g('lot_proj');
  if(!projIdRaw){ document.getElementById('lot-error').classList.remove('hidden'); document.getElementById('lot-err-msg').textContent='Please select a project.'; return; }
  const projId=parseInt(projIdRaw);
  const data={
    projId,
    lotNo:g('lot_no')||'Lot '+(state.materialLots.filter(l=>l.projId===projId).length+1),
    dispatchDate:g('lot_dispatch_date'),
    expectedArrival:g('lot_expected_arrival'),
    actualArrival:g('lot_actual_arrival'),
    vehicle:g('lot_vehicle'),
    driver:g('lot_driver'),
    dispatchNotes:g('lot_dispatch_notes'),
    condition:g('lot_condition'),
    bundleMatched:g('lot_bundle_matched'),
    storage:g('lot_storage'),
    arrivalNotes:g('lot_arrival_notes'),
    lrCopyUrl:state.lotLrCopyUrl,
    ewayBillUrl:state.lotEwayBillUrl,
    deliveryChalanUrl:state.lotDeliveryChalanUrl,
    lrCopyReceivingUrl:state.lotLrCopyReceivingUrl,
    packingListUrl:state.lotPackingListUrl,
    otherDocumentUrl:state.lotOtherDocumentUrl,
    items:state.lotItems.filter(it=>it.product.trim())
  };
  if(state.editingLotId){
    const idx=state.materialLots.findIndex(l=>l.id===state.editingLotId);
    state.materialLots[idx]={...state.materialLots[idx],...data};
    const {error}=await db.from('material_lots').update(lotToRow(state.materialLots[idx])).eq('id',state.editingLotId);
    if(error){ console.error('Supabase update failed',error); document.getElementById('lot-error').classList.remove('hidden'); document.getElementById('lot-err-msg').textContent='Could not save to database — check console.'; return; }
  } else {
    // No client-supplied id — material_lots.id is a real Postgres identity column, so letting
    // the database assign it atomically avoids two concurrent submissions colliding (see plan.md v2-4).
    const {data:inserted,error}=await db.from('material_lots').insert(lotToRow(data)).select().single();
    if(error){ console.error('Supabase insert failed',error); document.getElementById('lot-error').classList.remove('hidden'); document.getElementById('lot-err-msg').textContent='Could not save to database — check console.'; return; }
    state.materialLots.push(rowToLot(inserted));
    const proj=state.projects.find(x=>x.id===projId);
    logActivity('Dispatch lot added', (proj?proj.name+' — '+proj.tower:'Project')+' — '+data.lotNo);
  }
  document.getElementById('lot-error').classList.add('hidden');
  closePanel('panel-add-lot');
  if(state.activeTab==='material') renderMaterial();
  updateBell(); // was missing — the Material badge and dispatch notification never
                // refreshed when a new lot was added without this.
}

