-- Phase D: Row-Level Security. Named 0004 (not the architecture doc's original 0002) because
-- Phase C already shipped as 0003_auth_hardening.sql — see plan.md's "Next session should
-- start with" note. apply-migrations.mjs re-applies every file in filename order on every run
-- and everything here is idempotent (drop-if-exists policies, create-or-replace functions), so
-- the exact number only matters for readability/chronology, not correctness.
--
-- SCOPE DECISION (confirmed with the user before writing this file, see plan.md Phase D notes):
-- this migration locks down WRITES only (insert/update/delete), matching the ROLES.can matrix
-- in src/lib/constants.js. Reads (select) are left open on every table, unchanged from today.
--
-- Why reads stay open: src/main.js calls loadAllData() once, unconditionally, BEFORE any
-- login, using the plain anon key — that's the ONLY data fetch in the app's lifecycle, nothing
-- re-fetches after team/client/vendor login. The architecture doc's original plan (SELECT
-- policies gated on auth.jwt()->>'team_role') assumed reads happen after a team JWT exists;
-- applied literally, that would make loadAllData() come back empty for every real user, since
-- the fetch happens before the JWT is even issued — a severe regression, not hardening. Full
-- row-level read scoping would require redesigning the load sequence (fetch after login instead
-- of before) — out of scope for this migration; today's actual behavior (anon can already read
-- every table, no RLS at all) is an already-known, already-documented gap, not something this
-- migration makes worse. What this migration actually closes: today, anyone holding the anon
-- key (not just the app) can INSERT/UPDATE/DELETE any row in any table with zero restriction.
-- That's the real, dangerous gap, and it's fully closeable without touching the load sequence,
-- because every write in this app happens only after login (team JWT already exists by then).
--
-- team_members.pin/pin_hash are the one exception to "reads stay open" — those must never be
-- selectable by anon/authenticated regardless (see column REVOKE near the bottom), independent
-- of RLS row policies (RLS is row-level, not column-level).
--
-- KNOWN NARROW GAP, accepted deliberately: loadAllData()'s "seed on first run" inserts (when a
-- table is completely empty) run pre-login with the anon key too. Requiring a team JWT for
-- INSERT means that auto-seed path would fail if these tables were ever wiped on a live
-- project. Not a concern today (this project already has real data — Phase B seeded it), and
-- re-seeding a wiped project is something whoever has DATABASE_URL access can do directly
-- (service_role bypasses RLS). Flagging so it isn't rediscovered as a surprise later.

/* ══ JWT / ROLE HELPERS ══
   Our custom team JWT (signed in supabase/functions/team-login) carries team_member_id,
   team_role, team_username claims — NOT team_member_id's current name. Vendor sessions use
   real Supabase Auth (GoTrue-issued JWTs) and never carry these claims, so these helpers
   correctly return null for vendor requests, which is what excludes vendors from every
   team-role-gated policy below. */
create or replace function app_jwt_team_role() returns text
language sql stable
as $$ select nullif(auth.jwt()->>'team_role', '') $$;

create or replace function app_jwt_team_member_id() returns integer
language sql stable
as $$ select nullif(auth.jwt()->>'team_member_id', '')::integer $$;

create or replace function app_jwt_team_username() returns text
language sql stable
as $$ select nullif(auth.jwt()->>'team_username', '') $$;

-- Re-checks team_members.active on every policy evaluation (not just at login), so a
-- deactivated member's still-unexpired token stops being able to write immediately — matches
-- the architecture doc's explicit requirement for Phase D.
create or replace function app_is_active_team_member() returns boolean
language sql stable
as $$
  select exists (
    select 1 from team_members m
    where m.id = app_jwt_team_member_id() and m.active = true
  );
$$;

-- Current display name for the logged-in team member, re-read from team_members (not carried
-- in the JWT) — needed to replicate dprTab.js's exact self-edit check
-- (`canDo('addDPR') || d.supervisor === currentUser.name`), which compares against the
-- display name, not the login username. Returns null (never matches) if deactivated.
create or replace function app_active_team_member_name() returns text
language sql stable
as $$
  select m.name from team_members m
  where m.id = app_jwt_team_member_id() and m.active = true
  limit 1;
