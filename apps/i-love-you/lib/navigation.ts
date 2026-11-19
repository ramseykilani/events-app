import { router } from 'expo-router';

// Opening a channel: desktop switches the right pane in place (the list is
// already beside it); phones push so Back returns to the list.
export function openChannel(channelId: string, wide: boolean): void {
  const target = { pathname: '/(app)/channel/[id]' as const, params: { id: channelId } };
  if (wide) router.replace(target);
  else router.push(target);
}
