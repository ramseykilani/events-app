import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { isMac, shortcutFor, type ShortcutIntent } from '../lib/shortcuts';

// Wires lib/shortcuts.ts to the window on web. Native has no hardware-key
// layer here (an iPad keyboard gets the same table once that ships —
// FEATURES.md -> Desktop, next steps).
export function useKeyboardShortcuts(onIntent: (intent: ShortcutIntent) => void): void {
  const handler = useRef(onIntent);
  handler.current = onIntent;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const mac = isMac(navigator.platform || navigator.userAgent);
    const listener = (e: KeyboardEvent) => {
      const intent = shortcutFor(e, mac);
      if (!intent) return;
      e.preventDefault();
      handler.current(intent);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
