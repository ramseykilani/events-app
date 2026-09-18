import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Colors,
  DEFAULT_THEME,
  THEME_REGISTRY,
  type ThemeName,
  type ThemePalette,
} from '../../constants/Colors';
import { applyWebBrowserChrome } from '../../lib/applyWebBrowserChrome';

// Stable storage key — a rename would silently reset every user's chosen mood.
const THEME_STORAGE_KEY = 'theme_preference';

type ThemeContextType = {
  themeName: ThemeName;
  theme: ThemePalette;
  setTheme: (name: ThemeName) => void;
  isLoaded: boolean;
};

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && THEME_REGISTRY.some((t) => t.name === value);
}

// Defaults double as the fallback for tests that render outside the provider:
// no provider means Paper.
const ThemeContext = createContext<ThemeContextType>({
  themeName: DEFAULT_THEME,
  theme: Colors[DEFAULT_THEME],
  setTheme: () => {},
  isLoaded: false,
});

export function ThemeContextProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (isThemeName(stored)) setThemeName(stored);
      })
      .catch(() => {
        // A unreadable store falls back to the default theme.
      })
      .finally(() => setIsLoaded(true));
  }, []);

  // Keep iOS Safari / browser chrome (status bar, Dynamic Island tint) in
  // sync with Paper/Evening — native StatusBar does nothing on web.
  useEffect(() => {
    applyWebBrowserChrome(Colors[themeName]);
  }, [themeName]);

  const setTheme = (name: ThemeName) => {
    setThemeName(name);
    AsyncStorage.setItem(THEME_STORAGE_KEY, name).catch((err) =>
      console.error('Failed to persist theme preference:', err)
    );
  };

  return (
    <ThemeContext.Provider
      value={{ themeName, theme: Colors[themeName], setTheme, isLoaded }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(ThemeContext);
}

export default ThemeContextProvider;
