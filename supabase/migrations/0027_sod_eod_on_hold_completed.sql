-- v2-61: SOD/EOD tracker — count On Hold and Completed projects the same way as In Progress / Not Started
-- (management request, see plan.md). Adds two more frozen per-day counts and widens the group the trigger can
-- stamp on each row. No backfill: On Hold/Completed weren't selectable before this ships, so no past row can
-- belong to either group — older days simply show no pill for them (count 0), same as today before any entry.

alter table sod_eod_log add column if not exists total_on_hold smallint;
alter table sod_eod_log add column if not exists total_completed smallint;

alter table sod_eod_log drop constraint if exists sod_eod_log_project_group_check;
alter table sod_eod_log add constraint sod_eod_log_project_group_check
  check (project_group is null or project_group in ('In Progress','Not Started','On Hold','Completed'));

-- Same function name as 0020/0022 (the insert trigger already points at it) — just widened to 4 groups.
-- A project (grouped by name) is counted while any tower is Not Started / In Progress / On Hold / Completed
-- (CNC / Only Supply still excluded), and its group is whichever of those is "most active" when it has towers
-- in more than one: In Progress > Not Started > On Hold > Completed.
create or replace function sod_eod_log_set_total_projects() returns trigger
language plpgsql
set search_path = public
as $$
declare
  n_ip integer;
  n_ns integer;
  n_oh integer;
  n_cm integer;
  grp text;
begin
  with g as (
    select name,
           bool_or(status = 'In Progress') as any_ip,
           bool_or(status = 'Not Started') as any_ns,
           bool_or(status = 'On Hold') as any_oh,
           bool_or(status = 'Completed') as any_cm,
           bool_or(status in ('Not Started','In Progress','On Hold','Completed')) as counted
    from projects
    where name is not null
    group by name
  )
  select count(*) filter (where counted and any_ip),
         count(*) filter (where counted and not any_ip and any_ns),
         count(*) filter (where counted and not any_ip and not any_ns and any_oh),
         count(*) filter (where counted and not any_ip and not any_ns and not any_oh and any_cm)
    into n_ip, n_ns, n_oh, n_cm
  from g;

  select case
           when any_ip then 'In Progress'
           when any_ns then 'Not Started'
           when any_oh then 'On Hold'
           when any_cm then 'Completed'
         end
    into grp
  from (
    select bool_or(status = 'In Progress') as any_ip,
           bool_or(status = 'Not Started') as any_ns,
           bool_or(status = 'On Hold') as any_oh,
           bool_or(status = 'Completed') as any_cm
    from projects
    where name = new.project_name
  ) x;

  new.total_in_progress := n_ip;
  new.total_not_started := n_ns;
  new.total_on_hold := n_oh;
  new.total_completed := n_cm;
  new.total_projects := n_ip + n_ns + n_oh + n_cm;
  new.project_group := coalesce(grp, 'Not Started');
  return new;
end;
$$;