$$;

/* ══ PROJECTS ══
   INSERT: addProject (admin, manager, viewer) — new-project form (addEditProject.js) and
   request-to-project conversion (requestsTab.js), both gated client-side by the same flag.
   UPDATE: syncProject() is a shared "save whatever changed" call used across many different
   flows and roles (edits, comments, checklists, milestones, snags, finance fields) — there is
   no single owning permission to replicate precisely without risking blocking a legitimate
   flow, so this stays at the baseline: must be a logged-in, active team member. Still closes
   the real gap (writes from outside the app / a deactivated member).
   DELETE: deleteProject (admin only) — the one clearly single-gated action on this table. */
alter table projects enable row level security;
drop policy if exists projects_select_open on projects;
create policy projects_select_open on projects for select using (true);

drop policy if exists projects_insert on projects;
create policy projects_insert on projects for insert
  with check (app_is_active_team_member() and app_jwt_team_role() in ('admin','manager','viewer'));

drop policy if exists projects_update on projects;
create policy projects_update on projects for update
  using (app_is_active_team_member())
  with check (app_is_active_team_member());

drop policy if exists projects_delete on projects;
create policy projects_delete on projects for delete
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin');

/* ══ DPR_LOG ══
   Single-flow table (only dprTab.js writes here), so the exact per-action gate is safe to
   replicate precisely, unlike projects/requests/material_lots below.
   INSERT: addDPR (admin, manager, supervisor).
   UPDATE: addDPR roles, OR the supervisor who owns this specific DPR entry (by display name —
   matches dprTab.js's `d.supervisor===currentUser.name` check exactly). */
alter table dpr_log enable row level security;
drop policy if exists dpr_log_select_open on dpr_log;
create policy dpr_log_select_open on dpr_log for select using (true);

drop policy if exists dpr_log_insert on dpr_log;
create policy dpr_log_insert on dpr_log for insert
  with check (app_is_active_team_member() and app_jwt_team_role() in ('admin','manager','supervisor'));

drop policy if exists dpr_log_update on dpr_log;
create policy dpr_log_update on dpr_log for update
  using (app_is_active_team_member() and (app_jwt_team_role() in ('admin','manager') or supervisor = app_active_team_member_name()))
  with check (app_is_active_team_member() and (app_jwt_team_role() in ('admin','manager') or supervisor = app_active_team_member_name()));

/* ══ TEAM_MEMBERS ══
   The only table where every single write (insert/update/delete) genuinely goes through one
   permission (manageTeam, admin-only, teamMgmtTab.js) — safe to restrict fully.
   pin/pin_hash writes only ever happen via the Phase C SECURITY DEFINER functions
   (set_member_pin_hash, called from the team-set-pin Edge Function under service_role, which
   bypasses RLS) — the app itself never writes those columns directly, so no exception needed
   here for that. */
alter table team_members enable row level security;
drop policy if exists team_members_select_open on team_members;
create policy team_members_select_open on team_members for select using (true);

drop policy if exists team_members_insert on team_members;
create policy team_members_insert on team_members for insert
  with check (app_is_active_team_member() and app_jwt_team_role() = 'admin');

drop policy if exists team_members_update on team_members;
create policy team_members_update on team_members for update
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin')
  with check (app_is_active_team_member() and app_jwt_team_role() = 'admin');

drop policy if exists team_members_delete on team_members;
create policy team_members_delete on team_members for delete
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin');

-- Column-level lock: pin/pin_hash must never be selectable by anon/authenticated, regardless
-- of the row-level policy above (RLS is row-level only). The app already excludes both columns
-- from its own select (TEAM_MEMBER_PUBLIC_COLUMNS in src/data/loadAllData.js) — this closes the
-- remaining gap where anyone with the anon key could `select=*` or `select=pin_hash` directly
-- against the REST API, bypassing the app entirely.
revoke select (pin, pin_hash) on team_members from anon, authenticated;

/* ══ MATERIAL_LOTS ══
   INSERT: addLot (admin, dispatch_head) — one clear gate (materialTab.js).
   UPDATE: two legitimate, differently-permissioned flows touch this table (admin editing a
   dispatched lot's details in materialTab.js; any addDPR-capable supervisor acknowledging
   material arrival from within the DPR save flow in dprTab.js) — same reasoning as projects,
   baseline (active team member) rather than risk blocking either flow. */
