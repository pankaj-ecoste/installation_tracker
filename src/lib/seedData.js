/* ══ SEED DATA ══
   Used ONLY the very first time the app connects to an empty Supabase
   database — it gets inserted once, then the app always reads/writes
   Supabase after that. Safe to edit or delete these later from the UI. */
export const SEED_PROJECTS = [
  {id:1,accessCode:"AJMERA-BW",createdBy:"neelam",name:"Ajmera (Wadala Mumbai)",tower:"B-Wing",developer:"Ajmera",city:"Mumbai",state:"Maharastra",supervisor:"Shubham Salvi",vendor:"Bombay Aluminium Works",supervisorWA:"919876543210",status:"Completed",plannedQty:1850,installedQty:1850,raBillQty:1110,raBillAmt:438450,paymentCollected:400647,jmrQty:1850,constraintsOpen:0,raBillReady:true,startDate:"2025-12-22",committedDate:"2026-06-17",actualDate:"2026-06-17",driveLink:"",unit:"sqft",orderType:"main",vendors:[{name:"Bombay Aluminium Works",role:"Installation"}],products:[{name:"18mm Jali",qty:"1850"}],
  framingMaterial:"Aluminum",sectionSize:"24mmX24mmX5mm",
  constraints:[{text:"Crane access delayed on floor 12",status:"solved",date:"15 Apr 2026"}],
  milestones:[{label:"Site visit & measurement",planned:"2025-12-22",actual:"2025-12-26",gap:4},{label:"Work Completion - 25%",planned:"2026-04-20",actual:"2026-04-15",gap:-5},{label:"Work Completion - 50%",planned:"2026-04-30",actual:"2026-04-30",gap:0},{label:"Work Completion - 100%",planned:"2026-06-18",actual:"2026-06-18",gap:0}],
  comments:[{author:"Neelam",text:"Site cleared for final JMR. Balance ₹37,803 pending.",time:"17 Jun 2026"}]},

  {id:2,accessCode:"AJMERA-AW",createdBy:"shubham",name:"Ajmera (Wadala Mumbai)",tower:"A-Wing",developer:"Ajmera",city:"Mumbai",state:"Maharastra",supervisor:"Shubham Salvi",vendor:"Bombay Aluminium Works",supervisorWA:"919876543210",status:"Completed",plannedQty:1850,installedQty:1850,raBillQty:1850,raBillAmt:568800,paymentCollected:400647,jmrQty:1850,constraintsOpen:0,raBillReady:true,startDate:"2025-12-22",committedDate:"2026-06-17",actualDate:"2026-06-17",driveLink:"",unit:"sqft",orderType:"main",vendors:[{name:"Bombay Aluminium Works",role:"Installation"}],products:[{name:"18mm Jali",qty:"1850"}],
  framingMaterial:"Aluminum",sectionSize:"24mmX24mmX5mm",
  constraints:[],
  milestones:[{label:"Site visit",planned:"2025-12-22",actual:"2025-12-26",gap:4},{label:"Work Completion - 50%",planned:"2026-04-30",actual:"2026-05-10",gap:10},{label:"Work Completion - 100%",planned:"2026-06-17",actual:"2026-06-17",gap:0}],
  comments:[{author:"Shubham",text:"A-Wing handover complete. 30% payment outstanding.",time:"17 Jun 2026"}]},

  {id:3,accessCode:"ARUN-SETH",createdBy:"sales",name:"Arun Seth",tower:"Supply only",developer:"—",city:"Pune",state:"Maharastra",supervisor:"Shubham Salvi",vendor:"—",supervisorWA:"919876543210",status:"Not Started",plannedQty:500,installedQty:0,raBillQty:0,raBillAmt:0,paymentCollected:0,jmrQty:120,constraintsOpen:1,raBillReady:false,startDate:"2026-05-01",committedDate:"2026-08-30",actualDate:"",driveLink:"",unit:"sqft",orderType:"mockup",vendors:[],products:[{name:"24mm Grille",qty:"500"}],
  constraints:[{text:"Site readiness not confirmed",status:"open",date:"20 Jun 2026"},{text:"Measurement team not allocated",status:"in-progress",date:"22 Jun 2026"}],
  milestones:[{label:"Sizes confirmed from client",planned:"2026-05-10",actual:"",gap:null},{label:"Preview approval",planned:"2026-05-20",actual:"",gap:null}],
  comments:[]}
];

export const SEED_DPR = [
  {id:1,projId:1,project:"Ajmera (Wadala Mumbai) — B-Wing",date:"17 Jun 2026",supervisor:"Shubham Salvi",dayNo:178,daysLeft:0,committedMp:12,actualMp:12,installed:"Final 50 units",products:[{product:"18mm Jali",totalQty:1850,cumulativeTillYesterday:1800,todayInstalled:50,balanceQty:0,balancePct:0,location:"Floor 20"}],constraints:["None"],manpower:12,photos:3,next:"Handover walkthrough"},
  {id:2,projId:1,project:"Ajmera (Wadala Mumbai) — B-Wing",date:"16 Jun 2026",supervisor:"Shubham Salvi",dayNo:177,daysLeft:1,committedMp:14,actualMp:14,installed:"180 units floors 14-16",products:[{product:"18mm Jali",totalQty:1850,cumulativeTillYesterday:1620,todayInstalled:180,balanceQty:50,balancePct:3,location:"Floors 14-16"}],constraints:["Crane slot delayed 2 hrs"],manpower:14,photos:5,next:"Final 50 units"}
];

export const SEED_TEAM = [
  {id:1,name:'Admin (Shashank)',username:'admin',pin:'1234',role:'admin',dept:'Management',wa:'',active:true,lastLogin:'25 Jun 2026'},
  {id:2,name:'Neelam Sharma',username:'neelam',pin:'5678',role:'manager',dept:'Installation Ops',wa:'919876543210',active:true,lastLogin:'25 Jun 2026'},
  {id:3,name:'Shubham Salvi',username:'shubham',pin:'9012',role:'supervisor',dept:'Site Team',wa:'919765432100',active:true,lastLogin:'24 Jun 2026'},
  {id:4,name:'Upasana Singh',username:'finance',pin:'3456',role:'finance',dept:'Finance',wa:'',active:true,lastLogin:'23 Jun 2026'},
  {id:5,name:'Sales Team',username:'sales',pin:'7890',role:'viewer',dept:'Sales / CRE',wa:'',active:true,lastLogin:'22 Jun 2026'}
];

export const SEED_LOTS = [
  {id:1, projId:1, lotNo:'Lot 1', dispatchDate:'2025-12-12', expectedArrival:'2025-12-14',
   actualArrival:'2025-12-14', vehicle:'MH-04-AB-1234', driver:'9876543210',
   dispatchNotes:'Framing + grille for floors 1-10',
   condition:'good', bundleMatched:'yes', storage:'Ground floor storeroom',
   arrivalNotes:'',
   items:[{product:'18mm Jali', bundleCount:20, qtyDispatched:925}]},
  {id:2, projId:1, lotNo:'Lot 2', dispatchDate:'2026-02-01', expectedArrival:'2026-02-03',
   actualArrival:'2026-02-03', vehicle:'MH-04-CD-5678', driver:'9876543210',
   dispatchNotes:'Balance grille floors 11-20',
   condition:'good', bundleMatched:'yes', storage:'2nd floor corridor',
   arrivalNotes:'',
   items:[{product:'18mm Jali', bundleCount:20, qtyDispatched:925}]}
];

