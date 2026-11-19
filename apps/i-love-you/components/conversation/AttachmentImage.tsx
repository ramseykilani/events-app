import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, useTheme } from '@family/design';
import { useAttachmentUrl } from '../../hooks/useAttachmentUrl';
import type { TimelineMessage } from '../../lib/types';

// A photo in a bubble: the device preview while it uploads (and after, until
// the signed URL is ready), sized from the stored dimensions so the list
// never jumps when the image lands. Tap for full screen.
const MAX_W = 260;
const MAX_H = 320;

export function AttachmentImage({ message }: { message: TimelineMessage }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { url, failed } = useAttachmentUrl(message.attachment?.path || null);
  const [open, setOpen] = useState(false);
  const src = message.previewUri ?? url;
  const w = message.attachment?.width ?? 4;
  const h = message.attachment?.height ?? 3;
  const scale = Math.min(MAX_W / w, MAX_H / h, 1);
  const size = { width: Math.round(w * scale) || MAX_W, height: Math.round(h * scale) || 200 };

  return (
    <>
      <TouchableOpacity
        onPress={() => src && setOpen(true)}
        activeOpacity={0.8}
        accessibilityRole="imagebutton"
        accessibilityLabel="Photo. Open full screen"
        style={[styles.frame, size, { backgroundColor: theme.surfaceSecondary }]}
      >
        {src ? (
          <Image source={{ uri: src }} style={size} resizeMode="cover" />
        ) : failed ? (
          <Text style={[styles.failed, { color: theme.textTertiary }]}>Photo unavailable</Text>
        ) : (
          <ActivityIndicator color={theme.textTertiary} />
        )}
      </TouchableOpacity>
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={[styles.viewer, { backgroundColor: theme.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom }]}>
          <AppHeader title="Photo" left={{ kind: 'close' }} onLeft={() => setOpen(false)} />
          <Pressable style={styles.full} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close photo">
            {src ? <Image source={{ uri: src }} style={styles.full} resizeMode="contain" /> : null}
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  failed: { fontSize: 13 },
  viewer: { flex: 1 },
  full: { flex: 1, width: '100%' },
});
