import type { Channel, SettingValue, Settings } from './types';

// The client half of the settings registry (FEATURES.md -> Channel Settings).
// The server's setting_definitions table is the source of truth for keys,
// scopes, types, options and defaults; this file adds what only the client
// needs — labels, help text, option wording, and the group a setting renders
// in. __tests__/lib/channelSettings.test.ts parses the migration and fails if
// the two lists drift, so a new setting is: one migration row, one entry
// here, and the behavior that reads it.
//
// Channels have no behavior of their own. Every difference between two
// channels is one of these values, and either partner can change any shared
// one at any time.

export type SettingScope = 'shared' | 'personal';

type Base = {
  key: string;
  scope: SettingScope;
  label: string;
  help: string;
  group: 'notifications' | 'conversation';
};

export type BooleanSetting = Base & { type: 'boolean'; default: boolean };
export type ChoiceSetting = Base & {
  type: 'choice';
  default: string;
  options: { value: string; label: string; help: string }[];
};
export type SettingDefinition = BooleanSetting | ChoiceSetting;

export const SETTINGS: SettingDefinition[] = [
  {
    key: 'notify_level',
    scope: 'personal',
    type: 'choice',
    default: 'notify',
    group: 'notifications',
    label: 'Notifications',
    help: 'Just for you. The unread dot shows either way.',
    options: [
      { value: 'notify', label: 'Notify', help: 'Sound and a banner.' },
      { value: 'quiet', label: 'Deliver quietly', help: 'Lands in your notifications without a sound or banner.' },
      { value: 'none', label: 'Off', help: 'Never notifies. Muted.' },
    ],
  },
  {
    key: 'notify_sound',
    scope: 'personal',
    type: 'choice',
    default: 'default',
    group: 'notifications',
    label: 'Sound',
    help: 'What this channel sounds like when it notifies you.',
    options: [
      { value: 'default', label: 'Default', help: 'Your device’s notification sound.' },
      { value: 'chime', label: 'Chime', help: 'A soft two-note chime.' },
      { value: 'none', label: 'Silent', help: 'A banner without a sound.' },
    ],
  },
  {
    key: 'notify_preview',
    scope: 'personal',
    type: 'boolean',
    default: true,
    group: 'notifications',
    label: 'Show message text',
    help: 'Off shows only the channel name on your lock screen.',
  },
  {
    key: 'read_receipts',
    scope: 'shared',
    type: 'boolean',
    default: false,
    group: 'conversation',
    label: 'Read receipts',
    help: 'You both see “Seen” when the other has read up to a message.',
  },
  {
    key: 'typing_indicator',
    scope: 'shared',
    type: 'boolean',
    default: true,
    group: 'conversation',
    label: 'Typing indicator',
    help: 'You both see when the other is typing.',
  },
  {
    key: 'items_completable',
    scope: 'shared',
    type: 'boolean',
    default: false,
    group: 'conversation',
    label: 'Items can be marked done',
    help: 'Each message gets a circle to tick off. Open ones stay findable.',
  },
  {
    key: 'allow_urgent',
    scope: 'shared',
    type: 'boolean',
    default: false,
    group: 'conversation',
    label: 'Allow “needs you now”',
    help: 'A message can be flagged to notify even when this channel is quiet or off.',
  },
];

export const SETTINGS_BY_KEY: Record<string, SettingDefinition> = Object.fromEntries(
  SETTINGS.map((s) => [s.key, s])
);

export function settingsInGroup(group: SettingDefinition['group']): SettingDefinition[] {
  return SETTINGS.filter((s) => s.group === group);
}

// The effective value of a setting for a channel: stored value when it fits
// the definition, otherwise the default. The server already returns effective
// values; this guards optimistic writes and cached rows from an older build.
export function settingValue(channel: Pick<Channel, 'settings' | 'my_settings'>, key: string): SettingValue {
  const def = SETTINGS_BY_KEY[key];
  if (!def) throw new Error(`Unknown setting ${key}`);
  const stored: Settings = def.scope === 'shared' ? channel.settings : channel.my_settings;
  const value = stored?.[key];
  if (def.type === 'boolean') return typeof value === 'boolean' ? value : def.default;
  return typeof value === 'string' && def.options.some((o) => o.value === value) ? value : def.default;
}

export function isOn(channel: Pick<Channel, 'settings' | 'my_settings'>, key: string): boolean {
  return settingValue(channel, key) === true;
}

export type NotifyLevel = 'notify' | 'quiet' | 'none';

export function notifyLevel(channel: Pick<Channel, 'settings' | 'my_settings'>): NotifyLevel {
  return settingValue(channel, 'notify_level') as NotifyLevel;
}

// A channel with its setting changed — the optimistic copy the UI shows while
// set_channel_setting is in flight.
export function withSetting<T extends Pick<Channel, 'settings' | 'my_settings'>>(
  channel: T,
  key: string,
  value: SettingValue
): T {
  const def = SETTINGS_BY_KEY[key];
  if (!def) throw new Error(`Unknown setting ${key}`);
  return def.scope === 'shared'
    ? { ...channel, settings: { ...channel.settings, [key]: value } }
    : { ...channel, my_settings: { ...channel.my_settings, [key]: value } };
}

export function isValidValue(key: string, value: SettingValue): boolean {
  const def = SETTINGS_BY_KEY[key];
  if (!def) return false;
  if (def.type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'string' && def.options.some((o) => o.value === value);
}

// One line under the channel name in the channel's settings sheet header and
// the manage list: what makes this channel behave the way it does.
export function describeChannel(channel: Pick<Channel, 'settings' | 'my_settings'>): string {
  const parts: string[] = [];
  const level = notifyLevel(channel);
  if (level === 'quiet') parts.push('Quiet');
  if (level === 'none') parts.push('Muted');
  if (isOn(channel, 'items_completable')) parts.push('Items');
  if (isOn(channel, 'read_receipts')) parts.push('Receipts');
  if (isOn(channel, 'allow_urgent')) parts.push('Needs-you-now');
  return parts.join(' · ');
}

// The icons a channel can wear (Ionicons outline set, tinted by role tokens —
// never emoji). The server only checks the name's shape; this is the menu.
export const CHANNEL_ICONS = [
  'chatbubbles-outline',
  'heart-outline',
  'checkbox-outline',
  'home-outline',
  'cart-outline',
  'calendar-outline',
  'airplane-outline',
  'cash-outline',
  'leaf-outline',
  'moon-outline',
  'sunny-outline',
  'book-outline',
  'musical-notes-outline',
  'restaurant-outline',
  'gift-outline',
  'paw-outline',
  'happy-outline',
  'sparkles-outline',
  'flower-outline',
  'ellipse-outline',
] as const;
