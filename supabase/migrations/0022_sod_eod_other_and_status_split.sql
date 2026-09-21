-- v2-46: SOD/EOD tracker rework (management request, see plan.md).
--   * "Not Done" is gone and there is no negative marking. New option "Other" with free text; it scores 0.
--   * Score is tracked separately for In Progress vs Not Started projects, so each row records which group the project
--     was in when it was logged, and each day freezes how many projects were in each group (like total_projects, 0020).
-- Runs as the table owner, so the data conversion below is not blocked by the insert-only RLS policies (0019).

-- 1. Drop what depends on the old values: the value/remarks checks, and the generated score (it references 'Not Done').
alter table sod_eod_log drop constraint if exists sod_eod_log_not_done_needs_remarks;
alter table sod_eod_log drop constraint if exists sod_eod_log_sod_check;
alter table sod_eod_log drop constraint if exists sod_eod_log_eod_check;
alter table sod_eod_log drop column if exists score;

-- 2. New columns.
alter table sod_eod_log add column if not exists sod_other text;
alter table sod_eod_log add column if not exists eod_other text;
alter table sod_eod_log add column if not exists project_group text;
alter table sod_eod_log add column if not exists total_in_progress smallint;
alter table sod_eod_log add column if not exists total_not_started smallint;

-- 3. Convert existing Not Done rows to Other, keeping the words "Not Done" as the free text (remarks untouched).
update sod_eod_log set sod_other = 'Not Done', sod = 'Other' where sod = 'Not Done';
update sod_eod_log set eod_other = 'Not Done', eod = 'Other' where eod = 'Not Done';

-- 4. New constraints.
alter table sod_eod_log add constraint sod_eod_log_sod_check check (sod in ('Call','Email','WhatsApp','Other'));
alter table sod_eod_log add constraint sod_eod_log_eod_check check (eod in ('Call','Email','WhatsApp','Other'));
alter table sod_eod_log add constraint sod_eod_log_sod_other_check
  check (sod <> 'Other' or length(btrim(coalesce(sod_other, ''))) > 0);
alter table sod_eod_log add constraint sod_eod_log_eod_other_check
  check (eod <> 'Other' or length(btrim(coalesce(eod_other, ''))) > 0);
alter table sod_eod_log add constraint sod_eod_log_project_group_check
  check (project_group is null or project_group in ('In Progress','Not Started'));

-- 5. Score is DB-owned: +1 per Call/Email/WhatsApp slot, 0 for Other. A row is 0, 1 or 2.
alter table sod_eod_log add column score smallint generated always as (
  (case when sod in ('Call','Email','WhatsApp') then 1 else 0 end) +
  (case when eod in ('Call','Email','WhatsApp') then 1 else 0 end)
) stored;

-- 6. The insert trigger now stamps the project's group and the day's per-group project counts, all from the projects table.
--    A project (grouped by name) is counted while any tower is Not Started / In Progress, and is "In Progress" if any
--    tower is In Progress, otherwise "Not Started" — the same rule the report UI uses.
--    (The trigger sod_eod_log_set_total_projects_trg from 0020 already points at this function name.)
create or replace function sod_eod_log_set_total_projects() returns trigger
language plpgsql
set search_path = public
as $$
declare
  n_ip integer;
  n_ns integer;
  grp text;
begin
  with g as (
    select name,
           bool_or(status = 'In Progress') as any_ip,
           bool_or(status in ('Not Started','In Progress')) as counted
    from projects
    where name is not null
    group by name
  )
  select count(*) filter (where counted and any_ip),
         count(*) filter (where counted and not any_ip)
    into n_ip, n_ns
  from g;

  select case when any_ip then 'In Progress' when counted then 'Not Started' end
    into grp
  from (
    select bool_or(status = 'In Progress') as any_ip,
           bool_or(status in ('Not Started','In Progress')) as counted
    from projects
    where name = new.project_name
  ) x;

  new.total_in_progress := n_ip;
  new.total_not_started := n_ns;
  new.total_projects := n_ip + n_ns;
  new.project_group := coalesce(grp, 'Not Started');
  return new;
end;
$$;

-- 7. Rows dated today (IST) were logged with the project statuses as they are right now, so stamp them exactly.
--    Older rows (19 and 20 Sept) cannot be split retroactively and stay NULL — the UI shows only their combined score.
with g as (
  select name,
         bool_or(status = 'In Progress') as any_ip,
         bool_or(status in ('Not Started','In Progress')) as counted
  from projects
  where name is not null
  group by name
), tot as (
  select count(*) filter (where counted and any_ip) as n_ip,
         count(*) filter (where counted and not any_ip) as n_ns
  from g
)
update sod_eod_log l
set project_group = coalesce((select case when g.any_ip then 'In Progress' when g.counted then 'Not Started' end
                              from g where g.name = l.project_name), 'Not Started'),
    total_in_progress = (select n_ip from tot),
    total_not_started = (select n_ns from tot),
    total_projects = (select n_ip + n_ns from tot)
where l.log_date = (now() at time zone 'Asia/Kolkata')::date;
