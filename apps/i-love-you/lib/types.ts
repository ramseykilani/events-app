// Row shapes as the RPCs return them (supabase/migrations). Timestamps are
// ISO strings; settings are the effective values (registry defaults filled
// in server-side by get_channels).

export type SettingValue = boolean | string;
export type Settings = Record<string, SettingValue>;

export type Couple = {
  couple_id: string;
  paired_at: string | null;
  invite_code: string | null;
  invite_expires_at: string | null;
  my_id: string;
  my_display_name: string | null;
  partner_id: string | null;
  partner_display_name: string | null;
};

export type Channel = {
  id: string;
  name: string;
  icon: string;
  position: number;
  archived_at: string | null;
  settings: Settings;
  my_settings: Settings;
  last_message_at: string | null;
  last_message_sender: string | null;
  last_message_preview: string | null;
  last_read_at: string | null;
  unread: boolean;
  updated_at: string;
};

export type Preset = {
  key: string;
  name: string;
  icon: string;
  shared_settings: Settings;
  personal_settings: Settings;
  seed_on_pairing: boolean;
  position: number;
  description: string;
};

export type MessageKind = 'text' | 'image' | 'voice';

export type Attachment = {
  path: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  mime?: string;
};

export type Message = {
  id: string;
  couple_id: string;
  channel_id: string;
  sender_id: string | null;
  kind: MessageKind;
  body: string | null;
  attachment: Attachment | null;
  reply_to_id: string | null;
  reactions: Record<string, string[]>;
  urgent: boolean;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  done_at: string | null;
  done_by: string | null;
  moved_from_channel_id: string | null;
  moved_at: string | null;
};

// A message the server has not confirmed yet. `sending` covers the whole
// retry window (send_message is idempotent on the id, so the outbox retries
// on its own); `failed` means the server refused it and only the person can
// decide (Retry or Discard).
export type LocalStatus = 'sending' | 'failed';

export type TimelineMessage = Message & {
  local?: { status: LocalStatus; error?: string };
  // A device URI for an attachment this device just sent: the bubble shows
  // it while (and after) the upload, so the picked photo never flashes
  // blank waiting for a signed URL. Never cached.
  previewUri?: string;
};

export type PartnerReads = Record<string, string>;
