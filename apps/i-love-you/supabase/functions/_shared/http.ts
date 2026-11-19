// Shared plumbing for I Love You's edge functions. No remote imports on
// purpose: the functions talk to Auth and PostgREST with plain fetch, so a
// cold start never waits on (or fails at) a module CDN, and the local stack
// boots them offline.

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

export type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export type Authed = { callerId: string; rpc: Rpc };

const BACKSTOP_MS = 10_000;

// Verifies the caller's JWT against Auth (/auth/v1/user) and hands back an
// rpc() bound to the service role, for the definer-only claim functions.
// A Response = the request is already answered (preflight, 405, 500, 401).
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
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'Unauthorized' }, 401);

  let callerId: string | undefined;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authHeader },
      signal: AbortSignal.timeout(BACKSTOP_MS),
    });
    if (res.ok) callerId = (await res.json())?.id;
  } catch {
    // fall through to 401
  }
  if (!callerId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const rpc: Rpc = async (name, args) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(BACKSTOP_MS),
    });
    if (!res.ok) throw new Error(`rpc ${name} failed: ${res.status} ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  return { callerId, rpc };
}
