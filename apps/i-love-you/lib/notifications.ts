import type { Channel, Message } from './types';
import { buildMessagePush } from './notificationChannels';

// Web/desktop half of notifications (lib/notifications.native.ts is the
// phone half). On the desktop the app is a browser tab or an installed PWA
// window, and the Notification API is the OS notification: it follows the
// same per-channel levels as push — 'notify' plays the OS sound, 'quiet'
// arrives silent, 'off' never shows, "needs you now" stays until clicked —
// and the title is the channel, so a glance says what kind of conversation
// it is. Notifications group per channel (tag) and only appear when the
// window is hidden or a different channel is open.
//
// The browser permission prompt has exactly one call site:
// requestPermission(), behind Settings -> Desktop notifications.

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

type Handlers = {
  openChannel: (channelId: string) => void;
  reply: (channelId: string, text: string, replyToId: string | null) => Promise<void>;
  openRoom: () => void;
};

let handlers: Handlers | null = null;
let activeChannelId: string | null = null;

// Inside the desktop shell (desktop/i-love-you, Tauri v2 with
// withGlobalTauri) the OS notification goes through
// tauri-plugin-notification — the system webviews (WKWebView, WebKitGTK,
// WebView2) do not back the web Notification API with OS notifications.
type TauriNotification = {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<'granted' | 'denied' | 'default'>;
  sendNotification: (o: { title: string; body?: string; silent?: boolean }) => void;
};
function tauri(): TauriNotification | null {
  const t = (globalThis as { __TAURI__?: { notification?: TauriNotification } }).__TAURI__;
  return t?.notification ?? null;
}

function supported(): boolean {
  return typeof window !== 'undefined' && ('Notification' in window || !!tauri());
}

export async function getPermission(): Promise<PermissionState> {
  const shell = tauri();
  if (shell) return (await shell.isPermissionGranted()) ? 'granted' : 'undetermined';
  if (!supported()) return 'unsupported';
  const p = Notification.permission;
  return p === 'default' ? 'undetermined' : p;
}

export async function requestPermission(): Promise<PermissionState> {
  const shell = tauri();
  if (shell) {
    const r = await shell.requestPermission();
    return r === 'default' ? 'undetermined' : r;
  }
  if (!supported()) return 'unsupported';
  const result = await Notification.requestPermission();
  return result === 'default' ? 'undetermined' : result;
}

// Web push (VAPID) is not wired: the desktop app notifies while it is open
// or installed-and-running, which is how a desktop chat app is used
// (FEATURES.md -> Notifications, next steps).
export async function registerPushToken(): Promise<string | null> {
  return null;
}

export async function syncNotificationChannels(_channels: Channel[]): Promise<void> {}

export function setActiveChannel(channelId: string | null): void {
  activeChannelId = channelId;
}

export function setupResponseHandling(next: Handlers): () => void {
  handlers = next;
  return () => {
    if (handlers === next) handlers = null;
  };
}

export function presentIncoming(message: Message, channel: Channel | undefined, partnerName: string): void {
  const shell = tauri();
  if (!channel || !supported() || (!shell && Notification.permission !== 'granted')) return;
  const visible = typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
  if (visible && activeChannelId === message.channel_id) return;
  const payload = buildMessagePush({
    token: '',
    channel: { id: channel.id, name: channel.name },
    senderName: partnerName,
    message: { id: message.id, kind: message.kind, body: message.body, urgent: message.urgent },
    settings: channel.my_settings,
  });
  if (!payload) return;
  if (shell) {
    // The shell's window comes forward from the tray on click (lib.rs).
    shell.sendNotification({ title: payload.title, body: payload.body, silent: payload.sound === null });
    return;
  }
  try {
    const n = new Notification(payload.title, {
      body: payload.body,
      tag: `${channel.id}:${message.id}`,
      silent: payload.sound === null,
      requireInteraction: message.urgent,
      icon: '/icon-192.png',
      data: payload.data,
    });
    n.onclick = () => {
      window.focus();
      handlers?.openChannel(channel.id);
      n.close();
    };
  } catch (err) {
    console.error('desktop notification failed:', err);
  }
}
