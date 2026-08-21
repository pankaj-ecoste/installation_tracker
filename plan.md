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
