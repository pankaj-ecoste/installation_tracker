/* ══ VISIT PLANNER — pure rules (plan.md v2-64) ══
   No DOM, no database: every function takes the data it needs. The same rules are enforced again in the database
   (migration 0029) — this copy only gives the user a friendly message before the save is attempted.
   Dates are plain local "YYYY-MM-DD" strings built from date PARTS, never toISOString() (shifts a day in IST). */
import { TODAY } from './config.js';
import { addDays, mondayOf, weekDays } from './installationScoring.js';

export const VISIT_REASONS=['New site visit','Execution of work','Rectification of work','Final WCC','Sample approval','Measurement / JMR','Client meeting','Other'];
export const VISIT_STATUSES=['Planned','Done','Missed','Rescheduled'];
export const MAX_VISITS_PER_DAY=4;
// "Site" choices for a day with no site visit — stored as kind off/leave/office, not counted as visits.
export const NO_VISIT_OPTIONS=[{kind:'off',label:'Weekly Off'},{kind:'leave',label:'Leave'},{kind:'office',label:'Office / Other'}];
export const NO_VISIT_KINDS=NO_VISIT_OPTIONS.map(o=>o.kind);
// Projects with these statuses are not offered in the Site dropdown (plan.md v2-64: active projects only).
export const SITE_HIDDEN_STATUSES=['Completed','On Hold'];

const pad=n=>String(n).padStart(2,'0');
export const todayYmd=()=>TODAY.getFullYear()+'-'+pad(TODAY.getMonth()+1)+'-'+pad(TODAY.getDate());
const partsOf=ymd=>{ const [y,m,d]=ymd.split('-').map(Number); return new Date(y,m-1,d); };
const DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTH_SHORT=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const dayName=ymd=>DAY_NAMES[partsOf(ymd).getDay()];
export const ddmmyy=ymd=>{ const [y,m,d]=ymd.split('-'); return d+'/'+m+'/'+y.slice(2); };
export const longDate=ymd=>{ const d=partsOf(ymd); return d.getDate()+' '+MONTH_SHORT[d.getMonth()]+' '+d.getFullYear(); };
export const weekRangeLabel=monday=>longDate(monday)+' – '+longDate(addDays(monday,6));
export { addDays, mondayOf, weekDays };

export const isRealVisit=v=>!NO_VISIT_KINDS.includes(v.kind);
export const visitSiteLabel=v=>{
  if(v.kind==='off') return 'Weekly Off';
  if(v.kind==='leave') return 'Leave';
  if(v.kind==='office') return 'Office / Other';
  return v.site||'';
};
export const visitReasonLabel=v=>v.reason==='Other'?('Other — '+(v.reason_other||'')):(v.reason||'');
// Unique id for a visit inside the plan's jsonb array (the status dropdown addresses a visit by it).
export const newVisitId=()=>'v'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);

// Which weeks a SUPERVISOR may plan: the current week always, next week only from Saturday (Sat/Sun). Past weeks never.
// Admin may plan any week (a date picker in the form) — see weekAllowedFor().
export function supervisorWeekChoices(today){
  const thisMonday=mondayOf(today);
  const weeks=[thisMonday];
  const dow=partsOf(today).getDay(); // 6 = Saturday, 0 = Sunday
  if(dow===6||dow===0) weeks.push(addDays(thisMonday,7));
  return weeks;
}
export function weekAllowedFor(isAdmin,weekMonday,today){
  if(isAdmin) return true;
  return supervisorWeekChoices(today).includes(weekMonday);
}
// A supervisor cannot plan a past day; admin can (plan.md v2-64).
export const dayAllowedFor=(isAdmin,ymd,today)=>isAdmin||ymd>=today;

// The 7-day skeleton a fresh form starts from: one empty row per day.
export function blankVisit(date){
  return {id:newVisitId(),date,kind:'project',project_id:null,site:'',reason:'',reason_other:'',status:'Planned',remark:''};
}
export const blankWeek=monday=>weekDays(monday).map(blankVisit);

// Returns '' when the plan is OK to save, otherwise the first problem in plain words.
export function validatePlan(plan,{isAdmin,today,cities,isNew}){
  if(!plan.supervisor_id) return 'Please select the employee.';
  if(!plan.base_city||!cities.includes(plan.base_city)) return 'Please pick the base city from the list.';
  if(!plan.week_start||mondayOf(plan.week_start)!==plan.week_start) return 'The week must start on a Monday.';
  if(isNew&&!weekAllowedFor(isAdmin,plan.week_start,today)) return plan.week_start<mondayOf(today)?'Past weeks can\'t be planned.':'Next week opens on Saturday.';
  const days=weekDays(plan.week_start);
  for(const day of days){
    const list=plan.visits.filter(v=>v.date===day);
    // Every day that can still be planned needs an entry; a supervisor's already-gone days are simply left out
    // (same rule as the database trigger in migration 0029).
    const required=isNew?(isAdmin||day>=today):day>=today;
    if(!list.length&&required) return dayName(day)+' ('+ddmmyy(day)+') has no entry — every day needs one.';
    if(list.length>MAX_VISITS_PER_DAY) return 'At most '+MAX_VISITS_PER_DAY+' visits can be planned on '+dayName(day)+'.';
    for(const v of list){
      if(isNew&&!dayAllowedFor(isAdmin,day,today)) return 'You can\'t plan a past day ('+dayName(day)+' '+ddmmyy(day)+').';
      if(isRealVisit(v)){
        if(!String(v.site||'').trim()) return dayName(day)+': please choose a site.';
        if(!v.reason) return dayName(day)+': please choose a reason.';
        if(v.reason==='Other'&&!String(v.reason_other||'').trim()) return dayName(day)+': please type the reason for "Other".';
      }
    }
  }
  return '';
}

