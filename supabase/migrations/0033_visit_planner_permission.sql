-- v2-77: Visit Planner access follows the Role Permissions grid (permission 'useVisitPlanner', plan.md v2-77).
-- Until now visit_plans was hard-wired to the roles admin / supervisor. Now:
--   * full ("admin-level") access = admin, OR any non-supervisor role whose grid tick is on. With no saved row the
--     defaults apply: Ops Manager = on, every other non-supervisor role = off.
--   * supervisor keeps own-plan access while the Supervisor tick is on (default on).
-- Ops Manager (and any ticked role) is treated EXACTLY like admin by the plan-validation trigger, so every rule
-- (week, 7 days, max 4 a day, Done/Missed dates, remarks) is unchanged.

create or replace function app_vp_admin_access() returns boolean
language sql stable
as $$
  select app_is_active_team_member() and (
    app_jwt_team_role() = 'admin'
    or (app_jwt_team_role() <> 'supervisor' and coalesce(
         (select rp.allowed from role_permissions rp where rp.role = app_jwt_team_role() and rp.permission = 'useVisitPlanner'),
         app_jwt_team_role() = 'manager'))
  );
$$;

create or replace function app_vp_supervisor_access() returns boolean
language sql stable
as $$
  select app_is_active_team_member() and app_jwt_team_role() = 'supervisor' and coalesce(
    (select rp.allowed from role_permissions rp where rp.role = 'supervisor' and rp.permission = 'useVisitPlanner'), true);
$$;

-- The validation trigger decides "is admin?" from v_role. Re-point that one line (rest of the function untouched).
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('visit_plans_enforce()'::regprocedure) into v_def;
  v_new := replace(v_def, 'v_role text := app_jwt_team_role();',
    'v_role text := case when app_vp_admin_access() then ''admin'' else app_jwt_team_role() end;');
  if v_new = v_def then raise exception 'visit_plans_enforce: expected line not found, nothing changed'; end if;
  execute v_new;
end $$;

drop policy if exists visit_plans_select on visit_plans;
create policy visit_plans_select on visit_plans for select
  using (app_vp_admin_access() or (app_vp_supervisor_access() and supervisor_id = app_jwt_team_member_id()));

drop policy if exists visit_plans_insert on visit_plans;
create policy visit_plans_insert on visit_plans for insert
  with check (app_vp_admin_access() or (app_vp_supervisor_access() and supervisor_id = app_jwt_team_member_id()));

drop policy if exists visit_plans_update on visit_plans;
create policy visit_plans_update on visit_plans for update
  using (app_vp_admin_access()) with check (app_vp_admin_access());

drop policy if exists visit_plans_delete on visit_plans;
create policy visit_plans_delete on visit_plans for delete
  using (app_vp_admin_access());
