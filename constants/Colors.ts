import { Platform } from 'react-native';
import type { StatusBarStyle, TextStyle } from 'react-native';

// Role-token palettes for the two named themes, per docs/events-design-language.md §3.
// Tokens are named by role, never by value — a theme is a value-swap under fixed
// role names, which is what makes a future third theme cheap (doc §8).

// Paper sets display titles in a serif face; Evening in a clean sans-serif (doc §4).
// No bundled font files — platform generic families keep both moods everywhere.
const paperTitleFont = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  web: 'Georgia, "Times New Roman", serif',
  default: 'serif',
});

const eveningTitleFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  default: 'sans-serif',
});

export type ThemePalette = {
  background: string;
  surface: string;
  surfaceSecondary: string;
  selectedBg: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderLight: string;
  primaryButtonBg: string;
  primaryButtonText: string;
  destructiveBg: string;
  destructiveText: string;
  destructiveLink: string;
  linkText: string;
  calendarSelected: string;
  calendarSelectedText: string;
  calendarTodayText: string;
  accent: string;
  accentSoft: string;
  shadow: string;
  titleFontFamily: string;
  // Inverted-weight principle (doc §4): display type runs light, not heavy.
  titleFontWeight: TextStyle['fontWeight'];
  statusBar: StatusBarStyle;
};

export const Colors: Record<'paper' | 'evening', ThemePalette> = {
  paper: {
    background: '#faf7f0',
    surface: '#ffffff',
    surfaceSecondary: '#f1ece0',
    selectedBg: '#f3ecda',
    textPrimary: '#1a1815',
    textSecondary: '#6b6357',
    // 4.83:1 on background — the design doc (§3) promises ≥4.5:1 for all
    // text-role pairs; the previous #a39a8b measured 2.6:1 (release review).
    textTertiary: '#756c5d',
    border: '#e3dcc9',
    borderLight: '#efe9da',
    primaryButtonBg: '#1a1815',
    primaryButtonText: '#faf7f0',
    destructiveBg: '#f7e3dd',
    destructiveText: '#c2482f',
    destructiveLink: '#c2482f',
    // 5.40:1 on background (was #a3691a at 4.27:1, under the doc's ≥4.5:1 floor).
    linkText: '#8f5a10',
    calendarSelected: '#c8871e',
    calendarSelectedText: '#ffffff',
    calendarTodayText: '#c8871e',
    accent: '#c8871e',
    accentSoft: '#f0e2c4',
    shadow: '#1a1815',
    titleFontFamily: paperTitleFont,
    titleFontWeight: '400',
    statusBar: 'dark-content',
  },
  evening: {
    background: '#17151a',
    surface: '#211d24',
    surfaceSecondary: '#2a2635',
    selectedBg: '#2e2a3a',
    textPrimary: '#ece7df',
    textSecondary: '#a49fb0',
    // 5.14:1 on background (was #6e6879 at 3.38:1, under the doc's floor).
    textTertiary: '#8b85a0',
    border: '#37334a',
    borderLight: '#282435',
    primaryButtonBg: '#d9a05b',
    primaryButtonText: '#2a1d10',
    destructiveBg: '#38222a',
    destructiveText: '#e08a7a',
    destructiveLink: '#e08a7a',
    linkText: '#d9a05b',
    calendarSelected: '#d9a05b',
    calendarSelectedText: '#2a1d10',
    calendarTodayText: '#d9a05b',
    accent: '#d9a05b',
    accentSoft: '#3a2f23',
    shadow: '#000000',
    titleFontFamily: eveningTitleFont,
    titleFontWeight: '300',
    statusBar: 'light-content',
  },
};

export type ThemeName = keyof typeof Colors;

export const DEFAULT_THEME: ThemeName = 'paper';

// The registry is the theme picker's contract (doc §7): a future theme needs
// only a palette above plus an entry here — no component changes.
export const THEME_REGISTRY: { name: ThemeName; label: string }[] = [
  { name: 'paper', label: 'Paper' },
  { name: 'evening', label: 'Evening' },
];
