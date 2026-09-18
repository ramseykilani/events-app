import { useThemePreference } from './ThemeContext';

// Returns the active theme's role-token palette. Outside a ThemeContextProvider
// (e.g. component tests) the context default applies, which is Paper.
export function useTheme() {
  return useThemePreference().theme;
}
