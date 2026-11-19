import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, useTheme } from '@family/design';
import { isAbortError, showAlert } from '@family/infra';
import { useChat, useChatEngine } from '../_context/ChatContext';
import { ChannelIcon } from '../../components/ChannelIcon';
import { CHANNEL_ICONS } from '../../lib/channelSettings';
import { useLayout } from '../../hooks/useLayout';
import { openChannel } from '../../lib/navigation';

// New channel: a name, an icon, and a starting point. Presets are only
// starting points — the settings are copied in and either of you can change
// any of them later (FEATURES.md -> Channels).
export default function NewChannelScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const engine = useChatEngine();
  const { wide } = useLayout();
  const presets = useChat((s) => s.presets);
  const [preset, setPreset] = useState('blank');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('ellipse-outline');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const choose = (key: string) => {
    setPreset(key);
    const p = presets.find((x) => x.key === key);
    if (p) setIcon(p.icon);
  };

  useEffect(() => {
    if (presets.length > 0 && !presets.some((p) => p.key === preset)) setPreset('blank');
  }, [presets, preset]);

  const create = async () => {
    if (!name.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const id = await engine.createChannel(name, icon, preset);
      router.back();
      openChannel(id, wide);
    } catch (err) {
      console.error('create channel failed:', err);
      showAlert(
        'Could not create the channel',
        isAbortError(err) ? 'That took too long. Check your connection and try again.' : 'Something went wrong. Try again.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 12 }]}
    >
      <AppHeader
        title="New channel"
        left={{ kind: 'cancel' }}
        onLeft={() => (router.canGoBack() ? router.back() : router.replace('/(app)/channels'))}
        right={{ label: saving ? 'Creating…' : 'Create', onPress: () => void create(), disabled: saving || !name.trim() }}
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Name</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
            value={name}
            onChangeText={(t) => setName(t.replace(/[\r\n]/g, ''))}
            placeholder="Dreams, Money, Kids…"
            placeholderTextColor={theme.textTertiary}
            maxLength={40}
            autoFocus
            onSubmitEditing={() => void create()}
            accessibilityLabel="Channel name"
          />
          <Text style={[styles.label, { color: theme.textSecondary }]}>Start from</Text>
          {presets.map((p) => {
            const selected = p.key === preset;
            return (
              <TouchableOpacity
                key={p.key}
                style={[styles.preset, { borderColor: selected ? theme.accent : theme.border, backgroundColor: selected ? theme.selectedBg : theme.surface }]}
                onPress={() => choose(p.key)}
                activeOpacity={0.6}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                accessibilityLabel={`${p.key === 'blank' ? 'Blank' : p.name}: ${p.description}`}
              >
                <ChannelIcon name={p.icon} color={theme.textSecondary} />
                <View style={styles.presetTexts}>
                  <Text style={[styles.presetName, { color: theme.textPrimary }]}>{p.key === 'blank' ? 'Blank' : p.name}</Text>
                  <Text style={[styles.presetHelp, { color: theme.textTertiary }]}>{p.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <Text style={[styles.label, { color: theme.textSecondary }]}>Icon</Text>
          <View style={styles.icons}>
            {CHANNEL_ICONS.map((i) => {
              const selected = i === icon;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.icon, { backgroundColor: selected ? theme.selectedBg : theme.surfaceSecondary }, selected && { borderColor: theme.accent, borderWidth: 2 }]}
                  onPress={() => setIcon(i)}
                  activeOpacity={0.6}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  aria-checked={selected}
                  accessibilityLabel={i.replace(/-outline$/, '').replace(/-/g, ' ')}
                >
                  <ChannelIcon name={i} color={theme.textPrimary} />
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: theme.textTertiary }]}>
            Every setting can be changed later in the channel’s settings, by either of you.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { alignItems: 'center' },
  column: { width: '100%', maxWidth: 640, paddingHorizontal: 20 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16 },
  preset: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8, minHeight: 56 },
  presetTexts: { flex: 1 },
  presetName: { fontSize: 16 },
  presetHelp: { fontSize: 13, marginTop: 2 },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  icon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, marginTop: 20 },
});
