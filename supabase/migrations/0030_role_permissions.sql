-- v2-66: Role Permissions actually persists (plan.md v2-66).
-- The Team tab's "Role permissions" grid (togglePerm() in teamMgmtTab.js) has existed since early on, but it
-- only ever mutated the in-memory ROLES constant — no table backed it, so every toggle was lost on the next
-- reload and was never visible to any other session to begin with. This table makes an override real and
-- shared. RLS matches the current house style (app_jwt_team_role(), same as 0029's visit_plans), not the
-- older fully-open pattern from before Phase C.

create table if not exists role_permissions (
  role text not null,
  permission text not null,
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by_id integer,
  primary key (role, permission)
);

-- Mirrors togglePerm()'s existing client-side "if(role==='admin') return;" — a crafted request can't
-- downgrade admin's own access either. Also stamps who/when, same idiom as visit_plans.
create or replace function role_permissions_guard() returns trigger
language plpgsql
as $$
begin
  if new.role = 'admin' then
    raise exception 'The admin role''s permissions cannot be changed';
  end if;
  new.updated_at := now();
  new.updated_by_id := app_jwt_team_member_id();
  return new;
end;
$$;

drop trigger if exists role_permissions_guard_trg on role_permissions;
create trigger role_permissions_guard_trg
  before insert or update on role_permissions
  for each row execute function role_permissions_guard();

alter table role_permissions enable row level security;

-- Every active team member reads the full matrix — canDo() must evaluate correctly for every role at
-- login, not just admin's own session.
drop policy if exists role_permissions_select on role_permissions;
create policy role_permissions_select on role_permissions for select
  using (app_is_active_team_member());

-- Only admin may change a permission — matches canDo('editPermissions'), which only admin has.
drop policy if exists role_permissions_insert on role_permissions;
create policy role_permissions_insert on role_permissions for insert
  with check (app_is_active_team_member() and app_jwt_team_role() = 'admin');

drop policy if exists role_permissions_update on role_permissions;
create policy role_permissions_update on role_permissions for update
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin')
  with check (app_is_active_team_member() and app_jwt_team_role() = 'admin');
