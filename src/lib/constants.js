import { state } from './state.js';
import { TODAY } from './config.js';

/* ══ CONSTANTS ══ */
export { TODAY };

export const ROLES = {
  admin:      {label:'Admin',        color:'role-admin',      emoji:'👑', can:{addProject:true, editProject:true, deleteProject:true, updateProgress:true, addDPR:true, manageTeam:true, viewFinance:true, viewAll:true, editPermissions:true, editFinance:true, viewDPR:true, viewGantt:true, manageDispatch:true, addLot:true, addFinanceRow:true, addRequest:true, addMilestone:true}},
  manager:    {label:'Ops Manager',  color:'role-manager',    emoji:'📋', can:{addProject:true, editProject:true, deleteProject:false,updateProgress:true, addDPR:true, manageTeam:false,viewFinance:true, viewAll:true, editPermissions:false,editFinance:true, viewDPR:true, viewGantt:true, manageDispatch:true, addLot:false, addFinanceRow:false, addRequest:true, addMilestone:true}},
  supervisor: {label:'Supervisor',   color:'role-supervisor', emoji:'🏗', can:{addProject:false,editProject:false,deleteProject:false,updateProgress:false, addDPR:true, manageTeam:false,viewFinance:false,viewAll:false, editPermissions:false,editFinance:false,viewDPR:true, viewGantt:true, manageDispatch:false, addLot:false, addFinanceRow:false, addRequest:false, addMilestone:false}},
  finance:    {label:'Finance',      color:'role-viewer',     emoji:'💰', can:{addProject:false,editProject:false,deleteProject:false,updateProgress:false,addDPR:false,manageTeam:false,viewFinance:true, viewAll:true, editPermissions:false,editFinance:true, viewDPR:true, viewGantt:true, manageDispatch:false, addLot:false, addFinanceRow:true, addRequest:false, addMilestone:false}},
  viewer:     {label:'Sales/Viewer', color:'role-viewer',     emoji:'👁', can:{addProject:true, editProject:false,deleteProject:false,updateProgress:false,addDPR:false,manageTeam:false,viewFinance:false,viewAll:false, editPermissions:false,editFinance:false,viewDPR:false,viewGantt:true, manageDispatch:false, addLot:false, addFinanceRow:false, addRequest:true, addMilestone:false}},
  dispatch_head: {label:'Dispatch Head', color:'role-manager', emoji:'📦', can:{addProject:false,editProject:false,deleteProject:false,updateProgress:false,addDPR:false,manageTeam:false,viewFinance:false,viewAll:true, editPermissions:false,editFinance:false,viewDPR:false,viewGantt:true, manageDispatch:true, addLot:true, addFinanceRow:false, addRequest:false, addMilestone:false}}
};

// Reusable checklist templates for site supervisors — pick one to pre-fill a project's checklist fast.
export const CHECKLIST_TEMPLATES = {
  'Pre-installation site check': ['Site access confirmed','Power/electricity available','Material storage space identified','Safety gear available','Client point of contact confirmed'],
  'Installation day checklist': ['Manpower reported on site','Tools & material verified against dispatch','Photos of before-state taken','Work area cordoned/safe','Daily DPR submitted'],
  'Handover checklist': ['Final measurement/JMR done','Client walkthrough completed','Photos of completed work taken','Punch list items resolved','Client sign-off obtained']
};

