import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Chip, ThemedSwitch, useTheme } from '@family/design';
import type { SettingDefinition } from '../lib/channelSettings';
import type { SettingValue } from '../lib/types';

// A setting rendered from its registry definition (lib/channelSettings.ts):
// booleans are a whole-row switch (Events KI-008 pattern — the row is the
// control, the visual switch inside is inert), choices are a row of chips.
// A new setting renders here with no new UI code.
export function SettingRow({
  def,
  value,
  busy,
  onChange,
}: {
  def: SettingDefinition;
  value: SettingValue;
  busy: boolean;
  onChange: (value: SettingValue) => void;
}) {
  const theme = useTheme();
  if (def.type === 'boolean') {
    const on = value === true;
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => onChange(!on)}
        disabled={busy}
        activeOpacity={0.6}
        accessibilityRole="switch"
        accessibilityLabel={def.label}
        accessibilityHint={def.help}
        accessibilityState={{ checked: on, disabled: busy }}
        aria-checked={on}
        testID={`setting-${def.key}`}
      >
        <View style={styles.texts}>
          <Text style={[styles.label, { color: theme.textPrimary }]}>{def.label}</Text>
          <Text style={[styles.help, { color: theme.textTertiary }]}>{def.help}</Text>
        </View>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no" aria-hidden>
          <ThemedSwitch value={on} disabled={busy} />
        </View>
      </TouchableOpacity>
    );
  }
  const selected = def.options.find((o) => o.value === value) ?? def.options[0];
  return (
    <View style={styles.choice} testID={`setting-${def.key}`}>
      <Text style={[styles.label, { color: theme.textPrimary }]}>{def.label}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={def.label}>
        {def.options.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={o.value === value}
            disabled={busy}
            onPress={() => o.value !== value && onChange(o.value)}
            accessibilityLabel={`${def.label}: ${o.label}`}
          />
        ))}
      </View>
      <Text style={[styles.help, { color: theme.textTertiary }]}>{selected.help}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  texts: { flex: 1 },
  label: { fontSize: 16 },
  help: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  choice: { paddingVertical: 10, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