// Summary-card numbers over a list of plans. "Visits planned" counts only real site visits (not Weekly Off / Leave /
// Office). "Not updated" = the day has passed and the visit is still Planned (plan.md v2-64).
export function visitStats(plans,today){
  let planned=0,done=0,missed=0,notUpdated=0;
  plans.forEach(p=>(p.visits||[]).filter(isRealVisit).forEach(v=>{
    planned++;
    if(v.status==='Done') done++;
    else if(v.status==='Missed') missed++;
    else if(v.status==='Planned'&&v.date<today) notUpdated++;
  }));
  return {planned,done,missed,notUpdated};
}
export const visitIsNotUpdated=(v,today)=>isRealVisit(v)&&v.status==='Planned'&&v.date<today;

// A visit's status can be changed to Done/Missed only on or after its date; Rescheduled and back to Planned any time.
export const statusAllowedOn=(status,visitDate,today)=>!(status==='Done'||status==='Missed')||visitDate<=today;

/* ── Email Plan recipients (plan.md v2-64) ──
   Plans of Shubham / Mahesh / Aditya -> To Aditya + Neelam; every other supervisor -> To Shashank + Neelam;
   Cc Shalini + Shashi (Shashi Rawat) always. People are looked up BY NAME in the Team tab so an email change there is picked up. */
const GROUP_A=['shubham','mahesh','aditya'];
// Alternate spellings tried in the Team tab, and the full name shown in the "missing" warning so it says exactly what to add.
const RECIPIENT_SPELLINGS={shashi:['shashi','sashi']};
const RECIPIENT_LABELS={neelam:'Neelam Rawat',aditya:'Aditya',shashank:'Shashank Soni',shalini:'Shalini Gupta',shashi:'Shashi Rawat'};
const wordsOf=s=>String(s||'').toLowerCase().split(/[^a-z]+/).filter(Boolean);
export function findTeamMember(key,members){
  return members.find(m=>m.active&&(String(m.username||'').toLowerCase()===key||wordsOf(m.name).includes(key)))||null;
}
export function planEmailRecipients(plan,members){
  const sup=members.find(m=>m.id===plan.supervisor_id);
  const supWords=[...wordsOf(plan.supervisor_name),...(sup?[String(sup.username||'').toLowerCase()]:[])];
  const groupA=GROUP_A.some(k=>supWords.includes(k));
  const toKeys=groupA?['aditya','neelam']:['shashank','neelam'];
  const ccKeys=['shalini','shashi'];
  const resolve=keys=>{
    const emails=[],missing=[];
    keys.forEach(k=>{
      // try every known spelling of the person (Sashi/Shashi was the original mismatch)
      const m=(RECIPIENT_SPELLINGS[k]||[k]).map(s=>findTeamMember(s,members)).find(Boolean);
      if(m&&String(m.email||'').trim()) emails.push(m.email.trim()); else missing.push(RECIPIENT_LABELS[k]||k);
    });
    return {emails:[...new Set(emails)],missing};
  };
  const to=resolve(toKeys), cc=resolve(ccKeys);
  return {to:to.emails,cc:cc.emails,missing:[...to.missing,...cc.missing]};
}
export function planEmailContent(plan){
  const subject='Visit plan — '+plan.supervisor_name+' — week of '+weekRangeLabel(plan.week_start);
  const lines=[
    'Visit plan — week of '+weekRangeLabel(plan.week_start),
    'Employee: '+plan.supervisor_name,
    'Location: '+plan.base_city,
    ''
  ];
  weekDays(plan.week_start).forEach(day=>{
    plan.visits.filter(v=>v.date===day).forEach((v,i)=>{
      const head=i===0?(dayName(day).slice(0,3)+' '+ddmmyy(day)):'              ';
      const newTag=v.kind==='new_site'?' [New site]':'';
      const reason=isRealVisit(v)?' — '+visitReasonLabel(v):'';
      lines.push(head+'  '+visitSiteLabel(v)+newTag+reason+'  ('+(v.status||'Planned')+')');
    });
  });
  lines.push('','Regards,','Ecoste Installation Tracker');
  return {subject,body:lines.join('\n')};
}
