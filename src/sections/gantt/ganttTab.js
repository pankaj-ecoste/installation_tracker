import { TODAY } from '../../lib/constants.js';
import { fmtDate, pct, visibleProjects } from '../../lib/helpers.js';

/* ══ GANTT ══ */
export function renderGantt(){
  const sq=(document.getElementById('gantt-search')?.value||'').toLowerCase();
  let vp=visibleProjects();
  if(sq) vp=vp.filter(p=>(p.name||'').toLowerCase().includes(sq)||(p.tower||'').toLowerCase().includes(sq)||(p.developer||'').toLowerCase().includes(sq));
  if(!vp.length){ document.getElementById('gantt-wrap').innerHTML='<div class="empty">'+(sq?'No projects match your search.':'No projects to display.')+'</div>'; return; }
  // Row 1 = Project name (with a visual progress chart). Row 2 onward = each milestone with
  // Planned date, Actual date, and Gap (ahead/late/on-time) shown side by side.
  const html=vp.map(p=>{
    const milestones=p.milestones||[];
    const doneCount=milestones.filter(m=>!!m.actual).length;
    const msPct=milestones.length?Math.round((doneCount/milestones.length)*100):0;
    const msRows=milestones.length?milestones.map(m=>{
      const isDone=!!m.actual;
      const isLate=!isDone&&m.planned&&new Date(m.planned)<TODAY;
      let gapLabel='—', gapColor='#888';
      if(isDone&&m.planned){
        const g=Math.round((new Date(m.actual)-new Date(m.planned))/86400000);
        gapLabel=g===0?'On time':g<0?Math.abs(g)+'d early':g+'d late';
        gapColor=g<0?'#1a5e2a':g>0?'#cc3333':'#444';
      } else if(isLate){
        gapLabel='Overdue'; gapColor='#cc3333';
      }
      return '<tr>'+
        '<td style="'+(isDone?'':'color:#888')+'">'+(isDone?'✅':isLate?'⏰':'⬜')+' '+m.label+'</td>'+
        '<td style="color:#666">'+fmtDate(m.planned)+'</td>'+
        '<td style="'+(isDone?'color:#1D9E75;font-weight:600':'color:#888')+'">'+(isDone?fmtDate(m.actual):'—')+'</td>'+
        '<td style="color:'+gapColor+';font-weight:600">'+gapLabel+'</td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="4" style="color:#888;padding:8px 0">No milestones added yet.</td></tr>';
    return '<div class="proj-card" style="cursor:default;margin-bottom:10px">'+
      '<div class="proj-name">'+(p.name||'Untitled')+' — '+(p.tower||'')+'</div>'+
      '<div class="proj-sub">'+(p.supervisor&&p.supervisor!=='—'?'👤 '+p.supervisor+' · ':'')+pct(p.installedQty,p.plannedQty)+'% installed'+(p.salesPersonName?' · 👤 Sales: '+p.salesPersonName:'')+'</div>'+
      '<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:3px"><span>Milestones completed</span><span>'+doneCount+' / '+milestones.length+' ('+msPct+'%)</span></div>'+
        '<div style="height:10px;background:#f0f0f0;border-radius:5px;overflow:hidden"><div style="height:100%;width:'+msPct+'%;background:#1D9E75"></div></div></div>'+
      '<table style="width:100%;font-size:13px;margin-top:12px;border-collapse:collapse">'+
        '<thead><tr style="font-size:11px;color:#666;text-transform:uppercase"><th style="text-align:left;padding-bottom:4px">Milestone</th><th style="text-align:left;padding-bottom:4px">Planned</th><th style="text-align:left;padding-bottom:4px">Actual</th><th style="text-align:left;padding-bottom:4px">Gap</th></tr></thead>'+
        '<tbody>'+msRows+'</tbody>'+
      '</table>'+
    '</div>';
  }).join('');
  document.getElementById('gantt-wrap').innerHTML=html;
}

/* ══ PIPELINE ══ */
export function renderPipeline(){
  const vp=visibleProjects();
  const phases=[{label:"Not started",cls:"ph-ns",f:p=>p.status==='Not Started'},{label:"In progress",cls:"ph-ip",f:p=>p.status==='In Progress'},{label:"On Hold",cls:"ph-hold",f:p=>p.status==='On Hold'},{label:"Completed",cls:"ph-dn",f:p=>p.status==='Completed'}];
  document.getElementById('pipeline-view').innerHTML=phases.map(ph=>{
    const cards=vp.filter(ph.f);
    return '<div class="phase-col"><div class="phase-hdr '+ph.cls+'">'+ph.label+' <span style="opacity:.7">'+cards.length+'</span></div><div class="phase-body">'+(cards.length?cards.map(p=>{
      try{ return '<div class="mini-card"><div class="mini-name">'+(p.name||'Untitled')+' — '+(p.tower||'')+'</div><div class="mini-sub">'+(p.supervisor||'—')+' · '+pct(p.installedQty,p.plannedQty)+'% installed</div></div>'; }
      catch(e){ console.warn('Skipped a project in Pipeline render due to bad data:', p, e); return ''; }
    }).join(''):'<div class="empty" style="padding:12px">No projects</div>')+'</div></div>';
  }).join('');
}

