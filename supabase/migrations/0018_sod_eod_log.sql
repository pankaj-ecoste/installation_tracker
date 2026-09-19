-- v2-42: Reports module — SOD / EOD Follow-Up Tracker (admin only).
-- One row per project per day (unique log_date + project_name). Both SOD and EOD are required.
-- Score is DB-owned: +1 per slot for Call / Email / WhatsApp, -1 per slot for Not Done, so a row is -2..+2.
-- project_name (not a per-tower id) because the report is per builder/project group, same grouping the
-- dashboard's "Total projects" tile uses.
create table if not exists sod_eod_log (
  id bigint generated always as identity primary key,
  log_date date not null,
  project_name text not null,
  sod text not null check (sod in ('Call','Email','WhatsApp','Not Done')),
  eod text not null check (eod in ('Call','Email','WhatsApp','Not Done')),
  remarks text,
  score smallint generated always as (
    (case when sod = 'Not Done' then -1 else 1 end) + (case when eod = 'Not Done' then -1 else 1 end)
  ) stored,
  created_by integer,
  created_at timestamptz not null default now(),
  unique (log_date, project_name)
);

-- Admin only for every operation, INCLUDING select. Unlike the other tables (reads open, see 0004),
-- this one has no open-read policy: RLS with no matching policy denies anon and every non-admin role.
-- The frontend therefore fetches it only after an admin logs in, never in loadAllData() (which runs
-- pre-login with the anon key).
alter table sod_eod_log enable row level security;
drop policy if exists sod_eod_log_admin_all on sod_eod_log;
create policy sod_eod_log_admin_all on sod_eod_log for all
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin')
  with check (app_is_active_team_member() and app_jwt_team_role() = 'admin');
