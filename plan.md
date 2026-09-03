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
| E | Full manual regression pass, old file vs new app, per role | ✅ Done (2026-08-08) — two real production bugs found and fixed, pushed and live. See notes below. |
| F | Vercel deployment | ✅ Done — `installation-tracker-five.vercel.app` deploys from `main` with `VITE_TEST_MODE=false` against the real Supabase project. All Phase E + mobile-audit + feature fixes are live. This is the final go-live; the team is already using it in production (confirmed via real data — see mobile-audit/geolocation notes below). |

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

### Phase E notes (done 2026-08-08)

Full walkthrough per role against the real Supabase project (mostly via local dev pointed at
production data, with the two fixes below also re-verified against the deployed
`installation-tracker-five.vercel.app` URL): admin, manager (neelam), supervisor (shubham),
finance, sales/viewer, a newly-seeded dispatch_head (see below), client portal (access-code
login, Gantt, the known feedback-box bug confirmed still present and left as-is), and vendor
portal (register → admin review queue → login). Nav tabs, edit/delete icon visibility, and
scoped project counts matched the `ROLES.can` matrix exactly for every role. No unexpected
console errors beyond the pre-existing benign GoTrue multi-instance warning.

**Opportunistic seed**: added a real `dispatch_head` team member (`ravi.dispatch`, Ravi Kumar)
via the live Team Management UI as admin — this exercised the Add Team Member flow live (see bug
#1) and gives that role real data to test against, not just reasoning by analogy to admin.

**Two real production bugs found by this pass, both fixed and pushed live (commits `d1bec45`,
`2459605`):**

1. **Add Team Member was completely broken in production** (admin role, Team Management →
   `+ Add Member`). `saveMember()`'s insert used `.insert({...}).select().single()` — the
   trailing bare `.select()` defaults to `select=*`, which requires column-level SELECT on every
   column of the row, including `pin`/`pin_hash`. Those were revoked from
   `anon`/`authenticated` in Phase D's `0006_fix_team_members_column_select.sql`, so every
   attempt 403'd with `permission denied for table team_members`, silently and completely
   blocking admin from ever adding a new team member since Phase D shipped. Fixed by scoping the
   post-insert `.select()` to the same public column list `loadAllData()` already uses (now
   exported as `TEAM_MEMBER_PUBLIC_COLUMNS` from `src/data/loadAllData.js`). TEST_MODE keeps
   requesting `select('*')` since the mock client doesn't enforce column grants and needs `pin`
   back for its own local login check. Verified live: added `ravi.dispatch` successfully, no
   console errors, `pin_hash` confirmed set via a follow-up login as that account.
2. **Vendor self-registration was completely broken in production**, for two independent,
   stacked reasons:
   - The KYC document `<input type=file>` `onchange` handlers uploaded to the `vendor-kyc`
     storage folder immediately on file selection — before the vendor's account exists. Phase
     D's storage policy for that folder requires `auth.uid() is not null`, so every such upload
     403'd (`new row violates row-level security policy`), and registration could never get past
     "Please upload: MSME Certificate" (the missing-doc validation, since the upload always
     failed). Fixed by staging the picked `File` objects in a new `state.vendRegFiles` map and
     only calling `uploadFiles()` after `signUp()` resolves, when a real session exists.
   - Even after that fix, uploads (and the pre-existing `vendor_profiles` insert right after
     signUp) still failed the same way, because this Supabase project has "Confirm email"
     enabled — `signUp()` creates the `auth.users` row but returns no active session until the
     email is confirmed, so `auth.uid()` was still null immediately afterward. **User decision
     (2026-08-08): disable "Confirm email" in the Supabase project's Auth settings** (done by
     the user via the dashboard) rather than the two code-heavier alternatives (service-role
     Edge Function for the whole registration write, or splitting registration into a
     confirm-then-complete-profile two-step flow) — chosen because nothing else in this app
     relies on verified vendor emails today, and unverified registrations still sit in the
     existing admin-approval queue before being trusted. Verified live end-to-end after the
     toggle: registered a real test vendor, all 5 KYC docs uploaded with real public URLs,
     `vendor_profiles` row saved, logged in as that vendor successfully, and confirmed the
     registration appeared in Admin's New Vendors → "Stage 1: Admin review" queue with all 5
     document links present. Test request/vendor rows cleaned up afterward via direct
     `DATABASE_URL` access (RLS doesn't apply there); five small dummy KYC text files were left
     in the `uploads/vendor-kyc/` storage folder from the successful test run (harmless, low
     priority to clean up).

**Still flagged as opportunistic, not yet done**: drop the now-unused plaintext `pin` column on
`team_members` (dead since Phase C, RLS doesn't change that calculus).

### Mobile audit (2026-08-08)

User flagged that this app must work well on phones. Audited at a real 390×844 mobile viewport
(chrome-devtools MCP's device emulation, `deviceScaleFactor:2, isMobile:true`) using a scripted
DOM overflow check (`document.documentElement.scrollWidth > clientWidth`) rather than eyeballing
screenshots — faster and catches every screen, not just the ones photographed. Covered: client
portal login, team login, vendor portal login/register, all 10 admin nav tabs, Add/Edit Project
(incl. the milestones editor), Add Team Member, New Request (Pre-Mockup and Main Order field
sets), Add DPR, and the client portal's post-login project view.

**Two real mobile bugs found and fixed** (the CSS in `app.css` already had a `@media
(max-width:640px)` block from the original `complete.html` — these were gaps in it, not a
missing mobile story):
1. **Four `.team-table` instances had no horizontal-scroll wrapper**, unlike every other use of
   that class in the codebase (`dprTab.js`, `requestsTab.js`, `financeTab.js` all already wrap
   it in `<div style="overflow-x:auto">`). Team Management's member list and all three Dashboard
   tables (developer breakdown, project breakdown, vendor productivity) forced the *entire page*
   to scroll sideways on a phone instead of just the table. Fixed by adding the same wrapper div
   at those four call sites (`teamMgmtTab.js`, `dashboardTab.js` ×3) — zero desktop visual
   change, `overflow-x:auto` is a no-op when content already fits.
2. **The milestones editor (Add/Edit Project) used a fixed-width flex row** (140px × 2 date
   inputs + 60px gap + 20px checkbox/delete, no wrap) that's wider than any phone screen,
   forcing the same page-wide horizontal scroll. Since these are inline-styled JS template
   strings (not CSS classes), added `.ms-row`/`.ms-label`/`.ms-date` classes alongside the
   existing inline styles (both milestone renderers — new-project form and existing-project
   edit) and a mobile-only override in `app.css` (`flex-wrap:wrap`, label forced to its own
   line, date inputs to ~50% width) — again additive-only, no desktop change.

Both verified fixed via the same scripted overflow check after rebuilding, on the actual
milestone data (4 real milestones) not just an empty form.

**Not yet re-checked at mobile**: Finance ledger's per-row edit panel, New Vendors admin-review
cards, and the vendor portal's own dashboard (all reasoned to be low-risk — simple layouts,
already using the flexible `flex:2`/`flex:1` pattern elsewhere in the codebase — but not
explicitly screenshot/overflow-tested this session).

All of the above (Phase E fixes + mobile-audit fixes) are pushed to `main` and live in
production as of 2026-08-08.

### Feature add: address alongside GPS coordinates (2026-08-08)

Team feedback (relayed by the user): when a supervisor captures GPS location (site visit report,
DPR material-arrival acknowledgment), the app only showed raw coordinates — team wanted the
resolved street address shown too. Both capture points (`captureGeoLocation()` in
`requestsTab.js` for the visit-report flow, `captureDPRArrivalGeoLocation()` for DPR material
arrival) share a new `reverseGeocodeAddress(lat,lng)` helper that calls OpenStreetMap's free
Nominatim reverse-geocoding API (no key/billing setup needed) and appends the result:
`"19.076000, 72.877700 — Shahid Major Kaustubh Rane flyover, ... Mumbai, ... India"`. Best-effort
only — coordinates are captured and shown immediately; if the address lookup is slow, offline,
or fails, the UI just keeps the coordinates-only string, never blocks the capture itself. Both
`geoLocation` fields are stored as plain text (one inside a request's `details` jsonb blob, one
as `material_lots.arrival_geo_location`, a real `text` column) and only ever displayed as raw
text elsewhere in the app — no schema migration needed, no downstream code parses the "lat, lng"
format expecting it to stay exactly that shape.

Verified live against the real Nominatim API (stubbed `navigator.geolocation` to a known Mumbai
coordinate via `Object.defineProperty` since real GPS isn't available in this environment) —
confirmed the address resolves and displays correctly in the actual Visit Report form UI. Did
**not** save this into the real in-progress request I used to test it (`PRE-0001`, genuine team
data — the team is now actively using the app in production) — cancelled out without persisting,
confirmed via direct DB read afterward that `details->geoLocation` is still `null` on that row.

This commit is pushed and live.

## Project status: the restructuring itself (Phases 0–F) is complete and live in production

All 6 phases are done; the app is deployed, hardened, regression-tested per role, mobile-checked,
and the team is actively using it (confirmed via real data appearing — see PRE-0001 above). What
remains is not a phase of this plan, just optional low-priority cleanup, tracked here so it isn't
lost:

- Drop the now-dead plaintext `pin` column on `team_members` (superseded by `pin_hash` since
  Phase C; nothing reads it anymore, RLS doesn't change that calculus).
- A handful of screens flagged but not explicitly mobile-tested (reasoned low-risk, not
  zero-risk): Finance ledger's per-row edit panel, New Vendors admin-review cards, vendor
  portal's own dashboard.
- The client portal's "leave feedback" box bug (message never persists) — left as-is
  deliberately per the approved exceptions list, not forgotten.

None of these block calling the project finished. Next session should start by asking the user
what's next, not by assuming there's unfinished restructuring work.

---

## v2: team-driven data-entry tweaks (starting 2026-08-12)

The restructuring project (Phases 0–F, above) is done and the app is live in production with the
team actively using it. This new track is different in kind: small, specific changes to how data
gets filled in day-to-day, requested directly by the team as they use the app (not architecture
work). **Same non-negotiable ground rule carries over**: no feature/flow changes except the exact
one requested — anything else stays pixel/behavior-identical. Each change gets logged here before
being implemented, confirmed with the user first, then verified live.

### v2-1: Vendor KYC uploads made optional (2026-08-12)

**Ask**: On the vendor portal's registration form (KYC Documents section — MSME Certificate, GST
Certificate, PAN Card, TAN Certificate, Cancelled Cheque), all 5 file uploads were mandatory. Team
wants them optional — registration should submit successfully even with zero files attached.

**Root cause**: Not an HTML `required` attribute — two JS checks in `src/auth/vendorAuth.js`
enforced it: `vendorRegister()` blocked submission pre-signup if any doc wasn't staged
(`missingDoc`, line 38), and blocked again post-signup if any staged upload hadn't produced a URL
(`missingUpload`, line 50). Removed both checks; the upload loop now only attempts files the
vendor actually selected, skipping the rest.

**Confirmed no downstream flow change**: the admin "New Vendors" review tab
(`newVendorsTab.js:24-27`) already rendered each KYC doc as either a clickable link or a red "❌
X missing" badge per-document — built to handle absence gracefully already. Admins will now just
see more ❌ badges for vendors who skip uploads; no code change needed there.

### v2-2: Fixed "old data reappears" bug on Edit Project (2026-08-12)

**Report**: Staff edit a project and save; later, opening "Edit Project" on that same project
shows the old (pre-edit) values instead of what was just saved.

**Root cause, confirmed by live reproduction against the real production database** (using two
separate logged-in browser sessions, admin/1234): this app fetches all data exactly once when a
browser tab first loads (`main.js` → `loadAllData()`), and never re-fetches after that — no
polling, no realtime subscription. So if Session A has been open since before Session B saved a
change to a project, Session A's in-memory copy is stale, and opening Edit Project in Session A
populates the form from that stale copy. Reproduced exactly: Tab B edited a project's Drive Link
and saved (confirmed persisted in the DB); Tab A, open since before that save, then opened Edit
Project on the same project and saw the old (empty) value — the literal bug report. This can
happen soon after another save or much later — purely a function of how long the viewing tab has
been open, not a database failure.

**Fix**: `openEditProject()` (`src/sections/projects/addEditProject.js`) now re-fetches that one
project's current row from Supabase before populating the form, replacing this tab's local copy
if it differs. Adds one network round-trip when opening Edit — no visible behavior change
otherwise, and TEST_MODE (mock client, no live DB) skips it entirely.

**Secondary bug fixed alongside it**: `saveProject()`'s edit path called `syncProject()` but
never checked whether the save actually succeeded — unlike two sibling functions in the same file
(`saveSnagQuick`, `saveMilestonesOnly`) which already roll back and show an error on failure. Now
matches that pattern: a failed save rolls back the optimistic local update and shows "Could not
save" instead of silently closing the panel as if it worked. This was a real gap (found by code
reading, not reproduced live) but not the cause of this specific report — the live reproduction
above showed the underlying database writes succeeding correctly.

**Known related gap, not fixed here (flagging, not silently expanding scope)**: the same
"loads once, never refreshes" architecture underlies every other edit panel in the app (Update
Progress, Milestones, Snags, etc.) — any of them could show stale data the same way if a tab's
been open since before another session's save. Only Edit Project was reported and fixed. Revisit
if the same complaint surfaces elsewhere.

Verified live against the real Supabase project (`qxxcwctbaefwhjjlmiyi`) using the real admin
account, reproducing the exact bug before the fix and confirming it resolved after, on a real
project (id 3, "Arun Seth — Supply only") using its Drive Link field as the test value — reset
back to its original empty value afterward, no test data left behind.

### v2-3: Fixed silent data loss in Products/Vendors/Tower/Milestones/DPR/Lot row fields (2026-08-12)

**Report**: Admin filled in the "18mm Grille" product's quantity when creating/editing "Ashiana
(Jaipur) — Tower 2", but the project card shows "18mm Grille — 0 sqft" and Planned is 0 sqft.

**Root cause, confirmed live**: much broader than just this one field. Every row-editor field in
three different forms — **Add/Edit Project** (Products name+qty, Vendors name+role, Tower name,
Milestones selected/planned/actual), **DPR** (cumulative qty, today-installed qty, location), and
**Material Lot dispatch** (product, bundle count, qty dispatched) — types into the field via an
inline handler like `oninput="formProducts[i].qty=this.value"`. That bare `formProducts` name was
a real top-level global before the app's original ES-module split (see
[[project_restructuring_overview]] for that codemod); after the split it only exists as
`state.formProducts`, and nothing ever re-exposed the bare name on `window`. The AST-based codemod
that did the rename couldn't see these references — they live inside JS string literals, not real
code, until the browser evaluates them as onclick/oninput attributes at runtime. Confirmed via
console: typing into the Qty field threw `ReferenceError: formProducts is not defined` on every
keystroke. The number stays visible in the input box regardless (that's just the browser's native
display, independent of the app's JS), which is why it looked like data entry worked — but the
value never reached `state`, so Save persisted whatever was there before (blank/0).

**Fix**: `src/utils/domGlobals.js` (the file already dedicated to exposing things inline handlers
need) now also defines live getter/setter properties on `window` for the seven affected bare
names: `formProducts`, `formVendors`, `formTowers`, `formMilestones`, `pendingMilestones`,
`dprProducts`, `lotItems`. Each getter/setter proxies straight to the matching `state.X`, so these
bare references now always resolve to the live, current array — no other code changed.

Verified live against the real Supabase project, all three affected forms, without persisting any
fabricated data to real records: Edit Project's Products qty field (project id 11, the actual
"Ashiana (Jaipur) — Tower 2" from the report) now updates `state.formProducts` correctly when
typed into (confirmed via console, then cancelled without saving); Material Lot's bundle-count
field and DPR's cumulative-qty field both confirmed the same way. No console errors on any of the
three after the fix, versus the reproducible `ReferenceError` before it.

**Not yet fixed**: the real "Ashiana (Jaipur) — Tower 2" project (id 11) still has its 18mm
Grille qty saved as blank from before this fix — the fix prevents new instances of this, it
doesn't retroactively repair already-broken data. Needs the correct quantity from the user, then
either they re-enter it now that it actually saves, or tell it to me directly to enter.

### v2-4: Fixed "Could not save — requests table SQL" error on New Request (2026-08-12)

**Report**: Shalini (Sales/Viewer) got "Could not save — check console. (Have you run the
requests table SQL in Supabase yet?)" submitting a new Post-PO request, with all required fields
and documents filled in. Reported as happening in production while the team is actively using
the app.