// Structured checklists — one registry drives Pre-Mockup, Mockup, Pre-Main Order Survey,
// and Handover. All filled by Supervisor via the DPR tab, shown as dropdowns in both
// All Projects and DPR. Once a checklist has any data on a project, it stays visible
// forever, regardless of what stage/order-type the project later moves to.
export const PREMOCKUP_CHECKLIST_GROUPS = [
  { key:'A', title:'Checklist A — Design Approval', items:['Design approval','WPC','Frame','Frame & Accessory design Approval'] },
  { key:'B', title:'Checklist B — Size Approvals', items:['Size Approvals','Sample size','Site size survey','Phase Definitions','Frames'] },
  { key:'C', title:'Checklist C — Documentation Approval - Client', items:['Documentation Approval - Client','CAD drawing','Project Site Location','Safety Clauses','Terms & Conditions','Quality Compliances','FOR terms, facilities'] },
  { key:'D', title:'Checklist D — Documentation Approval - Management', items:['Documentation Approval - Management','Work Order & contracts','Budgeting & finance','Design approval & sales','Size survey sheet'] },
  { key:'E', title:'Checklist E — Vendor Management', items:['Vendor Management','Vendor Approval','Rate Negotiations','Agreement / Contract / T&C','PO','Method statement','Timeline sheet','Manpower allocation, supervisor alloted','Material allocation','Tools and accessories allocation'] }
];
export const MOCKUP_CHECKLIST_GROUPS = [
  { key:'1', title:'1. Pre-Work Preparation', items:['Confirm sample location is cleaned and accessible','Verify all required materials are available (Frame components, WPC panels, Fasteners/anchors/adhesives, Alignment tools)','Check tools and equipment are in good working condition','Review installation drawings or sample design with team','Ensure safety PPE is worn (helmets, gloves, eye protection)'] },
  { key:'2', title:'2. Frame Installation at Sample Space', items:['Mark installation points and reference lines','Verify wall/floor/structure readiness (flatness, load capacity)','Install the frame according to the specified layout','Tighten all fasteners to required torque','Confirm the frame is stable and secure','Check vertical and horizontal levels before proceeding','Document any site deviations or issues'] },
  { key:'3', title:'3. WPC Assembling', items:['Confirm correct WPC profiles and colors before installation','Cut and prepare panels as per measurements','Begin assembling WPC panels on installed frame','Ensure clips, screws, or fasteners are properly installed','Maintain required expansion gaps (if applicable)','Check joint consistency and seamless alignment','Clean panels periodically during installation to avoid scratches'] },
  { key:'4', title:'4. Alignment & Structural Check', items:['Use laser level or spirit level to confirm straightness','Check vertical plumb of panels','Verify even spacing between WPC boards','Inspect joints for uniformity and tightness','Ensure no bending, warping, or misalignment','Re-adjust as needed before final fixing'] },
  { key:'5', title:'5. Quality Control Measures', items:['Review installation against design specifications','Inspect surface finish for defects (scratches, dents, color variations)','Check fastener visibility and ensure they meet aesthetic requirements','Confirm structural integrity of the entire assembly','Ensure edges and corners are properly finished','Clean the completed sample area','Record QC findings and corrective actions taken'] },
  { key:'6', title:'6. Photographic Documentation', items:['Capture before-installation site condition','Take step-by-step installation photos (Frame installation, WPC assembly progress, Alignment checks)','Take final completed sample photos','Photograph close-ups of joints, corners, and finishing','Store photos in project folder with date and description'] },
  { key:'7', title:'7. Client Review & Feedback at Sample Location', items:['Walk the client through the installed sample','Explain materials, installation technique, and durability','Show alignment and QC points','Present photographic documentation if needed','Ask for client comments and note areas of concern','Record client feedback (written form or verbal transcript)','Discuss next steps or modifications if required','Obtain client acknowledgment or approval for the sample'] },
  { key:'8', title:'8. Post-Completion Wrap-Up', items:['Update internal records with QC report and client feedback','Notify project manager of completion and approval status','Store all measurements and notes for final installation phase','Clean and demobilize tools/materials from sample location'] }
];
export const PREMAINSURVEY_CHECKLIST_GROUPS = [
  { key:'1', title:'1. Permits, Approvals & Documentation', items:['Building permits obtained and posted','Site-specific safety plan completed and communicated','Emergency response plan posted','Contracts, scope, and drawings accessible on site','Insurance and bonding in place','Subcontractor documentation received (licenses, safety training records, insurance)'] },
  { key:'2', title:'2. Utilities & Temporary Facilities', items:['Temporary power installed and tested','Temporary water available','Temporary sanitation (portable toilets) installed and serviced','Site office/trailer set up and equipped','Storage containers placed and locked','Material laydown areas assigned','Waste and recycling bins placed'] },
  { key:'3', title:'3. Safety & Environmental Controls', items:['First aid kits stocked','Fire extinguishers placed and inspected','Emergency exits and evacuation maps posted','Safety signage installed (PPE, restricted areas, hazards)','Fall protection systems ready (guardrails, anchors, nets)'] },
  { key:'4', title:'4. Equipment & Tools', items:['Heavy equipment delivered, inspected, and logged','Daily inspection checklists prepared','Operator certifications verified','Tools calibrated and safe to use','Fueling station area designated','Equipment parking plan established'] },
  { key:'5', title:'5. Materials Management', items:['Critical-path materials delivered or scheduled','Material storage areas labeled','Hazardous materials stored per regulations','Inventory log established','Theft-prevention plan in place'] },
  { key:'6', title:'6. Workforce Readiness', items:['Worker orientations completed','PPE available and distributed (helmets, vests, boots, eye protection)','Site rules reviewed with all personnel','Subcontractor schedules confirmed','Supervisors and foremen onsite'] },
  { key:'7', title:'7. Plans, Drawings & Layout', items:['Latest drawings and revisions onsite','Staking and survey completed','Control points verified','Shop drawings and submittals approved and distributed'] },
  { key:'8', title:'8. Communication & Meetings', items:['Kickoff meeting completed','Daily briefing plan established (toolbox talks)','Emergency contacts posted','Communication chain of command clarified','Incident reporting procedure in place'] },
  { key:'9', title:'9. Final Pre-Start Verification', items:['All hazards identified and mitigated','Weather forecast checked and contingencies prepared','Work areas clean and organized','Pre-start walkthrough completed by supervisor','Authorization to begin work issued'] }
];
export const HANDOVER_CHECKLIST_GROUPS = [
  { key:'1', title:'Handover', items:['Final measurement/JMR done','Client walkthrough completed','Photos of completed work taken','Punch list items resolved','Client sign-off obtained'] }
];
// General Work Policy Checklist - triggered by a milestone (Kickoff induction meeting)
// being marked done, not by project stage. Mandatory for Supervisor. On completion,
// automatically advances the next milestone ("Send Kick off Meeting report to the admin").
export const GENERAL_WORK_POLICY_GROUPS = [
  { key:'1', title:'1. Site Access & Attendance', items:['All workers have valid site entry passes/ID cards','Attendance recorded daily','Visitors signed in and accompanied by authorized personnel','Unauthorized access strictly restricted'] },
  { key:'2', title:'2. Personal Protective Equipment (PPE)', items:['Hard hats worn at all times','Safety shoes/steel-toe boots mandatory','High-visibility vests worn in operational zones','Gloves, goggles, ear protection used as required','Respiratory protection provided where needed','PPE condition checked regularly'] },
  { key:'3', title:'3. Conduct & Behavior', items:['No alcohol or drugs on site','No smoking outside designated zones','Workers maintain professional behavior and teamwork','No horseplay or unsafe practices','Respect for site rules, supervisors, and co-workers'] },
  { key:'4', title:'4. Safety Procedures', items:['All workers have completed site safety induction','Toolbox talks conducted daily/weekly','Work is carried out as per method statements/JHA','Lockout/Tagout procedures followed for electrical/mechanical work','Proper use of tools and equipment; no makeshift arrangements','Emergency evacuation routes known to all workers'] },
  { key:'5', title:'5. Work Permits & Compliance', items:['All high-risk activities covered with valid work permits (hot work, height work, confined space, lifting, etc.)','Permits displayed at work area','Supervisors verify compliance before starting work','Relevant project standards or codes followed'] },
  { key:'6', title:'6. Housekeeping & Cleanliness', items:['Work areas kept clean and free of debris','Waste disposed of in designated bins','Materials stored neatly and safely','Cables and hoses properly routed to avoid trip hazards','Tools returned to designated storage after use'] },
  { key:'7', title:'7. Equipment & Machinery Use', items:['Operators licensed and authorized','Pre-start checks completed for machines','Equipment maintained regularly','Safety guards and emergency stops functional','No overloading of lifting equipment','Machinery used only for intended purpose'] },
  { key:'8', title:'8. Working at Height', items:['Guardrails/scaffolds installed and inspected','Full-body harness used with secure anchorage points','Ladders inspected and used correctly','No climbing on unstable structures','Fall protection plan understood by the team'] },
  { key:'9', title:'9. Material Handling & Storage', items:['Materials stacked safely and not blocking pathways','Heavy materials lifted using proper technique or lifting equipment','Hazardous materials stored in labelled, secure areas','MSDS sheets available for chemicals','Fuel storage compliant with fire regulations'] },
  { key:'10', title:'10. Emergency Preparedness', items:['First aid kits available and stocked','Trained first aiders identified on site','Fire extinguishers placed at accessible locations','Emergency contact numbers displayed','Workers aware of muster points and evacuation plans'] },
  { key:'11', title:'11. Communication & Reporting', items:['Daily briefings conducted by supervisors','Workers encouraged to report hazards or near-misses','Incident/accident reporting procedure followed','Communication tools available (radios, phones)','Language barriers addressed through translators or signage'] },
  { key:'12', title:'12. Documentation & Approvals', items:['Work orders and drawings available','Daily progress reports maintained','Safety inspection logs updated','Required approvals obtained before work starts'] },
  { key:'13', title:'13. End-of-Day Procedures', items:['Work area cleaned and materials secured','Tools returned and accounted for','Equipment switched off and locked','Hazardous areas barricaded','Daily attendance and reports submitted'] }
];
// The registry — add a new checklist type here and everything else (DPR form, dropdowns,
// completion notification, badge, email) picks it up automatically.
// Stable milestone keys — assigned once, at creation time, for any milestone that another
// feature needs to reliably detect later (e.g. a checklist trigger). Matching on this key
// instead of the label text means the trigger keeps working even if the label is ever
// edited or reworded down the line.
export const MILESTONE_KEY_MAP={
  'Kickoff induction meeting with client':'kickoff-meeting',
  'Send Kick off Meeting report to the admin':'send-kickoff-report',
  'Payment received from customer and project closed':'payment-received-closed'
};
export function milestoneKeyFor(label){ return MILESTONE_KEY_MAP[label]||null; }
// POLICY: every checklist below is "soft" — visible, editable anytime, tracked, and it
// notifies Admin/Sales on completion, but it never blocks a Supervisor from saving a DPR
// or a milestone from moving forward on its own. The ONE deliberate exception is the
// Handover checklist, which genuinely gates marking a project "Completed" (see saveUpdate).
// Keep it this way — don't add hard blocks to new checklist types without a very good
// reason, since it's easy for a half-finished checklist to trap a Supervisor's whole DPR.
export const CHECKLIST_DEFS=[
  { key:'premockup', label:'Pre-Mockup Checklist', dataField:'premockupChecklist', completedField:'premockupChecklistCompletedAt', reviewedField:'premockupChecklistReviewed', groups:PREMOCKUP_CHECKLIST_GROUPS,
    matches:p=>p.orderType==='pre-mockup'||p.sourceRequestType==='Pre-Mockup' },
  { key:'mockup', label:'Mockup Checklist', dataField:'mockupChecklist', completedField:'mockupChecklistCompletedAt', reviewedField:'mockupChecklistReviewed', groups:MOCKUP_CHECKLIST_GROUPS,
    matches:p=>p.orderType==='mockup'||p.sourceRequestType==='Mockup' },
  { key:'premainsurvey', label:'Site Readiness Checklist', dataField:'preMainSurveyChecklist', completedField:'preMainSurveyChecklistCompletedAt', reviewedField:'preMainSurveyChecklistReviewed', groups:PREMAINSURVEY_CHECKLIST_GROUPS,
    matches:p=>p.orderType==='pre-main'||p.sourceRequestType==='Pre-Main Order Survey' },
  { key:'handover', label:'Handover Checklist', dataField:'handoverChecklist', completedField:'handoverChecklistCompletedAt', reviewedField:'handoverChecklistReviewed', groups:HANDOVER_CHECKLIST_GROUPS,
    // Triggered by the Main Order milestone "Payment received from customer and project
    // closed" being marked done — not on every project anymore. Still the one checklist
    // that hard-blocks marking a project Completed (see saveUpdate).
    matches:p=>(p.milestones||[]).some(m=>m.key==='payment-received-closed'&&m.actual) },
  { key:'workpolicy', label:'General Work Policy Checklist', dataField:'workPolicyChecklist', completedField:'workPolicyChecklistCompletedAt', reviewedField:'workPolicyChecklistReviewed', groups:GENERAL_WORK_POLICY_GROUPS,
    mandatory:false, advancesMilestoneKey:'send-kickoff-report', advancesMilestoneLabel:'Send Kick off Meeting report to the admin',
    // Triggered by a MILESTONE being done, not by project stage — matches on the milestone's
    // stable key (assigned at creation), not its label text, so a future label edit can't
    // silently break this trigger.
    matches:p=>(p.milestones||[]).some(m=>m.key==='kickoff-meeting'&&m.actual) }
];
// "Once added, don't remove" — a checklist stays available for filling once it's either
// currently relevant to the project's stage, OR already has data on it (so switching order
// type later never hides it).
export function isChecklistActive(def,p){ return p&&(def.matches(p)||p[def.dataField]!=null); }
export function blankChecklistData(def){
  const out={};
  def.groups.forEach(g=>{ out[g.key]=g.items.map(text=>({text,done:false})); });
  return out;
}
export function checklistTotalItems(def){ return def.groups.reduce((a,g)=>a+g.items.length,0); }
export function checklistDoneItems(def,data){ if(!data) return 0; return Object.values(data).reduce((a,items)=>a+(items||[]).filter(i=>i.done).length,0); }

