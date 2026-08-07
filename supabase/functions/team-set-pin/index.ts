// Phase C auth hardening. The only path left that can set a team member's PIN, now that
// pin_hash is one-way. Called from src/sections/team/teamMgmtTab.js's saveMember() whenever
// the PIN field is non-empty (blank = keep current PIN, per the approved Team Management UI
// exception in plan.md).
//
// Caller must present a valid signed team JWT (same one teamLogin() issued) with
// team_role: 'admin' — checked here explicitly, not left to RLS, since this bypasses RLS
// entirely via the service role key.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { jwtVerify } from 'npm:jose@5';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET = Deno.env.get('SB_JWT_SECRET')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse({ error: 'Not authenticated.' }, 401);

  let claims: Record<string, unknown>;
  try {
    const key = new TextEncoder().encode(JWT_SECRET);
    ({ payload: claims } = await jwtVerify(token, key));
  } catch {
    return jsonResponse({ error: 'Session expired — please log in again.' }, 401);
  }
  if (claims.team_role !== 'admin') {
    return jsonResponse({ error: 'Only an admin can change PINs.' }, 403);
  }

  let body: { memberId?: number; newPin?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Bad request.' }, 400);
  }
  const memberId = Number(body.memberId);
  const newPin = String(body.newPin || '').trim();
  if (!memberId || !newPin) return jsonResponse({ error: 'Bad request.' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await admin.rpc('set_member_pin_hash', {
    p_member_id: memberId,
    p_new_pin: newPin,
  });
  if (error) {
    console.error('set_member_pin_hash failed', error);
    return jsonResponse({ error: 'Could not save PIN — check console.' }, 500);
  }
  return jsonResponse({ ok: true });
});
