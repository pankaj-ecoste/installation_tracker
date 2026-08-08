# Installation Tracker — Plan & Progress

## Ground rule (non-negotiable, applies to every phase below)

This app's every feature, workflow, and screen was built and iterated inside Claude Artifacts by the
business team, then hand-verified by the CEO — down to very small, specific details (exact wording,
which role sees what, exact calculation rules like snag severity thresholds, the two-stage vendor
approval flow, etc.). **None of that may change, ever, as a side effect of this restructuring.**

This project is infrastructure/architecture work only: code restructuring, backend separation, a real
database, and deployment. Any time a technical necessity (e.g. moving to ES modules, hashing PINs)
would visibly change behavior, that is called out explicitly and confirmed before doing it — never
changed silently. See "Approved, non-mechanical exceptions" below for the only ones agreed so far.

## Live deployment

- **Production URL**: https://installation-tracker-five.vercel.app/ (Vercel project, auto-deploys from `main`)
- **Repo**: https://github.com/pankaj-ecoste/installation_tracker
- **Supabase project**: ref `qxxcwctbaefwhjjlmiyi` (fresh project created 2026-08-07, not the old throwaway `gklhzciipttprudfhomh`)
- Vercel env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TEST_MODE=false` (no `VITE_TODAY_OVERRIDE`) — same values as `.env.local` (gitignored, ask the user or check Vercel's dashboard if a fresh session needs them again, don't guess).

## Stack

| Part | What it is |
|---|---|
| Frontend | Vanilla JS (same string-based DOM rendering as the original), bundled with Vite — not a rewrite |
| Backend | Supabase (Postgres + Auth + Storage + RLS + Edge Functions), no custom API server |
| Deploy | Vercel (existing account/project), static Vite build |

Full architecture detail (schema design, RLS strategy, auth design, phase-by-phase verification
checks) lives in **`C:\Users\aisup\.claude\plans\cuddly-sniffing-castle.md`** — read that before
resuming work if it's not already in context. This file (`plan.md`) is the running status tracker;
that one is the design doc.

## Approved, non-mechanical exceptions (the only allowed behavior changes)

1. `TODAY` (drove every late/on-track calculation) changed from hardcoded `2026-06-25` to the real
   current date, with a `VITE_TODAY_OVERRIDE` env var for local testing.
2. Team Management's PIN-reveal eye icon and PIN-prefill-on-edit will be removed once PINs are
   hashed (Phase C) — a hash can't be reversed. The login screen itself stays pixel-identical.
3. Client Portal's "leave feedback" box bug (message never persists to Supabase) is being left
   exactly as-is, deliberately not fixed as a drive-by.

Everything else must render and behave identically to `complete.html` (kept in the repo root as the
reference/source of truth) for every role: admin, manager, supervisor, finance, viewer, dispatch_head,
plus the client portal and vendor portal.

## Status

| Phase | What | Status |
|---|---|---|
| 0 | Baseline capture of `complete.html` behavior | ✅ Done |
| A | Mechanical Vite extraction (30 files under `src/`), zero logic change | ✅ Done — verified live in browser: all 10 nav tabs, Add/Edit Project, Add Request, Add DPR, Team Management, login/logout |
| B | Fresh Supabase project + schema + migrations | ✅ Done — verified live in browser with `VITE_TEST_MODE=false` against the real project: all 8 tables created, auto-seed on first load worked, every tab (All Projects, DPR Log, Team, Material, Finance, Requests, New Vendors) renders identically to Phase A, no console errors |
| C | Auth hardening (team login + client portal via Edge Functions, signed JWT) | ✅ Done — deployed live, verified in browser against the real project |
| D | RLS + storage policies + go-live env vars | ✅ Done — applied live, verified per-role via direct API calls + real browser login (admin, finance) |
| E | Full manual regression pass, old file vs new app, per role | ⬜ Pending |
| F | Vercel deployment | 🟡 Pipeline live early (was ahead of Phase D, now caught up) — `installation-tracker-five.vercel.app` deploys from `main` with `VITE_TEST_MODE=false` against the real Supabase project. Team/client login hardened (Phase C) and RLS now enforced (Phase D) — writes are locked down per role; still worth a full Phase E regression pass before wide sharing. |

### Phase A notes (done 2026-08-07)

- Split `complete.html`'s ~4,700-line inline script into `src/lib/`, `src/data/`, `src/auth/`,
  `src/sections/**` (one file per tab/panel) using an AST-based codemod (not manual edits) — see
  memory for the approach if extending this further.
- Two real bugs found and fixed along the way:
  1. `complete.html` itself had a JS syntax error (stray line break inside a string literal at
     `"flex:2"`) — the file as originally given could not run in any real browser at all. Fixed
     (one character).
  2. The new shared `state` wrapper object collided with one pre-existing local variable also
     named `state` inside `renderDPRChecklist` — fixed by renaming the local to `checklistState`.
     Confirmed (full AST scan) this was the only such collision in the codebase.
- `TEST_MODE`/Supabase keys moved from hardcoded values to `.env.local` (see `.env.example`).
- `npm run build` and `npm run dev` both verified clean, no console errors.

### Phase B notes (done 2026-08-07)

- Fresh Supabase project created by the user (ref `qxxcwctbaefwhjjlmiyi`); URL/anon key/DB
  connection string stored in `.env.local` only (gitignored, never committed).
- `supabase/migrations/0001_baseline_schema.sql` applied via `scripts/apply-migrations.mjs`
  (`DATABASE_URL=... node scripts/apply-migrations.mjs`, same pattern as
  `att_leave_system/scripts/apply-migrations.mjs`) — all 8 tables created: `projects`, `dpr_log`,
  `team_members`, `material_lots`, `requests`, `finance_ledger`, `vendor_profiles`,
  `activity_log`. Storage bucket/policies deferred to Phase D per the architecture doc.
- Columns are a mechanical transcription of what `src/lib/mappers.js` actually reads/writes
  (the "SUPABASE SYNC LAYER"), not a redesign. jsonb fields kept jsonb with `[]`/`{}` defaults
  matching the mappers' own fallbacks.
- **One architecture-doc assumption caught and corrected before it shipped:** the doc proposed
  making `dpr_log.date` and `team_members.last_login` real `date`/`timestamptz` columns,
  reasoning the change would be invisible because `fmtDate()` reformats on render either way.
  Verified against the actual render call sites in the browser and that was false —
  `dprTab.js:62` and `teamMgmtTab.js:37` print those fields raw, no `fmtDate()`. A real
  `timestamptz` column would also have hard-rejected the literal string `'Never'` that
  `teamMgmtTab.js:119` sets for a brand-new member's `lastLogin`, breaking "Add Team Member"
  outright. Both columns were kept as `text` — exact pass-through of the display strings the
  app already produces, zero app-code changes, zero visible difference. Confirmed live: DPR Log
  shows "16 Jun 2026" (not "2026-06-16"), and a test team member with `lastLogin:'Never'` saved
  successfully. **Lesson for later phases (esp. Phase C's PIN hashing):** don't trust the
  architecture doc's "this is invisible" claims without checking the actual render/write call
  sites — verify in a real browser, not just by re-reading the plan.
- `VITE_TEST_MODE` is now `false` in `.env.local` going forward — Phase C/D build on top of the
  real database, not the mock client.

### Phase C notes (done 2026-08-07)

- `supabase/migrations/0003_auth_hardening.sql`: adds `pin_hash text` (bcrypt via `pgcrypto`),
  backfills it from the existing plaintext `pin` column, adds a unique index on `username`, and
  two `SECURITY DEFINER` Postgres functions — `team_login_verify(username, pin)` (does the
  bcrypt compare in Postgres, not in Deno) and `set_member_pin_hash(member_id, new_pin)` — both
  with `execute` revoked from `anon`/`authenticated` and granted only to `service_role`.
  The plaintext `pin` column is deliberately **not dropped yet** — kept as a rollback safety
  margin; drop it in a follow-up migration once this has run in production for a while.
- Three Edge Functions deployed (`supabase/functions/{team-login,client-login,team-set-pin}`):
  `team-login` replaces the old client-side plaintext PIN check; `client-login` replaces the
  old client-side access-code lookup against a fully-preloaded `projects` array, now looking
  the project up server-side via the service role key instead; `team-set-pin` is the only
  remaining way to set a PIN (admin-only, checked from the caller's own signed JWT claims).
- `src/lib/supabaseClient.js`'s `db` export is now `let`, not `const`, with a
  `setTeamAuthToken()` setter that reconfigures it with the signed JWT as an `Authorization`
  header after login — this is what let the ~230 existing `db.from(table)...` call sites across
  the app stay completely untouched, per the architecture doc's decision #4.
- Approved UI exception (see above) implemented: Team Management's PIN-reveal eye icon is gone;
  Edit Member's PIN field is blank-by-default with the label "New PIN (leave blank to keep
  current)"; a new member still requires a PIN up front (nothing to "keep" yet).
- **A real bug caught before it shipped, not part of the original ask:** `loadAllData()` was
  doing `select('*')` on `team_members`, which runs for *every* visitor before any login. Even
  after hashing, that `select('*')` would have kept broadcasting every member's `pin_hash` (and
  the still-live plaintext `pin` column) to every browser tab, defeating the hardening
  entirely. Fixed by selecting an explicit column list (`TEAM_MEMBER_PUBLIC_COLUMNS` in
  `src/data/loadAllData.js`) that excludes both.
- **A deploy-time bug, not caught until live verification:** the two new `SECURITY DEFINER`
  functions pin `set search_path = public` (standard practice against search_path hijacking),
  but this project's `pgcrypto` extension installs into the `extensions` schema, not `public`
  — so `crypt()` was unresolvable *inside* those functions even though the same unqualified
  call worked fine at top level (where the session's default search_path already includes
  `extensions`). `team_login_verify` silently returned zero rows for every login until this was
  caught by testing an actual login against the live project, not just re-reading the SQL.
  Fixed by pinning `search_path = public, extensions` instead. **Reinforces the standing lesson
  from Phase B: verify live, not just "should work" from reading the code.**
- Verified live (`VITE_TEST_MODE=false`, real project): `npx supabase functions deploy` needs
  no Docker (confirmed — only local `supabase functions serve` does). Team login end-to-end via
  browser + network tab (`team-login` response is only `{token, member}`, no PIN/hash anywhere);
  PostgREST accepts the custom-signed JWT (`/rest/v1/...` with the token returns 200, garbage
  token returns 401) — this also de-risks Phase D's RLS, which depends on the same JWT trust;
  `team-set-pin` correctly 403s a non-admin token and 401s an unauthenticated request (verified
  via direct calls, not the UI — didn't want to mutate a real team member's live PIN just to
  exercise the admin-success path, since the pieces it's built from were already verified
  independently: TEST_MODE's full save flow, and this function's own auth checks).
- TEST_MODE (mock client, `src/auth/teamAuth.js` / `src/auth/clientAuth.js`) deliberately keeps
  the original plaintext-comparison code path — it has no live Supabase project to call an Edge
  Function against, and this was verified separately in the browser first.

### Phase D notes (done 2026-08-08)

- `supabase/migrations/0004_rls_policies.sql`: enables RLS on all 8 tables. **Scope decision**:
  locks down WRITES only (insert/update/delete), matching the `ROLES.can` matrix in
  `src/lib/constants.js` exactly. Reads stay open (`using (true)`) on every table, unchanged
  from today — `loadAllData()` fetches once, unconditionally, before any login exists, so
  gating SELECT on the team JWT (the architecture doc's original plan) would have made every
  real user's first load come back empty. Full row-level read scoping would need redesigning
  the load sequence (fetch after login) — out of scope for this migration, and today's
  anon-can-read-everything is an already-known gap, not something this migration makes worse.
  Four JWT/role helper functions added (`app_jwt_team_role()`, `app_jwt_team_member_id()`,
  `app_jwt_team_username()`, `app_is_active_team_member()`, `app_active_team_member_name()`) —
  the "active" re-check means a deactivated member's still-unexpired token stops being able to
  write immediately, not just at next login.
  - Single-flow tables (`dpr_log`, `team_members`, `finance_ledger`, `activity_log`) got their
    exact per-action role gate replicated from the `ROLES.can` matrix.
  - Shared-flow tables (`projects`, `material_lots`, `requests`) — UPDATE deliberately uses a
    baseline "any active team member" check instead of one precise role, because their shared
    helpers (`syncProject()`, etc.) are genuinely called from many differently-permissioned
    flows (doc uploads, checklist acknowledgment, finance uploads) with no single owning
    permission — confirmed by grepping every call site before accepting this trade-off, not a
    shortcut.
  - `vendor_profiles`: INSERT is the vendor's own `auth.uid()` (real Supabase Auth, not the
    team JWT); UPDATE (the two-stage approval fields) is admin-only via the team JWT — matches
    the actual code in `newVendorsTab.js` (`isAdmin` check), not the architecture doc's looser
    "admin/finance" claim, which was wrong.
- `supabase/migrations/0005_storage_policies.sql`: the `uploads` storage bucket didn't exist
  yet on the live project (checked directly against `storage.buckets` before writing this) —
  created here as public-read (matches every existing `getPublicUrl()` call site). Write access
  restricted to the exact folder-prefix allowlist found by grepping every `uploadFiles()` call
  site (not copied from the architecture doc, which listed a folder that isn't actually used in
  the code) — team-JWT-gated for all real folders, `auth.uid()`-gated for `vendor-kyc` only
  (vendor registration uses real Supabase Auth, not the team JWT).
- **A real bug found and fixed by live testing, not caught by reading the SQL:** 0004's
  `revoke select (pin, pin_hash) on team_members from anon, authenticated` looked correct but
  was a complete no-op — confirmed live, `curl .../team_members?select=pin_hash` with the plain
  anon key still returned every hash after 0004 was applied. Root cause: Supabase's default
  schema setup already grants `anon`/`authenticated` a blanket **table-level** `SELECT` on every
  table (that's what lets PostgREST read anything pre-RLS); a table-level grant implies select
  on every column, and a column-level `REVOKE` does nothing against a broader grant that's still
  in force — it only matters if the privilege was granted at the column level to begin with.
  Fixed in `0006_fix_team_members_column_select.sql`: revoke the table-level SELECT entirely,
  then grant SELECT back on an explicit safe column list (matches
  `TEAM_MEMBER_PUBLIC_COLUMNS` in `src/data/loadAllData.js` exactly). Verified live afterward:
  `pin`/`pin_hash` selects now 401 with "permission denied for table team_members", the safe
  column list still returns data, and `select=*` also now correctly fails (confirms the app's
  own code, which never uses `select=*` here, is unaffected). **General lesson: on Supabase,
  column-level REVOKE is only meaningful after first revoking the table-level grant — check
  `information_schema.role_table_grants`, not just `column_privileges`, before trusting a
  column-level restriction actually does anything.**
- **Verification approach**: rather than only clicking through the UI per role (slow, easy to
  miss a case), logged in as all 5 seeded team roles (admin/neelam/shubham/finance/sales — no
  `dispatch_head` account is seeded, that role's `material_lots` INSERT grant is untested
  against real data but matches the same pattern verified for `admin`) via the real
  `team-login` Edge Function to get real JWTs, then hit PostgREST directly with each token to
  confirm every INSERT/UPDATE against every table matches `ROLES.can` exactly — including a
  correct ownership-scoped case (`shubham`, the DPR's own supervisor, can update it; `finance`,
  who isn't the owner and isn't admin/manager, gets silently filtered to 0 rows). All test rows
  cleaned up afterward via a direct `DATABASE_URL` connection (RLS doesn't apply there). Then
  confirmed live in an actual browser per [[feedback_verification_approach]]: logged in as
  `admin` (dashboard renders fully, edit/delete icons visible, no console errors beyond a
  pre-existing benign GoTrue multi-instance warning) and `finance` (same dashboard, edit/delete
  icons correctly absent per `editProject:false`/`deleteProject:false`). Full per-role UI
  walkthrough (supervisor DPR edit, dispatch_head material lots, vendor/client portals) is
  Phase E's job, not repeated here.
- `TODAY` was already switched to the real date with no override, both locally (`.env.local`)
  and on Vercel (recorded in Phase B/F setup) — nothing further needed for that part of Phase D.

### Next session should start with

Phase E: full manual regression pass, `complete.html` vs the new app, per role — the final gate
before calling this production-ready and sharing the URL widely. Also worth doing opportunistically:
drop the now-unused plaintext `pin` column on `team_members` (has been dead since Phase C, RLS
doesn't change that calculus), and add a real `dispatch_head` team member (none exists in the
current seed data) so that role's `material_lots` INSERT policy gets exercised against real data,
not just reasoned about by analogy to admin.