export const PERM_LABELS = {
  addProject:'Add new projects', editProject:'Edit project details', deleteProject:'Delete projects',
  updateProgress:'Update progress & milestones', addDPR:'Submit DPR', viewDPR:'View DPR log',
  viewGantt:'View Gantt chart', manageTeam:'Manage team members',
  viewFinance:'View finance data', editFinance:'Edit finance data',
  viewAll:'View all projects', editPermissions:'Edit role permissions',
  manageDispatch:'Manage material dispatch'
};

export const MS_MOCKUP = [
  'Sizes confirmed from client','CNC Preview Approval from client',
  'CNC Preview comes from plant team','CNC Production completed',
  'CNC Quality Check','Preview approval','Vendor Selection',
  'Grill Movement','Material Movement & allotment of manpower',
  'Grill installation','Completion Intimation to client',
  'Customer Feedback','Payout to Vendor'
];
export const MS_MAIN = [
  'Site Visit for Actual Measurement','Preview approval',
  'CNC Preview comes from plant team','CNC Quality Check',
  'Sending Work Order','Releasing Advance Payment',
  'Material Movement and Manpower Mobilization','CNC Production completed',
  'Payment from customer','Work Completion - 25%',
  'Payment from customer','Work Completion - 50%',
  'Payment from customer','Work Completion - 75%',
  'Payment from customer','Work Completion - 100%'
];
export const MS_SAMPLING = [
  'Approval from finance team','Manpower planning',
  'Sample installed','Approval on sample'
];
// Pre-Mockup specific milestone template — used when a project is converted from a
// Pre-Mockup request. Same Planned/Actual/Gap format as every other milestone, and shows
// up in Gantt and Dashboard exactly like any other project's milestones already do.
export const MS_PREMOCKUP = [
  'Sample size and location verified',
  'Align manpower by the supervisor at the site',
  'Approval from Finance',
  'Send Work Order (WO) to the vendor'
];
// Mockup milestone workflow — mirrors the same sequence as when a new Mockup request comes
// in from Sales: sample arrives, supervisor revisits, vendor installs, supervisor checks
// against the checklist, reports up to Admin, and Admin loops in Sales + Finance.
export const MS_MOCKUP_STEPS = [
  'Sample reached at site',
  'Revisit by Supervisor at site',
  'Vendor Installed Mockup Sample',
  'Supervisor cross-check it with checklist',
  'Report sent to Admin',
  'Admin review it and send that report to sales team and finance team'
];
// Post-Mockup milestone workflow — client approval, sales follow-up, then confirmation
// of the main order.
export const MS_POSTMOCKUP_STEPS = [
  'Mockup Approved by Client Management',
  'Sales team follow-up and discuss about Mockup Report with Client',
  'Main Order Confirmed'
];
// Pre-Main Order Survey milestone workflow — site survey through dispatch.
export const MS_PREMAINSURVEY_STEPS = [
  'Size survey by supervisor',
  'Kickoff induction meeting with client',
  'Send Kick off Meeting report to the admin',
  'Visit at site and fill survey report according to checklist by supervisor',
  'Send report to admin',
  'Admin send this report to sales team',
  'Sales team send design to the plant for Preview',
  'Sales Team get approval on Preview from client',
  'Production Done',
  'Quality check by Quality head',
  'Dispatch Done'
];
// Main Order milestone workflow — from work order through project closure.
export const MS_MAINORDER_STEPS = [
  'Work Order sent to vendor',
  'Advance payment released to vendor',
  'Manpower mobilized',
  'Framing material mobilized',
  'Induction checklist reviewed by Supervisor',
  'Timeline & manpower deployment plan submitted by Project Manager and Admin',
  'Project initiated',
  'Framing work started',
  'Framing work completed',
  'Grille installation initiated',
  'Supervisor submits WPC & JMR',
  'RA bill raised by Finance',
  '25% Grille installed',
  '50% Grille installed',
  '75% Grille installed',
  '100% Grille installed',
  'Final WCC',
  'Final RA bill generated',
  'Payment received from customer and project closed'
];

