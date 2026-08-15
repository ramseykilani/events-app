// Exercises the real lib/supabase module (every other suite mocks it).
// Regression guard for the 2026-08-15 launch crash: an EAS build without the
// EXPO_PUBLIC_SUPABASE_* env vars died at module scope because createClient
// throws on an empty URL. (jest-expo inlines EXPO_PUBLIC_* at transform time,
// so the empty-config path is tested via resolveClientConfig directly rather
// than by mutating process.env.)

import { resolveClientConfig, supabase } from '../../lib/supabase';

describe('lib/supabase client config', () => {
  it('falls back to a valid placeholder when the env config is missing', () => {
    const config = resolveClientConfig('', '');

    expect(config.isConfigured).toBe(false);
    // createClient throws on empty strings; the placeholder must parse.
    expect(() => new URL(config.url)).not.toThrow();
    expect(config.key.length).toBeGreaterThan(0);
  });

  it('passes the real config through when present', () => {
    expect(resolveClientConfig('https://example.supabase.co', 'anon-key')).toEqual({
      url: 'https://example.supabase.co',
      key: 'anon-key',
      isConfigured: true,
    });
  });

  it('module load constructs a client without throwing', () => {
    expect(supabase).toBeDefined();
  });
});
