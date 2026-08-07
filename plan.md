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
| D | RLS + storage policies + go-live env vars | ⬜ Pending |
| E | Full manual regression pass, old file vs new app, per role | ⬜ Pending |
| F | Vercel deployment | 🟡 Pipeline live early (ahead of Phase D) — `installation-tracker-five.vercel.app` deploys from `main` with `VITE_TEST_MODE=false` against the real Supabase project; verified logging in as admin shows real DB data. Team/client login are now hardened (Phase C); still needs Phase D's RLS before this is a safe production URL to share widely — anon key can still read every table directly. |

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

### Next session should start with

Phase D: RLS + storage policies + go-live env vars. Apply `0002_rls_policies.sql` (not yet
created) and `0005_storage_policies.sql` (numbering per the architecture doc — Phase C used
`0003`, so RLS should probably become `0004` to stay in filename order, double-check before
naming it). This is the phase most likely to break something real, since RLS is default-deny —
see the architecture doc's Phase D check: re-run the parity checklist **per role**, not just as
admin. Also worth doing in this phase: drop the now-unused plaintext `pin` column on
`team_members` once Phase C has run in production a while, and reconsider whether `loadAllData()`
running fully before any login (now returning less per Phase C's column restriction, but still
everything else) is still the right shape once RLS actually restricts what `anon` can read —
right now every table is still fully anon-readable pre-login except `team_members`'s
pin/pin_hash columns.
