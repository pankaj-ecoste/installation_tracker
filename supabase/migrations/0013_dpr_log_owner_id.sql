-- v2-22: "Could not save DPR changes" — root cause was that dpr_log's UPDATE permission (both
-- the RLS policy below and the client-side Edit-button gate in dprTab.js) was based on comparing
-- the free-text `supervisor` field to the editor's team_members.name. That field is a plain
-- editable <input> pre-filled from the *project's* assigned supervisor, never actually bound to
-- who is logged in — so it routinely doesn't match (case differences, or genuinely filled in by
-- someone other than the named supervisor), permanently locking that entry out of being edited by
-- anyone but admin/manager. See plan.md v2-22 for the full root-cause writeup.
--
-- Fix: record the actual authenticated submitter's team_members.id at insert time (immutable,
-- JWT-verified, can't be typo'd or spoofed) and use that for the ownership check going forward.
-- The free-text `supervisor` field is untouched and keeps its existing display purpose — it's
-- just no longer used to decide who may edit the entry.

alter table dpr_log add column if not exists created_by_id integer references team_members(id);

-- Best-effort backfill for existing rows (created before this column existed), so entries whose
-- free-text supervisor happens to name a real, matchable team member don't regress to
-- admin/manager-only editing. Case/whitespace-insensitive match; rows with no match stay null and
-- fall back to the legacy exact-text check preserved in the policy below.
update dpr_log set created_by_id = tm.id
from team_members tm
where dpr_log.created_by_id is null
  and lower(trim(dpr_log.supervisor)) = lower(trim(tm.name));

-- Second pass: a lot of real entries have the free-text supervisor field filled with the
-- person's login *username* instead of their display name (e.g. "shubham" vs. "Shubham Salvi") —
-- also a legitimate, unambiguous match to a real team member, so catch those too.
update dpr_log set created_by_id = tm.id
from team_members tm
where dpr_log.created_by_id is null
  and lower(trim(dpr_log.supervisor)) = lower(trim(tm.username));

-- INSERT: still gated by role (unchanged) but now also requires the row's created_by_id to be
-- the caller's own id — the client always sets this, and this check stops it being spoofed to
-- claim someone else's entry (or inserted null) from the client side.
drop policy if exists dpr_log_insert on dpr_log;
create policy dpr_log_insert on dpr_log for insert
  with check (app_is_active_team_member() and app_jwt_team_role() in ('admin','manager','supervisor') and created_by_id = app_jwt_team_member_id());

-- UPDATE: admin/manager unchanged; everyone else must own the row by id. The old free-text
-- supervisor-name check is kept ONLY as a fallback for the narrow set of legacy rows the backfill
-- above couldn't match to any team member (created_by_id still null) — never applied once a row
-- has a real owner id, so it can't reintroduce the original mismatch bug for any row this fix
-- actually covers.
drop policy if exists dpr_log_update on dpr_log;
create policy dpr_log_update on dpr_log for update
  using (app_is_active_team_member() and (
    app_jwt_team_role() in ('admin','manager')
    or created_by_id = app_jwt_team_member_id()
    or (created_by_id is null and supervisor = app_active_team_member_name())
  ))
  with check (app_is_active_team_member() and (
    app_jwt_team_role() in ('admin','manager')
    or created_by_id = app_jwt_team_member_id()
    or (created_by_id is null and supervisor = app_active_team_member_name())
  ));
