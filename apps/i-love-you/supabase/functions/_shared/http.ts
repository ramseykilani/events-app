import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// supabase-js always sends apikey and x-client-info alongside Authorization;
// all four must be allowed or the browser preflight blocks the call (the
// Events gotcha, AGENTS.md -> Key gotchas).
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export type Authed = { callerId: string; db: SupabaseClient };

// Verifies the caller's JWT with the anon client and hands back a
// service-role client for the definer-only claim functions. Response = the
// request is answered already (preflight, misconfiguration, 401).
export async function authenticate(req: Request): Promise<Authed | Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

  return { callerId: user.id, db: createClient(supabaseUrl, serviceRoleKey) };
}
