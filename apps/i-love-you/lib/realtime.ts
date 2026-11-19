import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@family/infra';
import type { Channel, Message } from './types';

// The live layer (docs/i-love-you-design.md -> Live, not pulled). One
// Supabase Realtime channel per couple carries everything:
//   postgres_changes — messages, channels, my channel_prefs, couple_members
//                      (RLS-filtered per subscriber by Realtime itself)
//   broadcast        — typing and read positions (ephemeral, private topic)
//   presence         — who is sitting in the couple's call room
//
// The family reliability rules hold around it: the subscription is a
// best-effort accelerator, never the source of truth. Every (re)subscribe
// triggers the engine's catch-up read (get_message_changes from the cursor),
// so a dropped socket loses nothing; while disconnected the screen keeps its
// last-good data and shows a quiet "Reconnecting" line, never a blank.

export type LiveStatus = 'connecting' | 'live' | 'offline';

export type RoomPresence = { userId: string; inRoom: boolean; since: string };

export type LiveHandlers = {
  onMessage: (row: Message) => void;
  onChannel: (row: Partial<Channel> & { id: string }, deleted: boolean) => void;
  onPrefs: () => void;
  onMembers: () => void;
  onTyping: (channelId: string, userId: string) => void;
  onRead: (channelId: string, userId: string, at: string) => void;
  onPresence: (members: RoomPresence[]) => void;
  onStatus: (status: LiveStatus) => void;
};

export type LiveConnection = {
  sendTyping: (channelId: string) => void;
  sendRead: (channelId: string, at: string) => void;
  setInRoom: (inRoom: boolean) => void;
  stop: () => void;
};

export type LiveFactory = (coupleId: string, userId: string, handlers: LiveHandlers) => LiveConnection;

// Typing broadcasts are throttled; the receiver shows the indicator for a
// little longer than the throttle so a steady typist reads as continuous.
export const TYPING_THROTTLE_MS = 2500;
export const TYPING_VISIBLE_MS = 4000;

export const connectLive: LiveFactory = (coupleId, userId, handlers) => {
  let channel: RealtimeChannel | null = null;
  let stopped = false;
  let lastTyping = 0;
  let presence: RoomPresence = { userId, inRoom: false, since: new Date().toISOString() };

  const open = () => {
    handlers.onStatus('connecting');
    channel = supabase.channel(`couple:${coupleId}`, {
      config: { private: true, broadcast: { self: false }, presence: { key: userId } },
    });
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` },
        (payload) => {
          if (payload.eventType !== 'DELETE') handlers.onMessage(payload.new as Message);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channels', filter: `couple_id=eq.${coupleId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as { id?: string };
            if (old.id) handlers.onChannel({ id: old.id }, true);
          } else {
            handlers.onChannel(payload.new as Channel, false);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channel_prefs', filter: `user_id=eq.${userId}` },
        () => handlers.onPrefs()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'couple_members', filter: `couple_id=eq.${coupleId}` },
        () => handlers.onMembers()
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as { channelId?: string; userId?: string };
        if (p.channelId && p.userId && p.userId !== userId) handlers.onTyping(p.channelId, p.userId);
      })
      .on('broadcast', { event: 'read' }, ({ payload }) => {
        const p = payload as { channelId?: string; userId?: string; at?: string };
        if (p.channelId && p.userId && p.at && p.userId !== userId) handlers.onRead(p.channelId, p.userId, p.at);
      })
      .on('presence', { event: 'sync' }, () => {
        if (!channel) return;
        const state = channel.presenceState<RoomPresence>();
        const members = Object.values(state)
          .flat()
          .map((m) => ({ userId: m.userId, inRoom: m.inRoom, since: m.since }));
        handlers.onPresence(members);
      })
      .subscribe((status) => {
        if (stopped) return;
        if (status === 'SUBSCRIBED') {
          handlers.onStatus('live');
          channel?.track(presence).catch(() => {});
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // realtime-js rejoins with backoff on its own; the engine's
          // catch-up runs on the next SUBSCRIBED.
          handlers.onStatus('offline');
        }
      });
  };

  open();

  return {
    sendTyping(channelId) {
      const now = Date.now();
      if (now - lastTyping < TYPING_THROTTLE_MS) return;
      lastTyping = now;
      channel?.send({ type: 'broadcast', event: 'typing', payload: { channelId, userId } }).catch(() => {});
    },
    sendRead(channelId, at) {
      channel?.send({ type: 'broadcast', event: 'read', payload: { channelId, userId, at } }).catch(() => {});
    },
    setInRoom(inRoom) {
      presence = { userId, inRoom, since: new Date().toISOString() };
      channel?.track(presence).catch(() => {});
    },
    stop() {
      stopped = true;
      if (channel) supabase.removeChannel(channel).catch(() => {});
      channel = null;
    },
  };
};