**Root cause, confirmed by live reproduction against the real production database**: `requests.id`
is a real Postgres identity column, but `saveRequest()` computed its own "next id" client-side
(`state.nextRequestId = max(existing ids) + 1`, calculated once when the page loads and never
refreshed — same underlying architecture as [[v2-2]]) and passed it explicitly on insert. Two
browser tabs that both loaded before either one saved independently compute the *same* "next id"
— the first insert succeeds, the second collides on the primary key. Reproduced exactly: two
sessions both starting from `nextRequestId=4`, first save succeeded, second failed with the
identical error text from the report, traced to Postgres error `23505 duplicate key value
violates unique constraint "requests_pkey"`. Given multiple Sales/Viewer staff are submitting
requests concurrently today, this was always going to surface under real usage.

**Fix**: `saveRequest()` (`src/sections/requests/requestsTab.js`) no longer supplies a client-
computed `id` on insert — Postgres's own identity column assigns it atomically, so two concurrent
inserts can never collide regardless of how stale either tab's local counts are. Verified live:
re-ran the identical two-tab concurrent-save reproduction after the fix — both saved successfully
with distinct database ids (no error, no collision).

**Known related gap, not fixed here (flagging per the same policy as v2-2's note)**: the exact
same unsafe pattern (`id: state.nextXId` on insert) exists in 7 other places — `dpr_log`
(saveDPR), `finance_ledger` (saveFinanceRow), `material_lots` (saveLot), `team_members`
(saveMember), and `projects` (three separate insert call sites: saveProject's "create new" path,
and two in requestsTab.js's convert-request-to-project flows). Any of these could fail the exact
same way under concurrent use — it just hasn't been reported yet. Same fix applies (drop the
client-supplied `id`, let the identity column assign it) — worth doing proactively given this is
live production and it's the same one-line change repeated, but holding off until confirmed with
the user given the number of files touched.

**Also noticed, cosmetic only, not fixed**: `genRequestNumber()`'s human-readable label (e.g.
"PRE-0004") is still computed client-side from a local count and can display as a duplicate
across two concurrent submissions — confirmed during the same test (both got "PRE-0004", DB ids 4
and 5). This does not block saving and is unrelated to the primary-key collision; separate,
lower-priority issue.

