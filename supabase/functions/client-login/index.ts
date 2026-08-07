// Phase C auth hardening. Replaces the old client-side lookup
// (`state.projects.find(p=>p.accessCode===code)`, against a projects array already fully
// loaded into browser memory pre-login) with a server-side lookup using the service role
// key. Only the one matching project is ever returned — the full projects table (and every
// other project's access code) never reaches the browser for this flow.
//
// `name` is required non-empty but not otherwise validated — matches the original
// `doClientLogin()` behavior exactly (it never checked name against the project either).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GENERIC_ERROR = 'Invalid access code.';

// Mirrors src/lib/mappers.js rowToProject() exactly — duplicated here because Supabase's
// Edge Function bundler only picks up files inside supabase/functions, so this can't import
// the app's src/ modules directly. Keep in sync if mappers.js's project shape changes.
function rowToProject(r: Record<string, unknown>) {
  return {
    id: r.id, accessCode: r.access_code, createdBy: r.created_by, name: r.name, tower: r.tower,
    developer: r.developer, city: r.city, state: r.state, supervisor: r.supervisor,
    vendor: r.vendor, supervisorWA: r.supervisor_wa, status: r.status,
    plannedQty: r.planned_qty, installedQty: r.installed_qty, raBillQty: r.ra_bill_qty,
    raBillAmt: r.ra_bill_amt, paymentCollected: r.payment_collected, jmrQty: r.jmr_qty,
    constraintsOpen: r.constraints_open, raBillReady: r.ra_bill_ready,
    startDate: r.start_date || '', committedDate: r.committed_date || '',
    actualDate: r.actual_date || '', driveLink: r.drive_link || '', unit: r.unit || 'sqft',
    orderType: r.order_type || '', vendors: r.vendors || [], products: r.products || [],
    constraints: r.constraints || [], milestones: r.milestones || [], comments: r.comments || [],
    poQty: r.po_qty || 0, soQty: r.so_qty || 0, raBillHistory: r.ra_bill_history || [], jmrDocs: r.jmr_docs || [], checklist: r.checklist || [], snags: r.snags || [], salesPersonName: r.sales_person_name || '', sourceRequestType: r.source_request_type || '', salesPersonEmail: r.sales_person_email || '',
    framingMaterial: r.framing_material || '', sectionSize: r.section_size || '',
    premockupChecklistCompletedAt: r.premockup_checklist_completed_at || '', premockupChecklistReviewed: r.premockup_checklist_reviewed || false,
    financeLastReviewedJmr: r.finance_last_reviewed_jmr || 0,
    mockupChecklist: r.mockup_checklist || null, mockupChecklistCompletedAt: r.mockup_checklist_completed_at || '', mockupChecklistReviewed: r.mockup_checklist_reviewed || false,
    preMainSurveyChecklist: r.pre_main_survey_checklist || null, preMainSurveyChecklistCompletedAt: r.pre_main_survey_checklist_completed_at || '', preMainSurveyChecklistReviewed: r.pre_main_survey_checklist_reviewed || false,
    handoverChecklist: r.handover_checklist || null, handoverChecklistCompletedAt: r.handover_checklist_completed_at || '', handoverChecklistReviewed: r.handover_checklist_reviewed || false,
    workPolicyChecklist: r.work_policy_checklist || null, workPolicyChecklistCompletedAt: r.work_policy_checklist_completed_at || '', workPolicyChecklistReviewed: r.work_policy_checklist_reviewed || false,
    poDate: r.po_date || '', daysAvailable: r.days_available || 0, materialFirstLotDate: r.material_first_lot_date || '', installCommencementDate: r.install_commencement_date || '',
    wccDocs: r.wcc_docs || [], raBillDocs: r.ra_bill_docs || [], projectDocs: r.project_docs || [], premockupChecklist: r.premockup_checklist || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body: { name?: string; accessCode?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: GENERIC_ERROR }, 400);
  }
  const name = (body.name || '').trim();
  const accessCode = (body.accessCode || '').trim().toUpperCase();
  if (!name) return jsonResponse({ error: 'Please enter your name.' }, 400);
  if (!accessCode) return jsonResponse({ error: GENERIC_ERROR }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: row, error } = await admin
    .from('projects')
    .select('*')
    .eq('access_code', accessCode)
    .maybeSingle();
  if (error) {
    console.error('client-login project lookup failed', error);
    return jsonResponse({ error: GENERIC_ERROR }, 401);
  }
  if (!row) return jsonResponse({ error: GENERIC_ERROR }, 401);

  return jsonResponse({ project: rowToProject(row) });
});
