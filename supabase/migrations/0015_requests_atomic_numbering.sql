-- v2-21 permanent fix (2026-09-03): closes the request-numbering bug for good, not just the
-- individual duplicates cleaned up so far. genRequestNumber() (src/sections/requests/requestsTab.js)
-- computes the "next" PPO-/PRE-/SUR- number client-side from whatever's currently loaded in
-- state.requests, then sends it on insert. That's inherently unsafe under concurrency (two staff
-- submitting around the same time can both compute the same "next" number — nothing stops it),
-- and nothing in the database enforces uniqueness either, so a duplicate can be created by any
-- future code path too, not just this one. Every duplicate found so far only surfaced later, and
-- confusingly, at Convert-to-Project time (the request number becomes the project's access code).
--
-- Same pattern as 0014's dpr_log fix: stop trusting the client for a value the database can
-- generate atomically itself. A BEFORE INSERT trigger assigns request_number server-side from a
-- dedicated sequence per prefix (mirrors reqFieldGroup()'s grouping exactly), overriding whatever
-- the client sends — Postgres sequences are inherently safe under concurrency, so two
-- simultaneous inserts can never receive the same number, no matter how stale either client's
-- view of existing requests is. A UNIQUE constraint is added as a hard backstop on top, so even a
-- future bug in the trigger logic itself could never silently reintroduce a duplicate.

create sequence if not exists req_seq_ppo;
create sequence if not exists req_seq_pre;
create sequence if not exists req_seq_sur;

-- Seed each sequence past the highest number already used in its prefix (post the v2-21/09-03
-- cleanup, so this doesn't collide with real historical data, including the just-renumbered
-- PPO-0006/PPO-0007/PRE-0013).
select setval('req_seq_ppo', greatest(1, (select coalesce(max(substring(request_number from 5)::int),0) from requests where request_number like 'PPO-%')), true);
select setval('req_seq_pre', greatest(1, (select coalesce(max(substring(request_number from 5)::int),0) from requests where request_number like 'PRE-%')), true);
select setval('req_seq_sur', greatest(1, (select coalesce(max(substring(request_number from 5)::int),0) from requests where request_number like 'SUR-%')), true);

create or replace function requests_set_request_number() returns trigger
language plpgsql
as $$
declare
  prefix text;
  seqname text;
begin
  if new.request_type in ('mockup','post-mockup','main-order','post-main-order') then
    prefix := 'PPO'; seqname := 'req_seq_ppo';
  elsif new.request_type = 'sampling-survey' then
    prefix := 'SUR'; seqname := 'req_seq_sur';
  else
    prefix := 'PRE'; seqname := 'req_seq_pre'; -- pre-mockup, pre-main-survey
  end if;
  new.request_number := prefix || '-' || lpad(nextval(seqname)::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists requests_set_request_number_trg on requests;
create trigger requests_set_request_number_trg
  before insert on requests
  for each row execute function requests_set_request_number();

alter table requests add constraint requests_request_number_unique unique (request_number);
