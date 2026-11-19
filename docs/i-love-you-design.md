# I Love You — Design Note

Why the app behaves the way it does. Companion to the family design language
(`docs/events-design-language.md`, which I Love You uses unchanged: Paper and
Evening, role tokens, the header and button grammar) and the family
philosophy (`docs/events-philosophy.md`). This note records where I Love You
follows them, where it departs, and why. What it does lives in
`apps/i-love-you/FEATURES.md`; how to run it, in `apps/i-love-you/SETUP.md`.

---

## 1. What it is

A messaging and calling app for exactly two people. The owner's words are
the brief:

- "a messaging app … that only lets you message and call with one other
  person … designed explicitly for your spouse."
- "it can have features that would never make sense in a regular messaging
  app, and it can skip a ton of the things that a regular messaging app has."
- "we have our regular chat, we have deep heart-to-heart conversations chat,
  and then you can leave that one on mute … and then we have a logistics chat
  for those important quick questions."
- "Instead of having set channels, we should be able to adjust the channels,
  and they should simply have settings and names and stuff … You need to think
  at a higher layer."
- "if I get it from this app, it's from my partner. And second, I can see what
  was the intention behind it, like what channel did it come from."
- "the smoothness of Telegram with the voice quality of Discord, a really good
  desktop app."

## 2. Two people, structurally

The two-person rule is not a check that can be raced; it is the shape of the
table. `couple_members` is keyed on `(couple_id, slot)` with `slot IN (1, 2)`:
a third row is a primary-key violation however two requests interleave. A
person is in one couple (`UNIQUE user_id`), and a couple that has paired is
closed forever (a trigger refuses any member insert once `paired_at` is set;
the invite code is single-use and cleared on pairing). There is therefore no
contacts list, no search, no people screen. The home screen's title is your
partner's name.

Deleting your account ends the couple for both of you — a shared history has
two owners, and a couple with one member is not a couple. The confirm dialog
says exactly that.

## 3. Channels are generic; behavior is settings

A channel is a name, an icon, an order, and a bag of settings. Nothing in the
code knows that a channel "is" the heart-to-heart one. The three channels a
new couple starts with (Everyday, Heart-to-heart, Logistics) are *presets*:
rows in `channel_presets` whose setting values are copied in at creation and
never consulted again. Creating a channel starts from any preset or from
blank. Either partner can rename, re-icon, reorder, archive and restore.

Settings come from one registry with two halves:

- **Server** — `setting_definitions` (key, scope, type, options, default).
  Every write RPC validates against it; effective settings are computed
  server-side (stored value if valid, otherwise the default), so retiring a
  setting is a row delete, not a data migration.
- **Client** — `lib/channelSettings.ts` (label, help text, how it renders).
  A Jest test parses the migration and fails if the halves drift.

Two scopes: **shared** (one value for both — read receipts, typing indicator,
items can be marked done, "needs you now" allowed) and **personal** (yours
alone — how the channel notifies you, its sound, whether the lock screen
shows the text). The settings sheet renders both groups straight from the
registry: "Just for you" and "For both of you". Adding a setting is one
migration row, one registry entry, and the behavior that reads it.

## 4. Notifications are the product, not plumbing

The owner's point is that a notification from this app already says it is
your partner; what it must also say is *what kind of conversation* it is, and
each kind must be tunable at the OS level.

- The **title is the channel** ("Logistics"); the body is the message (or
  "New message" when you turned previews off for that channel). iOS also
  carries the partner's name as the subtitle.
- **Per person, per channel level**: Notify (sound and banner), Deliver
  quietly (iOS `passive`; a low-importance Android channel; a silent desktop
  notification), Off. Mute is simply Off. The unread dot shows either way.
- **Android**: one OS notification channel per conversation, named like it,
  created, renamed and removed in step with the app's channels — so sound,
  vibration and importance can be tuned per channel in system settings too.
  Android freezes importance and sound at creation, so they are part of the
  OS channel id; changing level or sound in the app replaces that OS channel
  (any customisation made in system settings for the old one is lost — the
  in-app change is the newer, explicit choice).
- **iOS**: each channel is its own thread (`threadId`), with its own sound
  and interruption level.
- **"Needs you now"**: a per-message flag, offered only where the channel's
  shared `allow_urgent` setting is on. It overrides the reader's quiet or off
  level (iOS `time-sensitive`, a separate high-importance Android channel,
  a desktop notification that stays until clicked). It is shared on purpose:
  both of you agree a channel may interrupt.
- **Reply from the notification** on both platforms (a text action).
- Person-triggered only, as in Events: the sender's client invokes `send-push`
  after its write lands; a SQL claim makes each message notify at most once.
  There is no digest, no "you have unread", no re-engagement push.

## 5. Live, not pulled — the deliberate exception

Events fetches on focus and has no realtime subscriptions. A conversation
cannot work that way, so I Love You subscribes — and keeps every Events
reliability rule around the subscription:

