# Features

A running list of planned and in-progress features. Each section contains a full spec so that agents and collaborators have enough context to implement without needing additional briefing.

## Status

| Feature | Status |
|---------|--------|
| [Notifications](#notifications) | Implemented |
| [SMS Invitations](#sms-invitations) | Implemented |
| [Hide](#hide) | Implemented |

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

- **Non-app users:** SMS with event details (title, date, time), the sharer's phone number as display identity, and App Store / Play Store download links
- **App users:** SMS with event details and a deep link (`events-app://event/[eventId]`) that opens directly to the event, in addition to their existing push notification

This means the only person who needs the app is the one sending events. Friends can receive invitations and decide to download the app from there.

### Technical Notes

- No SDK dependency: Twilio REST API called directly via `fetch` with Basic auth in `supabase/functions/send-notification/index.ts`
- Five new Supabase secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `IOS_APP_STORE_URL`, `ANDROID_PLAY_STORE_URL`
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
- `app/(app)/event/[id].tsx` accepts optional `sharedByPersonId` param; shows hide/unhide button when present and user doesn't own the event
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
