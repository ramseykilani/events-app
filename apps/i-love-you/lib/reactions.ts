// The fixed reaction set (supabase/migrations/…_messages.sql reaction_keys).
// Each is a vector icon tinted by a role token — emoji render in the OS font
// and ignore the theme (conventions rule 4), and a two-person app needs a
// handful of feelings, not a keyboard.
export const REACTIONS = [
  { key: 'heart', icon: 'heart', label: 'Love' },
  { key: 'thumbs_up', icon: 'thumbs-up', label: 'Yes' },
  { key: 'laugh', icon: 'happy', label: 'Funny' },
  { key: 'sad', icon: 'sad', label: 'Sad' },
  { key: 'flame', icon: 'flame', label: 'Hot' },
  { key: 'sparkles', icon: 'sparkles', label: 'Wonderful' },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]['key'];

export function reactionMeta(key: string) {
  return REACTIONS.find((r) => r.key === key);
}

// Who reacted, in words — never a number (design language §9).
export function reactorsLabel(userIds: string[], me: string, partnerName: string): string {
  const mine = userIds.includes(me);
  const theirs = userIds.some((u) => u !== me);
  if (mine && theirs) return 'Both';
  if (mine) return 'You';
  return partnerName;
}
