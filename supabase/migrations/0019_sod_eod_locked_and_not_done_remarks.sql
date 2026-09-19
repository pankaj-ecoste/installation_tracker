-- v2-42 follow-up (requested by the team after the first live check):
-- 1. Remarks are mandatory whenever SOD or EOD is 'Not Done'; optional for Call / Email / WhatsApp.
-- 2. A saved SOD/EOD entry is final ("locked, no editing"): admin can read and add, but no longer
--    update or delete through the API. A wrong entry can only be corrected directly in the database.
-- Later file (not an edit of 0018) because 0018 is already applied — see the runner's RULES header.

alter table sod_eod_log drop constraint if exists sod_eod_log_not_done_needs_remarks;
alter table sod_eod_log add constraint sod_eod_log_not_done_needs_remarks
  check ((sod <> 'Not Done' and eod <> 'Not Done') or length(btrim(coalesce(remarks, ''))) > 0);

-- Replace the single FOR ALL policy with select + insert only. With no update/delete policy, RLS denies
-- both for every API role, including admin.
drop policy if exists sod_eod_log_admin_all on sod_eod_log;
drop policy if exists sod_eod_log_admin_select on sod_eod_log;
drop policy if exists sod_eod_log_admin_insert on sod_eod_log;
create policy sod_eod_log_admin_select on sod_eod_log for select
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin');
create policy sod_eod_log_admin_insert on sod_eod_log for insert
  with check (app_is_active_team_member() and app_jwt_team_role() = 'admin');
