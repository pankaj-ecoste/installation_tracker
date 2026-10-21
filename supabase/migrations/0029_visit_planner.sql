-- v2-64: Visit Planner — one weekly site-visit plan per supervisor per week (plan.md v2-64).
-- The visits of a week live in one jsonb array on the plan row (same idiom as projects.milestones), so
-- saving a plan is a single atomic insert. Each visit element:
--   {id, date:'YYYY-MM-DD', kind:'project'|'new_site'|'off'|'leave'|'office', project_id, site, reason,
--    reason_other, status:'Planned'|'Done'|'Missed'|'Rescheduled', remark}
-- No foreign key to team_members on purpose: it would block the existing Team tab's "delete member".

create table if not exists visit_plans (
  id bigint generated always as identity primary key,
  supervisor_id integer not null,
  supervisor_name text not null,
  base_city text not null,
  week_start date not null,
  visits jsonb not null default '[]'::jsonb,
  created_by_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supervisor_id, week_start),
  check (extract(isodow from week_start) = 1)
);

-- Every rule that decides whether a plan may be saved lives HERE, in the database (not trusted from the
-- browser — see the "client-computed values should be DB-owned" lesson in plan.md):
--  * created_by_id is derived from the JWT, never sent by the client;
--  * a supervisor can only plan their own week, only the current week, or next week from Saturday;
--  * a supervisor cannot plan a past day, and cannot set a status (new visits start as Planned);
--  * every day that can still be planned (today onward) needs an entry, at most 4 per day, all inside the plan's week
--    (admin creating a plan needs all 7 days; a supervisor's plan saved mid-week has no entries for days already past);
--  * Done/Missed only on or after the visit date; Missed/Rescheduled need a remark.
-- "Today" is the India date, not the server's UTC date.
create or replace function visit_plans_enforce() returns trigger
language plpgsql
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_role text := app_jwt_team_role();
  v_this_monday date;
  v jsonb;
  v_date date;
  v_kind text;
  v_status text;
  v_day date;
  v_cnt int;
begin
  v_this_monday := v_today - (extract(isodow from v_today)::int - 1);

  if tg_op = 'INSERT' then
    new.created_by_id := app_jwt_team_member_id();
    if v_role is distinct from 'admin' then
      if new.supervisor_id is distinct from app_jwt_team_member_id() then
        raise exception 'You can only plan your own visits';
      end if;
      if new.week_start < v_this_monday then
        raise exception 'Past weeks cannot be planned';
      end if;
      if new.week_start > v_this_monday and (new.week_start <> v_this_monday + 7 or extract(isodow from v_today) < 6) then
        raise exception 'Next week opens on Saturday';
      end if;
    end if;
  else
    -- who and which week can never be moved by an edit
    new.supervisor_id := old.supervisor_id;
    new.supervisor_name := old.supervisor_name;
    new.week_start := old.week_start;
    new.created_by_id := old.created_by_id;
  end if;
  new.updated_at := now();

  if jsonb_typeof(new.visits) is distinct from 'array' then
    raise exception 'Visits must be a list';
  end if;

  for v in select * from jsonb_array_elements(new.visits) loop
    begin
      v_date := (v->>'date')::date;
    exception when others then
      raise exception 'A visit has an invalid date';
    end;
    if v_date < new.week_start or v_date > new.week_start + 6 then
      raise exception 'A visit date is outside the plan week';
    end if;
    v_kind := v->>'kind';
    if v_kind is null or v_kind not in ('project','new_site','off','leave','office') then
      raise exception 'A visit has an invalid site type';
    end if;
    if v_kind in ('project','new_site') then
      if coalesce(trim(v->>'site'), '') = '' then raise exception 'A visit has no site'; end if;
      if coalesce(trim(v->>'reason'), '') = '' then raise exception 'A visit has no reason'; end if;
      if v->>'reason' = 'Other' and coalesce(trim(v->>'reason_other'), '') = '' then
        raise exception 'Please type the reason when "Other" is chosen';
      end if;
    end if;
    v_status := coalesce(v->>'status', 'Planned');
    if v_status not in ('Planned','Done','Missed','Rescheduled') then
      raise exception 'A visit has an invalid status';
    end if;
    if v_status in ('Done','Missed') and v_date > v_today then
      raise exception 'A visit can be marked Done or Missed only on or after its date';
    end if;
    if v_status in ('Missed','Rescheduled') and coalesce(trim(v->>'remark'), '') = '' then
      raise exception 'A remark is required for Missed and Rescheduled';
    end if;
    if tg_op = 'INSERT' and v_role is distinct from 'admin' then
      if v_date < v_today then raise exception 'You can''t plan a past day'; end if;
      if v_status <> 'Planned' then raise exception 'A new plan must start as Planned'; end if;
    end if;
  end loop;

  for v_day in select new.week_start + i from generate_series(0, 6) as i loop
    select count(*) into v_cnt from jsonb_array_elements(new.visits) e where (e.value->>'date')::date = v_day;
    if v_cnt > 4 then raise exception 'At most 4 visits can be planned on one day'; end if;
    -- Every day that can still be planned needs an entry. A supervisor cannot plan a past day, so a plan
    -- saved mid-week simply has no entries for the days already gone; admin creating a plan needs all 7.
    if v_cnt = 0 and ((tg_op = 'INSERT' and (v_role = 'admin' or v_day >= v_today)) or (tg_op = 'UPDATE' and v_day >= v_today)) then
      raise exception 'Every day needs an entry';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists visit_plans_enforce_trg on visit_plans;
create trigger visit_plans_enforce_trg
  before insert or update on visit_plans
  for each row execute function visit_plans_enforce();

-- Reads are NOT open on this table (unlike most of the app, see 0004): admin reads every plan, a supervisor
-- only their own. The frontend therefore fetches it after login, never in loadAllData() (pre-login, anon).
alter table visit_plans enable row level security;

drop policy if exists visit_plans_select on visit_plans;
create policy visit_plans_select on visit_plans for select
  using (app_is_active_team_member() and (
    app_jwt_team_role() = 'admin'
    or (app_jwt_team_role() = 'supervisor' and supervisor_id = app_jwt_team_member_id())
  ));

drop policy if exists visit_plans_insert on visit_plans;
create policy visit_plans_insert on visit_plans for insert
  with check (app_is_active_team_member() and (
    app_jwt_team_role() = 'admin'
    or (app_jwt_team_role() = 'supervisor' and supervisor_id = app_jwt_team_member_id())
  ));

-- Once saved, only admin can edit or delete a plan (supervisors cannot change a saved plan).
drop policy if exists visit_plans_update on visit_plans;
create policy visit_plans_update on visit_plans for update
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin')
  with check (app_is_active_team_member() and app_jwt_team_role() = 'admin');

drop policy if exists visit_plans_delete on visit_plans;
create policy visit_plans_delete on visit_plans for delete
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin');
