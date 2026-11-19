// Desktop keyboard shortcuts (FEATURES.md -> Desktop). Pure: a key event in,
// an intent out — hooks/useKeyboardShortcuts.ts wires it to the window and
// Jest pins the table. Modifier choice follows the platform: ⌘ on macOS,
// Ctrl elsewhere ("mod").
//
//   mod+1 … mod+9        open channel N
//   Alt+↑ / Alt+↓        previous / next channel (Slack's binding)
//   mod+Shift+M          mute / unmute the microphone in a call (Discord's)
//   mod+,                settings
//   Esc                  (handled by the composer: cancel reply or edit)
//   Enter / Shift+Enter  (handled by the composer: send / new line)

export type ShortcutIntent =
  | { kind: 'channel-index'; index: number }
  | { kind: 'channel-step'; delta: -1 | 1 }
  | { kind: 'toggle-mic' }
  | { kind: 'settings' };

export type KeyLike = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

export function isMac(platform: string): boolean {
  return /Mac|iPhone|iPad/i.test(platform);
}

export function shortcutFor(e: KeyLike, mac: boolean): ShortcutIntent | null {
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (mod && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
    return { kind: 'channel-index', index: Number(e.key) - 1 };
  }
  if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    return { kind: 'channel-step', delta: e.key === 'ArrowUp' ? -1 : 1 };
  }
  if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'm') return { kind: 'toggle-mic' };
  if (mod && !e.shiftKey && !e.altKey && e.key === ',') return { kind: 'settings' };
  return null;
}

// The channel a step lands on, wrapping at the ends.
export function stepChannel(ids: string[], current: string | null, delta: -1 | 1): string | null {
  if (ids.length === 0) return null;
  const i = current ? ids.indexOf(current) : -1;
  if (i === -1) return delta === 1 ? ids[0] : ids[ids.length - 1];
  return ids[(i + delta + ids.length) % ids.length];
}

export function shortcutList(mac: boolean): { keys: string; action: string }[] {
  const mod = mac ? '⌘' : 'Ctrl';
  return [
    { keys: `${mod} 1–9`, action: 'Open a channel by its place in the list' },
    { keys: 'Alt ↑ / Alt ↓', action: 'Previous or next channel' },
    { keys: 'Enter', action: 'Send' },
    { keys: 'Shift Enter', action: 'New line' },
    { keys: '↑ in an empty message', action: 'Edit your last message' },
    { keys: 'Esc', action: 'Cancel a reply or an edit' },
    { keys: `${mod} Shift M`, action: 'Mute or unmute in a call' },
    { keys: `${mod} ,`, action: 'Settings' },
  ];
}
