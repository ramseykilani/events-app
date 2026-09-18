import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { boundedFetch } from './timeoutSignal';

// createClient throws on an empty URL, and a module-level throw in a release
// binary is an instant launch crash before React mounts. A build missing the
// env vars (e.g. an EAS profile without them) must degrade to failing data
// calls instead, so empty config resolves to a syntactically valid placeholder.
export function resolveClientConfig(
  url: string,
  key: string
): { url: string; key: string; isConfigured: boolean } {
  const isConfigured = url.length > 0 && key.length > 0;
  return {
    url: isConfigured ? url : 'https://placeholder.supabase.co',
    key: isConfigured ? key : 'placeholder-anon-key',
    isConfigured,
  };
}

const {
  url: clientUrl,
  key: clientKey,
  isConfigured,
} = resolveClientConfig(
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''
);

// Web Locks (navigator.locks) are browser-process-wide per origin and are not
// reliably released when a tab reloads/closes mid-auth-operation — the orphan
// makes every later getSession() wait forever: an infinite boot spinner on
// plain page reloads (caught by the release review). Native already runs with
// auth-js's no-op lock, so web now matches. Trade-off: two web tabs can race a
// token refresh; the loser falls back to the sign-in screen (SessionContext)
// instead of hanging.
async function noOpLock<T>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>
): Promise<T> {
  return fn();
}

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    ...(Platform.OS === 'web' ? { lock: noOpLock } : {}),
  },
  global: {
    // auth-js has no timeout support and RN's OkHttp client defaults to
    // infinite timeouts, so a black-holed token refresh used to hang the boot
    // spinner forever (KI-013). supabase-js forwards this fetch to auth,
    // postgrest, storage, and functions — one backstop bounds them all.
    fetch: boundedFetch,
  },
});

if (!isConfigured) {
  console.warn(
    'Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (see .env.example), then restart ' +
      'the Expo dev server. Auth and data calls will fail until then.'
  );
}