alter table material_lots enable row level security;
drop policy if exists material_lots_select_open on material_lots;
create policy material_lots_select_open on material_lots for select using (true);

drop policy if exists material_lots_insert on material_lots;
create policy material_lots_insert on material_lots for insert
  with check (app_is_active_team_member() and app_jwt_team_role() in ('admin','dispatch_head'));

drop policy if exists material_lots_update on material_lots;
create policy material_lots_update on material_lots for update
  using (app_is_active_team_member())
  with check (app_is_active_team_member());

/* ══ REQUESTS ══
   updateRequestFields() is a shared helper called from many different flows/roles (acknowledge,
   mark reviewed, convert to project, admin-only planned-date override, supervisor visit-report
   fill-in) — baseline for UPDATE, same reasoning as projects.
   INSERT: addRequest (admin, manager, viewer) — new-request form, single clear gate. */
alter table requests enable row level security;
drop policy if exists requests_select_open on requests;
create policy requests_select_open on requests for select using (true);

drop policy if exists requests_insert on requests;
create policy requests_insert on requests for insert
  with check (app_is_active_team_member() and app_jwt_team_role() in ('admin','manager','viewer'));

drop policy if exists requests_update on requests;
create policy requests_update on requests for update
  using (app_is_active_team_member())
  with check (app_is_active_team_member());

/* ══ FINANCE_LEDGER ══
   Single-flow table (only financeTab.js writes here) — safe to replicate the exact gates.
   INSERT: addFinanceRow (admin only, per the ROLES matrix — manager/finance can edit rows but
   not add new ones; preserved exactly as specified even though it looks asymmetric).
   UPDATE: editFinance (admin, manager, finance). */
alter table finance_ledger enable row level security;
drop policy if exists finance_ledger_select_open on finance_ledger;
create policy finance_ledger_select_open on finance_ledger for select using (true);

drop policy if exists finance_ledger_insert on finance_ledger;
create policy finance_ledger_insert on finance_ledger for insert
  with check (app_is_active_team_member() and app_jwt_team_role() = 'admin');

drop policy if exists finance_ledger_update on finance_ledger;
create policy finance_ledger_update on finance_ledger for update
  using (app_is_active_team_member() and app_jwt_team_role() in ('admin','manager','finance'))
  with check (app_is_active_team_member() and app_jwt_team_role() in ('admin','manager','finance'));

/* ══ VENDOR_PROFILES ══
   Structurally different from every table above: rows are written via two entirely separate
   auth mechanisms, not the custom team JWT.
   INSERT: the vendor's own registration (vendorAuth.js vendorRegister(), real Supabase Auth
   session from signUp()) — auth.uid() must equal the row's own user_id.
   UPDATE (reviewed_by_admin / approved_by_shashank): admin team members only
   (newVendorsTab.js), via the team JWT — matches "gated by role, not by specific person" per
   the architecture doc's note on the approved_by_shashank field name. */
alter table vendor_profiles enable row level security;
drop policy if exists vendor_profiles_select_open on vendor_profiles;
create policy vendor_profiles_select_open on vendor_profiles for select using (true);

drop policy if exists vendor_profiles_insert on vendor_profiles;
create policy vendor_profiles_insert on vendor_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists vendor_profiles_update on vendor_profiles;
create policy vendor_profiles_update on vendor_profiles for update
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin')
  with check (app_is_active_team_member() and app_jwt_team_role() = 'admin');

/* ══ ACTIVITY_LOG ══
   Insert-only table (logActivity(), src/lib/activityLog.js), called from dozens of places
   across every team role after a successful action — baseline (active team member) is the
   correct and only gate; no update/delete flow exists in the app, so none is added (default
   deny under RLS is correct there). */
alter table activity_log enable row level security;
drop policy if exists activity_log_select_open on activity_log;
create policy activity_log_select_open on activity_log for select using (true);

drop policy if exists activity_log_insert on activity_log;
create policy activity_log_insert on activity_log for insert
  with check (app_is_active_team_member());
