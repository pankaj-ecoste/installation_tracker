// Phase C auth hardening. Replaces the old client-side plaintext PIN check
// (`state.teamMembers.find(m=>m.pin===pass)`) with a server-side bcrypt check.
//
// Flow:
//   1. Look up + verify {username, pin} via the `team_login_verify` Postgres function
//      (bcrypt compare happens in Postgres via pgcrypto — see 0003_auth_hardening.sql).
//   2. On success, sign a JWT with the project's own JWT secret carrying the same
//      claims shape PostgREST/GoTrue JWTs use (`role: authenticated`) plus custom
//      `team_member_id`/`team_role`/`team_username` claims for RLS (Phase D) to read
//      via auth.jwt().
//   3. Update last_login (same display-string format the client used to set itself).
//   4. Return {token, member} — member never includes pin or pin_hash.
//
// On failure: same generic "Invalid username or PIN." message for every failure mode
// (unknown username, wrong PIN, inactive member) — no enumeration hints.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { SignJWT } from 'npm:jose@5';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET = Deno.env.get('SB_JWT_SECRET')!;

const GENERIC_ERROR = 'Invalid username or PIN.';

function todayDisplay(): string {
  return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body: { username?: string; pin?: string; remember?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: GENERIC_ERROR }, 400);
  }
  const username = (body.username || '').trim();
  const pin = (body.pin || '').trim();
  const remember = body.remember === true;
  if (!username || !pin) return jsonResponse({ error: GENERIC_ERROR }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: rows, error } = await admin.rpc('team_login_verify', {
    p_username: username,
    p_pin: pin,
  });
  if (error) {
    console.error('team_login_verify failed', error);
    return jsonResponse({ error: GENERIC_ERROR }, 401);
  }
  const member = Array.isArray(rows) ? rows[0] : rows;
  if (!member) return jsonResponse({ error: GENERIC_ERROR }, 401);

  const lastLogin = todayDisplay();
  const { error: updateErr } = await admin
    .from('team_members')
    .update({ last_login: lastLogin })
    .eq('id', member.id);
  if (updateErr) console.error('Failed to update last_login', updateErr);

  const key = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT({
    role: 'authenticated',
    team_member_id: member.id,
    team_role: member.role,
    team_username: member.username,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(remember ? '30d' : '12h') // v2-6: "Remember me" — see plan.md
    .sign(key);

  return jsonResponse({
    token,
    member: {
      id: member.id,
      name: member.name,
      username: member.username,
      role: member.role,
      dept: member.dept,
      wa: member.wa || '',
      active: member.active,
      lastLogin,
      email: member.email || '',
    },
  });
});
