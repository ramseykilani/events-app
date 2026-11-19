import { isAbortError } from '@family/infra';
import type { Attachment, MessageKind, TimelineMessage } from './types';

// The outbox: messages the person sent that the server has not confirmed.
// Persisted on every change (lib/cache.ts) so a send survives the app being
// killed, and shown inline in the conversation as the sender's own bubbles
// ("Sending…" / "✕ Not sent").
//
// Why sends retry on their own when Events' writes never do: Events forbids
// blind write retries because a write may have committed before the timeout
// fired. send_message is idempotent on the client-generated id — a retry of a
// committed send returns the stored row — so retrying is exactly the
// reconciliation Events does by reading back, done in one call. Only a
// refusal from the server (archived channel, removed reply target) stops the
// retries; that needs the person's call.

export type PendingUpload = {
  uri: string;
  mime: string;
  name: string;
  width?: number;
  height?: number;
  duration_ms?: number;
};

export type OutboxEntry = {
  id: string;
  couple_id: string;
  channel_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string | null;
  reply_to_id: string | null;
  urgent: boolean;
  created_at: string;
  attempts: number;
  status: 'sending' | 'failed';
  error?: string;
  // Present until the attachment is uploaded; then `attachment` carries the
  // storage path the message points at.
  upload?: PendingUpload;
  attachment?: Attachment;
};

export function attachmentPath(coupleId: string, messageId: string, name: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-60) || 'file';
  return `${coupleId}/${messageId}/${safe}`;
}

export function toTimelineMessage(entry: OutboxEntry): TimelineMessage {
  return {
    id: entry.id,
    couple_id: entry.couple_id,
    channel_id: entry.channel_id,
    sender_id: entry.sender_id,
    kind: entry.kind,
    body: entry.body,
    attachment:
      entry.attachment ??
      (entry.upload
        ? {
            path: '',
            width: entry.upload.width,
            height: entry.upload.height,
            duration_ms: entry.upload.duration_ms,
            mime: entry.upload.mime,
          }
        : null),
    reply_to_id: entry.reply_to_id,
    reactions: {},
    urgent: entry.urgent,
    created_at: entry.created_at,
    updated_at: entry.created_at,
    edited_at: null,
    deleted_at: null,
    done_at: null,
    done_by: null,
    moved_from_channel_id: null,
    moved_at: null,
    local: { status: entry.status, error: entry.error },
    previewUri: entry.upload?.uri,
  };
}

// A refusal is the server saying no (a RAISE in the RPC — PostgREST reports
// it with a Postgres error code). Anything else — timeout, offline, 5xx — is
// transient and the outbox keeps trying.
export function isRefusal(err: unknown): boolean {
  if (isAbortError(err)) return false;
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  // P0001 = RAISE EXCEPTION; 22xxx/23xxx = bad data / constraint.
  return typeof code === 'string' && (/^P0001$/.test(code) || /^2[23]/.test(code));
}

export function refusalMessage(err: unknown): string {
  const msg = (err as { message?: unknown })?.message;
  return typeof msg === 'string' && msg.length < 120 ? msg : 'The message could not be sent.';
}

// 1s, 2s, 4s … capped at 30s.
export function retryDelayMs(attempts: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempts - 1));
}
