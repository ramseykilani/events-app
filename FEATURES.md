# Features

A running list of planned and in-progress features. Each section contains a full spec so that agents and collaborators have enough context to implement without needing additional briefing.

## Status

| Feature | Status |
|---------|--------|
| [Notifications](#notifications) | Implemented |
| [SMS Invitations](#sms-invitations) | Implemented |
| [Hide](#hide) | Implemented |
| [Forwarding Shares](#forwarding-shares) | Implemented |
| [Sign Out](#sign-out) | Planned |
| [Web Support](#web-support) | Planned |

---

## Notifications

**Status:** Implemented

### Problem

When someone adds you to an event, there's no way to know unless you open the app. A push notification makes the experience feel immediate and connected without requiring active polling.

### Proposed Solution

When a user shares an event with someone, the recipient receives a push notification showing the event title and date/time. Tapping the notification navigates directly to the event detail screen.

### Technical Notes

- Install `expo-notifications`
- On authenticated app launch: request notification permissions, get the Expo push token, and upsert it to `users.expo_push_token`
- New DB migration: `ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token text`
- New edge function `supabase/functions/send-notification/index.ts`:
  - Input: `{ userEventId: string }` (called after shares are created in `share.tsx`)
  - Queries all `event_shares` for the `userEventId`
  - For each recipient: looks up their push token, checks `hidden_people` (skips if sharer is hidden), sends via Expo Push API
  - Notification body: `{ title: "[Name] added you to [Event Title]", body: "[date] · [time]", data: { eventId } }`
- In `app/_layout.tsx`: set notification tap handler to navigate to `/(app)/event/[eventId]`
- In `app/(app)/share.tsx`: call edge function fire-and-forget after share creation
- Handle `DeviceNotRegistered` errors from Expo Push API by clearing the stale token

### Acceptance Criteria

- [x] Recipient receives a push notification when added to an event on a physical device
- [x] Notification shows event title and date (and time if present)
- [x] Tapping the notification opens the event detail screen
- [x] No notification is sent if the sharer is hidden by the recipient
- [x] No notification is sent if the recipient has no push token

### Open Questions

- None

---

## SMS Invitations

**Status:** Implemented

### Problem

Push notifications only reach users who have installed the app. Non-app users (contacts in `my_people` who haven't signed up) previously received no notification at all when an event was shared with them — they had no way to know they'd been included. This limits the app's usefulness to groups where everyone has already downloaded it.

### Solution

When an event is shared, the `send-notification` Edge Function also sends an SMS via Twilio to every recipient:

- **Non-app users:** SMS with event details (title, date, time), the event URL when one exists, the sharer's phone number as display identity, and App Store / Play Store download links
- **App users:** SMS with event details, the event URL when one exists, and a deep link (`events-app://event/[eventId]`) that opens directly to the event, in addition to their existing push notification. A missing push token does not suppress the SMS.

This means the only person who needs the app is the one sending events. Friends can receive invitations and decide to download the app from there.

### Technical Notes

- No SDK dependency: Twilio REST API called directly via `fetch` with Basic auth in `supabase/functions/send-notification/index.ts`
- New Supabase secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, plus a sender — `TWILIO_MESSAGING_SERVICE_SID` (preferred; built-in STOP opt-out handling) or `TWILIO_PHONE_NUMBER` — and `IOS_APP_STORE_URL`, `ANDROID_PLAY_STORE_URL` for the non-app-user path
- Graceful degradation: if any Twilio secret is missing (or both store URLs are absent for non-app-user path), SMS is silently skipped — push notifications are unaffected
- SMS failures use `.catch(console.error)` and never propagate to the caller
- SMS sends are collected as `Promise<void>[]` and flushed with `Promise.all` after the Expo push batch — concurrent, non-blocking
- Hidden-person check applies to SMS as well: if the sharer is hidden by the recipient, neither push nor SMS is sent
- STOP opt-out language appended to non-app-user SMS per CASL requirements
- `phone_number` for recipients comes from `my_people.phone_number` (E.164); sharer's display identifier comes from `users.phone_number`
- Returns `{ sent: number, sms: number }` (push messages queued, SMS sends dispatched)

### Acceptance Criteria

- [x] Non-app users receive an SMS with event title, date/time, sharer phone, and app download links when shared an event
- [x] App users receive both a push notification and an SMS deep link when shared an event
- [x] SMS is skipped silently when Twilio secrets are not configured
- [x] SMS is skipped when the recipient has no phone number in `my_people`
- [x] SMS is not sent to app users when the sharer is hidden by the recipient
- [x] SMS failures never cause the Edge Function to return an error response

### Open Questions

- None

---

## Hide

**Status:** Implemented

### Problem

Sharing is asymmetric. A user might want to share events *to* someone while not wanting to see what *they* share. Without a hide feature, the only option is to remove them from My People entirely — but that also removes your ability to share events *to* them.

### Philosophy

The word "hide" is intentional. It is literal and emotionally neutral: hiding someone simply means their events don't appear on your calendar and you don't receive notifications from them. It carries no social or moral implication beyond that. There is no reciprocity — the hidden person is unaware and entirely unaffected. It is purely a calendar filter.

Hiding is only possible from within an event that person shared with you. This keeps the action contextual and grounded: you're responding to something that actually happened, not pre-emptively managing people. The Hidden section in the People screen is for undoing a hide only — you cannot hide someone from there.

### Proposed Solution

- From a shared event detail, a "Hide [name]" / "Unhide [name]" button appears at the bottom of the actions
- Tapping Hide immediately hides the person and navigates back (their events disappear from the calendar)
- Tapping Unhide un-hides them in place (no navigation)
- The People screen shows a "Hidden" section at the bottom of the people list; each entry has an "Unhide" button
- Hidden people's events are filtered out server-side by the `get_calendar_events` RPC

### Technical Notes

- New table: `hidden_people(id, owner_id → users, person_id → my_people, hidden_at)` with RLS owner-only
- `get_calendar_events` RPC updated: LEFT JOINs `hidden_people`, filters `WHERE hp.id IS NULL`, and now also returns `sharer_person_id` (the sharer's `my_people.id` in the recipient's contact list)
- `CalendarEvent` type gains `sharer_person_id: string | null`
- `components/Calendar.tsx` passes `sharedByPersonId` param when navigating to a shared event
- `app/(app)/event/[id].tsx` accepts optional `sharedByPersonId` param; shows hide/unhide button whenever present (recipients own their copy under forwarding semantics — see [Forwarding Shares](#forwarding-shares))
- `app/(app)/people.tsx` loads `hidden_people` joined with `my_people` and renders them as a `ListFooterComponent` of the People FlatList

### Acceptance Criteria

- [x] "Hide [name]" button appears on shared event detail screens
- [x] Tapping Hide hides the person and navigates back; their events no longer appear on the calendar
- [x] "Unhide [name]" button appears on the same event if the person is already hidden
- [x] Tapping Unhide un-hides the person; their events reappear on the calendar
- [x] People screen shows a "Hidden" section when there are hidden people
- [x] "Unhide" in the People screen removes the person from the hidden list
- [x] Hidden people's events are excluded server-side, not just client-side

### Open Questions

- None

---

## Forwarding Shares

### Problem

Sharing used to work by reference: recipients saw a shared event through the sharer's `user_events` row, linked by `event_shares`. That made deletion semantics incoherent — if A shared with B and B re-shared with C, A removing the event yanked it from B's calendar but not C's; whether an event survived on your calendar depended on what other people did, not on any rule a user could predict. It also motivated an "unshare" feature that tried to claw back something recipients may already have passed along.

### Philosophy

This app shares public event listings, not private hosted events — closer to forwarding a link by text than to Partiful-style invitations. A share is a completed action, not a revocable grant: once you send someone something, it's theirs. There is no unsend. Removal is purely personal: taking an event off your calendar never changes anyone else's.

### Solution

- **Share delivers a copy.** The `share_event` RPC (SECURITY DEFINER, verifies caller owns the user_event) records `event_shares` rows AND inserts each recipient's own `user_events` row for the same immutable snapshot. Contacts without an account receive their copies on sign-up via the `deliver_pending_shares` trigger (fires when `my_people.user_id` is resolved).
- **Your calendar is yours.** `get_calendar_events` returns only the caller's own `user_events`; `event_shares` is consulted only for "Shared by X" attribution and the hide filter.
- **No unshare.** The share sheet is additive-only: people the event was already shared with render as a completed action ("✓ Shared") and can't be deselected. The header action is "Share", not "Done".
- **Remove is personal.** "Remove Event" deletes only the caller's `user_events` row; recipients keep their copies. The `cleanup_old_events` cron only deletes `events` snapshots with zero remaining owners — it never touches `user_events` or `event_shares`.
- **Hide still works** as the recipient-side control for people whose events you don't want to see.

### Technical Notes

- New migrations: `20260807000005_share_event_rpc.sql` (RPC + backfill of existing shares into recipient copies + `events_select_owner` RLS so recipients can always read events they own), `20260807000006_signup_deliver_pending_shares.sql` (AFTER UPDATE OF user_id trigger on my_people), `20260807000007_calendar_rpc_forwarding.sql` (owned-copies calendar + attribution + hide), `20260807000008_cleanup_orphan_events_only.sql` (orphan-only cleanup)
- `app/(app)/share.tsx` calls the RPC instead of raw `event_shares` inserts; no delete path exists
- `components/ShareSheet.tsx` gains a `sharedPersonIds` prop rendering completed, non-interactive rows and circle chips
- `app/(app)/event/[id].tsx` shows the hide button whenever `sharedByPersonId` is present (recipients now own a copy), and the remove confirmation states it only affects your calendar

### Acceptance Criteria

- [x] Sharing with an app user puts the event on their calendar immediately as their own copy
- [x] Sharing with a non-app user delivers their copy on sign-up
- [x] The sharer removing the event changes nobody else's calendar
- [x] A re-sharer removing the event changes nobody else's calendar
- [x] The share sheet shows existing shares as completed and non-interactive; only never-shared people can be selected
- [x] No code path deletes `event_shares` to revoke access
- [x] Event cleanup deletes only orphaned snapshots

### Open Questions

- None

---

## Sign Out

**Status:** Planned

### Problem

There is no way to sign out. The session persists in AsyncStorage indefinitely, so anyone with the device (or browser profile) stays signed in forever, and there is no way to switch accounts.

### Proposed Solution

A deliberately low-prominence sign-out action — this should not be easy to tap by accident. Put it at the bottom of the People screen (or behind a small menu on the calendar header), labeled "Sign out", and gate it behind a `showConfirm` dialog ("Sign out of [phone number]?").

### Technical Notes

- Call `supabase.auth.signOut()`; `SessionContext` already reacts to the auth state change and routes back to `/(auth)/sign-in` — no extra navigation code needed
- Works on web too (AsyncStorage is backed by localStorage there); today testers work around the missing button with `localStorage.clear()` in the console
- Manual regression: signing out and back in must not duplicate data (sessions are stateless server-side)

### Acceptance Criteria

- [ ] Sign-out control exists but is not prominent (bottom of People screen or behind a menu)
- [ ] Tapping it requires confirming a dialog
- [ ] After sign-out the app lands on the sign-in screen and protected screens are unreachable
- [ ] Signing back in restores the calendar exactly as before

### Open Questions

- Exact placement (People screen footer vs. a calendar header menu that could later hold more settings)

---

## Web Support

**Status:** Planned

### Problem

The app already runs in the browser (`npx expo start --web`) — the entire manual regression suite runs against the web build — but it is only a local dev server, and two gaps block real web usage: there is no contacts API on the web (so My People can't be populated), and the date/time pickers don't open (`@react-native-community/datetimepicker` is native-only).

### Philosophy

A web-first beta is attractive: nobody has to install anything, and notifications arrive by SMS — which the backend already does. Web users never register an Expo push token, and `send-notification` sends app users an SMS regardless of whether they have a push token, so "website + SMS" is the de facto behavior once Twilio function secrets are configured. The web app never requests browser notification permission.

### Proposed Solution

1. **Manual add person.** An "Add manually" form (name + phone number) alongside "Add from Contacts" on the People screen. Normalize to E.164 with `libphonenumber-js` and upsert into `my_people` — the same code path contacts import already uses, so `user_id` resolution and pending-share delivery work unchanged.
2. **Web date/time input.** Fall back to HTML `date`/`time` inputs (or a simple custom picker) when `Platform.OS === 'web'`.
3. **Deploy the web build.** `npx expo export --platform web` produces a static bundle suitable for any static host (Vercel/Netlify/Cloudflare Pages). The bundle uses the public anon key — safe to ship because all data access goes through RLS. Auth (SMS OTP) already works on web.
4. **SMS links for a web beta.** Non-app-user SMS is currently gated on App Store / Play Store URLs; for a web beta the message should link the website instead (small `send-notification` change: accept a `WEB_APP_URL` secret and prefer it over store links).
5. **Turn on SMS sending.** `send-notification` needs its own Twilio function secrets (separate from the Supabase Auth SMS config): `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + a sender. A Messaging Service sender is supported (`TWILIO_MESSAGING_SERVICE_SID`, preferred — built-in STOP opt-out handling) with `TWILIO_PHONE_NUMBER` as fallback.

### Rollout order (web beta)

1. Manual add person + web date/time input (items 1–2)
2. Set the Twilio function secrets (item 5), then verify one real SMS end-to-end against a real phone number (share an event to it from a test account; test OTP numbers never trigger real sends)
3. Deploy the static web build at a stable URL (item 3) and set `WEB_APP_URL` (item 4)
4. [Sign Out](#sign-out) and general polish

### Technical Notes

- Web gaps found during 2026-08-07 live regression: contacts permission flow is a dead end on web (explainer dialog only); date picker silently doesn't open; fixed already: Alert dialogs and edge-function CORS headers
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are bundled into the static build at export time
- The forwarded-copy model means a recipient who later installs the native app sees the same calendar — web and native are interchangeable frontends over the same account
- Status as of 2026-08-07: `send-notification` supports `TWILIO_MESSAGING_SERVICE_SID`; `TWILIO_ACCOUNT_SID` and `TWILIO_MESSAGING_SERVICE_SID` function secrets are set; `TWILIO_AUTH_TOKEN` is still pending (the raw token is not retrievable via the Management API — it must come from the Twilio console)
- The test account B's number (`+16462655565`) is a real-format Manhattan number, not a reserved 555 number — once SMS is on, sharing to B in tests sends real texts to whoever holds that number. Consider moving test accounts to reserved `+1555555XXXX` numbers before heavy SMS-on testing.

### Acceptance Criteria

- [ ] A person can be added on web with name + phone number (E.164), and sharing to them works end-to-end
- [ ] Event date/time can be chosen on web
- [ ] A production web build is deployed at a stable URL and sign-in via SMS OTP works there
- [ ] `TWILIO_AUTH_TOKEN` function secret is set and a real SMS is received end-to-end (event title, date/time, event URL, STOP footer)
- [ ] Sharing to a non-user sends an SMS containing the website URL

### Open Questions

- Hosting provider and domain
- Whether the browser build should show any "install the app" prompt once native builds exist
