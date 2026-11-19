import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@family/design';
import { showAlert } from '@family/infra';
import { isOn } from '../../lib/channelSettings';
import { formatDuration } from '../../lib/format';
import type { Draft } from '../../lib/chatEngine';
import type { Channel, TimelineMessage } from '../../lib/types';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';

// The composer. Telegram-grade basics: Enter sends and Shift+Enter breaks a
// line on desktop; ↑ in an empty box edits your last message; Esc cancels a
// reply or an edit; the send button and the mic trade places as you type.
// "Needs you now" appears only where the channel's shared allow_urgent
// setting is on, and is off again after each send.

type Props = {
  channel: Channel;
  replyTo: TimelineMessage | null;
  editing: TimelineMessage | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (draft: Draft) => void;
  onSaveEdit: (message: TimelineMessage, body: string) => void;
  onEditLast: () => void;
  onTyping: () => void;
};

const MAX_INPUT_HEIGHT = 140;

export function Composer(props: Props) {
  const theme = useTheme();
  const { channel, replyTo, editing } = props;
  const [text, setText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [height, setHeight] = useState(44);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const voice = useVoiceRecorder();
  const allowUrgent = isOn(channel, 'allow_urgent');

  // Entering edit mode loads the message into the box.
  useEffect(() => {
    if (editing) {
      setText(editing.body ?? '');
      inputRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  // A different channel starts with an empty composer.
  useEffect(() => {
    setText('');
    setUrgent(false);
  }, [channel.id]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    if (editing) {
      props.onSaveEdit(editing, body);
    } else {
      props.onSend({ body, replyToId: replyTo?.id ?? null, urgent: allowUrgent && urgent });
      setUrgent(false);
    }
    setText('');
    setHeight(44);
  };

  const pickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsMultipleSelection: false,
      });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      const mime = a.mimeType ?? 'image/jpeg';
      props.onSend({
        body: text.trim(),
        replyToId: replyTo?.id ?? null,
        urgent: allowUrgent && urgent,
        upload: {
          kind: 'image',
          uri: a.uri,
          mime,
          name: a.fileName ?? `photo.${mime.split('/')[1] ?? 'jpg'}`,
          width: a.width,
          height: a.height,
        },
      });
      setText('');
      setUrgent(false);
    } catch (err) {
      console.error('image pick failed:', err);
      showAlert('Could not open photos', 'Check that the app may use your photos, then try again.');
    }
  };

  const startVoice = async () => {
    try {
      await voice.start();
    } catch (err) {
      console.error('recording failed:', err);
      showAlert('Microphone unavailable', 'Allow the microphone for this app, then try again.');
    }
  };

  const sendVoice = async () => {
    const rec = await voice.stop();
    if (!rec) return;
    props.onSend({
      body: '',
      replyToId: replyTo?.id ?? null,
      urgent: allowUrgent && urgent,
      upload: { kind: 'voice', uri: rec.uri, mime: rec.mime, name: rec.name, duration_ms: rec.duration_ms },
    });
    setUrgent(false);
  };

  const onKeyPress = (e: { nativeEvent: { key: string; shiftKey?: boolean }; preventDefault?: () => void }) => {
    if (Platform.OS !== 'web') return;
    const { key, shiftKey } = e.nativeEvent;
    if (key === 'Enter' && !shiftKey) {
      e.preventDefault?.();
      submit();
    } else if (key === 'Escape') {
      if (editing) {
        props.onCancelEdit();
        setText('');
      } else if (replyTo) props.onCancelReply();
    } else if (key === 'ArrowUp' && !text && !editing) {
      e.preventDefault?.();
      props.onEditLast();
    }
  };

  if (voice.recording) {
    return (
      <View style={[styles.bar, { borderTopColor: theme.borderLight, backgroundColor: theme.background }]}>
        <View style={[styles.recDot, { backgroundColor: theme.accent }]} />
        <Text style={[styles.recText, { color: theme.textPrimary }]} accessibilityLiveRegion="polite">
          Recording {formatDuration(voice.elapsedMs)}
        </Text>
        <TouchableOpacity style={styles.textButton} onPress={voice.cancel} accessibilityRole="button" activeOpacity={0.6}>
          <Text style={[styles.textButtonLabel, { color: theme.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.send, { backgroundColor: theme.primaryButtonBg }]}
          onPress={() => void sendVoice()}
          accessibilityRole="button"
          accessibilityLabel="Send voice note"
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-up" size={20} color={theme.primaryButtonText} />
        </TouchableOpacity>
      </View>
    );
  }

  const hasText = text.trim().length > 0;
  return (
    <View style={[styles.wrap, { borderTopColor: theme.borderLight, backgroundColor: theme.background }]}>
      {replyTo || editing ? (
        <View style={styles.context}>
          <Ionicons name={editing ? 'create-outline' : 'arrow-undo-outline'} size={16} color={theme.textSecondary} />
          <Text style={[styles.contextText, { color: theme.textSecondary }]} numberOfLines={1}>
            {editing
              ? 'Editing'
              : `Replying to ${replyTo?.kind === 'image' ? 'a photo' : replyTo?.kind === 'voice' ? 'a voice note' : `“${replyTo?.body ?? ''}”`}`}
          </Text>
          <TouchableOpacity
            style={styles.contextClose}
            onPress={() => {
              if (editing) {
                props.onCancelEdit();
                setText('');
              } else props.onCancelReply();
            }}
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Cancel edit' : 'Cancel reply'}
            activeOpacity={0.6}
          >
            <Ionicons name="close" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      ) : null}
      {allowUrgent && !editing ? (
        <TouchableOpacity
          style={styles.urgentToggle}
          onPress={() => setUrgent((u) => !u)}
          accessibilityRole="switch"
          accessibilityLabel="Needs you now"
          accessibilityState={{ checked: urgent }}
          aria-checked={urgent}
          activeOpacity={0.6}
        >
          <View style={[styles.urgentPill, { backgroundColor: urgent ? theme.selectedBg : 'transparent', borderColor: urgent ? theme.accent : theme.border }]}>
            <Ionicons name="alert-circle-outline" size={14} color={urgent ? theme.textPrimary : theme.textTertiary} />
            <Text style={[styles.urgentLabel, { color: urgent ? theme.textPrimary : theme.textTertiary }]}>
              {urgent ? 'Needs you now — notifies even if quiet' : 'Needs you now'}
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}
      <View style={styles.bar}>
        {!editing ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => void pickImage()}
            accessibilityRole="button"
            accessibilityLabel="Send a photo"
            activeOpacity={0.6}
          >
            <Ionicons name="image-outline" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        ) : null}
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              // Focus shows on the border itself (a role token), in place of
              // the browser's heavy default ring, which ignores the theme.
              borderColor: focused ? theme.textSecondary : theme.border,
              color: theme.textPrimary,
              height: Math.min(MAX_INPUT_HEIGHT, Math.max(44, height)),
            },
            Platform.OS === 'web' && styles.noRing,
          ]}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (t.length > 0) props.onTyping();
          }}
          onContentSizeChange={(e) => setHeight(e.nativeEvent.contentSize.height + 2)}
          onKeyPress={onKeyPress as never}
          placeholder={`Message ${channel.name}`}
          placeholderTextColor={theme.textTertiary}
          multiline
          maxLength={8000}
          accessibilityLabel={`Message ${channel.name}`}
          testID="composer-input"
        />
        {hasText || editing || !voice.supported ? (
          <TouchableOpacity
            style={[styles.send, { backgroundColor: theme.primaryButtonBg }, !hasText && styles.dimmed]}
            onPress={submit}
            disabled={!hasText}
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Save edit' : 'Send'}
            accessibilityState={{ disabled: !hasText }}
            activeOpacity={0.7}
            testID="send-button"
          >
            <Ionicons name={editing ? 'checkmark' : 'arrow-up'} size={20} color={theme.primaryButtonText} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => void startVoice()}
            accessibilityRole="button"
            accessibilityLabel="Record a voice note"
            activeOpacity={0.6}
          >
            <Ionicons name="mic-outline" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: 1, paddingTop: 6 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderTopWidth: 0 },
  context: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 16, paddingRight: 4 },
  contextText: { flex: 1, fontSize: 14 },
  contextClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  urgentToggle: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, alignSelf: 'flex-start' },
  urgentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 28,
    paddingHorizontal: 10,
  },
  urgentLabel: { fontSize: 13 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
  },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.5 },
  noRing: { outlineWidth: 0 },
  recDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 12, alignSelf: 'center' },
  recText: { flex: 1, fontSize: 16, alignSelf: 'center' },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  textButtonLabel: { fontSize: 16, fontWeight: '600' },
});
