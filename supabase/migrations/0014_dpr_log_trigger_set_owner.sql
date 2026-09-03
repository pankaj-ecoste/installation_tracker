-- v2-22 follow-up (2026-09-03): closes a transitional gap that 0013 introduced. A team member
-- reported "Could not save DPR to database" the morning after 0013 shipped (Durgendra) — the
-- INSERT policy from 0013 required the CLIENT to supply created_by_id matching the caller's JWT,
-- but any browser tab/session still running the pre-0013 JS bundle (backgrounded on a phone,
-- never force-refreshed) doesn't send that field at all, so it started getting rejected where it
-- previously succeeded. Confirmed live: dpr_log's id sequence had 3 unexplained gaps (103-105)
-- that morning with no matching rows — the signature of RLS-rejected insert attempts (a rejected
-- insert still consumes the identity sequence value before the row is discarded).
--
-- Permanent fix, not just a patch for today: stop trusting the client to send created_by_id at
-- all. A BEFORE INSERT trigger derives it here, in the database, from the exact same JWT claim
-- the RLS policy already trusts (app_jwt_team_member_id()) — independent of whatever the client
-- does or doesn't send. This closes today's specific failure AND makes this entire class of
-- "client forgot to send the ownership field" bug structurally impossible for any future deploy
-- that touches this table's insert path, including one running stale cached JS.

create or replace function dpr_log_set_created_by_id() returns trigger
language plpgsql
as $$
begin
  new.created_by_id := app_jwt_team_member_id();
  return new;
end;
$$;

drop trigger if exists dpr_log_set_created_by_id_trg on dpr_log;
create trigger dpr_log_set_created_by_id_trg
  before insert on dpr_log
  for each row execute function dpr_log_set_created_by_id();

-- The insert policy no longer needs to compare created_by_id against the caller — the trigger
-- above now guarantees it's always correct (overwriting whatever, if anything, the client sent)
-- before the row is even checked. Role gating is unchanged.
drop policy if exists dpr_log_insert on dpr_log;
create policy dpr_log_insert on dpr_log for insert
  with check (app_is_active_team_member() and app_jwt_team_role() in ('admin','manager','supervisor'));
