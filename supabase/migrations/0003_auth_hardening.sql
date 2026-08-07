-- Phase C: auth hardening. Adds bcrypt PIN hashing (via pgcrypto) alongside the existing
-- plaintext `pin` column, so the team-login Edge Function can verify credentials server-side
-- instead of the current client-side plaintext comparison in src/auth/teamAuth.js.
--
-- The plaintext `pin` column is intentionally NOT dropped in this migration — it's stopped
-- being read/written by the app (Edge Functions + client code switch to pin_hash), but keeping
-- the column for now is a safety margin in case this needs to be rolled back before the app-code
-- switch is verified live. Drop it in a later cleanup migration once Phase C is fully verified.
--
-- set_member_pin_hash(): the only way pin_hash is ever written going forward. Only reachable
-- by the service_role (used exclusively from the team-set-pin Edge Function, which itself
-- checks the caller's signed JWT carries team_role: 'admin' before calling this) — execute is
-- explicitly revoked from anon/authenticated so the anon key can never call it directly, even
-- though RLS itself isn't enabled until Phase D.

create extension if not exists pgcrypto;
-- pgcrypto installs into the `extensions` schema on this project (Supabase default), not
-- `public` — the SECURITY DEFINER functions below pin an explicit search_path (standard
-- practice against search_path hijacking), so `extensions` must be listed there too or their
-- unqualified crypt()/gen_salt() calls fail even though the same calls work fine at top level
-- (where the session's own default search_path already includes it).

alter table team_members add column if not exists pin_hash text;

-- One-time backfill: hash every existing plaintext PIN so current members can still log in
-- once the app switches to pin_hash verification. Safe to re-run — only fills NULLs.
update team_members set pin_hash = crypt(pin, gen_salt('bf')) where pin_hash is null and pin is not null;

create unique index if not exists idx_team_members_username on team_members(username);

create or replace function set_member_pin_hash(p_member_id integer, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update team_members set pin_hash = crypt(p_new_pin, gen_salt('bf')) where id = p_member_id;
end;
$$;

revoke all on function set_member_pin_hash(integer, text) from public;
revoke all on function set_member_pin_hash(integer, text) from anon, authenticated;
grant execute on function set_member_pin_hash(integer, text) to service_role;

-- team_login_verify(): all bcrypt comparison happens here in Postgres (pgcrypto), not in the
-- Edge Function runtime — avoids needing a separate bcrypt library in Deno. Called exclusively
-- by the team-login Edge Function via the service_role key. Returns zero or one row; the
-- Edge Function treats "zero rows" and "wrong username" identically (same generic error),
-- so this can't be used to enumerate valid usernames.
create or replace function team_login_verify(p_username text, p_pin text)
returns table(id integer, name text, username text, role text, dept text, wa text, active boolean, last_login text, email text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
    select m.id, m.name, m.username, m.role, m.dept, m.wa, m.active, m.last_login, m.email
    from team_members m
    where m.username = lower(trim(p_username))
      and m.active = true
      and m.pin_hash is not null
      and crypt(p_pin, m.pin_hash) = m.pin_hash;
end;
$$;

revoke all on function team_login_verify(text, text) from public, anon, authenticated;
grant execute on function team_login_verify(text, text) to service_role;
