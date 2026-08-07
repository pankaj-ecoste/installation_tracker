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
| C | Auth hardening (team login + client portal via Edge Functions, signed JWT) | ⬜ Pending |
| D | RLS + storage policies + go-live env vars | ⬜ Pending |
| E | Full manual regression pass, old file vs new app, per role | ⬜ Pending |
| F | Vercel deployment | ⬜ Pending |

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

### Next session should start with

Phase C: deploy the `team-login`/`client-login` Edge Functions, hash-migrate PINs (bcrypt via
`pgcrypto`), switch `teamLogin()`/`doClientLogin()` to call them. See the architecture doc's
"Auth & RLS design" section for the exact JWT-claims design. Given the Phase B lesson above,
double-check any other spot the doc assumes is "invisible" against the real render code before
implementing, not just before shipping.
