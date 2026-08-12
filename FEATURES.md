# Features

A running list of planned and in-progress features. Each section contains a full spec so that agents and collaborators have enough context to implement without needing additional briefing.

## Status

| Feature | Status |
|---------|--------|
| [Notifications](#notifications) | Implemented |
| [SMS Invitations](#sms-invitations) | Implemented |
| [Hide](#hide) | Implemented |
| [Forwarding Shares](#forwarding-shares) | Implemented |
| [Sign Out](#sign-out) | Implemented |
| [Web Support](#web-support) | Implemented |
| [Display Names](#display-names) | Implemented |
| [Inline Add-by-Phone in Share Sheet](#inline-add-by-phone-in-share-sheet) | Planned |
| [Add Sharer to Your People](#add-sharer-to-your-people) | Planned |
| [Contacts Permission Explainer](#contacts-permission-explainer) | Implemented |
| [Themeable Icons (Emoji Audit)](#themeable-icons-emoji-audit) | Implemented |
| [Delete Account](#delete-account) | Implemented |

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

- **Non-app users:** SMS with event details (title, date, time), the event URL when one exists, and the sharer's phone number as display identity. No app or web links — the SMS is the whole message.
- **App users:** the same link-free SMS in addition to their push notification (push is the tappable path into the event). A missing push token does not suppress the SMS.

This means the only person who needs the app is the one sending events. Friends are informed by text; nothing in the message pulls them into the app or website. (Revised 2026-08-09: SMS previously carried web/store/deep links; removed deliberately — see `docs/distribution-strategy.md`.)

### Technical Notes

- No SDK dependency: Twilio REST API called directly via `fetch` with Basic auth in `supabase/functions/send-notification/index.ts`
- New Supabase secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, plus a sender — `TWILIO_MESSAGING_SERVICE_SID` (preferred; built-in STOP opt-out handling) or `TWILIO_PHONE_NUMBER`. No other secrets gate SMS (`IOS_APP_STORE_URL` placeholder was removed 2026-08-09; `WEB_APP_URL` is no longer read by this function)
- Graceful degradation: if any Twilio secret is missing, SMS is silently skipped — push notifications are unaffected
- SMS failures use `.catch(console.error)` and never propagate to the caller
- SMS sends are collected as `Promise<void>[]` and flushed with `Promise.all` after the Expo push batch — concurrent, non-blocking
- Hidden-person check applies to SMS as well: if the sharer is hidden by the recipient, neither push nor SMS is sent
- STOP opt-out language appended to non-app-user SMS per CASL requirements
- `phone_number` for recipients comes from `my_people.phone_number` (E.164); sharer's display identifier comes from `users.phone_number`
- Returns `{ sent: number, sms: number }` (push messages queued, SMS sends dispatched)

### Acceptance Criteria

- [x] Non-app users receive an SMS with event title, date/time, sharer phone, and the event URL when one exists — no app/web links
- [x] App users receive both a push notification and a plain-text SMS when shared an event
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

**Status:** Implemented

### Problem

There is no way to sign out. The session persists in AsyncStorage indefinitely, so anyone with the device (or browser profile) stays signed in forever, and there is no way to switch accounts.

### Proposed Solution

A deliberately low-prominence sign-out action — this should not be easy to tap by accident. Put it at the bottom of the People screen (or behind a small menu on the calendar header), labeled "Sign out", and gate it behind a `showConfirm` dialog ("Sign out of [phone number]?").

### Technical Notes

- Call `supabase.auth.signOut()`; `SessionContext` already reacts to the auth state change and routes back to `/(auth)/sign-in` — no extra navigation code needed
- Works on web too (AsyncStorage is backed by localStorage there); today testers work around the missing button with `localStorage.clear()` in the console
- Manual regression: signing out and back in must not duplicate data (sessions are stateless server-side)

### Acceptance Criteria

- [x] Sign-out control exists but is not prominent (bottom of People screen or behind a menu)
- [x] Tapping it requires confirming a dialog
- [x] After sign-out the app lands on the sign-in screen and protected screens are unreachable
- [ ] Signing back in restores the calendar exactly as before (covered by the native device smoke pass, `manual-tests/native_device_smoke.md`)

### Open Questions

- Exact placement (People screen footer vs. a calendar header menu that could later hold more settings)

---

## Display Names

**Status:** Implemented (2026-08-12)

### Problem

Notification SMS identifies the sharer by raw phone number ("+1 416 555 1234 added you to…"). This is worse than it sounds: the SMS arrives from a Twilio Messaging Service pool number, so the recipient's phone can never match it to a saved contact — the body text is the *only* identity signal. A nameless share is effectively an anonymous text, and the SMS is the entire product surface for non-app recipients.

### Solution (as shipped)

Capture a display name with a **hard gate at first share — never at sign-up**. The name is only ever consumed at share time (`send-notification` and calendar attribution are its only readers), so the ask lives in the share screen where it is self-justifying: an inline field with one line of context ("Your friends get a text when you share — this is the name they'll see") appears while `display_name` is null, and Share stays disabled until it's saved. Users who never share are never asked; the no-forced-onboarding rule stays absolute. The gate binds the Share *action*, not the share screen, which is also the mandatory step after event creation.

This supersedes the originally spec'd capture UX ("one skippable field after OTP verification"). A skippable sign-up prompt had the worst of both worlds: friction for recipients who may never share, and a permanent nameless state for skippers (a skip was forever — there was no edit path). The share-time gate guarantees no nameless share can ever go out, asks at the moment the user is most motivated to be recognizable, and composes with [Inline Add-by-Phone in Share Sheet](#inline-add-by-phone-in-share-sheet) (a first-time sharer's screen becomes: your name, their names, send).

### Decisions (2026-08-12)

- **No backfill.** Accounts that predate the feature stay NULL until their next share, when the gate asks. Recorded so nobody "fixes" it later.
- **Editable, never removable.** A "Your name" row at the People screen footer opens an edit modal; empty saves are rejected (client and CHECK constraint). There is no delete-name path.
- **No verification / impersonation accepted.** A user can call themselves anything. Acceptable because shares only reach the sharer's own chosen contacts — the same trust model as contact names.
- **Still no name lookup.** Typing a phone number never reveals whether that number is a user or what they call themselves. `users` rows are select/update own-only via RLS; the only cross-user reads are `send-notification` (service role) and the calendar RPC's share attribution — both limited to people the user actually shared with.
- **"From X" coalesces.** Calendar attribution is the recipient's own `contact_name` for the sharer when present, else the sharer's `display_name`, else no attribution line.

### Technical Notes

- Migration `20260812000001`: `users.display_name text` nullable, plus CHECK constraint `users_display_name_valid` (non-empty after trim, ≤50 chars, no newlines). The CHECK is the real validation boundary: `users_update_own` RLS lets any authenticated user write their own row via raw REST, and the value is interpolated unescaped at the start of an SMS body. The cap also bounds push titles and the "From X" line.
- Migration `20260812000002`: `get_calendar_events` attribution becomes `COALESCE(mp_owner.contact_name, u_sharer.display_name)` (joins `users` for the sharer). Return shape unchanged — no calendar client changes.
- `send-notification`: selects `display_name` alongside `phone_number`. App users (push title + SMS): `contact_name` → `display_name` → phone. Non-app users: `display_name` → phone. The phone fallback is pre-feature legacy state given the share gate.
- Share screen ([app/(app)/share.tsx](app/(app)/share.tsx)): fetches the caller's `display_name` on focus; the gate renders only when the value is positively known null — a failed fetch never blocks sharing. Name save is its own step (so a failed write can't swallow a share); inputs strip newlines client-side too.
- Edit path ([app/(app)/people.tsx](app/(app)/people.tsx)): footer row + pageSheet modal cloned from the manual-add pattern; `users_update_own` RLS already permits the update. Name changes propagate for free — attribution is read fresh at share/query time (pull, not push).
- SQL coverage: [supabase/tests/display_name_test.sql](supabase/tests/display_name_test.sql) (CHECK constraint cases + attribution coalesce). E2e: [e2e/display-name.spec.ts](e2e/display-name.spec.ts); `createEventAndShareToB` fills the gate when it appears.

### Acceptance Criteria

- [x] A user cannot send a share without a display name; users who never share are never asked
- [x] SMS to non-app recipients shows the sharer's display name when set (phone number as fallback)
- [x] Push notification titles use the display name when the recipient has no contact name for the sharer
- [x] No code path reveals a user's name in response to a phone-number lookup
- [x] The name is editable from the People screen footer and cannot be removed

### Open Questions

- None

---

## Inline Add-by-Phone in Share Sheet

**Status:** Planned

### Problem

The share screen is mandatory after creating an event, but a first-time user with an empty people list hits a dead end: "No people added yet" → navigate to People → fill the manual form → come back → select the person. On web this is the *only* add path; on native it's the fallback when contacts permission is denied. The moment of highest intent (just created an event, want to send it) is where we strand new users.

### Proposed Solution

A "name or phone number" input at the top of the share sheet ([components/ShareSheet.tsx](components/ShareSheet.tsx)). Typing filters existing people; digits that match nobody offer an inline "Add +1 416 555 1234" row. Tapping it normalizes to E.164, inserts the `my_people` row (same path as the manual form), and selects the new person for sharing — one step, no navigation.

### Technical Notes

- Reuse `normalizeToE164` ([lib/contacts.ts](lib/contacts.ts)) and the upsert from [app/(app)/people.tsx](app/(app)/people.tsx) (`onConflict: 'owner_id,phone_number'`) — extract a shared helper rather than duplicating
- Must work identically on web and native; no contacts permission involved
- Respect the 50-person cap (disable the add row with a message when full)
- The share screen ([app/(app)/share.tsx](app/(app)/share.tsx)) currently routes the empty state to `/people`; keep that link as secondary ("Manage people") but it stops being the primary path
- e2e gotcha applies: row-selection taps can be eaten by re-renders — see `e2e/helpers.ts` selection retry helpers

### Acceptance Criteria

- [ ] A user with zero people can create an event and share it to a typed phone number without leaving the share screen
- [ ] Invalid numbers surface the same alert as manual add; nothing is inserted
- [ ] Adding a number that already exists in `my_people` selects the existing person (no duplicate row)
- [ ] Works on web and native, with Jest + e2e coverage

### Open Questions

- Whether the input also searches existing people by name (recommended: yes, it's the same field)

---

## Add Sharer to Your People

**Status:** Planned

### Problem

A user whose first experience is *receiving* an event has an empty people list. Sharing anything back — even to the person who invited them — means manually entering that person's number. Every invite-acquired user starts with zero network, so the invite channel doesn't compound.

### Proposed Solution

On the event detail screen ([app/(app)/event/[id].tsx](app/(app)/event/[id].tsx)) for an event with "From X" attribution, offer a one-tap "Add X to your people". This creates a `my_people` row for the sharer and makes sharing back to them zero-friction. Once added (or if already present), the action doesn't appear.

### Technical Notes

- The event detail screen already loads attribution (`sharedByPersonId`, `sharerName`) and hidden state
- The sharer's phone number is not currently exposed to recipients: `my_people` rows are owner-scoped by RLS. Expose it via a narrow `SECURITY DEFINER` function (or extend `get_calendar_events`) that returns the sharer's phone only for events actually shared with the caller — they were texted from that number, so this reveals nothing new
- Don't show the action for hidden sharers (unhide stays a separate deliberate act)
- Pairs naturally with [Display Names](#display-names): pre-fill the person name from attribution when available

### Acceptance Criteria

- [ ] Received events show an add-sharer action when the sharer isn't already in your people
- [ ] After adding, sharing back to them works without re-entering their number
- [ ] The action never appears for self-created events, already-added sharers, or hidden sharers

### Open Questions

- None

---

## Contacts Permission Explainer

**Status:** Implemented (2026-08-12)

### Problem

On native, the contacts ask was a `showConfirm` dialog, and denying it skipped recovery (it opened the manual-add form). Neither explained the product reason, and first share didn't ask at all — empty Share bounced to People, which then required a second Add tap before the OS prompt.

### Solution (as shipped)

A real explainer screen, then the system prompt. New users see this on **first Share** (or opening People with an empty list) — not at sign-up, not in the walkthrough.

1. **Explainer:** “Events uses your contacts so you can pick who to text when you share.” Continue fires the OS prompt. Not now dismisses without calling the OS (so iOS hasn't used up its one ask).
2. **OS prompt:** Allow → contact picker. Don’t Allow → recovery.
3. **Recovery:** “Contacts are off,” same why, **Open Settings** as the primary action, “Add a number instead” as a quiet hatch. Returning from Settings with permission granted opens the picker. Manual add is an escape hatch, not a path we sell.

Already granted → picker, no explainer. Already denied and the OS will not ask again → recovery. Android `canAskAgain` after a deny still shows the explainer so Continue can fire the OS prompt one more time.

Web is unchanged (no contacts API → manual form). Inline add-by-phone on the share sheet is a separate planned feature.

### Technical Notes

- [`lib/contacts.ts`](lib/contacts.ts): `getContactsPermission()` returns `{ status, canAskAgain }`. `getContactsWithPhones` never calls `requestPermissionsAsync` — the explainer's Continue is the only request site.
- Flow owner: [`components/ContactsPermissionFlow.tsx`](components/ContactsPermissionFlow.tsx), used by Share and People. AppState `active` while recovery is showing re-checks permission.
- [`app.config.js`](app.config.js) `NSContactsUsageDescription` matches the explainer why (ships in the next native binary).
- Jest: [`__tests__/components/ContactsPermissionFlow.test.tsx`](__tests__/components/ContactsPermissionFlow.test.tsx). Playwright is web-only; native acceptance is N-002.

### Acceptance Criteria

- [x] First Share (empty people) or People (empty list) shows the explainer before the OS prompt, never the OS prompt cold
- [x] Denying lands on the recovery screen with Settings first and a quiet add-a-number hatch
- [x] Granting later via Settings makes the picker work on return
- [x] Web behavior unchanged
- [x] Not now does not burn the iOS one-shot
- [x] Fetching contacts never requests permission on its own

### Open Questions

- None

---

## Themeable Icons (Emoji Audit)

**Status:** Implemented

### Problem

The People screen's empty state shows a raw `👥` emoji ([app/(app)/people.tsx](app/(app)/people.tsx), `emptyIcon`). Emoji render in the OS emoji font — blue on iOS and most web browsers — and cannot be tinted, so the glyph sits entirely outside the role-token palettes (`constants/Colors.ts`). The design language spends color deliberately; an unthemeable blue blob in the middle of Paper/Evening breaks it.

### Proposed Solution

Replace emoji glyphs with vector icons tinted by theme role tokens (e.g. `textTertiary` for empty-state art). `@expo/vector-icons` already ships with the `expo` package — no new dependency. Grep for remaining emoji in `app/` and `components/` at implementation time; the People empty state is the only known instance.

**As shipped (2026-08-10):** the empty state renders Ionicons `people-outline` at 52px in `textTertiary`, wrapped in a decorative View hidden from accessibility. The audit confirmed 👥 was the only emoji in the UI source (the `✓` checkmarks are U+2713 text dingbats, already tinted via role tokens — not emoji). `@expo/vector-icons` is now a declared dependency (`^15.0.3`), and `scripts/check-conventions.mjs` rule 4 bans Unicode Extended_Pictographic characters in `app/`/`components/`/`hooks/`/`lib/` so the audit can't regress.

### Acceptance Criteria

- [x] No UI element renders color outside the role-token system in either theme
- [x] Empty-state icon reads correctly in both Paper and Evening
- [x] Pixel-diff baselines regenerated — vacuous: no baseline contained the emoji, so nothing drifted (verified by running `e2e/visual.spec.ts`). A People empty-state baseline was considered and skipped: the shared e2e accounts always have people (share/hide specs upsert "E2E Account B" and never remove it), so the empty state isn't deterministically reachable. The conventions rule above is the permanent guard instead.

### Open Questions

- None

---

## Delete Account

**Status:** Implemented (2026-08-09). Was **launch-blocking**: Apple App Review Guideline 5.1.1(v) requires in-app account deletion for any app with account creation, and Play requires a deletion path plus a matching data-deletion declaration. TestFlight internal won't check it; everything past internal testing will. The Play data-deletion declaration still needs to be made to match at listing time.

### Problem

There is no way to delete an account. Phone-number identity makes the data unambiguously personal, and both stores require a self-serve deletion path anyway. Deletion should be easy and trivial: one button, one honest confirm, done.

### Proposed Solution

"Delete account" at the bottom of the People screen, below Sign out, in destructive red (per the design language). A single `showConfirm` with honest copy ("This deletes your calendar, your people, and your sign-in. Events you already shared stay on the calendars of the people you sent them to."). On confirm, call a new `delete_my_account()` RPC; `SessionContext` routes to the sign-in screen on the auth state change, as with sign-out.

### Technical Notes

- **One schema fix is required first.** `events.created_by_user_id` is currently `NOT NULL REFERENCES users(id) ON DELETE CASCADE` ([supabase/migrations/20240216000001_schema.sql](supabase/migrations/20240216000001_schema.sql)). A naive account deletion would cascade into `events` and delete snapshots the user created — which cascades further into *other people's* `user_events` copies, stripping events off their calendars and breaking the forwarding model ("removing your copy never affects anyone else's calendar"). Fix: make the column nullable and re-add the FK `ON DELETE SET NULL`. The architecture doc already calls this column informational-only, and `cleanup-events` reclaims snapshots with zero owners, so nothing leaks. Update `lib/types.ts` (`created_by_user_id: string | null`).
- New `delete_my_account()` `SECURITY DEFINER` function: `DELETE FROM auth.users WHERE id = auth.uid()`; revoke from `anon`, grant to `authenticated`. Client-side deletion of auth users isn't possible with the anon key — the RPC is the whole reason this function exists.
- After the auth row goes, existing cascades do the right thing: `public.users`, `my_people` (owned), `circles`, `hidden_people`, `user_events` copies, `event_shares` records, and the push token all die. Other users' `my_people` rows pointing at the deleted account get `user_id` SET NULL — the person reverts to a pending phone-number contact, which is coherent: the number is a non-user again, future shares to it get the non-app SMS, and re-signup triggers pending-share delivery.
- Add SQL tests in `supabase/tests/`: A shares to B, A deletes account → B keeps their copy and calendar attribution disappears cleanly; A's own data is gone; a snapshot with remaining owners survives with `created_by_user_id` NULL.
- The privacy policy currently routes deletion requests to the store-listing contact — update `public/privacy.html` to describe in-app deletion when this ships, and make the Play data-deletion declaration match.

### Acceptance Criteria

- [x] "Delete account" exists at the People screen footer, destructive-styled, behind one confirm dialog
- [x] Deleting removes the account's own data (calendar, people, circles, sign-in) and lands on the sign-in screen
- [x] Events the deleted user shared remain on recipients' calendars
- [x] Re-signing up with the same phone number starts a clean account and receives any pending shares
- [x] SQL tests cover the forwarding-preservation case

### Open Questions

- None (immediate deletion, no grace period — the confirm dialog is the grace period)

---

## Web Support

**Status:** Implemented — **demoted 2026-08-09.** The web build is now a dev/staging/testing surface only, not somewhere we direct users (see `docs/distribution-strategy.md`). Notification SMS no longer links it; the native app is the product. Everything below is the historical record of the web rollout.

### Problem

The app already runs in the browser (`npx expo start --web`) — the entire manual regression suite runs against the web build — but it used to be only a local dev server, and two gaps blocked real web usage: there is no contacts API on the web (so My People can't be populated), and the date/time pickers don't open (`@react-native-community/datetimepicker` is native-only).

### Solution (shipped 2026-08-08)

Live at **https://shared-events.pages.dev**. Web and native share the same Expo codebase; web users get SMS (never browser push). Items 1–6 from the rollout below are all done.

- **Manual add person** (`app/(app)/people.tsx`): an "Add manually" form (name + phone) — on web it's the primary add path (no contacts API in the browser); on native it's offered alongside contacts. Numbers are normalized to E.164 with `libphonenumber-js` and upserted into `my_people` via the same path contacts import uses, so `user_id` resolution and pending-share delivery work unchanged.
- **Web date/time** (`components/WebDateTimeInputs.tsx`, used by `add-event.tsx` / `edit-event.tsx`): HTML `date`/`time` inputs render when `Platform.OS === 'web'`. Dates are built as local dates (no UTC day-shift); clearing the time input unsets the time.
- **Browser chrome follows the theme** (`lib/applyWebBrowserChrome.ts`, `app/+html.tsx`): react-native-web's `StatusBar` is a no-op, so iOS Safari's status bar / Dynamic Island tint used to stay white in Evening. On theme change we sync `theme-color`, `color-scheme`, and `html`/`body` background to the active palette.
- **`WEB_APP_URL`** (`supabase/functions/send-notification/index.ts`): function secret. Non-app-user SMS links the website ("See it on the web", preferred over store links); app-user SMS uses a single universal `https` event link (`WEB_APP_URL/event/[id]`) instead of the `events-app://` custom scheme. Falls back to store links / the deep link when unset. Currently set to `https://shared-events.pages.dev`.
- **Hosting: Cloudflare Pages** via Wrangler direct-upload — `wrangler.toml` (project name `shared-events`), `npm run deploy:web`, `public/_redirects` SPA fallback. See AGENTS.md → Deploying the web app.
- **Why `shared-events`, not `events-app`:** Cloudflare Pages `*.pages.dev` subdomains are **globally unique**. The bare name `events-app` was already taken by another Cloudflare account, so the first deploy landed on a suffixed hostname (`events-app-lzv.pages.dev`). The project was then renamed to `shared-events`, which claimed the clean `https://shared-events.pages.dev` URL. Do **not** try to recreate or rename back to `events-app` — that name is unavailable. Keep `wrangler.toml` `name = "shared-events"` and `WEB_APP_URL` in sync with whatever hostname is live.

### Philosophy

A web-first beta is attractive: nobody has to install anything, and notifications arrive by SMS — which the backend already does. Web users never register an Expo push token, and `send-notification` sends app users an SMS regardless of whether they have a push token, so "website + SMS" is the de facto behavior once Twilio function secrets are configured. The web app never requests browser notification permission.

### Proposed Solution

1. **Manual add person.** An "Add manually" form (name + phone number) alongside "Add from Contacts" on the People screen. Normalize to E.164 with `libphonenumber-js` and upsert into `my_people` — the same code path contacts import already uses, so `user_id` resolution and pending-share delivery work unchanged.
2. **Web date/time input.** Fall back to HTML `date`/`time` inputs (or a simple custom picker) when `Platform.OS === 'web'`.
3. **Deploy the web build.** `npx expo export --platform web` produces a static bundle suitable for any static host (Vercel/Netlify/Cloudflare Pages). The bundle uses the public anon key — safe to ship because all data access goes through RLS. Auth (SMS OTP) already works on web.
4. **SMS links for a web beta.** Non-app-user SMS is currently gated on App Store / Play Store URLs; for a web beta the message should link the website instead (small `send-notification` change: accept a `WEB_APP_URL` secret and prefer it over store links).
5. **Universal https links in SMS.** App-user SMS currently appends a custom-scheme deep link (`events-app://event/[eventId]`), which SMS clients never linkify — it arrives as plain, untappable text — and which does nothing when the native app isn't installed. Once the web build lives at a stable URL, replace the deep link with a single https event link (`WEB_APP_URL/event/[eventId]`) that opens the event on web for anyone; hosting Apple's AASA and Android's assetlinks files on that domain upgrades the same link to open the native app directly when installed (universal links / App Links). Until then the custom scheme stays — it works on native installs, where the tappable notification path is push anyway.
6. **Turn on SMS sending.** `send-notification` needs its own Twilio function secrets (separate from the Supabase Auth SMS config): `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + a sender. A Messaging Service sender is supported (`TWILIO_MESSAGING_SERVICE_SID`, preferred — built-in STOP opt-out handling) with `TWILIO_PHONE_NUMBER` as fallback.

### Rollout order (web beta)

1. Manual add person + web date/time input (items 1–2)
2. Set the Twilio function secrets (item 6), then verify one real SMS end-to-end against a real phone number (share an event to it from a test account; test OTP numbers never trigger real sends)
3. Deploy the static web build at a stable URL (item 3), set `WEB_APP_URL` (item 4), and switch app-user SMS to universal https links (item 5)
4. [Sign Out](#sign-out) and general polish

### Technical Notes

- Web gaps found during 2026-08-07 live regression: contacts permission flow is a dead end on web (explainer dialog only); date picker silently doesn't open; fixed already: Alert dialogs and edge-function CORS headers
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are bundled into the static build at export time
- The forwarded-copy model means a recipient who later installs the native app sees the same calendar — web and native are interchangeable frontends over the same account
- Status as of 2026-08-07: all three Twilio function secrets are set (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`) and a real SMS was verified end-to-end (E-107: `send-notification` returned `{"sent":0,"sms":1}`; Twilio's message log confirms delivery from the Messaging Service pool number). Non-app-user SMS remains gated on a store URL until item 4 lands — a temporary `IOS_APP_STORE_URL=https://example.com/events` placeholder secret is set; remove it when `WEB_APP_URL` exists
- Test accounts use reserved 555 numbers: A is `+15555550100`, B is `+15555550103` (moved off the real-format `+16462655565`). Sharing to test accounts never sends real SMS

### Acceptance Criteria

- [x] A person can be added on web with name + phone number (E.164), and sharing to them works end-to-end
- [x] Event date/time can be chosen on web
- [x] A production web build is deployed at a stable URL and sign-in via SMS OTP works there (`https://shared-events.pages.dev`)
- [x] `TWILIO_AUTH_TOKEN` function secret is set and a real SMS is received end-to-end (event title, date/time, event URL, STOP footer) — verified 2026-08-07 (E-107)
- [x] Sharing to a non-user sends an SMS containing the website URL (`WEB_APP_URL=https://shared-events.pages.dev`)

### Open Questions / follow-ups

- ~~Hosting provider~~ → Cloudflare Pages at **https://shared-events.pages.dev** (see "Why `shared-events`" above — `events-app.pages.dev` was globally taken)
- Custom domain when purchased: add in Pages dashboard, then update `WEB_APP_URL`
- ~~Remove the placeholder `IOS_APP_STORE_URL` secret~~ — done 2026-08-09 (the whole store-URL concept left with the SMS links)
- **Considered and rejected (2026-08-09), recorded so they aren't resurrected blindly:**
  - *Contact Picker API* (browser contact picking on Chrome/Android): web-only, and the web build is no longer a user surface
  - *Universal links / App Links + AASA/assetlinks hosting*: there are no links in SMS left to make universal; push already deep-links app users
  - *PWA install prompts*: installing the PWA unlocks no contacts capability on any platform, so it can't honestly be pitched as fixing the add-people problem
  - *Shareable event invite links*: duplicates the group-chat behavior the app replaces with extra steps; not a contacts bootstrap worth building
  - *Bulk paste of contact lists*: target users don't maintain such lists
- [Sign Out](#sign-out) — implemented separately
