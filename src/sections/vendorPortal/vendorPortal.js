import { state } from '../../lib/state.js';
import { fillCls, pct } from '../../lib/helpers.js';

export function renderVendorPortal(){
  if(!state.currentVendor) return;
  const name=state.currentVendor.profile?(state.currentVendor.profile.trade_name||state.currentVendor.profile.company_name):state.currentVendor.user.email;
  document.getElementById('vp-welcome').textContent='Hello, '+name;
  // Match projects by vendor name text containment — simplified linking since projects don't yet store a vendor_profile id
  const matchName=(state.currentVendor.profile&&(state.currentVendor.profile.trade_name||state.currentVendor.profile.company_name)||'').toLowerCase();
  const myProjects=matchName?state.projects.filter(p=>(p.vendor||'').toLowerCase().includes(matchName)):[];
  document.getElementById('vendor-portal-body').innerHTML=
    '<div class="c-header"><h2>Vendor dashboard</h2><p>Projects currently assigned to your company</p></div>'+
    (myProjects.length?myProjects.map(p=>{
      const pInst=pct(p.installedQty,p.plannedQty);
      return '<div class="proj-card" style="cursor:default;margin-bottom:10px"><div class="proj-name">'+p.name+' — '+p.tower+'</div>'+
        '<div class="proj-sub">'+p.city+' · Status: '+p.status+'</div>'+
        '<div class="progress-wrap"><div class="progress-label"><span>Installed</span><span>'+pInst+'%</span></div><div class="progress-bar"><div class="progress-fill '+fillCls(pInst)+'" style="width:'+pInst+'%"></div></div></div></div>';
    }).join(''):'<div class="empty">No projects matched to your company name yet. Ask admin to make sure the project\'s vendor field matches your registered company/trade name.</div>');
}

