-- v2-42 follow-up 2: freeze each day's maximum score at the time it is logged.
-- The report shows a day's score as "score / (2 x projects)". If that project count were computed live for old days,
-- yesterday's "7/72" would silently become "7/70" once projects complete. So every row records how many projects
-- counted (Not Started / In Progress, once per project name — the same rule the UI uses) when it was saved.
-- DB-owned: the trigger always overwrites whatever the client sends, so the client never supplies it.
alter table sod_eod_log add column if not exists total_projects smallint;

create or replace function sod_eod_log_set_total_projects() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.total_projects := (
    select count(distinct name) from projects where status in ('Not Started', 'In Progress')
  );
  return new;
end;
$$;

drop trigger if exists sod_eod_log_set_total_projects_trg on sod_eod_log;
create trigger sod_eod_log_set_total_projects_trg
  before insert on sod_eod_log
  for each row execute function sod_eod_log_set_total_projects();

-- Existing rows predate the column; stamp them with the current count (only same-day rows exist today).
update sod_eod_log
set total_projects = (select count(distinct name) from projects where status in ('Not Started', 'In Progress'))
where total_projects is null;
