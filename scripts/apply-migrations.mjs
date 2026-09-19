#!/usr/bin/env node
// Applies the supabase/migrations/*.sql files that have NOT been applied yet, in filename order,
// to whatever Postgres connection string is given. Use the session pooler connection string
// (aws-*.pooler.supabase.com:5432), not the direct db.<ref>.supabase.co one.
//
// Usage:
//   DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" \
//     node scripts/apply-migrations.mjs             # apply every pending migration
//     node scripts/apply-migrations.mjs --dry-run   # only list what WOULD be applied (no writes at all)
//     node scripts/apply-migrations.mjs --baseline  # one-time: record every file as already applied, run nothing
//
// v2-40 — WHY THIS TRACKS APPLIED FILES: this script used to re-apply EVERY file on every run. That
// is unsafe here because later migrations deliberately override earlier ones (0013/0014 redefine the
// dpr_log policies that 0004 created), so a full re-run re-created 0004's old policies, then aborted at
// the first non-re-runnable file — silently reverting a production fix (supervisors could no longer edit
// their own DPRs; see plan.md v2-40). Applied files are now recorded in app_migrations.applied (its own
// schema, so PostgREST never exposes it) and never run twice.
//
// RULES: (1) never edit a migration that has already been applied and expect a re-run to pick it up —
// add a NEW numbered file instead; (2) a migration that overrides an earlier one must live in a LATER
// file, which is fine now because earlier files are never replayed.
//
// SAFETY: if the database already has the app's tables but no tracking table, this refuses to run
// (it would replay everything). Run --baseline once against such a database first.

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(__dirname, '..', 'supabase', 'migrations')

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const BASELINE = args.includes('--baseline')
if (DRY_RUN && BASELINE) {
  console.error('Use either --dry-run or --baseline, not both.')
  process.exit(2)
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('Set DATABASE_URL to the session-pooler connection string first.')
  process.exit(2)
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()
if (files.length === 0) {
  console.error('No migrations found.')
  process.exit(2)
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function trackingTableExists() {
  const { rows } = await client.query("select to_regclass('app_migrations.applied') as t")
  return rows[0].t !== null
}
async function appTablesExist() {
  const { rows } = await client.query("select to_regclass('public.projects') as t")
  return rows[0].t !== null
}
async function ensureTrackingTable() {
  await client.query('create schema if not exists app_migrations')
  await client.query(
    'create table if not exists app_migrations.applied (filename text primary key, applied_at timestamptz not null default now())'
  )
}
async function appliedSet() {
  if (!(await trackingTableExists())) return new Set()
  const { rows } = await client.query('select filename from app_migrations.applied')
  return new Set(rows.map(r => r.filename))
}

async function main() {
  await client.connect()
  // One runner at a time, and never wait forever on a lock held by live traffic.
  await client.query('select pg_advisory_lock(727001)')
  await client.query("set lock_timeout = '10s'")

  const hasTracking = await trackingTableExists()
  const applied = await appliedSet()

  if (BASELINE) {
    if (!(await appTablesExist())) {
      console.error('--baseline refused: this database has no app tables yet, so there is nothing to record as applied.')
      console.error('Run without --baseline to apply the migrations for real.')
      process.exit(1)
    }
    await ensureTrackingTable()
    let added = 0
    for (const file of files) {
      if (applied.has(file)) continue
      await client.query('insert into app_migrations.applied (filename) values ($1) on conflict do nothing', [file])
      console.log(`  baselined ${file}`)
      added++
    }
    console.log(`\nBaseline done: ${added} file(s) newly recorded as applied, ${applied.size} already recorded. Nothing was executed.`)
    return
  }

  if (!hasTracking && (await appTablesExist())) {
    console.error('Refusing to run: this database already has the app tables but no migration tracking,')
    console.error('so every file would be replayed (that is what reverted a production fix — plan.md v2-40).')
    console.error('If it is already fully migrated, run once with --baseline, then re-run this command.')
    process.exit(1)
  }

  const pending = files.filter(f => !applied.has(f))
  if (pending.length === 0) {
    console.log(`Nothing to apply — all ${files.length} migration(s) already recorded as applied.`)
    return
  }

  if (DRY_RUN) {
    console.log(`Dry run — ${pending.length} migration(s) would be applied (nothing was executed):`)
    for (const f of pending) console.log(`  -> ${f}`)
    return
  }

  await ensureTrackingTable()
  console.log(`Connected. Applying ${pending.length} pending migration(s) (${files.length - pending.length} already applied):`)
  for (const file of pending) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    console.log(`  -> ${file}`)
    try {
      // The file and its "applied" record commit together, so a failure leaves neither behind.
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into app_migrations.applied (filename) values ($1)', [file])
      await client.query('commit')
    } catch (err) {
      await client.query('rollback').catch(() => {})
      console.error(`\nFailed applying ${file} (rolled back, not recorded as applied):`)
      console.error(err.message)
      process.exit(1)
    }
  }
  console.log('\nAll pending migrations applied successfully.')
}

main()
  .then(() => client.end())
  .catch(async err => {
    console.error(err)
    await client.end().catch(() => {})
    process.exit(1)
  })