Verified against real production data throughout, no test data left behind — both reproduction
attempts (before and after the fix) created rows that were removed via a direct Postgres
connection afterward (RLS has no delete policy on `requests`, so cleanup needed `DATABASE_URL`
directly rather than the app's own client).

### v2-4 continued: applied the same fix to all 7 remaining insert sites (2026-08-12)

Per the user's decision to close this proactively rather than wait for each to break in
production: applied the identical fix (drop the client-supplied `id`, let the Postgres identity
column assign it) to every other insert call site with the same pattern —
`dpr_log` (saveDPR, `dprTab.js`), `finance_ledger` (saveFinanceRow, `financeTab.js`),
`material_lots` (saveLot, `materialTab.js`), `team_members` (saveMember, `teamMgmtTab.js`), and
`projects` (three call sites: saveProject's create-new path in `addEditProject.js`, and two in
`requestsTab.js` — `confirmConvertRequestToProject` and the CSV-import loop).

**Critical catch made during verification, would have been a serious regression if missed**:
every one of these tables' Postgres identity sequences had never actually advanced, because every
insert since the app went live supplied its own explicit `id` (identity columns only auto-advance
their sequence on inserts that omit `id`). Checked all 6 sequences directly against real data:
`projects`' sequence was at 5 while real rows go up to id 67; `team_members`' sequence was at 7
against real rows up to 18. Left alone, the code fix above would have made every single new
project or team member insert **fail** (not just under concurrent access — deterministically,
every time) until ~60+ consecutive failed attempts happened to walk the sequence forward past the
real max id — a much worse regression than the bug being fixed. (`dpr_log`, `material_lots`,
`requests` happened to already have sequences sitting ahead of their real max ids, purely by
coincidence of this session's own earlier test inserts; `finance_ledger` was empty. Relying on
that coincidence for `projects`/`team_members` would not have held.)

**Fix applied**: ran `select setval(pg_get_serial_sequence(table,'id'), max(id), true)` directly
against the production database (via `DATABASE_URL`, since this is bookkeeping RLS has no path
for) for all 6 tables, bringing every sequence to exactly the real current max id (or reset to
start at 1 for the empty `finance_ledger`). This is a one-time, zero-behavior-change correction —
no schema change, no data change, just telling Postgres's own auto-numbering where the existing
data actually ends.

Verified live, one insert per table, all six: `dpr_log` (id 3→4 correctly, via saveDPR),
`material_lots`, `finance_ledger`, `requests` (already verified above), `team_members` (id
18→19, via saveMember, including its PIN-hash follow-up write), and `projects` (id 67→68,
inserted directly matching `saveProject`'s create-new payload shape). Every test row was deleted
afterward via `DATABASE_URL` directly (none of these tables have a delete RLS policy, so the
app's own client can't remove them — expected, matches existing `requests`/`projects` delete
gaps already known from earlier phases). Final state confirmed: all 6 sequences sit at or above
their real max id, production data otherwise completely unchanged from before this session.

### v2-5: Finance role can now add ledger rows, not just edit them (2026-08-13)

**Request from the team**: the Finance tab has a "+ Add ledger row" button (and its per-project
"+ Add RA Bill" twin). Admin sees it. A staff member logged in under the **Finance** role does
not, even though the Role Permissions grid (Team Management tab) shows "Edit finance data" as ✅
for Finance. The team wants Finance staff to be able to add new ledger rows, not just edit
existing ones.

**Root cause**: "Add ledger row" was never wired to `editFinance` (the permission shown/toggle-
able in the Role Permissions grid). It's gated by a separate, hardcoded `addFinanceRow`
permission that isn't in `PERM_LABELS` at all — so it never appears in the admin's permissions
table and admin has no way to grant it. It's `true` only for `admin`; `manager` and `finance`
both have it hardcoded `false`, matching a deliberate decision recorded in
`supabase/migrations/0004_rls_policies.sql`'s finance_ledger comment ("admin only... manager/
finance can edit rows but not add new ones; preserved exactly as specified even though it looks
asymmetric") from the RLS-hardening phase. The team is now explicitly changing that decision for
Finance.

**Scope of this change**: grant `addFinanceRow` to the `finance` role only (not `manager`/
`dispatch_head`/others) — that's the specific gap reported. Two layers both currently block
Finance, both need the change:
1. Front end — `ROLES.finance.can.addFinanceRow` in `src/lib/constants.js` (controls the
   "+ Add ledger row" / "+ Add RA Bill" button visibility via `canDo('addFinanceRow')` in
   `teamAuth.js` and `financeTab.js`, and the same check inside `openAddFinanceRow()`).
2. Database — the `finance_ledger_insert` RLS policy in `0004_rls_policies.sql` currently only
   allows `app_jwt_team_role() = 'admin'`. Even with the button visible, a Finance user's insert
   would still be rejected by Postgres. New migration `0007_finance_ledger_insert_finance_role.sql`
   adds `'finance'` to the allowed roles for INSERT (matches the existing UPDATE policy, which
   already allows `admin`, `manager`, `finance`).

**Not changed**: `manager`'s `addFinanceRow` stays `false` (not part of this request); the RLS
UPDATE policy (already includes finance, unchanged).

**Verified**: migration `0007` applied to the live production database via
`scripts/apply-migrations.mjs`. RLS confirmed directly against production in a rolled-back
transaction (simulated JWT claims per role, no row persisted): `finance` role insert now
succeeds, `admin` still succeeds, `supervisor` still correctly blocked. Then verified live in the
browser logged in as an actual Finance-role team member (Rashi) against the dev server pointed at
production data: both the top-level "+ Add ledger row" button and the per-project "+ Add RA Bill"
button are now visible and open the same "Add Ledger Row" panel Admin sees — cancelled out without
saving, no test data left in `finance_ledger`.

### v2-6: "Remember Me" on all three login flows (starting 2026-08-18)

**Request from the team**: after refreshing the app, users are always dropped back to the login
screen and have to re-enter credentials — even seconds after logging in. The team wants a
"Remember Me" checkbox on login so that, when checked, a refresh keeps them signed in.

**Investigation before designing**: none of the three login flows (Team, Client Portal, Vendor
Portal) persist anything today. `state.currentUser`, `state.loggedInClient`, and the team JWT
(`currentTeamToken` in `src/lib/supabaseClient.js`) are all plain in-memory JS state, wiped on
every reload. `src/main.js`'s `init()` unconditionally shows the client-login screen first; the
one `if(state.currentUser) showTeamDashboard()` line is dead code on a fresh page load. Vendor
login uses real Supabase Auth (`db.auth.signInWithPassword`), which *would* persist to
`localStorage` by default (Supabase's own default), but `main.js` never checks for an existing
session on startup, so today it has no visible effect either — confirmed all three flows
currently force a fresh login on every refresh, with no exceptions.

**Decisions finalized with the team before building (2026-08-18)**:
1. **Scope**: all three flows get the checkbox — Team, Client Portal, Vendor Portal.
2. **Duration**: a remembered login stays valid for **30 days**.
3. **Unchecked behavior**: unchanged from today — nothing is persisted, a refresh always asks
   for credentials again. Checking the box is what changes behavior, not the default.

**Design**:
- **Team login**: `team-login` Edge Function currently signs a fixed 12h JWT. Add an optional
  `remember` flag to the request body; sign a 30-day-expiry JWT when true, keep 12h otherwise. On
  the client, only write `{token, member, expiresAt}` to `localStorage` (`ecoste_team_session`)
  when the checkbox was checked — unchecked logins keep today's in-memory-only behavior exactly.
  `main.js` checks this key on startup (before showing any login screen) and, if present and
  unexpired, restores `setTeamAuthToken()` + `state.currentUser` and jumps straight to
  `showTeamDashboard()`. Expired/invalid entries are cleared. `lockTeam()` clears the key on
  logout.
- **Client portal**: there's no server token here, just a one-time access-code check against
  `client-login`. When remembered, store `{name, accessCode, expiresAt}` in `localStorage`
  (`ecoste_client_session`) — never the returned project data directly. On startup, if present
  and unexpired, silently replay the same `client-login` call to re-validate and refresh project
  data (so a revoked/changed access code can't be used from stale local storage). `clientLogout()`
  clears the key.
- **Vendor portal**: reuses Supabase Auth's own session handling rather than inventing a parallel
  mechanism. Mirrors the existing `setTeamAuthToken()` pattern of swapping the shared `db` client:
  before calling `signInWithPassword`, reconfigure `db` with `storage: localStorage` if
  remembered, or an in-memory-only storage adapter if not — so an unremembered vendor session
  never touches `localStorage` at all and is lost on refresh, matching the other two flows exactly.
  `main.js` checks `db.auth.getSession()` on startup (after the team/client checks) to restore
  `state.currentVendor` and show the vendor portal.
- **TEST_MODE**: no live Supabase project to call, so team/client "remember" in TEST_MODE stores
  the in-memory member/project object directly instead of a real token — dev-only convenience,
  not used in production.
- **UI**: one checkbox added per login form (`tl-remember`, `login-remember`, `vend-remember`),
  unchecked by default, placed directly under the password/PIN/access-code field. No other
  markup on the login screens changes.

**Built (2026-08-18)**:
- `src/lib/rememberMe.js` (new) — shared localStorage read/write/clear + 30-day expiry helpers
  for the Team and Client sessions.
- `supabase/functions/team-login/index.ts` — accepts `remember` in the request body, signs a
  30-day JWT when true (12h otherwise, unchanged default). Deployed to production.
- `src/lib/supabaseClient.js` — added `setVendorAuthStorage(remember)`, which swaps `db` to a
  plain in-memory storage adapter for an unremembered vendor login (so its Supabase Auth session
  never touches `localStorage`), mirroring the existing `setTeamAuthToken()` client-swap pattern.
  Also added a `getSession()` stub to the TEST_MODE mock client's `auth` object so
  `restoreVendorSession()` has something safe to call in dev.
- `src/auth/teamAuth.js` / `clientAuth.js` / `vendorAuth.js` — each login function now reads its
  checkbox and saves/clears the appropriate stored session; each gained a `restore*Session()`
  export for startup; `lockTeam()` / `clientLogout()` / (vendor sign-out already clears its own
  Supabase Auth session) clear the stored session on logout.
- `src/main.js` — on startup, tries `restoreTeamSession()` → `restoreClientSession()` →
  `restoreVendorSession()` in order (at most one flow is ever logged in at a time) before
  falling back to the client-login screen.
- `index.html` — one "Remember me" checkbox added to each of the three login forms
  (`tl-remember`, `login-remember`, `vend-remember`), unchecked by default.

**Verified live in the browser (TEST_MODE, `localhost:5174`)**:
- Team login (admin/1234) with the box checked → refresh → stayed on the dashboard, no re-login.
  `localStorage.ecoste_team_session` held the member + a 30-day `expiresAt`.
- Team logout ("Lock") → `ecoste_team_session` cleared.
- Client portal login (AJMERA-BW) with the box checked → refresh → stayed on the client portal
  (re-validated the access code against the mock backend rather than trusting stored data).
- Client sign-out → `ecoste_client_session` cleared.
- Team login **unchecked** → nothing written to `localStorage` → refresh → back at the login
  screen, exactly matching pre-existing behavior (the agreed default-unchanged requirement).
- `npm run build` succeeds with no errors.
- The live production Edge Function deploy (`npx supabase functions deploy team-login`) was
  confirmed successful, and the production dev server (`localhost:5173`, real Supabase project)
  still loads the client-login screen correctly with the new checkbox present.

**Not verified live**: Vendor Portal's remember-me swap (`setVendorAuthStorage`) is a no-op in
TEST_MODE by design (real Supabase Auth session storage doesn't exist in the mock client), so it
can only be exercised against a real vendor account on the live project. Skipped for this
session per the team's call — the mechanism mirrors `setTeamAuthToken()`'s already-proven
client-swap pattern exactly, but hasn't been click-tested end-to-end. Worth a real login test
next time a vendor account is available.

### v2-7: 5 more document uploads on Add/Edit Lot Dispatch (starting 2026-08-18)

**Request from the dispatch team**: the "Add Lot Dispatch" form (Material tab) today has one
upload field, "LR copy (Lorry Receipt)" — tap opens the rear camera directly to photograph the
document, or the user can choose an existing image/PDF instead. The dispatch team wants 5 more
document upload fields added the same way, so all dispatch paperwork is captured per lot:
1. E-way Bill
2. Delivery Chalan
3. LR Copy Receiving
4. Packing List
5. Other

**Decisions finalized with the team before building (2026-08-18)**:
1. **Behavior**: identical to the existing LR Copy field — tap opens the rear camera
   (`capture="environment"`) to take a photo directly, or the user can pick an existing
   image/PDF instead. No new interaction pattern.
2. **File count**: single file each (matches LR Copy exactly) — not multi-file, including "Other".
3. **Placement**: all 5 new fields go directly after the existing LR Copy field, in the order
   listed above, so all 6 document fields are grouped together.
4. **Scope**: purely additive — the existing LR Copy field, its column, and its behavior are
   untouched. Nothing about the current dispatch flow changes for users who don't use the new
   fields.
5. **Optional**: all 6 document fields (LR Copy + the 5 new ones) are optional. The lot form must
   still submit successfully with none of them attached — matches LR Copy's existing behavior
   today (`saveLot()` only validates that a project is selected; there's no required-file check on
   `lot_lr_copy` currently). The 5 new fields will follow the same no-validation pattern by
   default, so no extra code is needed to keep them optional — just confirming it explicitly so it
   isn't accidentally added later.

**Design** (mirrors the existing `lr_copy_url` plumbing exactly, per lot):
- **DB migration**: add 5 nullable `text` columns to `material_lots` — `eway_bill_url`,
  `delivery_chalan_url`, `lr_copy_receiving_url`, `packing_list_url`, `other_document_url`.
- **`src/lib/mappers.js`**: extend `lotToRow` / `rowToLot` to map all 5 new columns both ways,
  same pattern as `lr_copy_url` / `lrCopyUrl`.
- **`index.html`**: add 5 more upload blocks in the Add/Edit Lot form markup, immediately after
  the LR Copy block — each `<input type="file" accept="image/*,application/pdf"
  capture="environment">` plus its own status/link `<div>`, same structure as the existing
  `lot_lr_copy` block.
- **`src/sections/material/materialTab.js`**:
  - `openAddLot()` / `openEditLot()`: wire each new field's `onchange` handler to
    `uploadFiles([file],'<folder>')` and reset/prefill it the same way `lot_lr_copy` is handled
    today (blank on Add, "✓ Already uploaded — choose a file to replace" on Edit if a URL exists).
  - `saveLot()`: include all 5 new URLs in the payload sent to `lotToRow`.
  - `renderLotCard()`: show each uploaded document as its own labeled link (e.g. "📄 E-way bill"),
    next to the existing "📄 LR copy" link, only when present.

**Built (2026-08-18)**:
- `supabase/migrations/0008_lot_dispatch_documents.sql` (new) — adds the 5 nullable columns to
  `material_lots`. Applied live against production (`qxxcwctbaefwhjjlmiyi`).
- `src/lib/mappers.js` — `lotToRow`/`rowToLot` extended for all 5 new columns, same pattern as
  `lr_copy_url`.
- `src/lib/state.js` — added `lotEwayBillUrl`, `lotDeliveryChalanUrl`, `lotLrCopyReceivingUrl`,
  `lotPackingListUrl`, `lotOtherDocumentUrl` alongside the existing `lotLrCopyUrl`.
- `index.html` — 5 new upload blocks added right after LR Copy, each labeled "(Optional)",
  same camera-first markup as the existing field.
- `src/sections/material/materialTab.js` — added a `LOT_DOC_FIELDS` table + `resetLotDocField()`
  helper (id/folder/state-key/lot-key per field) to wire all 5 fields in `openAddLot()` and
  `openEditLot()` without duplicating the LR Copy field's existing code; `saveLot()` now includes
  all 5 URLs in the save payload; `renderLotCard()` shows each uploaded doc as its own labeled
  link (e.g. "📄 E-way bill") next to "📄 LR copy", only when present.
- `supabase/migrations/0009_lot_documents_storage_policy.sql` (new) — **a real bug caught by live
  testing**: the 5 new folders (`eway-bills`, `delivery-chalans`, `lr-copies-receiving`,
  `packing-lists`, `other-documents`) weren't in the storage RLS insert-policy allowlist from
  `0005_storage_policies.sql`, so every upload 400'd with "new row violates row-level security
  policy". Fixed by re-issuing `uploads_insert_team` with the 5 new folder names added. Applied
  live; confirmed fixed by re-testing the same upload.

**Verified live in the browser** (`localhost:5175`, real production Supabase project,
logged in as admin): opened Add Lot Dispatch on Ajmera (Wadala Mumbai) — B-Wing, confirmed all
6 upload fields render in order with the camera-first hint text; uploaded a test PDF to the
E-way Bill field, confirmed "✓ Uploaded"; saved the lot with only that one field filled (all
other 5 left blank) and one product row — saved successfully, confirming the optional/no-file
requirement holds; the new lot showed a "📄 E-way bill" link (and no links for the untouched
fields) on the Material tab. `npm run build` succeeds. Test lot removed from production
afterward via a scoped, id-matched delete (not a bulk/destructive operation).

### v2-8: newest-added-first ordering for projects and lots (starting 2026-08-18)

**Request from the dispatch team**: on the Material Movement Tracker, projects currently list in
creation order oldest-first (looked alphabetical to the team, but that's incidental — it's really
`db.from('projects').select('*').order('id')`, ascending). They want the most recently added
project to appear at the top instead.

**Investigation before designing**: project order is loaded once in `src/data/loadAllData.js`
(`.order('id')` ascending) into `state.projects`, and that same array/order feeds every tab that
lists projects — All Projects, Dashboard, Gantt, Pipeline, Material, Requests, etc. — not just
Material. Lot order within a project card comes the same way, from `state.materialLots`
(`loadAllData.js`, also `.order('id')` ascending), filtered per-project in
`materialTab.js:renderMaterial()`. Confirmed no other code depends on either array's ascending
order for correctness — every consumer (`alerts.js`, `dprTab.js`, `materialTab.js`) only does
`.filter()`/`.find()` by id, or takes `.length`/`Math.max(id)` for numbering — so reordering only
changes display, nothing else. This also brings `projects`/`material_lots` in line with the
pattern already used for `dpr_log`, `requests`, and `activity_log`, which already load
`{ascending:false}` for "most recent first".

**Decisions finalized with the team before building (2026-08-18)**:
1. **Scope**: applies app-wide, not just the Material tab — every tab that lists projects
   (All Projects, Dashboard, Gantt, Pipeline, Material, etc.) switches to newest-added-first,
   since they all share the same underlying load order.
2. **Lots too**: within a project card, individual lots also flip to newest-dispatched-first
   (not just the project cards themselves).

**Design**:
- `src/data/loadAllData.js`: change `db.from('projects').select('*').order('id')` →
  `.order('id',{ascending:false})`, and the two `material_lots` load calls the same way (initial
  load + the auto-seed-then-reload fallback).
- `src/sections/material/materialTab.js`: no separate sort needed for lots — since
  `state.materialLots` itself now loads newest-first, `renderMaterial()`'s existing
  `state.materialLots.filter(l=>l.projId===p.id)` naturally lists lots newest-first without a
  code change there.

**Built (2026-08-18)**: `src/data/loadAllData.js` — both `projects` load calls (initial +
auto-seed fallback) and both `material_lots` load calls switched to `.order('id',{ascending:false})`.
No other file changed, as designed.

**Verified live in the browser** (`localhost:5175`, real production project, admin login):
on All Projects, the project that used to render first under the old ascending order (Ajmera
(Wadala Mumbai) — B-Wing) now renders last, and `civitech` (highest id) renders first — confirms
the flip is app-wide, not Material-tab-only. On the Material tab, Ajmera (Wadala Mumbai) —
B-Wing's lots showed "Lot 2" (Feb 2026) before "Lot 1" (Dec 2025), reversed from the original
oldest-first order. `npm run build` succeeds.

### v2-9: search box on the Material tab (starting 2026-08-18)

**Request from the dispatch team**: with 67 projects, the Material Movement Tracker has no way to
jump to a specific project — the team wants a search box by project name.

**Investigation before designing**: the All Projects tab already has this exact pattern —
`index.html:86`, `<input type="text" id="f-search" placeholder="Search project..."
oninput="renderProjects()">`, filtered in `src/sections/projects/projectCards.js:13,18` by
project name or tower substring (case-insensitive). Nothing like it exists yet on the Material
tab (`index.html:121-127`, `tab-material-view`), which just has a heading + "+ Add lot dispatch"
button above `#material-list`.

**Decisions finalized with the team before building (2026-08-18)**:
1. **Match fields**: name + tower only, mirroring the existing All Projects search exactly (not
   also matching city).
2. **Placement**: same row as the "Material movement tracker" heading, alongside the existing
   "+ Add lot dispatch" button.

**Design**:
- `index.html`: add `<input type="text" id="mat-search" placeholder="Search project..."
  oninput="renderMaterial()">` into the `tab-material-view` heading row (`index.html:122-125`),
  next to the "+ Add lot dispatch" button.
- `src/sections/material/materialTab.js`: in `renderMaterial()`, read `#mat-search`'s value
  (lowercased) and filter `vp` (from `visibleProjects()`) by `p.name`/`p.tower` substring match
  before rendering project cards — same filter logic as `projectCards.js:13,18`, just applied to
  the Material tab's project list instead of the All Projects grid. Purely additive: no existing
  Material tab behavior changes for a blank search box.

**Built (2026-08-18)**: `index.html` — `#mat-search` input added to the `tab-material-view`
heading row, next to "+ Add lot dispatch". `src/sections/material/materialTab.js` —
`renderMaterial()` now reads `#mat-search`, filters `visibleProjects()` by name/tower substring
match before rendering, and shows a distinct "No projects match your search." empty state
(vs. "No projects visible." when there are no visible projects at all, regardless of search).

**Verified live in the browser** (`localhost:5175`, real production project, admin login):
typed "ajme" into the Material tab's search box, list narrowed to only the 4 Ajmera projects
(both spellings/wings currently in the data). `npm run build` succeeds.

**Cross-cutting note for v2-7, v2-8, v2-9 (2026-08-18)**: the team asked to confirm these changes
reach the dispatch team's panel too, not just Admin. Confirmed this needs no extra work — the
Material tab is one shared component (`index.html`'s `tab-material-view` +
`src/sections/material/materialTab.js`), not a separate admin-only screen. The `dispatch_head`
role (`src/lib/constants.js:13`) already has `manageDispatch:true` and `addLot:true`, and
`src/auth/teamAuth.js:98` shows the Material nav tab to any role with `manageDispatch` —
dispatch_head and supervisor, not just admin. So all three of v2-7/v2-8/v2-9 will appear
identically for a dispatch_head login once built, automatically.

### v2-10: date filter on the DPR Log tab (starting 2026-08-21)

**Request from the team**: the DPR Log tab lists every Daily Progress Report across all visible
projects in one feed (68 projects' worth), each card showing its own "DPR Date". Team wants a
date filter so they can narrow the feed down to only the DPRs logged on one particular date.

**Investigation before designing**: the feed is `src/sections/dpr/dprTab.js`'s `renderDPR()`
(renders into `#dpr-list`, `index.html:119`), currently filtered only by project visibility
(`visibleProjects()`). Each entry's `d.date` is stored and displayed as a pre-formatted string
(e.g. `"21 Aug 2026"`, produced by `fmtDate()` at save time in `saveDPR()`), not an ISO date —
confirmed by reading `mappers.js`'s `dprToRow`/`rowToDpr` (straight pass-through, no reformatting)
and the `dpr_log.date` column (`text`, per Phase B's notes above). An HTML `<input type="date">`
filter yields `"2026-08-21"` (ISO), a different shape. The codebase already bridges exactly this
gap in two existing places — `openEditDPR()` (`dprTab.js:114`) and `getInstalledForProject()`
(`materialTab.js:22`) both do `new Date(d.date)` successfully on these same stored strings — so
reusing that identical parsing approach for the filter introduces no new risk.

**Decisions finalized with the team before building (2026-08-21)**:
1. **Scope**: purely additive — one new date-input filter control + one added filter step inside
   `renderDPR()`. No schema/migration change, no change to `saveDPR()`, mappers, or Supabase.
2. **Default**: filter starts empty (shows all DPRs, today's existing behavior); clearing the date
   input (native browser "×") returns to the unfiltered view.

**Design**:
- `index.html`: add `<input type="date" id="dpr-date-filter" oninput="renderDPR()">` into the
  `tab-dpr-view` heading row (`index.html:114-118`), next to the existing "+ Add DPR" button —
  same placement pattern as the Material tab's `#mat-search` (v2-9).
- `src/sections/dpr/dprTab.js`: in `renderDPR()`, after the existing `visible` array is built
  (line 19), read `#dpr-date-filter`'s value; if set, further filter `visible` to entries where
  `new Date(d.date)` matches the filter date. `renderDPR` is already exposed globally via
  `src/utils/domGlobals.js`, so no extra wiring needed for the `oninput` handler.

**Built (2026-08-21)**: `index.html` — `#dpr-date-filter` date input added to the `tab-dpr-view`
heading row, next to "+ Add DPR". `src/sections/dpr/dprTab.js` — `renderDPR()` filters `visible`
by the selected date when set, and shows a distinct "No DPRs found for that date." empty state.

**Real bug caught during live verification, fixed before shipping**: the first implementation
compared dates via `new Date(d.date).toISOString().slice(0,10) === filterValue` — the same
pattern already used elsewhere in this file (`openEditDPR`) — but `.toISOString()` converts to
**UTC**, which shifts the date back a day in any positive-offset timezone. Confirmed live: in
IST (UTC+5:30, this team's timezone), `new Date('21 Aug 2026').toISOString()` returns
`"2026-08-20T18:30:00.000Z"` — filtering for 21 Aug matched zero rows even though 3 real DPRs
were dated that day. The pre-existing `openEditDPR` use of this same pattern is harmless only
because it populates a `readonly disabled` date field that's never actually saved (DPRs always
save with today's date); this new filter had no such safety net, so the bug was live-breaking.
Fixed by comparing local calendar-date parts (`getFullYear()`/`getMonth()`/`getDate()`) instead
of the UTC-converting `toISOString()`.

**Verified live in the browser** (`localhost:5174`, real production Supabase project, admin
login): filtering to 2026-08-21 correctly narrowed 22 total DPR entries down to the 3 actually
dated "21 Aug 2026"; filtering to a date with no entries showed "No DPRs found for that date.";
clearing the filter restored all 22. `npm run build` succeeds.

### v2-11: allow choosing from gallery on DPR material-arrival photos (starting 2026-08-21)

**Request from the team**: in Add DPR → "Material arrival acknowledgement" → "Arrival photos",
tapping the file picker on mobile opens the camera directly with no way to pick an existing photo
from the gallery — staff want that option added.

**Root cause, confirmed by reading the code**: `dprTab.js:228`'s file input carries
`capture="environment"`, which is what forces mobile browsers straight into the rear camera,
bypassing the native "Camera / Gallery / Files" chooser. Notably the helper text right above it
(`dprTab.js:227`) already claims *"Tap to open your camera directly... or choose existing
photos"* — the text promised gallery access that the attribute was actually blocking, exactly
matching the staff complaint. Confirmed this is the only file input in the app with `capture`
set — `dpr-photos` (main DPR photos, `dprTab.js:196`) and `dpr-snag-photo`
(`dprTab.js:248`) don't have it.

**Decisions finalized with the team before building (2026-08-21)**:
1. **Fix**: remove `capture="environment"` from the `dpr-arrival-photo` input only. No JS change
   needed — `pickFilesOrWarn`/`uploadFiles` and its existing `onchange` handler
   (`dprTab.js:274-280`) behave identically regardless of whether the file came from camera or
   gallery.
2. **Wording tweak (included)**: update the helper text at `dprTab.js:227` from "Tap to open your
   camera directly (rear camera on phone), or choose existing photos." to something like "Tap to
   take a photo or choose from your gallery." — cosmetic only, to match the corrected behavior.

**Scope check**: single-attribute removal + one line of copy, both confined to this one field.
Nothing else in the Add DPR form, upload pipeline, or storage layer changes.

**Built (2026-08-21)**: `src/sections/dpr/dprTab.js` — removed `capture="environment"` from the
`dpr-arrival-photo` input (`accept`/`multiple` unchanged) and updated its helper text to "Tap to
take a photo or choose from your gallery. You can add multiple, one at a time or several
together."

**Verified live in the browser** (`localhost:5174`, real production Supabase project, admin
login): opened Add DPR, confirmed `dpr-arrival-photo` no longer has the `capture` attribute
(`accept="image/*"`, `multiple:true` unchanged) and the helper text reads as updated. Also
confirmed the other 4 file inputs in the same form (`dpr-photos`, `dpr-snag-photo`,
`dpr-wcc-upload`, `dpr-report-pdf`) were untouched — none had `capture` before or after.
`npm run build` succeeds.

### v2-12: make "No. of Towers/Blocks" editable on Edit Project (starting 2026-08-21)

**Request from the team**: on All Projects → Edit (pencil icon), the "No. of Towers/Blocks" field
sits fixed at `1` and can't be changed, unlike every other field on that form.

**Root cause, confirmed by reading the code**: this field was never a real project column — it's a
create-time-only form helper. On **Add**, raising it generates that many separate project rows (one
per tower/block), each becoming its own independent project with its own access code
(`formHelpers.js:96-108`, `addEditProject.js:286-295`). Once a project already exists, it already
**is** one tower/block row, so `openEditProject()` hardcodes the field to `'1'` and disables it
(`addEditProject.js:198-199`) — and even if it weren't disabled, the edit-save path only ever reads
`state.formTowers[0].name` (`addEditProject.js:262`), never the count. There's no `towerCount` (or
similar) column anywhere in the schema (`supabase/migrations/0001_baseline_schema.sql`) or in
`mappers.js` — the number is discarded after generating rows at create time.

**Decision finalized with the team (2026-08-21)**: make the field a plain editable number, stored on
the project, with no side effects — changing it in Edit does **not** create/remove any project rows
(that stays exclusive to Add). It becomes a reference figure the team can correct after creation.

**Design**:
1. New migration `supabase/migrations/0010_project_tower_count.sql`: `ALTER TABLE projects ADD COLUMN
   tower_count integer NOT NULL DEFAULT 1;`
2. `src/lib/mappers.js`: `projectToRow` writes `tower_count:p.towerCount||1`; `rowToProject` reads
   `towerCount:r.tower_count||1`.
3. `src/sections/projects/addEditProject.js`:
   - `openEditProject()` (~line 198-199): set the input's value from `p.towerCount||1` instead of the
     hardcoded `'1'`, and drop the `disabled=true` line.
   - `saveProject()` `baseData` (~line 234-258): add `towerCount:parseInt(document.getElementById('f-tower-count').value)||1`
     so both the Add and Edit paths persist whatever value is in the field.
   - Add path (~line 286-295, one row created per tower): each generated row still gets
     `towerCount:1` — the multi-row-generation behavior is untouched; only Edit exposes the count as
     an editable reference number afterward.
4. No changes to `formHelpers.js` `renderTowerRows()` (Tower/Block name-row generation logic stays
   exactly as is) or to `index.html`'s markup beyond nothing (the same input just stops being
   disabled).

**Scope check**: one migration, two mapper lines, and a handful of lines in `addEditProject.js`.
Doesn't touch DPR, Dispatch, Material, or Finance — `towerCount` isn't read anywhere else yet.

**Built (2026-08-21)**: `supabase/migrations/0010_project_tower_count.sql` (`tower_count integer not
null default 1`, applied to the live production project). `src/lib/mappers.js` — `projectToRow`/
`rowToProject` map `towerCount`↔`tower_count`. `src/sections/projects/addEditProject.js` —
`openEditProject()` now sets the field from `p.towerCount||1` instead of hardcoding `'1'`, and no
longer disables it; `saveProject()` reads the field into `towerCount` and includes it on both the
edit path and each row created on Add (where it's fixed at `1` per new row, matching "one row =
one tower"). `src/sections/projects/formHelpers.js` — `renderTowerRows()` now branches on
`state.editingId`: in Edit it always renders just the single "Tower / Block" name field (ignoring
the count), so raising the number never shows the Add-only "will create N sub-projects" row-adder
UI or touches `formTowers`.

**Verified live in the browser** (`localhost:5175`, real production Supabase project, admin
login): opened Edit on "Tharwani inftastructure" (the exact project from the team's screenshot),
confirmed "No. Of Towers/Blocks" was no longer disabled, changed it 1 → 3, confirmed the Tower/
Block field stayed a single input (no extra rows appeared) and total project count stayed at 37
after saving. Reopened Edit — the 3 persisted. Reverted to 1 and re-saved to leave the real
project's data as it was before testing; confirmed it read back as 1. `npm run build` succeeds.

### v2-13: auto-calculate "Days Available to Complete Installation" (starting 2026-08-21)

**Request from the team**: on Edit Project, "Days Available to Complete Installation (from Day
One)" is a free-typed number today with no relation to the project's actual dates — e.g. the
Tharwani project shows `5` while its PO Date (14 Aug 2026) to Committed Completion (18 Nov 2026)
is actually ~96 days apart. The team wants it auto-calculated as `Committed Completion − Date of
PO / Work Order`.

**Confirmed with the team (2026-08-21)**: `daysAvailable` also drives the DPR tab's "Days Left"
and daily-target math (`dprTab.js:339-342,389,420`), but those are anchored to **Installation
Commencement Date**, not PO Date — a different date pair from the one requested here. This is
intentional per the team, not a mix-up: `daysAvailable` becomes a single computed number
(Committed Completion − PO Date) that DPR then measures elapsed progress against from Install
Commencement Date onward.

**Decisions finalized with the team (2026-08-21)**:
1. **Fully auto-calculated, read-only** — no manual override. The field always shows Committed
   Completion − PO Date, recalculating live as either date is edited on the form.
2. **Backfill existing data now** — every existing project with both dates set gets its stored
   `days_available` overwritten to match, in the same pass as this change (one-time SQL update),
   so DPR's Days Left / daily-target numbers are consistent with the new rule immediately rather
   than only for projects someone happens to re-save later.
3. **Missing dates / negative range**: if either date is blank, the field shows blank (matches
   today's `daysAvailable:0` fallback → DPR already renders `—`/`#DIV/0!` for a falsy value, so no
   new empty state needed). If Committed Completion is before PO Date (bad data), clamp to `0`
   rather than show a negative number — same `Math.max(0, …)` pattern already used for
   `dprDaysLeft` (`dprTab.js:342`).

**Design**:
1. `src/sections/projects/formHelpers.js`: add `computeDaysAvailable(poDate, committedDate)` (plain
   day-count diff, `Math.max(0, …)`, returns `''` if either date missing) and
   `renderDaysAvailable()` (reads `#f-po-date`/`#f-commit-date`, writes the result into
   `#f-days-available`).
2. `index.html`:
   - `#f-days-available` (line 215) gets `readonly` (not `disabled`, so the value stays legible —
     unlike the Tower/Block lesson from v2-12, this one needs a visible explanation rather than
     just unlocking) plus a small hint: "Auto-calculated: Committed Completion − PO Date."
   - `#f-po-date` (line 214) and `#f-commit-date` (line 208) both get
     `onchange="renderDaysAvailable()"` added.
3. `src/sections/projects/addEditProject.js`:
   - `openEditProject()` (~line 211): replace the direct `p.daysAvailable||''` assignment with a
     call to `renderDaysAvailable()` after both date fields are set, so reopening Edit always shows
     the live-computed number, not the stored one.
   - `saveProject()` (~line 242): replace reading `#f-days-available`'s raw value with
     `computeDaysAvailable(document.getElementById('f-po-date').value, document.getElementById('f-commit-date').value)`
     directly, so the saved number can never drift from what the two date fields actually say.
4. `src/utils/domGlobals.js`: export `renderDaysAvailable` alongside the other form-helper globals
   (needed for the inline `onchange` handlers), same pattern as `renderTowerRows`.
5. One-time SQL update against production (not a schema migration — no column change): 
   `update projects set days_available = greatest(0, committed_date - po_date) where po_date is not null and committed_date is not null;`

**Scope check**: no schema change (column already exists, nullable integer). Touches the Edit
Project form and one backfill query only — DPR's own formulas (`dprDayNo`/`dprDaysLeft`) are
unchanged, they just now receive a more accurate `daysAvailable` input.

**Built (2026-08-21)**: `src/sections/projects/formHelpers.js` — added `computeDaysAvailable()` and
`renderDaysAvailable()`. `index.html` — `#f-days-available` is now `readonly` with a hint line
below it; `#f-po-date` and `#f-commit-date` both get `onchange="renderDaysAvailable()"`.
`src/sections/projects/addEditProject.js` — `openEditProject()` calls `renderDaysAvailable()`
instead of assigning the stored value directly; `saveProject()` computes the value fresh from the
two date fields at save time rather than trusting the (now read-only) display field.
`src/utils/domGlobals.js` — exported `renderDaysAvailable`. One-time production backfill applied
via `supabase db query --linked` (5 of 69 projects had both dates set; e.g. Tharwani went from a
stale manually-typed `5` to the correct `96`).

**Verified live in the browser** (real production Supabase project, admin login): opened Edit on
"Tharwani inftastructure" — Days Available correctly showed the backfilled `96` with the
"Auto-calculated: Committed Completion − PO Date" hint visible. Changed Committed Completion from
18-11-2026 to 25-12-2026 and confirmed the field live-recalculated to `133` with no page reload.
Confirmed the field rejects manual typing (selected it and typed "999" — stayed at `133`,
read-only holds). Cancelled out without saving to leave the real project's data untouched.
`npm run build` succeeds.

(Note: this verification pass hit unrelated browser-automation flakiness — a second tab sharing
the same Supabase auth session caused intermittent silent logouts/dead clicks, and the local Vite
dev server dropped its connection once mid-session and auto-reconnected. Neither was caused by
this change; closing the extra tab and retrying resolved it.)

### v2-14: search box on the Finance tab (starting 2026-08-21)

**Request from the team**: with 69 projects, the Finance ledger has no way to jump to a specific
project — team wants a search box by project name, same idea as v2-9's Material tab search.

**Investigation before designing**: same situation as v2-9 — the pattern already exists twice
(All Projects' `#f-search`, Material's `#mat-search`, both filtering by name/tower substring). The
Finance tab (`index.html:135-141`, `tab-finance-view`) has no equivalent: just a heading + "+ Add
ledger row" button above `#finance-table-wrap`, and `renderFinance()`
(`src/sections/finance/financeTab.js:137`) renders every project from `visibleProjects()`
unfiltered.

**Design** (matching v2-9 exactly, just applied to Finance instead of Material):
1. `index.html`: add `<input type="text" id="fin-search" placeholder="Search project..."
   oninput="renderFinance()">` into the `tab-finance-view` heading row, next to "+ Add ledger row".
2. `src/sections/finance/financeTab.js`: in `renderFinance()`, read `#fin-search`'s value
   (lowercased) and filter `vp` by `p.name`/`p.tower` substring match before rendering ledger
   cards — identical filter logic to `materialTab.js:36,39`. Distinct "No projects match your
   search." empty state, separate from "No projects visible."
3. No `domGlobals.js` change needed — `renderFinance` is already exported globally.

**Scope check**: two small, additive changes (one input, one filter line) mirroring an
already-proven pattern used twice elsewhere in this app. No other Finance behavior changes.

**Built (2026-08-21)**: `index.html` — `#fin-search` input added to the `tab-finance-view` heading
row, next to "+ Add ledger row". `src/sections/finance/financeTab.js` — `renderFinance()` now
reads `#fin-search`, filters `visibleProjects()` by name/tower substring match before rendering
ledger cards, and shows "No projects match your search." as a distinct empty state.

**Verified live in the browser** (real production Supabase project, admin login): opened Finance,
typed "tharwani" into the new search box — list narrowed from all 69 projects down to just
"Tharwani inftastructure"; typed a nonsense string — got the "No projects match your search."
empty state; cleared the box — full list returned. `npm run build` succeeds.

### Incident: `admin` account locked out — forgotten PIN + inactive flag (2026-08-27)

**Report**: the team could not log in with the `admin` username/PIN. Not a bug in the app's
normal operation — a support/recovery request, since Phase C (2026-08-07) intentionally made PINs
one-way bcrypt hashes, so there is no way to look up or "reverse" a forgotten one.

**Root cause, confirmed by direct DB inspection (`DATABASE_URL`, read-only queries first)**: two
things stacked:
1. **No admin-recovery path exists in this app.** `team-set-pin` (the only function that can ever
   set a new `pin_hash`) requires the caller to already present a valid **admin** JWT
   (`supabase/functions/team-set-pin/index.ts:32`) — by design, so a non-admin can't grant
   themselves admin. But this means there is no "forgot PIN" flow for an admin: if the only
   working admin account is the one that's locked out, nothing in the app itself can get back in.
   This gap has existed silently since Phase C and was never exercised until now.
2. **The `admin` team member (id 1) was also flagged `active = false`** — found by querying
   `team_members` directly, restricted to `role='admin'` and non-sensitive columns only (no
   PIN/hash values were ever pulled into this session). `team_login_verify()` requires
   `active = true` (`0003_auth_hardening.sql:62`), so even a correct PIN would have been rejected.
   **No audit trail exists for why or when it went inactive** — `teamMgmtTab.js`'s member-edit
   flow never writes to `activity_log` when the Active toggle changes (checked: zero matches for
   any deactivation-related event). Its last real activity/`last_login` was 24 Aug 2026, then
   nothing — consistent with either an accidental toggle or a deliberate one; genuinely
   undeterminable from the data. User confirmed they weren't aware of/didn't intend the
   deactivation.
   - **Also found, incidentally**: a second, active admin-role account already exists
     (`shashank`, id 21, logged in the same day this was reported) — had `admin` only been
     deactivated (PIN still known), that account could have self-served the fix via Team
     Management with zero DB intervention. Worth knowing for next time a team-role account is
     locked out.

**Fix applied (2026-08-27)**, confirmed with the user before executing:
1. `select set_member_pin_hash(1, '122246')` — sets a **new** PIN via the same bcrypt path the
   app itself uses, run directly against the DB. Deliberately a *reset*, not a lookup — the old
   PIN/hash was never read back into this session at all, even though the frozen legacy plaintext
   `pin` column (kept since Phase C as a rollback margin, still not dropped) could technically
   have been read. Resetting is strictly safer and fully solves "forgot the PIN" either way.
2. `update team_members set active = true where id = 1`.
3. Verified in two independent steps before calling it done: (a) `select * from
   team_login_verify('admin', '122246')` directly in Postgres returned exactly one row (Neelam,
   role admin, active), (b) a live HTTP call to the deployed `team-login` Edge Function with the
   same credentials returned `200`, a real signed JWT, and updated `lastLogin` to today —
   confirms the whole path end-to-end, not just the DB function in isolation, per this project's
   standing verification rule.

**Structural gaps flagged for the future (not fixed here, need a decision)**:
- **No break-glass admin recovery mechanism.** If this had been the *only* admin account, the fix
  above (direct DB access) is still available to a session with `DATABASE_URL`, but that's an
  informal safety net, not a designed recovery path. Worth deciding: keep ≥2 active admin
  accounts as standing policy, and/or build a documented recovery runbook, and/or add a proper
  service-role-gated "admin emergency reset" tool.
- **No audit log for `team_members.active`/role/permission changes.** Team Management writes no
  `activity_log` entry when a member is activated/deactivated or their role changes — this is why
  the root cause of `admin` going inactive couldn't be determined. Worth adding if this kind of
  question comes up again.
- **The legacy plaintext `pin` column is still not dropped** (flagged since Phase C/E) — this
  incident is one more reason it's pure latent risk with no offsetting benefit: it never actually
  helped here since the account was also inactive, and it stays a bcrypt-defeating exposure for
  as long as it exists. Worth prioritizing its removal.

### v2-15: search box on the DPR Log tab, by project or supervisor (starting 2026-08-27)

**Request from the team**: on the DPR Log tab, add a search that finds DPRs by supervisor name
(showing every project that supervisor works on) as well as by project name — same underlying
need as v2-9/v2-14's Material/Finance search, but the DPR tab only had a date filter, no text
search at all.

**Design decisions confirmed with the user before building**: (1) one combined search box, not
two separate ones — matches the single-box pattern already used on All Projects/Material/Finance
tabs; (2) the search also filters the checklist-summary cards at the top of the DPR list (Pre-Mockup
Checklist, Site Readiness, etc. — shown per visible project, not per DPR entry), not just the
individual DPR report cards below them, so the whole tab stays consistent.

**Design**:
1. `index.html` (`tab-dpr-view` heading row, next to the existing `#dpr-date-filter`): add
   `<input type="text" id="dpr-search" placeholder="Search by project or supervisor...">`.
2. `src/sections/dpr/dprTab.js` — `renderDPR()`: read `#dpr-search` (lowercased) and filter
   `visibleProjects()` itself by `p.name`/`p.tower`/`p.supervisor` substring match, before it's
   used for anything else. Because both the checklist-summary section and the DPR-entries list are
   derived from that same filtered `vp`, one filter step covers both — no separate filter needed
   on the DPR entries themselves. Matching against the project's own `supervisor` field (not each
   DPR entry's free-text supervisor field) is what makes "search by supervisor" correctly return
   every project of theirs, even if a given day's entry has that field edited to something else.
   Distinct empty-state message when search/date filter yields nothing vs. no DPRs at all.

**Built and verified live in the browser (2026-08-27, `support` login, local dev server)**: opened
DPR Log, typed "Karan" — narrowed from the full list down to just "Pioneer — 1" (Karan's project),
checklist section and DPR entry cards both filtered together; typed "Amartaru" — narrowed to just
that project's checklist card + its one DPR entry; cleared the box — full list returned.

### v2-16: automatic GPS location capture on every DPR save (starting 2026-08-27)

**Request from the team**: every DPR save (Add DPR and Edit DPR both use the same `saveDPR()`)
must automatically capture the device's on-site GPS location at the moment of saving — proof the
report was actually filed from site, not filled in later from anywhere else.

**Design decisions confirmed with the user before building**:
1. If location capture fails or is denied, the save is **blocked** (not saved with a blank
   location) — with a guided error message telling the supervisor what to do. This is stricter
   than the existing material-arrival location capture (`captureDPRArrivalGeoLocation()`,
   best-effort, never enforced — see plan.md's mobile-audit notes), and deliberately so, per the
   team's explicit ask.
2. Capture is automatic, triggered by clicking "Save DPR" itself — no separate manual "capture"
   button/step first. The browser's native permission prompt (if not already granted) appears at
   that point.
3. The captured location displays on each DPR card in the Daily Progress Reports log (same
   visibility as the rest of the DPR card), not tucked into the internal-only section.

**Design**:
1. New migration `supabase/migrations/0011_dpr_geo_location.sql` — `alter table dpr_log add
   column geo_location text default ''`, same text format as `material_lots.arrival_geo_location`
   ("lat, lng — reverse-geocoded address").
2. `src/lib/mappers.js` — `dprToRow`/`rowToDpr` read/write the new `geo_location` column.
3. `src/sections/requests/requestsTab.js` — exported the existing `reverseGeocodeAddress()`
   helper (was module-private) so `dprTab.js` can reuse the same free OpenStreetMap Nominatim
   lookup instead of duplicating it.
4. `src/sections/dpr/dprTab.js` — new `captureDPRSaveLocation()`: wraps
   `navigator.geolocation.getCurrentPosition` in a Promise that **rejects** (not resolves blank)
   on denial/timeout/unsupported, with a guided error message. `saveDPR()` now `await`s this right
   after the existing synchronous snag-validation checks (so a supervisor fixing a typo isn't
   re-prompted for location on every retry) and before anything is written to the DB — a rejection
   shows the message via the existing `#dpr-error`/`#dpr-err-msg` elements and returns without
   saving, exactly like the pre-existing snag-validation failures do. The "Save DPR" button
   (`index.html`, given `id="dpr-save-btn"`) is disabled and relabeled "📍 Getting your
   location..." → "Saving..." during the flow, and reset on every exit path (both error returns,
   the two Supabase error branches, and the success path) plus on `openAddDPR()`/`openEditDPR()`
   as a defensive reset. Captured location is stored on `newDpr.geoLocation` and rendered as a
   `📍 ...` line under "Supervisor:" on each DPR card in `renderDPR()`.

**Not changed**: the existing material-arrival location capture (separate manual button, separate
field, still best-effort/not mandatory) — this is a distinct, new capture point for the DPR itself.

**Scope check — production DB migration**: applying `0011_dpr_geo_location.sql` needs to go
against the real Supabase project. Per [[project_supabase_migration_state]] (remote migration
history is unsynced), this should be applied with `supabase db query --linked --file
supabase/migrations/0011_dpr_geo_location.sql`, not `supabase db push` — confirming with the user
before running it, since it's a change to shared production infrastructure.

**Migration applied to production (2026-08-29)**: confirmed missing first — a direct read against
the live REST API (`select id,geo_location from dpr_log`) returned `42703 column dpr_log.geo_location
does not exist` before applying. User provided a fresh Supabase Personal Access Token; ran
`supabase db query --linked --file supabase/migrations/0011_dpr_geo_location.sql`, then confirmed
the column exists by re-running the same read (returned `geo_location:""` instead of erroring).

**Verified live in the browser (2026-08-29, `support` login, real production Supabase project)**:
opened Add DPR for Amartaru, clicked Save DPR — Chrome's native location-permission prompt
appeared (a JS-level stub was attempted first but doesn't reach page-world code from the
extension's isolated content-script world, so this needed the user to click Allow on the real
prompt), location was captured and reverse-geocoded, and the DPR saved successfully. The new
entry (Amartaru, 29 Aug 2026) showed "📍 19.076090, 72.877426 — Lal Bahadur Shastri Marg, Kismat
Nagar, Kurla West, ... Mumbai ... 400070, India" on its card in the DPR log — confirms capture,
reverse-geocoding, DB write, and display all work end-to-end. Test entry deleted afterward
(`delete from dpr_log where id = 73`, confirmed gone via a follow-up read) to keep production data
clean. The denial/blocked path (save refused + guided message when location access is denied) was
**not** live-tested — skipped per the user's choice, since it exercises the same
try/catch/reject-with-message pattern already proven at the material-arrival capture point
(`captureDPRArrivalGeoLocation()`), just wired to block instead of falling back to blank.

### v2-17: fix "Could not delete from database" on Delete Project (starting 2026-08-29)

**Report from the team**: admin tries to delete a project ("Test Developer — —") and gets "Could
not delete from database — check console." for any project that actually has data on it.

**Root cause**: `confirmDelete()` (`src/sections/projects/addEditProject.js:316`) does a plain
`db.from('projects').delete().eq('id', state.deletingId)`. But `projects.id` is referenced by
foreign keys from `dpr_log.proj_id`, `material_lots.proj_id`, `finance_ledger.proj_id`, and
`requests.linked_project_id` (`0001_baseline_schema.sql`), none declared with an `ON DELETE`
clause — Postgres defaults to `NO ACTION`, so the delete is rejected (FK-violation, error 23503)
the instant the project has any DPR log, material lot, finance ledger row, or a request that was
converted into it. RLS is not the cause — the `admin`-only `projects_delete` policy
(`0004_rls_policies.sql:100-102`) is correct and unrelated to this failure.

**Design decisions confirmed with the user before building**:
1. Cascade: deleting a project also deletes its `dpr_log`, `material_lots`, and `finance_ledger`
   rows — these are purely project-scoped operational data with no meaning once the project is
   gone, and this matches the "This cannot be undone" warning already shown on the confirm dialog.
2. `requests.linked_project_id` is the one exception: **unlink, don't delete** — `ON DELETE SET
   NULL`, not CASCADE. The request row is the historical record of who asked for the project and
   when; deleting it along with the project would erase that audit trail for no benefit, since
   nothing currently reads `linked_project_id` after conversion.

**Design**:
1. New migration `supabase/migrations/0012_project_delete_cascade.sql`:
   - `alter table dpr_log drop constraint dpr_log_proj_id_fkey, add constraint
     dpr_log_proj_id_fkey foreign key (proj_id) references projects(id) on delete cascade;`
   - same pattern for `material_lots_proj_id_fkey` and `finance_ledger_proj_id_fkey`.
   - `alter table requests drop constraint requests_linked_project_id_fkey, add constraint
     requests_linked_project_id_fkey foreign key (linked_project_id) references projects(id) on
     delete set null;`
   - (Exact auto-generated constraint names need confirming against the live schema before
     writing the final `drop constraint` statements — Postgres names them
     `<table>_<column>_fkey` by default, which matches here since none were named explicitly in
     `0001_baseline_schema.sql`, but this should be verified, not assumed, when the migration is
     written.)
2. No application-code change needed — `confirmDelete()` already just deletes the `projects` row;
   the cascade does the rest at the database level.

**Migration applied to production (2026-08-29)**: constraint names confirmed first via a live
`pg_constraint` query (all four were the default `<table>_<column>_fkey` names, `confdeltype: 'a'`
i.e. NO ACTION, confirming the root cause); ran `supabase db query --linked --file
supabase/migrations/0012_project_delete_cascade.sql` using a fresh Personal Access Token from the
user; re-ran the same `pg_constraint` query and confirmed `confdeltype` flipped to `'c'` (CASCADE)
for dpr_log/material_lots/finance_ledger and `'n'` (SET NULL) for requests.

**Verified live in the browser (2026-08-29, `support` login, real production Supabase project)**:
logged in as admin, opened the "Test Developer — Test Developer" project (the same one from the
original bug report — has DPR logs and material lots on it), clicked delete, confirmed "Yes,
Delete" — no error alert, project disappeared from the list, project count dropped from 39 to 38.
Fix confirmed end-to-end.

### v2-18: Gmail-compose notification to management on New Request save (starting 2026-08-29)

**Request from the team**: when a new request is raised (any of the 7 request types), a mail
notification should go to all management. No third-party email API/service — same no-API pattern
already used elsewhere in the app (`notifyByGmail`/`gmailComposeLink` in `src/lib/constants.js`,
used today for JMR-upload and checklist-completion notifications): staff clicks Save, a Gmail
compose tab opens pre-filled with all management on Cc, a proper subject/body, and a link to the
app — staff just has to hit Send.

**Context found while investigating**: `requestsTab.js` already had two unused notification
functions (`notifyProjectTeamNewRequest`, `notifyNewRequest`) with a comment saying "Auto-emailer
removed on new request submission per request" — this predates the restructuring (present in the
original `complete.html` from the very first commit), and `plan.md` has no record of why, so it's
not a decision made during this project. Not reusing those two: `notifyNewRequest` opens a
WhatsApp link to `NEELAM_WA`, which is still the placeholder `'91XXXXXXXXXX'`, not a real number
(would silently break), and both were written Pre-PO-specific rather than for all 7 types.

**Design decisions confirmed with the user before building**:
1. Fires on saving any of the 7 request types (Pre-Mockup, Mockup, Post-Mockup, Pre-Main Survey,
   Sampling Survey, Main Order, Post-Main Order) — not just Pre-PO.
2. To: the primary admin (`getAdminEmail()`, same helper already used elsewhere). Cc: the rest of
   management — every other active `admin`/`manager` team member with an email on file. Matches
   the existing `notifyJMRUpload` To-admin/Cc-others pattern. Checked live data: 3 admins (Neelam,
   Shashank, support/admin) + 2 managers (Aditya, Shashi — Shashi has no email on file so is
   skipped), so Cc will currently carry 3 addresses.

**Design**:
1. `src/lib/constants.js`:
   - `gmailComposeLink(to, subject, body, cc)` / `notifyByGmail(to, subject, body, cc)` — add an
     optional 4th `cc` param (backward compatible; existing 3-arg callers unaffected) instead of
     each caller manually string-building `&cc=...` the way `notifyJMRUpload` currently does.
   - New `getManagementCcEmails()`: active `admin`/`manager` team members with a non-empty email,
     excluding the primary admin's own address (that's already in To), deduped.
2. `src/sections/requests/requestsTab.js` — new `notifyManagementNewRequest(r)`: builds a subject/
   body generic enough for all 3 field groups (visit/order/survey) using fields common to all of
   them (`developerName`/`projectName`, `salesName`, `contactPerson`, `mobile`,
   `locationForVisit`/`city`/`state`), includes `window.location.origin` as the app link, and
   calls `notifyByGmail(getAdminEmail(), subject, body, getManagementCcEmails())`. Called from
   `saveRequest()`'s insert branch right after `logActivity(...)`, replacing the stale
   "Auto-emailer removed" comment.

**Built and verified live in the browser (2026-08-29, `support` login, local dev server against
the real production Supabase project)**: opened New Request, filled a Pre-Mockup request, clicked
Save Request — request saved (PRE-0013), panel closed, and a Gmail compose tab opened
automatically with: To = Shalini Gupta (sales01@ecoste.in, the primary admin), Cc = Aditya Chavan
(project.west@ecoste.in), Shashank Soni (projectmanager@ecoste.in), Neelam Routhan
(sales07@ecoste.in) — correctly excluding the primary admin and skipping Shashi (no email on
file); subject "New Pre-Mockup request — PRE-0013 — TEST v2-18 Developer"; body with request
number, type, raised-by, developer, client rep + phone, location, the app link, and a signature.
Did not click Send (that's the staff member's manual step by design) — discarded the compose draft
and deleted the test request row (id 19) from production afterward to keep production data clean.

### v2-19: Delete-request button in the admin panel (starting 2026-08-31)

**Request from the team**: staff sometimes accidentally submit multiple requests for the same
task (e.g. duplicate saves), and there is no way to clean these up. Add a delete button to the
Requests list, admin-only.

**Root cause / gap found**: the `requests` table has no delete path anywhere today — no delete
button in the UI, no `deleteRequest` entry in the roles/permissions matrix, and (checked
`supabase/migrations/0004_rls_policies.sql`) no `requests_delete` RLS policy at all. Same class of
gap that caused the "Could not delete from database" bug fixed for Projects in v2-17 — if a delete
button were added without the RLS policy, it would 400 silently.

**Design decisions confirmed with the user before building**:
1. Admin-only, mirroring the existing "Delete Project" pattern exactly (same confirm-dialog panel,
   same permission-matrix shape as `deleteProject`).
2. No activity-log entry for this delete — user's call: only admin can do it, and the request can
   always be raised again if actually needed, so an audit trail isn't worth it here.

**Design**:
1. `src/lib/constants.js` — add `deleteRequest` to `ROLES.*.can` (`true` for admin, `false` for
   manager/supervisor/finance/viewer/dispatch_head) and to `PERM_LABELS` (so it shows, toggleable,
   in Team Management's permission matrix, same as `deleteProject`).
2. `supabase/migrations/0004_rls_policies.sql` — add `requests_delete` policy: active team member
   + `admin` role only, matching `projects_delete`'s shape exactly.
3. `src/lib/state.js` — add `deletingKind:'project'` alongside the existing `deletingId`, so the
   shared confirm panel knows which table to delete from.
4. `src/sections/projects/addEditProject.js` — generalize `confirmDelete()` (currently hardcoded to
   `projects`) to branch on `state.deletingKind`: delete from `requests` and update
   `state.requests`/`renderRequests()` when kind is `'request'`, keep existing `projects` behavior
   otherwise. `askDelete()` explicitly sets `deletingKind='project'`.
5. `src/sections/requests/requestsTab.js` — new `askDeleteRequest(id)` (sets `deletingId`/
   `deletingKind='request'`, shows the request number in the confirm text, opens the existing
   `panel-confirm`). New 🗑 delete button in `renderRequestCard()`'s action row, next to ✏️ Edit,
   gated by `canDo('deleteRequest')`, hidden for Sales/Viewer (same as Edit already is for them).
6. `src/utils/domGlobals.js` — expose `askDeleteRequest` globally (onclick handler needs it).

**Not changed**: `confirmDelete`'s no-activity-log behavior for projects stays as-is; this only
extends the same (already-silent) delete path to requests, per the decision above.

**Migration applied to the real production Supabase project** via `apply-migrations.mjs` — the
`requests_delete` policy is confirmed live (queried `pg_policies` directly: `requests_delete` /
`DELETE` now present alongside `requests_select_open`/`requests_insert`/`requests_update`).
**Also noticed while applying, unrelated to this change, not fixed**: `0010_project_tower_count.sql`
is not idempotent (`ADD COLUMN` without `IF NOT EXISTS`) and fails re-application with `column
"tower_count" already exists` — pre-existing issue, flagged for a future session.

**Built and verified live in the browser (2026-08-31, local dev server, `VITE_TEST_MODE=true` mock
data to avoid touching production request rows)**: logged in as `admin`/`1234`, created a test
Pre-Mockup request (PRE-0001), went to Requests — 🗑 "Delete request" button present next to ✏️
Edit. Clicked it — confirm modal correctly read `Delete request "PRE-0001"?` (reusing
`panel-confirm`/`confirmDelete` via the new `deletingKind` branch). Clicked "Yes, Delete" — request
removed from the list, Requests tab badge cleared, no console errors; Project delete (🗑 on project
cards) still worked unaffected. Logged in as `neelam`/`5678` (Ops Manager, `deleteRequest:false`),
created another test request — confirmed no 🗑 button shows next to Edit for that role (permission
gating works both ways). Cleaned up: closed temp dev servers, removed scratch log files.

### v2-20: Uploaded request documents not visible anywhere (starting 2026-09-01)

**Request from the team**: at request-filling time staff upload docs/files (WO/PO/PI, BOQ/CAD,
Approvals, Sample PO, visit/survey photos, general documents). Admin, management, and sales
currently have no way to see or open these from the app — they have to ask staff for the files
again over WhatsApp/email. Team wants anyone who can already see a request in the Requests module
to be able to click straight through to the uploaded file.

**Root cause found**: every upload path (`req-docs`/`documentUrls`, the 3
`POSTPO_DOC_CATEGORIES` uploads, `req-sample-po`, `visitPhotoUrls`) already saves correctly into
`request.details` and persists to the DB via `saveRequest()`. But nothing ever renders those URLs
back out anywhere — not on the request card, not in the edit/view panel. The data has been there
all along; it was just never displayed.

**Design decision confirmed with the user**: keep this change scoped to exactly one file,
`src/sections/requests/requestsTab.js` — no DB/schema/RLS/permission changes, since this is a
pure read-side rendering gap and the app is live in production (user's instruction: touch nothing
else, improve bit by bit). Uploads already go to the public `uploads` storage bucket via
`uploadFiles()`/`getPublicUrl()`, so a plain link works for any role without new policies.

**Design**:
1. `src/sections/requests/requestsTab.js`:
   - Import `docLink` from `../../lib/uploads.js` (same helper already used for project docs —
     handles both `{name,url}` and plain-URL-string entries).
   - New small helper that builds a "📎 Documents" block from `r.details`, grouped by category
     (general Documents / WO-PO-PI / BOQ-CAD / Approvals / Sample PO / Visit or Survey photos),
     skipping any group with no files.
   - Insert that block into `renderRequestCard()` so it shows for every role that already sees
     that card — no new permission flag needed; `renderRequests()` already scopes which requests
     each role sees (admin/manager/finance/dispatch_head: all; supervisor: assigned only;
     sales/viewer: their own), this only fills in what's shown once a card renders.

**Not changed**: no changes to `constants.js`, RLS policies, `state.js`, `domGlobals.js`, or any
other file — purely additive rendering inside the existing card function.

**Built and verified live in the browser (2026-09-01, local dev server, `VITE_TEST_MODE=true` mock
data to avoid touching production request rows)**: logged in as `admin`/`1234`, created a test
Pre-Mockup request (PRE-0001) with one uploaded document. Requests tab card immediately showed
"Documents: 📎 Document 1" right under the status badges — clicked it, opened correctly in a new
tab to the file's stored URL. Logged in as `neelam`/`5678` (Ops Manager, non-admin) — same card,
same "Documents: 📎 Document 1" link visible and clickable (no 🗑 delete button, as expected for
that role). Confirms the docs block renders for any role that can already see the card, no new
permission gating needed. Cleaned up: closed the temp dev server (port 5178).

### v2-21: Fixed "A project with access code ... already exists" blocking Convert To Project (2026-09-02)

**Report**: staff clicked "Convert To Project(S)" on a Mockup request for MAX ESTATE (AAR CEE
CONTRACTS PVT.LTD.), request `PPO-0003`, and got `A project with access code "PPO0003" already
exists — this request may already be converted.` — even though this specific request had never
been converted (still showed the "Convert To Project(S)" button, not the "Converted to Project"
badge).

**Root cause, confirmed against live production data**: `genRequestNumber()`
(`src/sections/requests/requestsTab.js`) computed its running number by counting requests of the
exact same `requestType` (`state.requests.filter(r=>r.requestType===type).length+1`), but the
human-readable prefix (`PPO`/`PRE`/`SUR`) is shared across several request types —
`reqFieldGroup()` groups `mockup`/`post-mockup`/`main-order`/`post-main-order` under one `PPO`
prefix, and `pre-mockup`/`pre-main-survey` under one `PRE` prefix. Counting per-type instead of
per-prefix meant the first `mockup` request and the first `main-order` request could both compute
to `PPO-0001` — a guaranteed collision, not a rare race. Since a project's access code is derived
directly from its source request's number (`r.requestNumber.replace(/[^A-Za-z0-9]/g,'').toUpperCase()`),
converting the second of two same-numbered requests always collides with whichever one converted
first.

Queried the live `requests` table directly and found this had already produced 3 real duplicate
pairs in production: `PPO-0001` (main-order id 6 + mockup id 8, already converted to project 75 +
mockup id 9, unconverted), `PPO-0003` (main-order id 11, converted to project 76 + mockup id 18,
the reported MAX ESTATE request, unconverted), and `PRE-0008` (pre-mockup id 13, unconverted +
pre-mockup id 17, converted to project 77).

**Fix**: `genRequestNumber()` now scopes its "existing numbers" scan by `reqFieldGroup()` (the same
grouping the prefix itself uses) instead of exact request type, and derives the next number from
the max existing numeric suffix among same-prefix requests rather than a plain count — the latter
also makes it resilient to the admin delete-request feature (v2-19): a count-based sequence would
shrink after a delete and could re-mint an already-used number, while a max-based one can't go
backwards. Built and pushed (`4757165`).

**Data fix applied directly to production** (the code fix only prevents new collisions —
`PPO-0003` was already duplicated in the database): renumbered the stuck MAX ESTATE request
(id 18) from `PPO-0003` to `PPO-0005`, the next number not in use by any existing request or
project access code (confirmed via direct query first). Convert To Project now has a free access
code to use.

**Update (2026-09-03) — this predicted collision actually hit production**: staff got the same
"access code already exists" alert converting "ATS Grand realtech" (`PPO-0001`, request id 9,
mockup). Re-querying at that point found the duplicate set was actually **three** requests, not
two as first flagged — `PPO-0001` had a *second* unconverted duplicate that hadn't surfaced yet
(request id 6, `main-order`, also colliding with the same already-converted id-8 sibling), plus
the previously-flagged `PRE-0008` (request id 13). All three renumbered directly against
production to the next free numbers in their prefix group: id 6 → `PPO-0006`, id 9 → `PPO-0007`,
id 13 → `PRE-0013`. Verified afterward with a full duplicate-scan query
(`select request_number, count(*) from requests group by request_number having count(*) > 1`) —
zero duplicates remain anywhere in the table.

### v2-22: Fixed "Could not save DPR changes" on Edit DPR (2026-09-02)

**Report**: a team member (screenshot shows a supervisor editing a DPR on mobile, "Next Dispatch"
/ "Escalations" fields visible, Shalini among the people on a concurrent call) got `Could not save
DPR changes — check console.` while saving an edited DPR entry.

**Root cause, confirmed against the live code and live production data** — a permission mismatch
between the client-side edit gate and the database's RLS policy, not a data or schema bug:

1. The error text ("Could not save DPR **changes**", `src/sections/dpr/dprTab.js:548`) pins this
   to the *edit-existing-DPR* path (`db.from('dpr_log').update(...).select().single()`), not the
   create-new path (which has different error text, "...to database", line 557). The `UPDATE` is
   being silently filtered to 0 rows by Postgres RLS, and `.single()` turns that into a hard
   `PGRST116` error ("JSON object requested, multiple (or no) rows returned"), surfaced verbatim
   by the generic alert.
2. The DPR "Supervisor" field is a plain free-text `<input>` (`dprTab.js:225`), pre-filled from
   the *project's* assigned supervisor for a new entry, but fully editable by whoever is saving —
   it is never actually bound to the logged-in user's identity.
3. `dpr_log`'s `UPDATE` RLS policy (`supabase/migrations/0004_rls_policies.sql:118-121`) only
   allows the write if the caller's role is `admin`/`manager`, **or** the row's `supervisor` text
   exactly (case-sensitively) matches the caller's own `team_members.name` via
   `app_active_team_member_name()`.
4. The client-side "✏️ Edit this DPR" button (`dprTab.js:102`) is shown whenever
   `canDo('addDPR')` is true, and `addDPR` is `true` for the entire `supervisor` role
   (`src/lib/constants.js:10`) — not scoped to "this is my own entry." So any Supervisor-role user
   sees an Edit button on **every** DPR log entry system-wide, including entries logged by someone
   else, even though only entries whose stored `supervisor` text matches their own name can
   actually be saved server-side.
5. Confirmed live against the real `dpr_log` table that this isn't theoretical: recent rows store
   `supervisor` as a lowercase, username-like string (`"mahesh"`, `"karan"`, `"durgendra"`) while
   the matching `team_members.name` is capitalized (`"Mahesh"`, `"Karan"`, `"Durgendra"`).
   Postgres `=` is case-sensitive, so even editing one's own entry can fail this check purely on
   casing, with no ownership confusion involved at all.

So there are two independent, stacking causes: (a) the Edit button's visibility check is
role-based, not ownership-based, letting a supervisor open entries that were never theirs to edit;
and (b) even a genuinely-own entry has no guaranteed match between the free-text supervisor field
and the editor's real team-member name, so the exact-match RLS check can fail on a typo/casing
difference alone. Either path ends the same way: RLS silently blocks the update, `.single()`
throws, the user sees "check console" with nothing actionable in the UI.

**Decision (2026-09-02, user's call after seeing the root cause)**: fix this permanently now
rather than hold for further discussion — the team losing confidence in the app from a repeat
report matters more than the usual discuss-first pacing for this one.

**Fix built**:
1. `supabase/migrations/0013_dpr_log_owner_id.sql` (new) — adds `dpr_log.created_by_id integer
   references team_members(id)`, the authenticated submitter's real id, set once at insert time
   and never touched again. Ownership is now a stored fact, not a re-derived string comparison.
   - `dpr_log_insert`'s `with check` now also requires `created_by_id = app_jwt_team_member_id()`
     — the client always sets this at insert time, and the check stops it being spoofed to claim
     (or leave null) someone else's entry.
   - `dpr_log_update` now checks `admin`/`manager` (unchanged) **or** `created_by_id =
     app_jwt_team_member_id()` — an id comparison, immune to the free-text field's casing/typo
     problem entirely. The old free-text `supervisor = app_active_team_member_name()` check is
     kept, but only as a fallback for rows where `created_by_id` is still null — it can never
     re-trigger the original bug for any row this fix actually covers.
   - **Backfill for existing rows**, run in two passes so real past entries aren't left worse off
     than today: first matched `supervisor` text to `team_members.name` (case/whitespace-
     insensitive), then — since a lot of real entries have the login *username* typed in instead
     of the display name (e.g. "shubham" vs. "Shubham Salvi", confirmed live: 12 of the 14 rows
     the first pass missed were exactly this) — a second pass matched against `team_members.username`
     too. Final result on the live table: 94 of 96 existing DPR rows now have a real
     `created_by_id`; the 2 that don't (`supervisor: "site supervisor"`, a placeholder from early
     testing, no real person to attribute) fall back to the preserved legacy check, unchanged from
     today — not a regression for any row.
2. `src/lib/mappers.js` — `rowToDpr` now reads `created_by_id` back as `createdById` (read-only,
   same convention as `id` itself: never written by `dprToRow`, only ever set explicitly at the
   one insert call site so an edit can never alter a row's original owner).
3. `src/sections/dpr/dprTab.js`:
   - New `canEditDPR(d)` helper: `true` for admin/manager; otherwise `d.createdById ?
     d.createdById===state.currentUser.id : d.supervisor===state.currentUser.name` — mirrors the
     RLS policy's own logic exactly (id match once one exists, legacy name-match fallback only
     when it doesn't), so the Edit button is never shown for an edit the database will then
     reject.
   - Both permission checks that used to compare against the free-text `d.supervisor` (the "✏️
     Edit this DPR" button's visibility, `openEditDPR()`'s guard) now call `canEditDPR(d)` instead
     of the old `canDo('addDPR')||state.currentUser.name===d.supervisor` — closing the actual
     button-visibility bug (any supervisor could previously see Edit on every entry, not just
     their own).
   - The insert call in `saveDPR()` now sends `created_by_id: state.currentUser.id` explicitly
     (the one and only place this column is ever set).
   - Unused `canDo` import removed from this file (nothing else in it still used it).

**Not changed**: the "Supervisor" field itself — still free text, still pre-fills from the
project's assigned supervisor, still fully editable — keeps its existing display/content purpose
exactly as before. It's just no longer what decides who may edit an entry.

**Verified**: `npm run build` clean. Migration applied directly to the live production database
(confirmed via `pg_policies`: both `dpr_log_insert`/`dpr_log_update` show the new id-based
conditions) and the backfill counts above were read back from the real table, not assumed.

**Audited the rest of the app for the same bug class** (per-row RLS ownership decided by a
free-text field the client's button-visibility doesn't precisely mirror), since the team
specifically doesn't want to keep re-reporting variants of this: read every `create policy` across
all migrations and cross-checked each role-gated one against the matching `ROLES.can` flag in
`constants.js` one by one — every single flag matches its policy exactly (including the
deliberately-asymmetric `addFinanceRow`, which correctly excludes `manager` on both sides — no
drift). `dpr_log` was the only table combining a per-row ownership RLS check with a free-text
identity field: `projects`/`material_lots`/`requests` updates use a permissive "any active member"
baseline (nothing to mismatch — DB accepts regardless of client button logic), `vendor_profiles`
insert keys off real `auth.uid()` (not free text), and `dpr_log`/`material_lots`/`finance_ledger`/
`vendor_profiles` have no delete policy at all but also have no delete button anywhere in the UI,
so nothing is silently unusable. One related instance found, already handled correctly by someone
before this session: `visibleProjects()` (`src/lib/helpers.js:59-67`) filters a Supervisor's
visible projects against the same historically-inconsistent `project.supervisor` free-text field,
but it already matches against both `username` and `name` with a comment explaining why — read-only
visibility (fails soft, not an error), left as-is. No other code changes needed.

### v2-22 follow-up: closed a transitional gap 0013 introduced (2026-09-03)

**Report**: the next morning, a team member (Durgendra, supervisor) got a *new* error saving a
DPR — `Could not save DPR to database — check console.` This is the **insert** path's error text
(`dprTab.js:570`), not the update-path text the original v2-22 report had (`...changes...`,
`:561`) — a different failure than yesterday's, not a recurrence of the same one.

**Root cause, confirmed against live production data, not guessed**: 0013's new `dpr_log_insert`
policy requires the row's `created_by_id` to match the caller's JWT — correct for any client
running the fixed JS, but it silently broke inserts from any browser tab/session still running the
*pre-0013* bundle (a phone that had the app open/backgrounded since before the fix deployed,
never force-refreshed) — that old code doesn't send `created_by_id` at all, so the field comes
through `null`, and `null = <id>` is never true in SQL. Confirmed live: `dpr_log`'s id sequence
(`dpr_log_id_seq`) had gaps at 103, 104, 105 that morning with no matching rows — the exact
signature of RLS-rejected insert attempts (a rejected insert still consumes the identity sequence
value via `nextval()` before the row is discarded, since sequence advancement isn't transactional
in Postgres). Two earlier gaps that same range (99, 100) were separately traced to my own RLS
verification script from the previous session, not real failures.

**Fix — moved ownership assignment from the client to the database, permanently, not just
patched for today**: the client-supplied `created_by_id` was the actual design flaw — any client
build that doesn't send it (an old cached bundle yesterday, potentially any future client bug)
hard-fails instead of just working, because insert-time ownership depended on the client getting
it right. `supabase/migrations/0014_dpr_log_trigger_set_owner.sql` (new) replaces that with a
`before insert` trigger (`dpr_log_set_created_by_id_trg`) that sets `new.created_by_id :=
app_jwt_team_member_id()` unconditionally — deriving it from the same JWT claim the RLS policy
already trusts, regardless of what the client sends or omits. The insert policy's `with check` no
longer compares `created_by_id` at all (nothing left to compare — the trigger already guarantees
it's correct before the row is checked); role gating (`admin`/`manager`/`supervisor`) is
unchanged. This closes not just today's instance but the entire class of "client forgot to send
the ownership field" failure for any future deploy that touches this table's insert path,
including one running stale cached JS — exactly the scenario that bit us this time.

**No client code change needed** — this is a pure server-side fix, which is also why it resolves
immediately for anyone with a stale tab still open right now, with no app reload/redeploy required
on their end. `npm run build` confirmed clean (bundle hash unchanged, `index-DCtF0Rdw.js`, since
no JS actually changed).

**Verified directly against production** in rolled-back transactions (no data persisted): an
insert simulating the exact stale-client scenario (authenticated as shubham, `created_by_id`
omitted entirely from the insert) now succeeds and is correctly attributed (`created_by_id: 3`);
a simulated spoofing attempt (authenticated as shubham, insert explicitly claiming
`created_by_id: 8`, mahesh's id) is silently corrected to `3` rather than merely rejected — the
trigger closes spoofing more completely than the old with-check comparison did, as a side effect
of fixing the actual bug.

### v2-23: "On Hold" project status (starting 2026-09-03)

**Request from the team**: add a 4th Status option, "On Hold", to the Edit Project form's Status
dropdown (pencil icon on a project card, All Projects tab). Today only Not Started / In Progress /
Completed exist. `projects.status` is a plain `text` column with no CHECK constraint
(`supabase/migrations/0001_baseline_schema.sql:34`), so this is frontend-only — no migration
needed.

**Design decisions confirmed with the user before building**:
1. Label: exactly "On Hold".
2. Alerts: On Hold gets the exact same blanket suppression Completed already gets in
   `computeAlerts()` — one shared early-return, no alert types fire for a paused project (overdue,
   at-risk, milestone-stalled, open constraints, no-progress, RA-bill-needed, finance-review-needed,
   snags, dispatch-pending, no-DPR-submitted all skipped, same as Completed today).
3. Badge color: reuse the existing `.bb` (blue) badge class from `src/styles/app.css` — already
   used elsewhere for neutral/informational badges (e.g. manpower, "awaiting approval" stages), not
   currently tied to any status meaning. No new CSS class needed.
4. Dashboard metrics row (`renderMetrics()`): a new standalone 6th tile, "On Hold" with a count,
   inserted next to the existing tiles. Every existing tile's number/wording stays unchanged.
5. Pipeline tab's phase board (`renderPipeline()` in `src/sections/gantt/ganttTab.js` — the 3-column
   Not started / In progress / Completed board, **not** the Gantt tab itself, which has no status
   columns): add a 4th "On Hold" column, matching the existing `ph-ns`/`ph-ip`/`ph-dn` pattern with
   a new `ph-hold` class (reusing `.bb`'s blue, `#d0e8f7`/`#0a3d6b`, for visual consistency with the
   badge).

**Design — files to change**:
1. `index.html:210` — Status `<select id="f-status-sel">` (Edit/Add Project form): add
   `<option>On Hold</option>`.
2. `index.html:84` — "All statuses" filter `<select id="f-status">` (All Projects list): add
   `<option>On Hold</option>`.
3. `src/lib/helpers.js` (`statusBadge()`, lines 53-57): add an explicit `On Hold` branch returning
   `<span class="badge bb">⏸ On Hold</span>`, ahead of the generic fallback so it no longer reads
   as "Not Started".
4. `src/sections/metrics.js` (`renderMetrics()`): compute `onHold` count explicitly; adjust the
   existing "not started" subtext calc (`total-done-ip`) to exclude it (`total-done-ip-onHold`) so
   an On-Hold project isn't double-counted as "not started"; add the new tile.
5. `src/sections/alerts.js` (`computeAlerts()`, line 13): change
   `if(p.status==='Completed') return;` to also match `'On Hold'`.
6. `src/sections/gantt/ganttTab.js` (`renderPipeline()`, lines 49-59): add a 4th entry to the
   `phases` array (`label:"On Hold"`, `cls:"ph-hold"`, `f:p=>p.status==='On Hold'`).
7. `src/styles/app.css`: add `.ph-hold{background:#d0e8f7;color:#0a3d6b}` near the existing
   `.ph-ns`/`.ph-ip`/`.ph-dn` definitions (line ~150).

**Not changed**: the "Completed" transition guards in `addEditProject.js` (installed-qty match,
Handover Checklist, milestone-done check) only trigger `if(newStatus==='Completed')` — untouched,
On Hold doesn't interact with them. No activity-log entry added for entering/leaving On Hold (no
existing precedent for logging every status change — only "completed" and "install started" are
currently logged). `dashboardTab.js`'s overdue calc and `clientPortal.js`'s milestone-active check
are left exactly as-is — out of scope for this request, not touched. `projectCards.js`'s inline
per-project badges (Overdue/stalled/open-constraint pills shown directly on the card) are a
separate render path from `computeAlerts()` and were correctly left untouched — they still show
real point-in-time facts about the project regardless of status, only the Active Alerts *count*
and notification bell are suppressed for On Hold.

**Verified live in the browser** (2026-09-03, local dev server, `VITE_TEST_MODE=true` mock data,
no production rows touched): `npm run build` clean. Logged in as `admin`/`1234`. Edit Project on
"Arun Seth — Supply only" — Status dropdown now offers "On Hold" alongside the other three;
selected it and saved. Confirmed all in one pass: project card badge now reads "⏸ On Hold" in the
blue `.bb` style; All Projects "On Hold" filter option present; dashboard metrics row now shows a
6th tile "On Hold — 1 — paused installs", and the "In progress" tile's "not started" subtext
correctly dropped from 1 to 0 (no longer double-counting the paused project); Active Alerts count
dropped from 6 to 0 for this project (Overdue/2 stalled/2 open constraint alerts all suppressed,
matching Completed's existing blanket-suppression behavior) while the project card's own
inline Overdue/stalled/open-constraint pills kept showing, confirming the two are correctly
independent; Pipeline tab now shows a 4th "On Hold" column (blue header, matching the Not
started/In progress/Completed columns' existing stacked layout) correctly listing the project.

### v2-24: notification "View project" always went to Team > Projects, even for Material/Finance/DPR alerts (starting 2026-09-03)

**Reported by the team**: a notification about Material or Finance (e.g. a dispatch pending
arrival, or a JMR/RA-bill review) always sent them to Team > Projects when clicked, instead of the
Material or Finance tab the alert was actually about. Same complaint applies to any module a
notification points at (DPR, Requests).

**Root cause**: every alert card in `buildNotifHTML()` (`src/sections/alerts.js`) rendered the same
`onclick="goToProject(...)"` button regardless of `a.type` — `goToProject` only knows how to open
Team > Projects and scroll to the project card. That's the right destination for project-level
alerts (overdue, at-risk, milestone-stalled, open constraint, no-progress, snag — all manageable
from that card), but wrong for `dispatch` (belongs on Material, at that lot), `rabill` /
`financereview` (belongs on Finance, in the same RA-bill/JMR fields the Finance tab's own inline
banner already opens via `openUpdate()`), and `nodpr` (the actual fix is filling in a DPR, not
looking at the project card). The request-related cards in `buildRequestActivityHTML()` (new
request / awaiting review / checklist pending) had no view action at all.

**Fix — `alertViewButtonHTML(a)`** (new, `alerts.js`) routes each alert type to a new type-specific
`goTo*` function instead of always calling `goToProject`:
- `dispatch` → `goToMaterialLot(projId, lotId)`: switches to the Material tab, scrolls to the
  specific lot card (`id="lot-<id>"`, added to `renderLotCard()` in `materialTab.js`; falls back to
  `id="mat-proj-<id>"` on the project wrapper, also added, if the lot isn't found).
- `rabill` / `financereview` → `goToFinanceProject(projId)`: switches to Finance, then opens the
  same `openUpdate(projId)` panel Finance's own "Set RA bill amount"/"Review now" buttons use — no
  new UI, just reachable from the notification too.
- `nodpr` → `goToDPRForProject(projId)`: switches to DPR, opens the Add DPR form pre-selected on
  that project (`openAddDPR()` in `dprTab.js` gained an optional `selectedProjId` param — falls
  back to the first visible project when omitted, so the existing no-arg call sites are unaffected).
- everything else (overdue, at-risk, milestone, constraint, no-progress, snag) still goes to
  `goToProject` — Team > Projects already has full management UI for these (milestones,
  constraints, snag escalate/cycle-status), confirmed by reading `projectCards.js`'s `renderDetail`.

Request-activity cards gained the same treatment: "New request" and "Awaiting review" cards now
have a "View in Requests →" button (`goToRequestCard(reqId)` — switches to Requests, clears any
active status filter so the card can't be hidden, scrolls to `id="req-card-<id>"`, added to
`renderRequestCard()` in `requestsTab.js`); "Checklist awaiting review" cards gained "View in DPR →"
(`goToDPRChecklist(projId)` — scrolls to `id="dpr-checklist-<projId>"`, added to the checklist
section wrapper in `renderDPR()`) alongside the existing Acknowledge button.

Every deep-link briefly outlines its target (`flashHighlight()` → new `.nav-highlight` CSS class,
`app.css`, a 2s pulse animation) so it's obvious what the click landed on, not just which tab.

**New functions exposed on `window`** (`domGlobals.js`): `goToMaterialLot`, `goToFinanceProject`,
`goToDPRForProject`, `goToDPRChecklist`, `goToRequestCard`.

**Not changed**: `showTeamDashboard()` (`teamAuth.js:125-126`) unconditionally resets to the
Projects tab every time any panel closes (`closePanel()` → `showTeamDashboard()` when logged in) —
pre-existing, app-wide behavior affecting every panel (Add Lot, Add Finance Row, Edit Project, ...),
not something this fix introduced or was asked to change. It only means that after using
`goToFinanceProject`/`goToDPRForProject` and then closing the panel, the user lands back on
Projects rather than staying on Finance/DPR — the deep-link itself still opens the correct
panel/fields, which was the actual complaint.

**Verified live in the browser** (2026-09-03, local dev server, `VITE_TEST_MODE=true` mock data, no
production rows touched — `.env.local`'s `VITE_TEST_MODE=false` was left untouched; test mode was
enabled only via a process env var for this session, not by editing the file): `npm run build`
clean. Logged in as `admin`/`1234`. From Alerts & Notifications: clicked "View in Finance →" on the
"JMR qty updated by installation team" alert for "Arun Seth — Supply only" — landed on the Finance
tab with the Update panel open, scrolled straight to JMR Qty Achieved (120, matching the alert) and
the RA Bill fields. Clicked "Fill DPR →" on the "No DPR ever submitted" alert for the same project —
opened the Add DPR form on the DPR tab with that exact project pre-selected in the Project dropdown
and Supervisor pre-filled. Added a test lot dispatch (dated today) to generate a `dispatch` alert,
then clicked "View in Material →" — landed on the Material tab scrolled directly to that lot card
with the pulse-highlight visible. No console errors during any of this. Dev server stopped
afterward, no production data affected.
No console errors during any of this. Dev server stopped afterward, no production data affected.