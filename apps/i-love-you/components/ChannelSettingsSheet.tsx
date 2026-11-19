import { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, PrimaryButton, TextAction, useTheme } from '@family/design';
import { isAbortError, showAlert } from '@family/infra';
import { CHANNEL_ICONS, SETTINGS, settingValue } from '../lib/channelSettings';
import type { Channel, SettingValue } from '../lib/types';
import { useChatEngine } from '../app/_context/ChatContext';
import { ChannelIcon } from './ChannelIcon';
import { SettingRow } from './SettingRows';

// A channel's settings (FEATURES.md -> Channel Settings): name, icon, and
// every registry setting, split into the two scopes the registry defines —
// "Just for you" (how it notifies you) and "For both of you" (how the
// conversation behaves). Rendered from lib/channelSettings.ts; nothing here
// knows what a particular channel is "for".
export function ChannelSettingsSheet({
  channel,
  visible,
  onClose,
}: {
  channel: Channel;
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const engine = useChatEngine();
  const [name, setName] = useState(channel.name);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [savedName, setSavedName] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(channel.name);
      setSavedName(false);
    }
  }, [visible, channel.name]);

  const fail = (title: string, err: unknown) => {
    console.error(`${title}:`, err);
    showAlert(title, isAbortError(err) ? 'That took too long. Check your connection and try again.' : 'Something went wrong. Try again.');
  };

  const change = async (key: string, value: SettingValue) => {
    setBusyKey(key);
    try {
      await engine.setSetting(channel.id, key, value);
    } catch (err) {
      fail('Could not change the setting', err);
    } finally {
      setBusyKey(null);
    }
  };

  const saveName = async () => {
    setBusyKey('name');
    try {
      await engine.updateChannel(channel.id, { name: name.trim() });
      setSavedName(true);
    } catch (err) {
      fail('Could not rename', err);
    } finally {
      setBusyKey(null);
    }
  };

  const setIcon = async (icon: string) => {
    setBusyKey('icon');
    try {
      await engine.updateChannel(channel.id, { icon });
    } catch (err) {
      fail('Could not change the icon', err);
    } finally {
      setBusyKey(null);
    }
  };

  const archive = async (archived: boolean) => {
    setBusyKey('archive');
    try {
      await engine.setArchived(channel.id, archived);
      if (archived) onClose();
    } catch (err) {
      fail(archived ? 'Could not archive' : 'Could not restore', err);
    } finally {
      setBusyKey(null);
    }
  };

  const section = (title: string, scope: 'personal' | 'shared', note: string) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title}</Text>
      <Text style={[styles.note, { color: theme.textTertiary }]}>{note}</Text>
      {SETTINGS.filter((s) => s.scope === scope).map((def) => (
        <SettingRow
          key={def.key}
          def={def}
          value={settingValue(channel, def.key)}
          busy={busyKey === def.key}
          onChange={(v) => void change(def.key, v)}
        />
      ))}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 12 }]}>
        <AppHeader title={`${channel.name} settings`} left={{ kind: 'close' }} onLeft={onClose} />
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]}>
          <View style={styles.column}>
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Name</Text>
              <View style={styles.nameRow}>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
                  value={name}
                  onChangeText={(t) => {
                    setName(t.replace(/[\r\n]/g, ''));
                    setSavedName(false);
                  }}
                  maxLength={40}
                  accessibilityLabel="Channel name"
                  onSubmitEditing={() => name.trim() && name.trim() !== channel.name && void saveName()}
                />
                <PrimaryButton
                  label="Save"
                  size="compact"
                  onPress={saveName}
                  loading={busyKey === 'name'}
                  disabled={!name.trim() || name.trim() === channel.name}
                />
              </View>
              {savedName ? <Text style={[styles.note, { color: theme.textSecondary }]}>✓ Saved.</Text> : null}
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Icon</Text>
              <View style={styles.icons} accessibilityRole="radiogroup" accessibilityLabel="Channel icon">
                {CHANNEL_ICONS.map((icon) => {
                  const selected = icon === channel.icon;
                  return (
                    <TouchableOpacity
                      key={icon}
                      style={[styles.icon, { backgroundColor: selected ? theme.selectedBg : theme.surfaceSecondary }, selected && { borderColor: theme.accent, borderWidth: 2 }]}
                      onPress={() => !selected && void setIcon(icon)}
                      disabled={busyKey === 'icon'}
                      activeOpacity={0.6}
                      accessibilityRole="radio"
                      accessibilityLabel={icon.replace(/-outline$/, '').replace(/-/g, ' ')}
                      accessibilityState={{ checked: selected }}
                      aria-checked={selected}
                    >
                      <ChannelIcon name={icon} color={theme.textPrimary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            {section(
              'Just for you',
              'personal',
              Platform.OS === 'android'
                ? 'Only you see these. This channel is also its own category in your phone’s notification settings.'
                : 'Only you see these.'
            )}
            {section('For both of you', 'shared', 'A change here changes it for your partner too.')}
            <View style={[styles.footer, { borderTopColor: theme.borderLight }]}>
              {channel.archived_at ? (
                <TextAction label="Restore channel" tone="link" onPress={() => void archive(false)} />
              ) : (
                <>
                  <TextAction label="Archive channel" onPress={() => void archive(true)} />
                  <Text style={[styles.note, { color: theme.textTertiary, textAlign: 'center' }]}>
                    Archived channels keep their history and can be restored by either of you.
                  </Text>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { alignItems: 'center' },
  column: { width: '100%', maxWidth: 640, paddingHorizontal: 20 },
  section: { paddingTop: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4, marginTop: 8 },
  note: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  nameRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16 },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  icon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  footer: { marginTop: 24, paddingTop: 12, borderTopWidth: 1, alignItems: 'center' },
});
