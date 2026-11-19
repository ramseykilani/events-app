# Features

The running list for I Love You. Same rules as `apps/events/FEATURES.md`:
each section is a full brief (Problem / Solution / Technical Notes /
Acceptance Criteria), and a status of **Not started** means "specified, not
built" — never half-built. Why the app works this way: `docs/i-love-you-design.md`
(repo root). Where things stand operationally: `STATUS.md`.

## Status

"Verified" says how far each implemented feature has been exercised. *e2e* =
a Playwright spec drives it in Chromium against the real local stack
(`e2e/stack.sh`: Supabase CLI stack + LiveKit dev server). *device* = needs a
native build on a phone; none exists yet (`STATUS.md`).

| Feature | Status | Verified |
|---------|--------|----------|
| [Pairing](#pairing) | Implemented | SQL + e2e |
| [Channels](#channels) | Implemented | SQL + Jest + e2e |
| [Channel Settings](#channel-settings) | Implemented | SQL + Jest + e2e |
| [Messaging](#messaging) | Implemented | SQL + Jest + e2e |
| [Photos and Voice Notes](#photos-and-voice-notes) | Implemented | e2e (web); device pending |
| [Move a Message](#move-a-message) | Implemented | SQL + Jest + e2e |
| [Needs You Now](#needs-you-now) | Implemented | SQL + Jest; push delivery device pending |
| [Notifications](#notifications) | Implemented | SQL + Jest; push delivery device pending |
| [Calls and the Drop-in Room](#calls-and-the-drop-in-room) | Implemented | e2e with real WebRTC (web); native device pending |
| [Desktop](#desktop) | Implemented | e2e (two panes, shortcuts, PWA assets) |
| [Desktop Shell (Tauri)](#desktop-shell-tauri) | Scaffolded | Linux debug build only (see STATUS.md) |
| [Send Later](#send-later) | Not started | — |
| [Native Call Integration (CallKit / ConnectionService)](#native-call-integration-callkit--connectionservice) | Not started | — |
| [Web Push for the Closed Desktop App](#web-push-for-the-closed-desktop-app) | Not started | — |
| [Krisp Noise Filter](#krisp-noise-filter) | Not started | — |
| [Screen Share from Phones](#screen-share-from-phones) | Not started | — |
| [Search](#search) | Not started | — |
| [Shared Scratchpad](#shared-scratchpad) | Not started | — |
| [Shared Vault](#shared-vault) | Not started | — |
| [Watch Together](#watch-together) | Not started | — |
| [End-to-End Encryption](#end-to-end-encryption) | Not started | — |
| [Privacy Policy Page](#privacy-policy-page) | Not started | Needed before any store listing |

Out of scope by owner decision, and not to be specified: location and battery
statuses, thumb-kiss style novelties, anything location-based.

---

## Pairing

### Problem
Two people need a private space nobody else can enter, without contacts,
discovery, or an inbox of people.

### Solution
Phone + SMS code sign-in (the family's one sign-in). Then: your name → one of
you taps **Start our space** and gets an 8-character code (31-symbol alphabet
without look-alikes, shown as two groups of four, copy/share), the other taps
**Enter a code**. The second arrival closes the couple for good and seeds the
three preset channels.

### Technical Notes
- `couple_members (couple_id, slot)` primary key with `slot IN (1, 2)`; a
  person in one couple (`UNIQUE user_id`); `couple_members_guard` trigger
  refuses inserts into a paired couple (row-locked).
- `create_couple` is idempotent for an unpaired creator (fresh code after the
  7-day expiry); `join_couple` returns a status (never raises for a miss) so
  failed attempts commit; 10 misses an hour → `rate_limited`; entering your
  own code is refused without a strike; joining abandons a couple you had
  started. `cancel_invite` ("Stop waiting").
- The waiting screen advances by Realtime (`couple_members`) with a 4s poll
  as the safety net.
- `get_my_couple` returns the partner's name only — never phone or token.

### Acceptance Criteria
- [x] A third person entering a used code is told it did not match
  (e2e `pairing.spec.ts`); a slot-3 or duplicate-slot insert fails by
  constraint (`pairing_test.sql` T8).
- [x] The creator's waiting screen moves to the channels when the partner
  joins, without a reload.
- [x] Expired codes are refused; the creator re-opens with a fresh code.

## Channels

### Problem
"We have our regular chat, … heart-to-heart … logistics … And we have a
bunch of different channels." Then: "Instead of having set channels, we
should be able to adjust the channels, and they should simply have settings
and names."

### Solution
Channels are generic: name, icon (Ionicons outline set, tinted — never
emoji), shared order, settings. Pairing seeds three from presets; **New
channel** starts from any preset or Blank. Either partner renames, re-icons,
reorders (up/down — keyboard and screen-reader reachable), archives
(reversible, no confirm, neutral — design language §3) and restores. There
is no channel delete: a shared history needs both people to destroy it.

### Technical Notes
`channels` + `channel_prefs` (per person); `channel_presets` table (data, not
code); RPCs `create_channel` (idempotent on client id), `update_channel`,
`reorder_channels`, `set_channel_archived`, `get_channels` (effective
settings + boolean `unread`). Archived channels are read-only until restored.

### Acceptance Criteria
- [x] Create from a preset, rename, reorder (persists across reload),
  archive and restore (e2e `channels.spec.ts`).
- [x] Changes reach the partner live.

## Channel Settings

### Problem
"I'd want the ability to toggle, for example, features like mute or not in
the different channels" — "maybe one day we want this, maybe one day we want
that."

### Solution
One typed registry; the settings sheet renders from it in two groups.

| Key | Scope | Type | Default | What it does |
|-----|-------|------|---------|--------------|
| `notify_level` | personal | notify / quiet / none | notify | How this channel notifies you (mute = none) |
| `notify_sound` | personal | default / chime / none | default | The sound it makes |
| `notify_preview` | personal | boolean | true | Message text on the lock screen, or only the channel name |
| `read_receipts` | shared | boolean | false | Both see "Seen" |
| `typing_indicator` | shared | boolean | true | Both see "… is typing" |
| `items_completable` | shared | boolean | false | Circle → ✓ Done per message; "Open items" filter |
| `allow_urgent` | shared | boolean | false | Messages may be flagged "needs you now" |

Presets: **Everyday** (defaults), **Heart-to-heart** (quiet, no preview, no
typing indicator), **Logistics** (items, receipts, needs-you-now), **Blank**.

### Technical Notes
To add a setting: a migration row in `setting_definitions` (validated shape),
an entry in `lib/channelSettings.ts`, and the code that reads it.
`__tests__/lib/channelSettings.test.ts` fails if the two lists drift;
`channels_test.sql` T5 proves a new row is effective everywhere without a
data migration. One write path: `set_channel_setting` (validates key, scope,
type, option; same-value writes are no-ops).

### Acceptance Criteria
- [x] A shared toggle changes the conversation for both, live; a personal one
  affects only its owner (e2e `channels.spec.ts`, SQL T2).
- [x] Unknown keys, wrong types and bad choices are refused (SQL T3).

## Messaging

### Problem
"The smoothness of Telegram."

### Solution
Instant open from the local cache; optimistic send; live delivery; typing
indicator; replies; reactions (six vector-icon reactions, labelled by who —
"You", "Natasha", "Both"); edit (yours; ↑ in an empty box edits your last);
delete (yours, confirmed, soft — "Message deleted" for both); links
(tappable, `linkText`); day dividers; history paging as you scroll up;
"Jump to latest" when scrolled away; read receipts where on.

### Technical Notes
- `lib/chatEngine.ts` (React-free, Jest-driven through an injected Api/cache/
  live seam) + `lib/timeline.ts` merge rules + `lib/outbox.ts`.
- Local cache: AsyncStorage per account (channels, newest 200 messages per
  channel, cursor, outbox). Outbox written immediately (survives a kill).
- `send_message` insert-or-return on the client id; outbox retries
  transient failures with backoff (1→30s), stops on refusal.
- Realtime: one private channel per couple — `postgres_changes` (messages,
  channels, my prefs, members), broadcast (typing, read), presence (room).
  Every (re)subscribe and foreground runs `get_message_changes` from the
  cursor (>2000 missed → reload fresh).
- Keyset paging `get_messages(created_at, id)`; inverted list.

### Acceptance Criteria
- [x] Two sessions exchange messages without refresh; unread dot appears
  live and is never a number; edit, react and delete reach the partner
  (e2e `messaging.spec.ts`).
- [x] A reload shows the same history with no duplicate of a sent message.
- [x] Timed-out sends retry with the same id; refusals show ✕ Not sent with
  Retry/Discard (Jest `chatEngine.test.ts`).

## Photos and Voice Notes

### Solution
Photo button (image picker; device preview while uploading; tap for full
screen). Mic button when the box is empty: record, Cancel or Send (up to 5
minutes). Voice notes play inline with progress.

### Technical Notes
Private `attachments` bucket, folder per couple
(`<couple>/<message>/<file>`), Storage RLS on the folder; uploads are
`upsert` on the message-keyed path so a retried upload overwrites itself.
Signed URLs (1h) cached in memory. Web records with MediaRecorder (Opus in
WebM; MP4 on Safari); phones with expo-audio (AAC/M4A). Deleting a message
removes its object (best effort; client-side).

### Acceptance Criteria
- [x] A photo and a voice note sent on one session load on the other
  (e2e `attachments.spec.ts`, Chromium fake mic).
- [ ] Native picker and recorder on a device (needs a dev build).

## Move a Message

### Problem
"This belongs in heart-to-heart."

### Solution
Message actions → **Move to another channel** → pick one. Either partner can
move any live message. Author and time are kept; the bubble says "Moved from
Everyday". Done-state is kept only if the target channel tracks items.

### Technical Notes
`move_message` updates `channel_id` (+ `moved_from_channel_id`, `moved_at`)
and re-derives both channels' last-message columns; the UPDATE travels over
Realtime and the engine re-files the row (`applyToTimelines`).

### Acceptance Criteria
- [x] Author/time preserved, origin recorded, no-op when already there
  (SQL T10); the engine moves it between timelines (Jest).
- [x] A message moved from Everyday shows up in Heart-to-heart for both,
  still the author's, marked "Moved from Everyday" (e2e `messaging.spec.ts`).

## Needs You Now

### Solution
Where a channel's shared `allow_urgent` is on, the composer shows a **Needs
you now** toggle (off again after each send). The message is marked in the
bubble and notifies even when the partner set that channel to quiet or off.

### Technical Notes
`send_message(p_urgent)` refuses it elsewhere; `claim_message_push` lets an
urgent message through a `none` level; payload = iOS `time-sensitive`
(entitlement in `app.config.js`), Android `ily.urgent` channel (max
importance), desktop `requireInteraction`.

### Acceptance Criteria
- [x] Refused where the setting is off; overrides "off" (SQL T8, push T4;
  Jest payload).
- [ ] Breaks through quiet/off on a real phone (device pending).

## Notifications

### Problem
"If I get it from this app, it's from my partner. And … I can see what was
the intention behind it … so it's very easy to set up notifications
separately."

### Solution
See `docs/i-love-you-design.md` §4. Title = channel; body = message (or "New
message"); per-person per-channel level, sound and preview; Android OS
channel per conversation; iOS thread per channel; Reply action; tap opens
the channel; desktop notifications follow the same levels.

### Technical Notes
- Server: `send-push` edge function (fetch-only, no SDK imports) →
  `claim_message_push` / `claim_ring_push` (service_role; exactly-once;
  ring throttle 1/min) → `buildMessagePush` (shared with the client) → Expo
  Push API. `DeviceNotRegistered` clears the token.
- Client: `lib/notifications.native.ts` (permission, token, categories,
  Android channel sync from `desiredAndroidChannels`/`staleAndroidChannels`,
  foreground suppression for the open channel, response handling incl. cold
  start); `lib/notifications.ts` (web/PWA/Tauri).
- The OS prompt is explainer-gated (one card, once; Settings keeps a way
  back) — the Events rule.

### Acceptance Criteria
- [x] Payload grammar per level/sound/preview/urgent (Jest
  `notificationPayload.test.ts`); claim semantics (SQL `push_claims_test.sql`).
- [x] Desktop notifications follow the levels and stay quiet for the open
  channel (Jest `desktopNotifications.test.ts`).
- [ ] Delivery on iOS and Android devices; Reply action from a locked phone
  (needs EAS dev build + APNs/FCM credentials — STATUS.md).

## Calls and the Drop-in Room

### Solution
`docs/i-love-you-design.md` §8. Your room: **Call** (rings), **Sit in the
room** (quiet), banner "X is in your room · Join", in-call dock on every
screen, mic/camera/screen share (desktop)/flip camera (phone)/leave.

### Technical Notes
`livekit-token` edge function mints an HS256 token (Web Crypto) for
`couple-<id>` only, after `room_for_member`; returns the LiveKit URL from its
secret. `app/_context/CallContext.tsx` owns the Room above the navigator.
Platform split: `lib/call/platform.ts` (web) / `platform.native.ts`
(registerGlobals, AudioSession); `components/call/VideoTile(.native).tsx`.
Presence for the room rides the couple's Realtime channel.

### Acceptance Criteria
- [x] A sits in, B sees the banner and joins, both connected, B's camera
  video plays on A, the call survives navigation, leaving updates the other
  side (e2e `call.spec.ts`, real WebRTC through a local LiveKit server).
- [ ] Native call audio routing, background audio, camera flip (device).
- [ ] LiveKit Cloud (TURN/TLS on the open internet) — local dev server only so far.

## Desktop

### Solution
Two panes ≥900px, keyboard shortcuts (Settings lists them), hover message
actions, dock at the foot of the channel pane, installable PWA (manifest,
icons, service worker: network-first shell, cache-first hashed assets,
nothing cross-origin cached).

### Acceptance Criteria
- [x] Two panes, ⌘/Ctrl+N and Alt+↑/↓ switch channels, Enter sends and
  Shift+Enter breaks a line (e2e `desktop.spec.ts`); manifest/icons/SW served
  (e2e `pwa.spec.ts`).
- [ ] Install-to-Dock / Start-menu checked by hand on macOS and Windows.

## Desktop Shell (Tauri)

### Solution
`desktop/i-love-you` (repo root, outside the npm workspaces): Tauri v2 around
the web build — tray icon, close-to-tray, single instance, remembered window
state, OS notifications via tauri-plugin-notification (the web build detects
`window.__TAURI__`).

### Status
Scaffolded and compiled on Linux only (see `STATUS.md` for exactly what was
built). macOS and Windows bundles must be built on those OSes:
`desktop/i-love-you/README.md`.

## Send Later

### Problem
Deliver a message at a chosen time ("remind her about the vet Saturday
morning").

### Proposed Solution
Long-press Send (or a clock button) → pick a time → the message sits in a
"Scheduled" strip for the sender only, editable and cancellable, and is
delivered (inserted + notified) at that time.

### Technical Notes
A `scheduled_messages` table (sender-only RLS) and a pg_cron job (every
minute) calling `release_scheduled_messages()`, which inserts due rows
through the same path as `send_message` and then calls `send-push` through
`pg_net` with a cron secret (the Events `cleanup-people` pattern). Delivery
is then an ordinary INSERT, so Realtime and the catch-up feed need nothing
new. Time zone: store `deliver_at timestamptz`; pick in the sender's zone.

### Acceptance Criteria
- Nothing reaches the partner (RLS, Realtime, push) before `deliver_at`.
- Cancel before delivery leaves no trace for the partner.

## Native Call Integration (CallKit / ConnectionService)

Ringing on a locked phone with the system call UI, call history, Bluetooth
headset answer. Needs VoIP push (PushKit) on iOS and a self-managed
ConnectionService on Android, wired to the same LiveKit room. Not started
by owner decision for this pass.

## Web Push for the Closed Desktop App

Desktop notifications today need the PWA/tab (or the Tauri shell in the
tray) running. Web Push (VAPID) would deliver when it is fully closed:
`send-push` gains a web-push sender, the service worker shows the
notification (`notificationclick` already focuses the app), and push
subscriptions are stored per device next to the Expo token.

## Krisp Noise Filter

`@livekit/krisp-noise-filter` on top of the browser/OS noise suppression —
a large step for voice in noisy rooms. Requires a LiveKit Cloud plan.

## Screen Share from Phones

iOS needs a Broadcast Upload Extension; Android a media-projection
foreground service. `@livekit/react-native` documents both; both need native
config beyond the current plugins.

## Search

Find a message across channels. Postgres full-text on `messages.body`
(GIN index, `websearch_to_tsquery`) behind a definer RPC scoped to the
couple; results open the conversation at that message.

## Shared Scratchpad

One always-there shared note per couple (lists, plans) with live
co-editing. Not started by owner decision for this pass.

## Shared Vault

Long-lived shared things (documents, passwords, important photos) apart
from chat. Not started by owner decision for this pass; would need
client-side encryption to be worth having.

## Watch Together

Synced playback while in the room. Not started by owner decision for this
pass.

## End-to-End Encryption

Messages readable only on the two people's devices. Not started by owner
decision for this pass. Shape: per-device keys, a couple key wrapped to each
device, encrypted `body`/attachments; server features that read bodies
(previews, search, push text) would move to the client.

## Privacy Policy Page

App Store and Play listings need a privacy policy URL; the sign-in screen
should link it (as Events does). Not written — content is the owner's call.
