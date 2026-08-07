import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ThemeContextProvider,
  useThemePreference,
} from '../../../app/_context/ThemeContext';
import { useTheme } from '../../../hooks/useTheme';
import { Colors } from '../../../constants/Colors';

function ThemeProbe() {
  const { themeName, theme, setTheme, isLoaded } = useThemePreference();
  return (
    <>
      <Text testID="theme-name">{themeName}</Text>
      <Text testID="background">{theme.background}</Text>
      <Text testID="loaded">{String(isLoaded)}</Text>
      <TouchableOpacity testID="set-evening" onPress={() => setTheme('evening')} />
    </>
  );
}

function UseThemeProbe() {
  const theme = useTheme();
  return <Text testID="background">{theme.background}</Text>;
}

describe('ThemeContextProvider', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('defaults to Paper with the paper palette once loaded', async () => {
    const screen = render(
      <ThemeContextProvider>
        <ThemeProbe />
      </ThemeContextProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('loaded').props.children).toBe('true')
    );
    expect(screen.getByTestId('theme-name').props.children).toBe('paper');
    expect(screen.getByTestId('background').props.children).toBe(
      Colors.paper.background
    );
  });

  it('switches theme immediately and persists the choice', async () => {
    const screen = render(
      <ThemeContextProvider>
        <ThemeProbe />
      </ThemeContextProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('loaded').props.children).toBe('true')
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('set-evening'));
    });

    expect(screen.getByTestId('theme-name').props.children).toBe('evening');
    expect(screen.getByTestId('background').props.children).toBe(
      Colors.evening.background
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'theme_preference',
      'evening'
    );
  });

  it('restores a stored theme on mount', async () => {
    await AsyncStorage.setItem('theme_preference', 'evening');

    const screen = render(
      <ThemeContextProvider>
        <ThemeProbe />
      </ThemeContextProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('loaded').props.children).toBe('true')
    );
    expect(screen.getByTestId('theme-name').props.children).toBe('evening');
    expect(screen.getByTestId('background').props.children).toBe(
      Colors.evening.background
    );
  });

  it('falls back to Paper when the stored value is unknown', async () => {
    await AsyncStorage.setItem('theme_preference', 'neon');

    const screen = render(
      <ThemeContextProvider>
        <ThemeProbe />
      </ThemeContextProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('loaded').props.children).toBe('true')
    );
    expect(screen.getByTestId('theme-name').props.children).toBe('paper');
  });
});

describe('useTheme', () => {
  it('falls back to the Paper palette outside a provider', () => {
    const screen = render(<UseThemeProbe />);
    expect(screen.getByTestId('background').props.children).toBe(
      Colors.paper.background
    );
  });
});
