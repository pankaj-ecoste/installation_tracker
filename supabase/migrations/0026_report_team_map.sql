-- v2-58: Installation Scoring Report — which manager each site supervisor reports to.
-- A NEW, separate table (not a column on team_members) so nothing the login / loadAllData() path reads is touched.
-- Admin only for every operation including select (same pattern as sod_eod_log, 0018): the frontend reads it
-- only after an admin opens the report. supervisor_username is the team_members.username, lower-case.
-- manager is the report row the supervisor's numbers roll up into.
create table if not exists report_team_map (
  supervisor_username text primary key,
  manager text not null check (manager in ('shashank','aditya')),
  updated_at timestamptz not null default now()
);

alter table report_team_map enable row level security;
drop policy if exists report_team_map_admin_all on report_team_map;
create policy report_team_map_admin_all on report_team_map for all
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin')
  with check (app_is_active_team_member() and app_jwt_team_role() = 'admin');

-- Starting teams as given by management; an admin can change them any time from the report.
insert into report_team_map (supervisor_username, manager) values
  ('durgendra','shashank'), ('ravi','shashank'), ('karan','shashank'), ('faizan','shashank'),
  ('shubham','aditya'), ('mahesh','aditya')
on conflict (supervisor_username) do nothing;
