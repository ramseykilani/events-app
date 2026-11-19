import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Channel, Couple, Message, PartnerReads } from './types';
import type { OutboxEntry } from './outbox';

// The local cache that makes opening a channel instant and reading work
// offline. AsyncStorage (localStorage on web), namespaced per account so a
// shared device never shows the previous person's conversation. Every read
// tolerates a missing or corrupt entry by returning nothing — the server
// load that follows repairs it. Writes are debounced per key: a burst of
// realtime rows costs one write.

const VERSION = 1;
const prefix = (userId: string) => `ily:v${VERSION}:${userId}:`;

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const WRITE_DEBOUNCE_MS = 400;

function write(key: string, value: unknown, immediate = false): void {
  const run = () => {
    pending.delete(key);
    AsyncStorage.setItem(key, JSON.stringify(value)).catch((err) =>
      console.error('cache write failed:', err)
    );
  };
  const existing = pending.get(key);
  if (existing) clearTimeout(existing);
  if (immediate) run();
  else pending.set(key, setTimeout(run, WRITE_DEBOUNCE_MS));
}

export type CacheSnapshot = {
  couple: Couple | null;
  channels: Channel[];
  partnerReads: PartnerReads;
  cursor: string | null;
  outbox: OutboxEntry[];
};

export function createCache(userId: string) {
  const p = prefix(userId);
  return {
    async load(): Promise<CacheSnapshot> {
      const [couple, channels, partnerReads, cursor, outbox] = await Promise.all([
        read<Couple>(`${p}couple`),
        read<Channel[]>(`${p}channels`),
        read<PartnerReads>(`${p}reads`),
        read<string>(`${p}cursor`),
        read<OutboxEntry[]>(`${p}outbox`),
      ]);
      return {
        couple,
        channels: channels ?? [],
        partnerReads: partnerReads ?? {},
        cursor,
        outbox: outbox ?? [],
      };
    },
    loadMessages: (channelId: string) => read<Message[]>(`${p}messages:${channelId}`).then((m) => m ?? []),
    saveCouple: (couple: Couple | null) => write(`${p}couple`, couple),
    saveChannels: (channels: Channel[]) => write(`${p}channels`, channels),
    saveReads: (reads: PartnerReads) => write(`${p}reads`, reads),
    saveCursor: (cursor: string | null) => write(`${p}cursor`, cursor),
    // The outbox is written immediately: a message typed and sent just before
    // the app is killed must survive.
    saveOutbox: (outbox: OutboxEntry[]) => write(`${p}outbox`, outbox, true),
    saveMessages: (channelId: string, messages: Message[]) => write(`${p}messages:${channelId}`, messages),
    async clear(): Promise<void> {
      try {
        const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(p));
        await AsyncStorage.multiRemove(keys);
      } catch (err) {
        console.error('cache clear failed:', err);
      }
    },
  };
}

export type Cache = ReturnType<typeof createCache>;
