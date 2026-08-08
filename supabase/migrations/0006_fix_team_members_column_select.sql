-- Fixes a real bug in 0004_rls_policies.sql, caught by live testing after that migration was
-- applied: `revoke select (pin, pin_hash) on team_members from anon, authenticated` did NOT
-- actually block reading those columns. Confirmed live — `curl .../team_members?select=pin_hash`
-- with the plain anon key still returned every hash.
--
-- Root cause: Supabase's default schema setup already grants anon/authenticated a blanket
-- TABLE-LEVEL `GRANT SELECT ON team_members` (this is what lets PostgREST read any table at
-- all before RLS even enters the picture). In Postgres, a table-level SELECT grant implies
-- select on every column — a column-level REVOKE only removes access that was granted at the
-- column level in the first place; it does nothing against a broader table-level grant that's
-- still in force. So 0004's revoke was a no-op the whole time, and pin/pin_hash have been
-- fully anon-readable since that migration ran. The correct pattern is the one below: revoke
-- the table-level SELECT entirely, then grant SELECT back on an explicit safe column list.
--
-- Safe column list matches TEAM_MEMBER_PUBLIC_COLUMNS in src/data/loadAllData.js exactly —
-- update both together if team_members ever grows a new non-secret column.
revoke select on team_members from anon, authenticated;
grant select (id, name, username, role, dept, wa, active, last_login, email)
  on team_members to anon, authenticated;
