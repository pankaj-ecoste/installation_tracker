/* ══ SUPABASE ══
   Set VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example).
   Find them in Supabase: Project Settings → API. */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/* ══ TEST MODE ══
   Set VITE_TEST_MODE=true to run the entire app in-memory, with no Supabase connection at all —
   good for checking the UI/flows work before touching the real database.
   Leave false (with real URL/key above) to run against the real database.
   NOTE: the actual `db` client is created in supabaseClient.js, after the seed data and
   row-mapping functions are defined (mirrors the original "DB CLIENT INIT" ordering). */
export const TEST_MODE = import.meta.env.VITE_TEST_MODE === 'true';

/* ══ CONSTANTS ══ */
// TODAY drives every "late/on-track/days remaining" calculation in the app. In production
// this is the real current date; VITE_TODAY_OVERRIDE lets local/demo runs pin it to a fixed
// date instead (e.g. to reproduce a specific alert/gap scenario), same as the app previously
// had this hardcoded for its whole development history.
export const TODAY = import.meta.env.VITE_TODAY_OVERRIDE
  ? new Date(import.meta.env.VITE_TODAY_OVERRIDE)
  : new Date();
