/* ══════════════════ SUPABASE SYNC LAYER ══════════════════
   Everything below maps your existing camelCase JS objects to
   snake_case Supabase columns and keeps them in sync. The rest of
   the app (render functions etc.) is untouched — it still just
   reads/writes the local `projects`, `dprLog`, `teamMembers`,
   `materialLots` arrays like before. */

export function projectToRow(p){
  return {
    access_code:p.accessCode, created_by:p.createdBy, name:p.name, tower:p.tower, tower_count:p.towerCount||1,
    developer:p.developer, city:p.city, state:p.state, supervisor:p.supervisor,
    vendor:p.vendor, supervisor_wa:p.supervisorWA, status:p.status,
    planned_qty:p.plannedQty, installed_qty:p.installedQty, ra_bill_qty:p.raBillQty,
    ra_bill_amt:p.raBillAmt, payment_collected:p.paymentCollected, jmr_qty:p.jmrQty,
    constraints_open:p.constraintsOpen, ra_bill_ready:p.raBillReady,
    start_date:p.startDate||null, committed_date:p.committedDate||null,
    actual_date:p.actualDate||null, drive_link:p.driveLink, unit:p.unit,
    order_type:p.orderType, vendors:p.vendors, products:p.products,
    constraints:p.constraints, milestones:p.milestones, comments:p.comments,
    po_qty:p.poQty||0, so_qty:p.soQty||0, ra_bill_history:p.raBillHistory||[], jmr_docs:p.jmrDocs||[], checklist:p.checklist||[], snags:p.snags||[], sales_person_name:p.salesPersonName||'', source_request_type:p.sourceRequestType||'', sales_person_email:p.salesPersonEmail||'',
    framing_material:p.framingMaterial||'', section_size:p.sectionSize||'',
    premockup_checklist_completed_at:p.premockupChecklistCompletedAt||null, premockup_checklist_reviewed:p.premockupChecklistReviewed||false,
    finance_last_reviewed_jmr:p.financeLastReviewedJmr||0,
    mockup_checklist:p.mockupChecklist||null, mockup_checklist_completed_at:p.mockupChecklistCompletedAt||null, mockup_checklist_reviewed:p.mockupChecklistReviewed||false,
    pre_main_survey_checklist:p.preMainSurveyChecklist||null, pre_main_survey_checklist_completed_at:p.preMainSurveyChecklistCompletedAt||null, pre_main_survey_checklist_reviewed:p.preMainSurveyChecklistReviewed||false,
    handover_checklist:p.handoverChecklist||null, handover_checklist_completed_at:p.handoverChecklistCompletedAt||null, handover_checklist_reviewed:p.handoverChecklistReviewed||false,
    work_policy_checklist:p.workPolicyChecklist||null, work_policy_checklist_completed_at:p.workPolicyChecklistCompletedAt||null, work_policy_checklist_reviewed:p.workPolicyChecklistReviewed||false,
    po_date:p.poDate||null, days_available:p.daysAvailable||null, material_first_lot_date:p.materialFirstLotDate||null, install_commencement_date:p.installCommencementDate||null,
    wcc_docs:p.wccDocs||[], ra_bill_docs:p.raBillDocs||[], project_docs:p.projectDocs||[], premockup_checklist:p.premockupChecklist||null
  };
}
export function rowToProject(r){
  return {
    id:r.id, accessCode:r.access_code, createdBy:r.created_by, name:r.name, tower:r.tower, towerCount:r.tower_count||1,
    developer:r.developer, city:r.city, state:r.state, supervisor:r.supervisor,
    vendor:r.vendor, supervisorWA:r.supervisor_wa, status:r.status,
    plannedQty:r.planned_qty, installedQty:r.installed_qty, raBillQty:r.ra_bill_qty,
    raBillAmt:r.ra_bill_amt, paymentCollected:r.payment_collected, jmrQty:r.jmr_qty,
    constraintsOpen:r.constraints_open, raBillReady:r.ra_bill_ready,
    startDate:r.start_date||'', committedDate:r.committed_date||'',
    actualDate:r.actual_date||'', driveLink:r.drive_link||'', unit:r.unit||'sqft',
    orderType:r.order_type||'', vendors:r.vendors||[], products:r.products||[],
    constraints:r.constraints||[], milestones:r.milestones||[], comments:r.comments||[],
    poQty:r.po_qty||0, soQty:r.so_qty||0, raBillHistory:r.ra_bill_history||[], jmrDocs:r.jmr_docs||[], checklist:r.checklist||[], snags:r.snags||[], salesPersonName:r.sales_person_name||'', sourceRequestType:r.source_request_type||'', salesPersonEmail:r.sales_person_email||'',
    framingMaterial:r.framing_material||'', sectionSize:r.section_size||'',
    premockupChecklistCompletedAt:r.premockup_checklist_completed_at||'', premockupChecklistReviewed:r.premockup_checklist_reviewed||false,
    financeLastReviewedJmr:r.finance_last_reviewed_jmr||0,
    mockupChecklist:r.mockup_checklist||null, mockupChecklistCompletedAt:r.mockup_checklist_completed_at||'', mockupChecklistReviewed:r.mockup_checklist_reviewed||false,
    preMainSurveyChecklist:r.pre_main_survey_checklist||null, preMainSurveyChecklistCompletedAt:r.pre_main_survey_checklist_completed_at||'', preMainSurveyChecklistReviewed:r.pre_main_survey_checklist_reviewed||false,
    handoverChecklist:r.handover_checklist||null, handoverChecklistCompletedAt:r.handover_checklist_completed_at||'', handoverChecklistReviewed:r.handover_checklist_reviewed||false,
    workPolicyChecklist:r.work_policy_checklist||null, workPolicyChecklistCompletedAt:r.work_policy_checklist_completed_at||'', workPolicyChecklistReviewed:r.work_policy_checklist_reviewed||false,
    poDate:r.po_date||'', daysAvailable:r.days_available||0, materialFirstLotDate:r.material_first_lot_date||'', installCommencementDate:r.install_commencement_date||'',
    wccDocs:r.wcc_docs||[], raBillDocs:r.ra_bill_docs||[], projectDocs:r.project_docs||[], premockupChecklist:r.premockup_checklist||null
  };
}

