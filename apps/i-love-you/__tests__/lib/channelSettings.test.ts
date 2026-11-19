import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  SETTINGS,
  describeChannel,
  isValidValue,
  notifyLevel,
  settingValue,
  withSetting,
} from '../../lib/channelSettings';

// The settings registry has two halves: setting_definitions (server: keys,
// scopes, types, options, defaults) and lib/channelSettings.ts (client:
// labels, help, grouping). This test parses the migrations and fails when the
// halves drift, which is what keeps "add a setting" a two-entry change.

const MIGRATIONS = join(__dirname, '../../supabase/migrations');

function serverDefinitions() {
  const sql = readdirSync(MIGRATIONS)
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n');
  // Up to the statement's closing "');" — comments inside it may hold semicolons.
  const block = sql.split('INSERT INTO public.setting_definitions')[1].split(/'\);\s*\n/)[0];
  const rows = [...block.matchAll(/\('([a-z_]+)', '(shared|personal)', '(boolean|choice)', (NULL|ARRAY\[[^\]]*\]), '([^']+)'/g)];
  return rows.map((r) => ({
    key: r[1],
    scope: r[2],
    type: r[3],
    options: r[4] === 'NULL' ? null : [...r[4].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]),
    default: JSON.parse(r[5]),
  }));
}

describe('settings registry', () => {
  const server = serverDefinitions();

  it('parses every server definition', () => {
    expect(server.length).toBeGreaterThanOrEqual(7);
  });

  it('client and server define the same settings with the same shape', () => {
    expect(SETTINGS.map((s) => s.key).sort()).toEqual(server.map((s) => s.key).sort());
    for (const def of SETTINGS) {
      const s = server.find((x) => x.key === def.key)!;
      expect({ key: def.key, scope: def.scope, type: def.type, default: def.default }).toEqual({
        key: s.key,
        scope: s.scope,
        type: s.type,
        default: s.default,
      });
      if (def.type === 'choice') expect(def.options.map((o) => o.value)).toEqual(s.options);
    }
  });

  it('every setting has a label and help text', () => {
    for (const def of SETTINGS) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.help.length).toBeGreaterThan(0);
    }
  });
});

describe('settingValue / withSetting', () => {
  const channel: { settings: Record<string, boolean | string>; my_settings: Record<string, boolean | string> } = {
    settings: { read_receipts: true },
    my_settings: { notify_level: 'quiet' },
  };

  it('reads stored values and falls back to defaults', () => {
    expect(settingValue(channel, 'read_receipts')).toBe(true);
    expect(settingValue(channel, 'items_completable')).toBe(false);
    expect(notifyLevel(channel)).toBe('quiet');
    expect(settingValue({ settings: {}, my_settings: { notify_level: 'loud' } }, 'notify_level')).toBe('notify');
  });

  it('writes to the scope the registry names', () => {
    const shared = withSetting(channel, 'items_completable', true);
    expect(shared.settings.items_completable).toBe(true);
    const personal = withSetting(channel, 'notify_level', 'none');
    expect(personal.my_settings.notify_level).toBe('none');
    expect(personal.settings).toBe(channel.settings);
  });

  it('validates values against the definition', () => {
    expect(isValidValue('notify_level', 'quiet')).toBe(true);
    expect(isValidValue('notify_level', 'loud')).toBe(false);
    expect(isValidValue('read_receipts', 'yes')).toBe(false);
    expect(isValidValue('nope', true)).toBe(false);
  });

  it('describes a channel by its settings, not its name', () => {
    expect(describeChannel({ settings: { items_completable: true, allow_urgent: true }, my_settings: { notify_level: 'quiet' } })).toBe(
      'Quiet · Items · Needs-you-now'
    );
    expect(describeChannel({ settings: {}, my_settings: {} })).toBe('');
  });
});
