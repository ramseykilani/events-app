import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Shared Expo push sender for the notification edge functions
// (send-notification, send-response-notification, send-response). Batch
// POSTs to the Expo Push API and clears tokens Expo reports as
// DeviceNotRegistered. Best-effort by design: a push failure never fails
// the caller's write.
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { eventId: string };
}

export async function sendExpoPush(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, 'public', any>,
  messages: PushMessage[],
): Promise<void> {
  if (messages.length === 0) return;
  const pushResponse = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });

  const pushResult = await pushResponse.json();

  if (Array.isArray(pushResult.data)) {
    for (let i = 0; i < pushResult.data.length; i++) {
      if (pushResult.data[i]?.details?.error === 'DeviceNotRegistered') {
        const token = messages[i]?.to;
        if (token) {
          await db
            .from('users')
            .update({ expo_push_token: null })
            .eq('expo_push_token', token);
        }
      }
    }
  }
}
