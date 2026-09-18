import { DefaultTheme, type Theme } from '@react-navigation/native';
import type { ThemePalette } from '../constants/Colors';

// React Navigation's default card/container background is white. During stack
// transitions on Android the moving card's edge exposes it — invisible in
// Paper (near-white), glaring in Evening (Screen Transition Polish, 2026-09-01).
// The navigator chrome must come from the same role tokens as the screens.
export function navigationTheme(palette: ThemePalette): Theme {
  return {
    ...DefaultTheme,
    dark: palette.statusBar === 'light-content',
    colors: {
      ...DefaultTheme.colors,
      primary: palette.accent,
      background: palette.background,
      card: palette.background,
      text: palette.textPrimary,
      border: palette.border,
    },
  };
}

export function themedScreenOptions(palette: ThemePalette) {
  return {
    headerShown: false,
    contentStyle: { backgroundColor: palette.background },
    // Covered screens stop re-rendering underneath a transition, freeing frame
    // budget. Data freshness is unaffected: every screen refetches on focus.
    // (Android's animation stays the platform default slide — the Material
    // fade_from_bottom was owner-rejected on device, 2026-09-01.)
    freezeOnBlur: true,
  };
}