/* ══ REQUESTS MODULE (Pre-PO / Post-PO intake, per sales workflow doc) ══ */
// WhatsApp numbers for the two people who get notified on every new/updated request.
// Replace with real numbers in international format, no + or spaces, e.g. 919876543210
export const NEELAM_WA = '91XXXXXXXXXX';
export const SHASHANK_WA = '91XXXXXXXXXX';
// Admin email — every "notify admin" button opens a pre-filled Gmail compose window to this address.
// No API key needed: it just opens Gmail in a new tab, ready for you to hit Send.
export const ADMIN_EMAIL = 'admin@example.com'; // fallback only — used if no admin has an email set in Team
// Always prefer the real admin's email from the Team module over the placeholder above.
export function getAdminEmail(){
  const adminMember=state.teamMembers.find(m=>m.role==='admin'&&m.email);
  return adminMember?adminMember.email:ADMIN_EMAIL;
}

export function gmailComposeLink(to, subject, body){
  return 'https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to)+'&su='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}
export function notifyByGmail(to, subject, body){
  window.open(gmailComposeLink(to, subject, body), '_blank');
}
// Per the doc: JMR photo/report upload notifies Finance, Admin, and Site Incharge together (via cc).
export function notifyJMRUpload(p, urls){
  const financeMember=state.teamMembers.find(m=>m.role==='finance');
  const supervisor=p.supervisor||'';
  const cc=[getAdminEmail(), financeMember&&financeMember.wa?financeMember.wa:''].filter(Boolean).join(',');
  const subject='JMR report uploaded — '+p.name+' '+p.tower;
  const body='JMR report/photos uploaded for '+p.name+' — '+p.tower+'.\nSite incharge: '+supervisor+'\nJMR qty: '+(p.jmrQty||0)+'\n\nFiles:\n'+urls.join('\n');
  window.open(gmailComposeLink(getAdminEmail(), subject, body)+'&cc='+encodeURIComponent(cc),'_blank');
}

export const INDIA_STATES=['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Chandigarh','Puducherry'];
export const PREPO_FIELDS = [
  {key:'salesName',label:'Sales team name',required:true},
  {key:'salesEmail',label:'Sales team email',required:true},
  {key:'developerName',label:'Developer name',required:true},
  {key:'contactPerson',label:'Client representative name',required:true},
  {key:'mobile',label:'Client representative number',type:'phone',required:true},
  {key:'designation',label:'Designation',required:true},
  {key:'locationForVisit',label:'Location for visit',required:true},
  {key:'locality',label:'Locality',required:true}, {key:'city',label:'City',required:true},
  {key:'state',label:'State',type:'select',options:INDIA_STATES,required:true},
  {key:'projectNameKnown',label:'Project name (if known)'},
  {key:'projectType',label:'Type of project',type:'select',options:['Residential','Commercial','Resi-cum-Commercial'],required:true},
  {key:'objectiveOfVisit',label:'Objective of visit',required:true},
  {key:'remarks',label:'Remarks',required:true}
];
export const POSTPO_FIELDS = [
  {key:'salesName',label:'Sales team name',required:true},
  {key:'salesEmail',label:'Sales team email',required:true},
  {key:'crmSoNumber',label:'CRM / Sale order unique number',required:true},
  {key:'developerName',label:'Developer name',required:true},
  {key:'contactPerson',label:'Client representative name',required:true},
  {key:'mobile',label:'Client representative number',type:'phone',required:true},
  {key:'designation',label:'Designation',required:true},
  {key:'locationForVisit',label:'Location for visit',required:true},
  {key:'locality',label:'Locality',required:true}, {key:'city',label:'City',required:true},
  {key:'state',label:'State',type:'select',options:INDIA_STATES,required:true},
  {key:'totalQtySO',label:'Total qty as per Sales Order'},
  {key:'totalQtyPO',label:'Total qty as per PO',required:true,onlyFor:'main-order'},
  {key:'projectName',label:'Project name',required:true},
  {key:'projectType',label:'Type of project',type:'select',options:['Residential','Commercial','Resi-cum-Commercial'],required:true},
  {key:'closingDate',label:'Client-committed closing date (as per work order)',type:'date',required:true},
  {key:'framingMaterial',label:'Framing Material',type:'select',options:['GI','MS','Aluminum'],required:true,conditionalOn:'With frame'},
  {key:'sectionSize',label:'Section size',placeholder:'e.g. 24mmX24mmX5mm',required:true,conditionalOn:'With frame'},
  {key:'customerName',label:'Customer name',required:true},
  {key:'customerMobile',label:'Customer mobile',type:'phone',required:true},
  {key:'workOrderNumber',label:'Work order number',required:true},
  {key:'specialAttention',label:'Special point of attention for execution',required:true},
  {key:'remarks',label:'Remarks',required:true}
];
// Sampling / Main Order Size Survey — raised by Sales, the actual survey is carried out
// by the site supervisor (reuses the same Visit Report card, just relabeled contextually).
// The Request Type dropdown offers 7 specific stages, but they route to one of 3
// underlying field sets/workflows: "visit" (lighter, pre-order estimation - reuses the
// Pre-PO style fields), "order" (full order-level fields, matches old Post-PO), and
// "survey" (Sampling Survey, with its own PO-upload logic).
export const REQUEST_TYPE_LABELS={
  'pre-mockup':'Pre-Mockup', 'mockup':'Mockup', 'post-mockup':'Post-Mockup',
  'pre-main-survey':'Pre-Main Order Survey', 'sampling-survey':'Sampling Survey',
  'main-order':'Main Order', 'post-main-order':'Post-Main Order'
};
export function reqFieldGroup(type){
  if(type==='sampling-survey') return 'survey';
  if(['mockup','post-mockup','main-order','post-main-order'].includes(type)) return 'order';
  return 'visit'; // pre-mockup, pre-main-survey
}
export function reqTypeLabel(type){ return REQUEST_TYPE_LABELS[type]||type||'—'; }
export const SURVEY_FIELDS = [
  {key:'salesName',label:'Sales team name',required:true},
  {key:'salesEmail',label:'Sales team email',required:true},
  {key:'developerName',label:'Developer name',required:true},
  {key:'contactPerson',label:'Client representative name',required:true},
  {key:'mobile',label:'Client representative number',type:'phone',required:true},
  {key:'locationForVisit',label:'Location for visit',required:true},
  {key:'locality',label:'Locality',required:true}, {key:'city',label:'City',required:true},
  {key:'state',label:'State',type:'select',options:INDIA_STATES,required:true},
  {key:'projectNameKnown',label:'Project name',required:true},
  {key:'remarks',label:'Remarks',required:true}
];
export const VISIT_FIELDS = [
  {key:'visitRemarks',label:'Visit remarks / outcome',required:true},
  {key:'measurementArea',label:'Measurement — area',type:'number',required:true},
  {key:'installationType',label:'Installation type',type:'select',options:['With frame','Without frame']},
  {key:'sectionSize',label:'Section size',placeholder:'e.g. 24mmX24mmX5mm'},
  {key:'framingMaterial',label:'Framing material',type:'select',options:['GI','MS','Aluminum']},
  {key:'grillSizeThickness',label:'Grill size & thickness'},
  {key:'qty',label:'Quantity',type:'number'},
  {key:'roughDrawingNotes',label:'Rough drawing notes/link'},
  {key:'siteReadinessStatus',label:'Site readiness status'},
  {key:'potentialHindrance',label:'Potential risk / hindrance observed'}
];
export const POSTPO_DOC_CATEGORIES=[
  {id:'req-docs-wopopi', label:'WO / PO / PI documents', folder:'requests-wopopi'},
  {id:'req-docs-boqcad', label:'BOQ / CAD / Shop drawing documents', folder:'requests-boqcad'},
  {id:'req-docs-approvals', label:'Approvals / Approved drawing documents', folder:'requests-approvals'}
];

/* ══ FINANCE LEDGER MODULE ══ */
// Editable fields only — contractValue, retention, paymentPending (due payment), unbilledAmt,
// dueBilling and workStatus are all auto-computed (see recalcFinanceComputed) and shown read-only.
// "Contractor" is now a dropdown of registered vendors, handled separately from this list.
export const FINANCE_FIELDS = [
  {key:'product',label:'Product'}, {key:'description',label:'Description'}, {key:'location',label:'Location'},
  {key:'boqQty',label:'BOQ qty',type:'number'},
  {key:'woQty',label:'WO qty',type:'number'}, {key:'woRate',label:'WO rate',type:'number'},
  {key:'paymentGiven',label:'Amount released to vendor',type:'number'},
  {key:'raBillStatus',label:'RA bill status',type:'select',options:['Not raised','Raised','Partially paid','Paid']},
  {key:'raBillDueDate',label:'RA bill due date',type:'date'}, {key:'raBillDueAmount',label:'RA bill due amount',type:'number'},
  {key:'raBillBalance',label:'RA bill balance',type:'number'}, {key:'billedQty',label:'Billed qty',type:'number'},
  {key:'billedAmt',label:'Billed amount',type:'number'}, {key:'unbilledQty',label:'Unbilled qty',type:'number'},
  {key:'installationRate',label:'Installation rate',type:'number'},
  {key:'installationAmountPending',label:'Installation amount pending (notes)'}
];

/* ══ VENDOR REGISTRATION / LOGIN MODULE (uses Supabase Auth — real hashed passwords, not the plain PIN system) ══ */
export const VENDOR_FIELDS = [
  {key:'companyName',label:'Company / Organization name',required:true}, {key:'tradeName',label:'Trade name of business',required:true},
  {key:'constitution',label:'Constitution of business',required:true}, {key:'vendorType',label:'Type of vendor',required:true},
  {key:'phone',label:'Phone',required:true,type:'phone'}, {key:'gstin',label:'GSTIN no.',required:true,type:'uppercase'}, {key:'registeredAddress',label:'Registered office address',required:true},
  {key:'panNumber',label:'PAN number',required:true}, {key:'panName',label:'Name on PAN card',required:true},
  {key:'lastYearTurnover',label:'Last year turnover of business',required:true}, {key:'mainItems',label:'List of main items you deal in',required:true},
  {key:'creditTerm',label:'Credit term period',required:true},
  {key:'bankName',label:'Name of bank',required:true}, {key:'accountNo',label:'Account no.',required:true,type:'numeric'}, {key:'ifscCode',label:'IFSC code',required:true},
  {key:'scopeOfWork',label:'Scope of work / expertise',required:false}
];
// KYC documents — each is its own real file upload, not a shared text field.
export const VENDOR_KYC_DOCS = [
  {key:'msmeDocUrl', label:'MSME Certificate'},
  {key:'gstDocUrl', label:'GST Certificate'},
  {key:'panDocUrl', label:'PAN Card'},
  {key:'tanDocUrl', label:'TAN Certificate'},
  {key:'chequeDocUrl', label:'Cancelled Cheque'}
];
