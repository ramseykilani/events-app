import { supabase, withRetries, withWriteTimeout } from '@family/infra';
import type {
  Attachment,
  Channel,
  Couple,
  Message,
  MessageKind,
  PartnerReads,
  Preset,
  SettingValue,
} from './types';

// The data-access seam. Every server call the app makes goes through this
// object, each wrapped in the family's budget discipline (@family/infra):
// reads take withRetries (2s per attempt × 3) and the caller keeps last-good
// data on failure; writes take withWriteTimeout (15s) and are idempotent or
// set-to-value server-side, so a retry after a timeout is always safe.
// ChatEngine receives this object by injection, which is what lets the Jest
// suite drive the engine without a network.

function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

function rows<T>(res: { data: unknown; error: unknown }): T[] {
  if (res.error) throw res.error;
  return (Array.isArray(res.data) ? res.data : res.data ? [res.data] : []) as T[];
}

export type JoinStatus = 'paired' | 'invalid' | 'expired' | 'own_code' | 'already_paired' | 'rate_limited';

export type SendInput = {
  id: string;
  channelId: string;
  body: string | null;
  kind: MessageKind;
  attachment: Attachment | null;
  replyToId: string | null;
  urgent: boolean;
};

export type CallToken = { token: string; url: string; room: string };

export class CallsNotConfiguredError extends Error {
  constructor() {
    super('Calls are not configured');
    this.name = 'CallsNotConfiguredError';
  }
}

