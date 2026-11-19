import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// A channel's icon: an Ionicons outline glyph tinted by a role token. The
// name comes from the server (any ^[a-z0-9-]+$ string), so an unknown name
// falls back instead of rendering a missing-glyph box.
export function ChannelIcon({ name, size = 20, color }: { name: string; size?: number; color: string }) {
  const glyph = (name in Ionicons.glyphMap ? name : 'ellipse-outline') as IoniconName;
  return <Ionicons name={glyph} size={size} color={color} />;
}