- **Realtime is an accelerator, never the source of truth.** Every
  (re)subscribe runs a catch-up read (`get_message_changes` from the newest
  `updated_at` seen), so a dropped socket loses nothing. Coming back to the
  foreground does the same.
- **Bounded everything.** Reads use `withRetries` (2s × 3), writes
  `withWriteTimeout` (15s); edge-function calls ride the 20s backstop.
- **Keep last-good data, never blank.** The engine renders the local cache
  first; a failed refresh keeps what is on screen and shows the family's
  quiet retry line; a dropped socket shows "Reconnecting…".
- **Idempotent writes.** Message ids are client-generated; `send_message` is
  insert-or-return on the id. This is why the outbox may retry a send on its
  own, which Events forbids for its writes: retrying an idempotent send *is*
  the read-back reconciliation Events does, in one call. Only a server
  refusal stops retries, and that becomes "✕ Not sent · Retry · Discard".
- RLS stays the boundary: `postgres_changes` is filtered per subscriber by
  Realtime against the table policies; the private broadcast topic
  (`couple:<id>`, typing, read positions, room presence) is authorized by a
  policy on `realtime.messages`.

## 6. Unread without counting

The design language bans badges and counts. Unread is a boolean from the
server (`get_channels`), shown as one small accent dot on the channel row —
never a number, no app badge, no tab-title count. Reactions name who
("You", "Natasha", "Both"), never how many. The "Open items" filter is a chip
with no count.

## 7. Read receipts are a choice, per channel

Events' philosophy says "No read receipts." Here the owner asked for them as
a toggle, and in a two-person app the question "did you see my question?" is
real. So they exist, as a **shared** setting, off by default except in the
Logistics preset. When off, the partner's read position is not merely hidden
by the client — `get_partner_reads` does not return it, and the client does
not broadcast its own.

## 8. Calls

One LiveKit room per couple. **Call** joins and rings your partner; **Sit in
the room** joins quietly, and your partner sees "Natasha is in your room ·
Join" wherever they are — a Discord voice channel for two. The room lives
above the navigator, so the in-call dock stays on screen while you move
between channels.

Quality choices (each commented in `lib/call/callConfig.ts`, pinned by Jest):

- Voice: Opus at 64 kbps mono (Discord's default voice bitrate; Opus is
  transparent for speech well below that), DTX on (silence costs nothing;
  comfort noise keeps the line alive), RED on (each packet carries the
  previous frame — the biggest win on lossy mobile networks). Capture runs
  echo cancellation, noise suppression, AGC and Chrome's voice isolation.
  Screen-share audio is the opposite: 128 kbps stereo, DTX off (it clips
  music). Krisp is the next step and needs LiveKit Cloud.
- Video: AV1 when the browser can encode it, else VP9, else VP8, with a VP8
  backup codec for a receiver that cannot decode the primary; H.264 on
  phones (hardware encode/decode). AV1/VP9 publish SVC (L3T3_KEY); VP8/H.264
  simulcast. Adaptive stream and dynacast on. 1080p30 camera on desktop,
  720p30 on phones, `maintain-framerate` (two faces need motion more than
  pixels). Screen share 1080p at 15 fps with the `detail` content hint.
- SDK versions are pinned to the line contemporaneous with Expo SDK 54:
  `@livekit/react-native` 2.9.8 with `@livekit/react-native-webrtc` 137.0.3
  and `@config-plugins/react-native-webrtc` 13.0.0 (the plugin major that
  declares `expo ^54`; 14+ require SDK 55+). LiveKit's Expo quickstart has
  moved to SDK 57 and RN SDK 3.x (WebRTC M144/M150), which assume a newer
  React Native than SDK 54's 0.81. `livekit-client` is one copy (2.24.1),
  shared by the web build and the RN SDK.

## 9. Desktop is the web build done properly

At 900px and wider the app is two panes (channels beside the conversation),
with keyboard shortcuts (⌘/Ctrl 1–9, Alt ↑/↓, Enter to send, ↑ to edit,
Esc, ⌘/Ctrl Shift M to mute), hover actions on messages, and the call dock
at the foot of the channel pane. It installs as a PWA (manifest, icons, a
deliberately small service worker) for its own window on macOS and Windows
today. `desktop/i-love-you` wraps the same build in Tauri v2 for a tray icon,
close-to-tray, single instance and native OS notifications.

Events never asks for browser notification permission because its web build
is a dev surface. For I Love You the desktop build *is* a product surface, so
desktop notifications exist — explainer-gated exactly like the native ask:
one card, once, with Not now final, and a way back in Settings.

## 10. What it is not

No feed, no stories, no status, no last-seen, no streaks, no counts. No
contacts and no third person, ever. No location features (owner, explicitly).
Nothing that pings you because the app wants your attention — only because
your partner wrote.
