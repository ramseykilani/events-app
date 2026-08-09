import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    ...(Platform.OS === 'web' ? { lock: noOpLock } : {}),
  },
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (see .env.example), then restart ' +
      'the Expo dev server. Auth and data calls will fail until then.'
  );
}
