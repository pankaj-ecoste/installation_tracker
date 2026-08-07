import { state } from '../../lib/state.js';
import { TODAY } from '../../lib/constants.js';
import { daysDiff, fmt, fmtDate, pct, visibleProjects } from '../../lib/helpers.js';

/* ══ DASHBOARD ══ */
export function renderDashboard(){
  const el=document.getElementById('dashboard-content'); if(!el) return;
  const sq=(document.getElementById('dashboard-search')?.value||'').toLowerCase();
  let vp=visibleProjects();
  if(sq) vp=vp.filter(p=>(p.name||'').toLowerCase().includes(sq)||(p.tower||'').toLowerCase().includes(sq)||(p.developer||'').toLowerCase().includes(sq));
  if(sq&&!vp.length){ el.innerHTML='<div class="empty">No projects match your search.</div>'; return; }
  const totalPlanned=vp.reduce((a,p)=>a+(p.plannedQty||0),0);
  const totalInstalled=vp.reduce((a,p)=>a+(p.installedQty||0),0);
  const totalJmr=vp.reduce((a,p)=>a+(p.jmrQty||0),0);
  const jmrBalance=Math.max(0,totalPlanned-totalJmr);
  const totalRaBillAmt=vp.reduce((a,p)=>a+(p.raBillAmt||0),0);
  const totalCollected=vp.reduce((a,p)=>a+(p.paymentCollected||0),0);
  const totalRaBillsGenerated=vp.reduce((a,p)=>a+((p.raBillHistory||[]).length),0);
  const constraintCounts={open:0,'in-progress':0,solved:0};
  vp.forEach(p=>p.constraints.forEach(c=>{ constraintCounts[c.status]=(constraintCounts[c.status]||0)+1; }));
  const totalWOGiven=state.financeLedger.reduce((a,f)=>a+(f.contractValue||0),0);
  const totalWOPaid=state.financeLedger.reduce((a,f)=>a+(f.paymentGiven||0),0);
  const totalWOLeft=Math.max(0,totalWOGiven-totalWOPaid);

  // Vendor productivity: per project/tower (not aggregated across a vendor's projects,
  // since planned-vs-achieved dates and run rates only make sense per project).
  const todayStr=TODAY.toISOString().slice(0,10);
  const vendorRows=vp.filter(p=>p.vendor&&p.vendor!=='—').map(p=>{
    const daysElapsed=p.startDate?Math.max(1,daysDiff(p.startDate,todayStr)):null;
    // Achieved run rate — how fast they've actually been going so far.
    const runRate=daysElapsed!==null?Math.round((p.installedQty||0)/daysElapsed):null;
    const daysRemaining=p.committedDate?daysDiff(todayStr,p.committedDate):null;
    // Required run rate — total planned qty (excluding Frame, since frame goes in as its
    // own separate pre-requisite step and isn't the pace being measured here) over the
    // working days from today to the planned/committed date.
    const framePlannedQty=(p.products||[]).filter(pr=>pr.name&&pr.name.toLowerCase().includes('frame')).reduce((a,pr)=>a+(parseInt(pr.qty)||0),0);
    const plannedQtyExcludingFrame=Math.max(0,(p.plannedQty||0)-framePlannedQty);
    // Always compute a real number — even once overdue, clamp to a minimum of 1 day so this
    // shows "what it'd take to catch up starting today" instead of just the word "Overdue".
    const requiredRunRate=(daysRemaining!==null)?Math.round(plannedQtyExcludingFrame/Math.max(1,daysRemaining)):null;
    const isOverdue=daysRemaining!==null&&daysRemaining<=0&&p.status!=='Completed';
    // Performance ratio: achieved run rate against required run rate — this is what drives
    // the Done/Delay/Early/On time status.
    const performanceRatio=(runRate!==null&&requiredRunRate!==null&&requiredRunRate>0)?runRate/requiredRunRate:null;
    let performanceStatus='—';
    if(p.status==='Completed') performanceStatus='✅ Done';
    else if(isOverdue) performanceStatus='🚨 Delay';
    else if(performanceRatio!==null){
      if(performanceRatio<0.95) performanceStatus='🔴 Delay';
      else if(performanceRatio>1.1) performanceStatus='🟢 Early';
      else performanceStatus='🟡 On time';
    }
    return {p, runRate, requiredRunRate, daysRemaining, isOverdue, performanceRatio, performanceStatus};
  });

  const metricCard=(label,val,sub,color)=>'<div class="metric" style="min-width:160px"><div class="metric-label">'+label+'</div><div class="metric-val" style="color:'+(color||'#1a1a1a')+'">'+val+'</div><div class="metric-sub">'+sub+'</div></div>';

  // Developer-wise aggregation — per project_monitoring dashboard requirements
  const devAgg={};
  vp.forEach(p=>{
    const devName=p.developer||'Unassigned';
    if(!devAgg[devName]) devAgg[devName]={projects:0,installed:0,planned:0,jmr:0,raBillAmt:0,collected:0,openConstraints:0,holdAmount:0};
    devAgg[devName].projects+=1;
    devAgg[devName].installed+=p.installedQty||0;
    devAgg[devName].planned+=p.plannedQty||0;
    devAgg[devName].jmr+=p.jmrQty||0;
    devAgg[devName].raBillAmt+=p.raBillAmt||0;
    devAgg[devName].collected+=p.paymentCollected||0;
    devAgg[devName].openConstraints+=p.constraintsOpen||0;
    // Hold amount = what's been billed to the client but not yet collected from them —
    // i.e. RA Bill Amount minus Amount Collected. This is computed automatically, not a
    // manually-typed figure (that was the bug — it was summing an unrelated free-text field).
    devAgg[devName].holdAmount+=Math.max(0,(p.raBillAmt||0)-(p.paymentCollected||0));
  });

  el.innerHTML=
    '<div class="metrics" style="margin-bottom:16px">'+
      metricCard('Project Progress Status', pct(totalInstalled,totalPlanned)+'%', fmt(totalInstalled)+' of '+fmt(totalPlanned)+' installed — across all projects')+
      metricCard('JMR status', fmt(totalJmr), fmt(jmrBalance)+' balance vs planned')+
      metricCard('RA bills generated', totalRaBillsGenerated, 'one per WCC upload + qty update')+
      metricCard('RA bill total (₹)', fmt(totalRaBillAmt), '₹'+fmt(totalCollected)+' collected', totalCollected<totalRaBillAmt?'#cc3333':'#1D9E75')+
      metricCard('Vendor WO value (₹)', fmt(totalWOGiven), '₹'+fmt(totalWOLeft)+' left to pay', totalWOLeft>0?'#f0a500':'#1D9E75')+
      metricCard('Constraints', constraintCounts.open+' open', constraintCounts['in-progress']+' in progress · '+constraintCounts.solved+' solved', constraintCounts.open>0?'#cc3333':'#1D9E75')+
    '</div>'+
    '<div class="section-hdr">🏗 Developer-wise breakdown</div>'+
    '<table class="team-table"><thead><tr><th>Developer</th><th>Projects</th><th>Installed / Planned</th><th>JMR</th><th>RA bill (₹)</th><th>Collected (₹)</th><th>Hold amount (₹)</th><th>Open constraints</th></tr></thead><tbody>'+
    Object.entries(devAgg).map(([dev,a])=>'<tr><td>'+dev+'</td><td>'+a.projects+'</td><td>'+fmt(a.installed)+' / '+fmt(a.planned)+' ('+pct(a.installed,a.planned)+'%)</td><td>'+fmt(a.jmr)+'</td><td>'+fmt(a.raBillAmt)+'</td><td>'+fmt(a.collected)+'</td><td>'+fmt(a.holdAmount)+'</td><td style="color:'+(a.openConstraints>0?'#cc3333':'#1D9E75')+'">'+a.openConstraints+'</td></tr>').join('')+
    '</tbody></table>'+
    '<div class="section-hdr" style="margin-top:16px">📋 Project-wise breakdown (Developer → Project → Tower/Block)</div>'+
    (()=>{
      // Group by project name so towers/blocks nest under their parent project, matching
      // the real hierarchy: Developer → Project → Sub-project (Tower/Block).
      const byProject={};
      vp.forEach(p=>{
        if(!byProject[p.name]) byProject[p.name]={developer:p.developer,towers:[]};
        byProject[p.name].towers.push(p);
      });
      // Frame installed to date, per project — tracked exactly like any other product line
      // in the DPR (Frame goes in first, Grille goes on top of it, both logged as their own
      // rows in "Today's installation by product"). Sums every day's "today installed" for
      // any product whose name matches "frame" across that project's whole DPR history.
      const frameInstalledToDate=p=>{
        const total=state.dprLog.filter(d=>d.projId===p.id).reduce((sum,d)=>{
          const frameRow=(d.products||[]).find(r=>r.product&&r.product.toLowerCase().includes('frame'));
          return sum+(frameRow?(frameRow.todayInstalled||0):0);
        },0);
        const framePlanned=(p.products||[]).find(pr=>pr.name&&pr.name.toLowerCase().includes('frame'));
        return framePlanned?fmt(total)+' / '+fmt(parseInt(framePlanned.qty)||0):(total>0?fmt(total):'—');
      };
      let rows='';
      Object.entries(byProject).forEach(([projName,grp])=>{
        const t={installed:0,planned:0,jmr:0,raBillAmt:0,collected:0,openConstraints:0,unbilled:0,released:0};
        grp.towers.forEach(p=>{
          const contractValue=state.financeLedger.filter(f=>f.projId===p.id).reduce((a,f)=>a+(f.contractValue||0),0);
          const released=state.financeLedger.filter(f=>f.projId===p.id).reduce((a,f)=>a+(f.paymentGiven||0),0);
          t.installed+=p.installedQty||0; t.planned+=p.plannedQty||0; t.jmr+=p.jmrQty||0; t.raBillAmt+=p.raBillAmt||0; t.collected+=p.paymentCollected||0; t.openConstraints+=p.constraintsOpen||0;
          t.unbilled+=Math.max(0,contractValue-released); t.released+=released;
        });
        rows+='<tr style="background:#f5f5f3;font-weight:700"><td>'+grp.developer+' — '+projName+'</td><td>'+fmt(t.installed)+' / '+fmt(t.planned)+' ('+pct(t.installed,t.planned)+'%)</td><td>'+fmt(t.jmr)+'</td><td>'+fmt(t.raBillAmt)+'</td><td>'+fmt(t.collected)+'</td><td>'+fmt(t.unbilled)+'</td><td>'+fmt(t.released)+'</td><td style="color:'+(t.openConstraints>0?'#cc3333':'#1D9E75')+'">'+t.openConstraints+'</td><td></td></tr>';
        grp.towers.forEach(p=>{
          const framing=frameInstalledToDate(p);
          const contractValue=state.financeLedger.filter(f=>f.projId===p.id).reduce((a,f)=>a+(f.contractValue||0),0);
          const released=state.financeLedger.filter(f=>f.projId===p.id).reduce((a,f)=>a+(f.paymentGiven||0),0);
          const unbilled=Math.max(0,contractValue-released);
          rows+='<tr><td style="padding-left:24px;color:#666">↳ '+p.tower+'</td><td>'+fmt(p.installedQty)+' / '+fmt(p.plannedQty)+' ('+pct(p.installedQty,p.plannedQty)+'%)</td><td>'+fmt(p.jmrQty)+'</td><td>'+fmt(p.raBillAmt)+'</td><td>'+fmt(p.paymentCollected)+'</td><td>'+fmt(unbilled)+'</td><td>'+fmt(released)+'</td><td style="color:'+(p.constraintsOpen>0?'#cc3333':'#1D9E75')+'">'+p.constraintsOpen+'</td><td>'+(framing?'<span class="badge bgr">'+framing+'</span>':'—')+'</td></tr>';
        });
      });
      return '<table class="team-table"><thead><tr><th>Developer / Project / Tower</th><th>Installed / Planned</th><th>JMR</th><th>RA bill (₹)</th><th>Collected (₹)</th><th>Unbilled Amount to Vendor (₹)</th><th>Released to vendor (₹)</th><th>Open constraints</th><th>Frame Installed</th></tr></thead><tbody>'+rows+'</tbody></table>';
    })()+
    '<div class="section-hdr" style="margin-top:16px">📈 Vendor productivity — planned vs. achieved, and run rate</div>'+
    '<div style="font-size:11px;color:#888;margin-bottom:8px">Required Performance Run Rate excludes Frame installed qty — it\'s calculated from the main product quantity only, since Frame goes in as its own separate step first.</div>'+
    '<table class="team-table"><thead><tr><th>Vendor</th><th>Project</th><th>Planned date</th><th>Installed / Planned qty</th><th>Performance Run Rate (units/day)</th><th>Required Performance Run Rate (units/day)*</th><th>Performance Status</th><th>Achieved date</th></tr></thead><tbody>'+
    vendorRows.map(({p,runRate,requiredRunRate,daysRemaining,isOverdue,performanceStatus})=>
      '<tr><td>'+p.vendor+'</td><td>'+p.name+' — '+p.tower+'</td>'+
      '<td>'+(p.committedDate?fmtDate(p.committedDate):'—')+(isOverdue?' <span style="color:#cc3333;font-weight:600">(overdue)</span>':'')+'</td>'+
      '<td>'+fmt(p.installedQty)+' / '+fmt(p.plannedQty)+' ('+pct(p.installedQty,p.plannedQty)+'%)</td>'+
      '<td>'+(runRate!==null?fmt(runRate)+'/day':'—')+'</td>'+
      '<td>'+(requiredRunRate!==null?fmt(requiredRunRate)+'/day':'—')+'</td>'+
      '<td style="font-weight:600">'+performanceStatus+'</td>'+
      '<td>'+(p.actualDate?fmtDate(p.actualDate):(p.status==='Completed'?'—':'In progress'))+'</td>'+
      '</tr>').join('')+
    '</tbody></table>'+
    '<div style="font-size:11px;color:#888;margin-top:6px">* Excludes Frame installed qty — calculated from the main product\'s planned quantity only.</div>';
}

