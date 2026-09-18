import { Platform } from 'react-native';
import type { ThemePalette } from '../constants/Colors';

const THEME_COLOR_META = 'theme-color';
const SAFARI_CHROME_ID = 'events-safari-chrome';

/**
 * Keep browser chrome (iOS Safari status bar / Dynamic Island tint, Android
 * address bar, form controls) aligned with the active named theme.
 *
 * react-native-web's StatusBar is a no-op, so native barStyle alone never
 * reaches the browser. Safari samples html/body (and nearby fixed edges);
 * other browsers still honor theme-color.
 */
export function applyWebBrowserChrome(theme: ThemePalette): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const colorScheme = theme.statusBar === 'light-content' ? 'dark' : 'light';
  const root = document.documentElement;
  root.style.colorScheme = colorScheme;
  root.style.backgroundColor = theme.background;
  document.body.style.backgroundColor = theme.background;
  document.body.style.colorScheme = colorScheme;

  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${THEME_COLOR_META}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = THEME_COLOR_META;
    document.head.appendChild(meta);
  }
  meta.content = theme.background;

  // Safari 26+ ignores theme-color and tints from fixed edge elements / body.
  // Keep a tiny fixed sampler at the top so the island area tracks Evening.
  let sampler = document.getElementById(SAFARI_CHROME_ID);
  if (!sampler) {
    sampler = document.createElement('div');
    sampler.id = SAFARI_CHROME_ID;
    sampler.setAttribute('aria-hidden', 'true');
    Object.assign(sampler.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '6px',
      pointerEvents: 'none',
      zIndex: '0',
    });
    document.body.prepend(sampler);
  }
  sampler.style.backgroundColor = theme.background;
}
