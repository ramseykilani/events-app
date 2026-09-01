import { Platform } from 'react-native';
import { Colors, THEME_REGISTRY } from '../../constants/Colors';
import { navigationTheme, themedScreenOptions } from '../../lib/navigationTheme';

// Regression guard for Screen Transition Polish (2026-09-01): React Navigation's
// default card/container background is white, which flashed at the screen edge
// during Android stack transitions — invisible in Paper, glaring in Evening.
// The navigator chrome must derive from the active palette, for every theme.
describe('navigationTheme', () => {
  it.each(THEME_REGISTRY.map(({ name }) => [name] as const))(
    'derives card and container backgrounds from the %s palette',
    (name) => {
      const palette = Colors[name];
      const navTheme = navigationTheme(palette);
      expect(navTheme.colors.card).toBe(palette.background);
      expect(navTheme.colors.background).toBe(palette.background);
      expect(navTheme.colors.text).toBe(palette.textPrimary);
      expect(navTheme.colors.primary).toBe(palette.accent);
      expect(navTheme.colors.border).toBe(palette.border);
    }
  );

  it('marks Evening as a dark navigation theme and Paper as light', () => {
    expect(navigationTheme(Colors.paper).dark).toBe(false);
    expect(navigationTheme(Colors.evening).dark).toBe(true);
  });
});

describe('themedScreenOptions', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it.each(THEME_REGISTRY.map(({ name }) => [name] as const))(
    'paints the transitioning card with the %s background',
    (name) => {
      const options = themedScreenOptions(Colors[name]);
      expect(options.contentStyle.backgroundColor).toBe(Colors[name].background);
      expect(options.headerShown).toBe(false);
    }
  );

  it('uses the calm fade on Android and the standard slide elsewhere', () => {
    Platform.OS = 'android';
    expect(themedScreenOptions(Colors.paper).animation).toBe('fade_from_bottom');
    Platform.OS = 'ios';
    expect(themedScreenOptions(Colors.paper).animation).toBe('default');
  });

  it('freezes covered screens so they stop re-rendering mid-transition', () => {
    expect(themedScreenOptions(Colors.paper).freezeOnBlur).toBe(true);
  });
});
