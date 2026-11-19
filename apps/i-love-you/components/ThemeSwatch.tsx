import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Colors, THEME_REGISTRY, useTheme, useThemePreference } from '@family/design';

// The theme control (design language §7): a two-tone disc in the NEXT mood's
// colors, cycling the registry. Same control as the Events calendar header.
export function ThemeSwatch() {
  const theme = useTheme();
  const { themeName, setTheme } = useThemePreference();
  const next =
    THEME_REGISTRY[(THEME_REGISTRY.findIndex((t) => t.name === themeName) + 1) % THEME_REGISTRY.length];
  const nextPalette = Colors[next.name];
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => setTheme(next.name)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${next.label} theme`}
    >
      <View style={[styles.swatch, { backgroundColor: nextPalette.background, borderColor: theme.border }]}>
        <View style={[styles.core, { backgroundColor: nextPalette.accent }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: { width: 10, height: 10, borderRadius: 5 },
});