export function dprToRow(d){
  return {
    proj_id:d.projId, project:d.project, date:d.date, supervisor:d.supervisor,
    day_no:d.dayNo, days_left:d.daysLeft, committed_mp:d.committedMp, actual_mp:d.actualMp,
    manpower:d.manpower, photos:d.photos, products:d.products, constraints:d.constraints,
    action_taken:d.actionTaken, remarks:d.remarks, internal_hindrance:d.internalHindrance,
    next_dispatch:d.nextDispatch, escalations:d.escalations, next:d.next,
    framing_material:d.framingMaterial||'', section_size:d.sectionSize||'', photo_urls:d.photoUrls||[], report_pdf_url:d.reportPdfUrl||'',
    geo_location:d.geoLocation||''
  };
}
export function rowToDpr(r){
  return {
    id:r.id, projId:r.proj_id, project:r.project, date:r.date, supervisor:r.supervisor,
    dayNo:r.day_no, daysLeft:r.days_left, committedMp:r.committed_mp, actualMp:r.actual_mp,
    manpower:r.manpower, photos:r.photos, products:r.products||[], constraints:r.constraints||[],
    actionTaken:r.action_taken||'', remarks:r.remarks||'', internalHindrance:r.internal_hindrance||'',
    nextDispatch:r.next_dispatch||'', escalations:r.escalations||'', next:r.next||'—',
    framingMaterial:r.framing_material||'', sectionSize:r.section_size||'', photoUrls:r.photo_urls||[], reportPdfUrl:r.report_pdf_url||'',
    geoLocation:r.geo_location||'', createdById:r.created_by_id||null
  };
}

export function memberToRow(m){
  return {name:m.name, username:m.username, pin:m.pin, role:m.role, dept:m.dept, wa:m.wa, active:m.active, last_login:m.lastLogin, email:m.email||''};
}
export function rowToMember(r){
  return {id:r.id, name:r.name, username:r.username, pin:r.pin, role:r.role, dept:r.dept, wa:r.wa||'', active:r.active, lastLogin:r.last_login||'Never', email:r.email||''};
}

