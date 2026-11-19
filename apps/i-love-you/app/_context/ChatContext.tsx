import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { api } from '../../lib/api';
import { createCache } from '../../lib/cache';
import { ChatEngine, type EngineState } from '../../lib/chatEngine';
import { connectLive } from '../../lib/realtime';

// Hosts the one ChatEngine for the signed-in person (lib/chatEngine.ts) and
// exposes it to screens. Screens subscribe to slices of its state with
// useChat(selector); actions are engine methods.

const ChatContext = createContext<ChatEngine | null>(null);

async function readFile(uri: string): Promise<Blob | ArrayBuffer> {
  const res = await fetch(uri);
  // supabase-js storage uploads a Blob on web; React Native's fetch Blob is
  // not uploadable through it, an ArrayBuffer is.
  return Platform.OS === 'web' ? res.blob() : res.arrayBuffer();
}

export function ChatProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [engine] = useState(
    () =>
      new ChatEngine({
        api,
        cache: createCache(userId),
        connectLive,
        userId,
        uuid: randomUUID,
        readFile,
      })
  );

  useEffect(() => {
    void engine.start();
    // Coming back to the foreground re-reads whatever Realtime may have
    // missed while the OS had the socket suspended.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void engine.refresh();
    });
    return () => {
      sub.remove();
      engine.stop();
    };
  }, [engine]);

  return <ChatContext.Provider value={engine}>{children}</ChatContext.Provider>;
}

export function useChatEngine(): ChatEngine {
  const engine = useContext(ChatContext);
  if (!engine) throw new Error('useChatEngine outside ChatProvider');
  return engine;
}

export function useChat<T>(selector: (s: EngineState) => T): T {
  const engine = useChatEngine();
  return useSyncExternalStore(
    engine.subscribe,
    () => selector(engine.getState()),
    () => selector(engine.getState())
  );
}
