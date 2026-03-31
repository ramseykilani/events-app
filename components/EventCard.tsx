import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import type { CalendarEvent } from '../lib/types';
import { useTheme } from '../hooks/useTheme';

type Props = {
  event: CalendarEvent;
  onPress: () => void;
};

export function EventCard({ event, onPress }: Props) {
  const theme = useTheme();

  const timeStr = event.event_time
    ? new Date(`1970-01-01T${event.event_time}`).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {event.image_url ? (
        <Image
          source={{ uri: event.image_url }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : null}
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={2}>
          {event.title ?? 'Untitled event'}
        </Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {event.event_date}
          {timeStr ? ` · ${timeStr}` : ''}
        </Text>
        {event.sharer_contact_name && (
          <Text style={[styles.sharer, { color: theme.textTertiary }]} numberOfLines={1}>
            From {event.sharer_contact_name}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  image: {
    width: 80,
    height: 80,
  },
  content: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  meta: {
    fontSize: 14,
    marginBottom: 2,
  },
  sharer: {
    fontSize: 12,
  },
});
