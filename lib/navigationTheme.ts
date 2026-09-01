import { Platform } from 'react-native';
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
    // Android's default full-width slide reads as janky (every dropped frame is
    // visible judder); the Material-style fade is short and calm per the design
    // language (§6). iOS keeps its standard interactive slide.
    animation: Platform.OS === 'android' ? ('fade_from_bottom' as const) : ('default' as const),
    // Covered screens stop re-rendering underneath a transition, freeing frame
    // budget. Data freshness is unaffected: every screen refetches on focus.
    freezeOnBlur: true,
  };
}