export const api = {
  // ----- reads -----
  async getMyCouple(): Promise<Couple | null> {
    return withRetries(async (signal) => {
      const list = rows<Couple>(await supabase.rpc('get_my_couple').abortSignal(signal));
      return list[0] ?? null;
    });
  },

  // The caller's own name (RLS: own row only) — pairing asks for it first.
  async getMyDisplayName(): Promise<string | null> {
    return withRetries(async (signal) => {
      const list = rows<{ display_name: string | null }>(
        await supabase.from('users').select('display_name').abortSignal(signal)
      );
      return list[0]?.display_name ?? null;
    });
  },

  async getChannels(): Promise<Channel[]> {
    return withRetries(async (signal) => rows<Channel>(await supabase.rpc('get_channels').abortSignal(signal)));
  },

  async getPresets(): Promise<Preset[]> {
    return withRetries(async (signal) =>
      rows<Preset>(await supabase.from('channel_presets').select('*').order('position').abortSignal(signal))
    );
  },

  async getMessages(channelId: string, before?: { created_at: string; id: string }, limit = 50): Promise<Message[]> {
    return withRetries(async (signal) =>
      rows<Message>(
        await supabase
          .rpc('get_messages', {
            p_channel_id: channelId,
            p_before_created_at: before?.created_at ?? null,
            p_before_id: before?.id ?? null,
            p_limit: limit,
          })
          .abortSignal(signal)
      )
    );
  },

  async getMessageChanges(since: string, limit = 200): Promise<Message[]> {
    return withRetries(async (signal) =>
      rows<Message>(await supabase.rpc('get_message_changes', { p_since: since, p_limit: limit }).abortSignal(signal))
    );
  },

  async getOpenItems(channelId: string): Promise<Message[]> {
    return withRetries(async (signal) =>
      rows<Message>(await supabase.rpc('get_open_items', { p_channel_id: channelId }).abortSignal(signal))
    );
  },

  async getPartnerReads(): Promise<PartnerReads> {
    return withRetries(async (signal) => {
      const list = rows<{ channel_id: string; last_read_at: string }>(
        await supabase.rpc('get_partner_reads').abortSignal(signal)
      );
      return Object.fromEntries(list.map((r) => [r.channel_id, r.last_read_at]));
    });
  },

  // ----- pairing & profile writes -----
  async createCouple(): Promise<{ couple_id: string; invite_code: string; invite_expires_at: string }> {
    return withWriteTimeout(async (signal) => {
      const list = rows<{ couple_id: string; invite_code: string; invite_expires_at: string }>(
        await supabase.rpc('create_couple').abortSignal(signal)
      );
      return list[0];
    });
  },

  async cancelInvite(): Promise<void> {
    await withWriteTimeout(async (signal) => unwrap(await supabase.rpc('cancel_invite').abortSignal(signal)));
  },

  async joinCouple(code: string): Promise<JoinStatus> {
    return withWriteTimeout(async (signal) => {
      const list = rows<{ status: JoinStatus }>(await supabase.rpc('join_couple', { p_code: code }).abortSignal(signal));
      return list[0]?.status ?? 'invalid';
    });
  },

  async setDisplayName(name: string): Promise<void> {
    await withWriteTimeout(async (signal) =>
      unwrap(await supabase.rpc('set_display_name', { p_name: name }).abortSignal(signal))
    );
  },

  async setPushToken(token: string | null): Promise<void> {
    await withWriteTimeout(async (signal) =>
      unwrap(await supabase.rpc('set_push_token', { p_token: token }).abortSignal(signal))
    );
  },

  async deleteMyAccount(): Promise<void> {
    await withWriteTimeout(async (signal) => unwrap(await supabase.rpc('delete_my_account').abortSignal(signal)));
  },

  // ----- channel writes -----
  async createChannel(id: string, name: string, icon: string, preset: string): Promise<void> {
    await withWriteTimeout(async (signal) =>
      unwrap(
        await supabase
          .rpc('create_channel', { p_id: id, p_name: name, p_icon: icon, p_preset: preset })
          .abortSignal(signal)
      )
    );
  },

  async updateChannel(id: string, fields: { name?: string; icon?: string }): Promise<boolean> {
    return withWriteTimeout(async (signal) =>
      unwrap<boolean>(
        await supabase
          .rpc('update_channel', { p_id: id, p_name: fields.name ?? null, p_icon: fields.icon ?? null })
          .abortSignal(signal)
      )
    );
  },

  async reorderChannels(ids: string[]): Promise<void> {
    await withWriteTimeout(async (signal) =>
      unwrap(await supabase.rpc('reorder_channels', { p_ids: ids }).abortSignal(signal))
    );
  },

  async setChannelArchived(id: string, archived: boolean): Promise<boolean> {
    return withWriteTimeout(async (signal) =>
      unwrap<boolean>(
        await supabase.rpc('set_channel_archived', { p_id: id, p_archived: archived }).abortSignal(signal)
      )
    );
  },

  async setChannelSetting(channelId: string, key: string, value: SettingValue): Promise<boolean> {
    return withWriteTimeout(async (signal) =>
      unwrap<boolean>(
        await supabase
          .rpc('set_channel_setting', { p_channel_id: channelId, p_key: key, p_value: value })
          .abortSignal(signal)
      )
    );
  },

  async markChannelRead(channelId: string, readAt: string): Promise<void> {
    await withWriteTimeout(async (signal) =>
      unwrap(
        await supabase.rpc('mark_channel_read', { p_channel_id: channelId, p_read_at: readAt }).abortSignal(signal)
      )
    );
  },

  // ----- message writes -----
  async sendMessage(input: SendInput): Promise<Message> {
    return withWriteTimeout(async (signal) =>
      unwrap<Message>(
        await supabase
          .rpc('send_message', {
            p_id: input.id,
            p_channel_id: input.channelId,
            p_body: input.body,
            p_kind: input.kind,
            p_attachment: input.attachment,
            p_reply_to_id: input.replyToId,
            p_urgent: input.urgent,
          })
          .abortSignal(signal)
      )
    );
  },

  async editMessage(id: string, body: string): Promise<Message> {
    return withWriteTimeout(async (signal) =>
      unwrap<Message>(await supabase.rpc('edit_message', { p_id: id, p_body: body }).abortSignal(signal))
    );
  },

  async deleteMessage(id: string): Promise<string | null> {
    return withWriteTimeout(async (signal) =>
      unwrap<string | null>(await supabase.rpc('delete_message', { p_id: id }).abortSignal(signal))
    );
  },

  async setMessageDone(id: string, done: boolean): Promise<boolean> {
    return withWriteTimeout(async (signal) =>
      unwrap<boolean>(await supabase.rpc('set_message_done', { p_id: id, p_done: done }).abortSignal(signal))
    );
  },

  async setReaction(id: string, reaction: string, on: boolean): Promise<boolean> {
    return withWriteTimeout(async (signal) =>
      unwrap<boolean>(
        await supabase.rpc('set_reaction', { p_id: id, p_reaction: reaction, p_on: on }).abortSignal(signal)
      )
    );
  },

  async moveMessage(id: string, channelId: string): Promise<boolean> {
    return withWriteTimeout(async (signal) =>
      unwrap<boolean>(await supabase.rpc('move_message', { p_id: id, p_channel_id: channelId }).abortSignal(signal))
    );
  },

  // ----- attachments -----
  async uploadAttachment(path: string, body: Blob | ArrayBuffer, contentType: string): Promise<void> {
    await withWriteTimeout(async (signal) => {
      // upsert: the path is keyed on the message id, so a retried upload of
      // the same message overwrites itself instead of failing on a duplicate.
      const { error } = await supabase.storage
        .from('attachments')
        .upload(path, body, { contentType, upsert: true, ...({ signal } as object) });
      if (error) throw error;
    });
  },

  async signedAttachmentUrl(path: string): Promise<string> {
    return withRetries(async () => {
      const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 60 * 60);
      if (error || !data) throw error ?? new Error('No signed URL');
      return data.signedUrl;
    });
  },

  async removeAttachment(path: string): Promise<void> {
    // Best effort: a leftover object is invisible (the message no longer
    // points at it) and costs only storage.
    await supabase.storage.from('attachments').remove([path]);
  },

  // ----- edge functions -----
  // Fire-and-forget after a send lands (person-triggered notifications only);
  // bounded by the 20s boundedFetch backstop, never awaited by the UI.
  notifyMessage(messageId: string): void {
    supabase.functions
      .invoke('send-push', { body: { kind: 'message', messageId } })
      .catch((err: unknown) => console.error('send-push failed:', err));
  },

  ringPartner(): void {
    supabase.functions
      .invoke('send-push', { body: { kind: 'ring' } })
      .catch((err: unknown) => console.error('ring failed:', err));
  },

  // The token mint is a read, but an edge cold start can take longer than
  // the 2s read attempt, so it rides the 15s budget (no retries: a tap to
  // join is the retry).
  async getCallToken(): Promise<CallToken> {
    return withWriteTimeout(async (signal) => {
      const { data, error } = await supabase.functions.invoke('livekit-token', { body: {}, signal });
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        if (status === 503) throw new CallsNotConfiguredError();
        throw error;
      }
      return data as CallToken;
    });
  },
};

export type Api = typeof api;
