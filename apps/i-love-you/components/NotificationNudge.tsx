import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PrimaryButton, TextAction, useTheme } from '@family/design';
import { useChat } from '../app/_context/ChatContext';
import { useNotificationPermission } from '../hooks/useNotificationPermission';

// The notification explainer, once (Events' rule: the OS prompt is
// explainer-gated and Not now is final). It says what a notification here
// is before the OS asks: your partner, titled by the channel, tuned per
// channel. Settings keeps a way back for anyone who said Not now.
const ANSWERED_KEY = 'ily_notification_nudge_answered';

export function NotificationNudge() {
  const theme = useTheme();
  const partnerName = useChat((s) => s.couple?.partner_display_name ?? 'your partner');
  const { state, ask } = useNotificationPermission();
  const [answered, setAnswered] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(ANSWERED_KEY)
      .then((v) => setAnswered(v === 'true'))
      .catch(() => setAnswered(true));
  }, []);

  if (answered || state !== 'undetermined') return null;

  const close = () => {
    setAnswered(true);
    AsyncStorage.setItem(ANSWERED_KEY, 'true').catch(() => {});
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>
        {Platform.OS === 'web' ? 'Desktop notifications' : 'Notifications'}
      </Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        Only {partnerName} can notify you here. Each notification is titled with its channel, and every channel
        can be loud, quiet or off.
      </Text>
      <View style={styles.actions}>
        <PrimaryButton
          label="Turn on notifications"
          size="compact"
          onPress={() => {
            close();
            void ask();
          }}
        />
        <TextAction label="Not now" onPress={close} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, marginBottom: 8, padding: 16, borderRadius: 12, borderWidth: 1 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