export function lotToRow(l){
  return {
    proj_id:l.projId, lot_no:l.lotNo, dispatch_date:l.dispatchDate||null, expected_arrival:l.expectedArrival||null,
    actual_arrival:l.actualArrival||null, vehicle:l.vehicle, driver:l.driver, dispatch_notes:l.dispatchNotes,
    condition:l.condition, bundle_matched:l.bundleMatched, storage:l.storage, arrival_notes:l.arrivalNotes, items:l.items,
    arrival_acked_at:l.arrivalAckedAt||null, arrival_geo_location:l.arrivalGeoLocation||null, arrival_photo_urls:l.arrivalPhotoUrls||[], lr_copy_url:l.lrCopyUrl||null,
    eway_bill_url:l.ewayBillUrl||null, delivery_chalan_url:l.deliveryChalanUrl||null, lr_copy_receiving_url:l.lrCopyReceivingUrl||null,
    packing_list_url:l.packingListUrl||null, other_document_url:l.otherDocumentUrl||null
  };
}
export function rowToLot(r){
  return {
    id:r.id, projId:r.proj_id, lotNo:r.lot_no, dispatchDate:r.dispatch_date||'', expectedArrival:r.expected_arrival||'',
    actualArrival:r.actual_arrival||'', vehicle:r.vehicle||'', driver:r.driver||'', dispatchNotes:r.dispatch_notes||'',
    condition:r.condition||'', bundleMatched:r.bundle_matched||'', storage:r.storage||'', arrivalNotes:r.arrival_notes||'', items:r.items||[],
    arrivalAckedAt:r.arrival_acked_at||'', arrivalGeoLocation:r.arrival_geo_location||'', arrivalPhotoUrls:r.arrival_photo_urls||[], lrCopyUrl:r.lr_copy_url||'',
    ewayBillUrl:r.eway_bill_url||'', deliveryChalanUrl:r.delivery_chalan_url||'', lrCopyReceivingUrl:r.lr_copy_receiving_url||'',
    packingListUrl:r.packing_list_url||'', otherDocumentUrl:r.other_document_url||''
  };
}

export function requestToRow(r){
  return {
    request_number:r.requestNumber, request_type:r.requestType, request_sub_type:r.requestSubType||null, status:r.status, created_by:r.createdBy,
    assigned_supervisor:r.assignedSupervisor||null, planned_visit_date:r.plannedVisitDate||null,
    actual_visit_date:r.actualVisitDate||null, planned_date_locked:r.plannedDateLocked||false,
    details:r.details||{}, checklist:r.checklist||[], linked_project_id:r.linkedProjectId||null,
    reviewed_at:r.reviewedAt||null, converted_at:r.convertedAt||null
  };
}
export function rowToRequest(row){
  return {
    id:row.id, requestNumber:row.request_number, requestType:row.request_type, requestSubType:row.request_sub_type||'', status:row.status,
    createdBy:row.created_by, assignedSupervisor:row.assigned_supervisor||'', plannedVisitDate:row.planned_visit_date||'',
    actualVisitDate:row.actual_visit_date||'', plannedDateLocked:row.planned_date_locked||false,
    details:row.details||{}, checklist:row.checklist||[], linkedProjectId:row.linked_project_id||null,
    createdAt:row.created_at||'', reviewedAt:row.reviewed_at||'', convertedAt:row.converted_at||''
  };
}

export function financeRowToRow(f){
  return {
    proj_id:f.projId, product:f.product, description:f.description, location:f.location,
    boq_qty:f.boqQty||0, contractor:f.contractor, wo_qty:f.woQty||0, wo_rate:f.woRate||0,
    contract_value:f.contractValue||0, payment_given:f.paymentGiven||0, retention:f.retention||0,
    work_status:f.workStatus, installation_payment_due:f.installationPaymentDue||0,
    payment_pending:f.paymentPending||0, installation_amount_pending:f.installationAmountPending||'',
    ra_bill_status:f.raBillStatus, ra_bill_due_date:f.raBillDueDate||null, ra_bill_due_amount:f.raBillDueAmount||0,
    ra_bill_balance:f.raBillBalance||0, billed_qty:f.billedQty||0, billed_amt:f.billedAmt||0,
    unbilled_qty:f.unbilledQty||0, unbilled_amt:f.unbilledAmt||0, installation_rate:f.installationRate||0,
    due_billing:f.dueBilling||0, hold_amount:f.holdAmount||0
  };
}
export function rowToFinanceRow(r){
  return {
    id:r.id, projId:r.proj_id, product:r.product||'', description:r.description||'', location:r.location||'',
    boqQty:r.boq_qty||0, contractor:r.contractor||'', woQty:r.wo_qty||0, woRate:r.wo_rate||0,
    contractValue:r.contract_value||0, paymentGiven:r.payment_given||0, retention:r.retention||0,
    workStatus:r.work_status||'', installationPaymentDue:r.installation_payment_due||0,
    paymentPending:r.payment_pending||0, installationAmountPending:r.installation_amount_pending||'',
    raBillStatus:r.ra_bill_status||'', raBillDueDate:r.ra_bill_due_date||'', raBillDueAmount:r.ra_bill_due_amount||0,
    raBillBalance:r.ra_bill_balance||0, billedQty:r.billed_qty||0, billedAmt:r.billed_amt||0,
    unbilledQty:r.unbilled_qty||0, unbilledAmt:r.unbilled_amt||0, installationRate:r.installation_rate||0,
    dueBilling:r.due_billing||0, holdAmount:r.hold_amount||0
  };
}

