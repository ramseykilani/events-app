# Features

A running list of planned and in-progress features. Each section contains a full spec so that agents and collaborators have enough context to implement without needing additional briefing.

## Status

The core loop is shipped. Nothing in Planned is required to use the app or to test that loop. Listing an idea here is not a commitment to build it: Planned means "intended, when someone picks it up," and Considering means "recorded so the idea isn't lost — we may never do it."

| Feature | Status | What it is |
|---------|--------|------------|
| [Notifications](#notifications) | Implemented | |
| [SMS Invitations](#sms-invitations) | Implemented | |
| [Hide](#hide) | Implemented | |
| [Forwarding Shares](#forwarding-shares) | Implemented | |
| [Sign Out](#sign-out) | Implemented | |
| [Sign Out Pop-up](#sign-out-pop-up) | Planned | Sign-out confirm is lacking, especially on native. |
| [Web Support](#web-support) | Implemented | Dev/staging/CI surface only |
| [Display Names](#display-names) | Implemented | |
| [Contacts Permission Explainer](#contacts-permission-explainer) | Implemented | First Share already adds people |
| [Themeable Icons (Emoji Audit)](#themeable-icons-emoji-audit) | Implemented | |
| [Delete Account](#delete-account) | Implemented | |
| [Inline Add-by-Phone in Share Sheet](#inline-add-by-phone-in-share-sheet) | Planned | Convenience. A new user can already share. |
| [Add Sharer to Your People](#add-sharer-to-your-people) | Planned | Convenience. Recipients who know the number can add them today. |
| [Richer Link Autofill](#richer-link-autofill) | Planned | Upgrade. Paste already stores the URL; OG title/image already work on open pages. |
| [People List Scrolling](#people-list-scrolling) | Planned | Polish. The People screen works; the list feel does not. Related: [KI-011](manual-tests/known_issues.md) (person rows too tall). |
| [Branded OTP SMS](#branded-otp-sms) | Implemented | The verification text didn't say it's from Events. Config, not code. |
| [Share SMS Content & Formatting](#share-sms-content--formatting) | Implemented | Nicer share text with the event description. Server-side only. |
| [Screen Transition Polish (Android)](#screen-transition-polish-android) | Planned | White bar flashes on the right edge during screen swipes. |
| [Manual Add Discoverability on Native](#manual-add-discoverability-on-native) | Planned | "Not now" on the contacts explainer is a dead end; manual add hides behind Deny. |
| [Notification Permission Explainer](#notification-permission-explainer) | Implemented | |
| [Notification Explainer Clarity](#notification-explainer-clarity) | Planned | Pre-ask screen doesn't make the OS prompt or Continue obvious. |
| [Circles UX](#circles-ux) | Planned | Current circles are hard to use, poorly explained, and not intuitive. Not designed — do not implement from this section. |
| [Notification On/Off](#notification-onoff) | Implemented | Separate push and SMS toggles. Follow-ups: [KI-008](manual-tests/known_issues.md), [KI-009](manual-tests/known_issues.md), [KI-010](manual-tests/known_issues.md). Broader Android Back: [KI-012](manual-tests/known_issues.md). |
| [Explain Before Share (No Unshare)](#explain-before-share-no-unshare) | Implemented | The share screen says you can't take it back before the first send. |
| [Button Size & Clickability](#button-size--clickability) | Planned | Revisit control size across the app. |
| [Share Delivery Status](#share-delivery-status) | Planned | ✓ Shared only means recorded, not received. |
| [US Phone Numbers](#us-phone-numbers) | Planned | Suspected Twilio path; US numbers don't work. Needs investigation. |
| [Add to Other Calendars](#add-to-other-calendars) | Planned | Events live only on the in-app calendar. |
| [Share Sent Confirmation](#share-sent-confirmation) | Planned | After Share, the screen just goes back. |
| [Touch Targets & Footer Safe Area (People Screen)](#touch-targets--footer-safe-area-people-screen) | Implemented | Pre-tester polish. Text buttons tap only on the glyphs; footer can sit under 3-button nav. |
| [Per-User Events (Copy + Follow)](#per-user-events-copy--follow) | Planned | Later rewrite. Incomplete — do not implement. Owner confirmed the why 2026-08-21; design pass may start — no implementation until its spec. Not a tester blocker. |
| [Creator-Linked Events (Edits Propagate)](#creator-linked-events-edits-propagate) | Considering | Maybe never — recorded so the idea isn't lost |
| [SMS Links at Launch](#sms-links-at-launch) | Planned | Launch-time pair: store link for non-users, event deep link for app users. Ship together. |

## Using and testing

No product feature is blocking the core loop. A new user can sign in, land on the calendar, create an event, add people, share, and receive shares (push + SMS). Hide, forward, edit (fork), remove (own copy only), sign out, and delete account are all shipped.

How people get onto a first share today:

- **Native:** an empty people list on first Share auto-starts the [contacts explainer](#contacts-permission-explainer) → OS prompt → picker. Deny → recovery with Settings and an “Add a number instead” hatch. Then select and send.
- **Web:** no contacts API, so the empty state goes to People for the manual name+phone form. Web is not a user surface (`docs/distribution-strategy.md`).

**Web testing is unblocked** — local `npx expo start --web`, the staging preview, and the full automated suite (Jest, SQL, Playwright). That is how agents and CI test; it is not how users get the app.

**Native distribution is the remaining gate for real use**, not a missing feature. Owner device smoke of preview `eab4bcd7` (promoted `8f3b660`, 2026-08-15) passed; the earlier N-005 push/tap path is green. KI-003 (additive share re-notify) and KI-004 (edit URL read-only) are fixed on staging as of the 2026-08-16 release review — they still exist on the 2026-08-15 native binaries until the post-promotion rebuild. N-007 recipient-side still needs a second account. Next: production AAB → Play internal track, then ~3 friends (see `STATUS.md`). Native-only paths (contacts picker, datetimepicker, push, notification tap) still have no automated coverage — run `manual-tests/native_device_smoke.md` on each new binary.

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
- Additive shares pass the newly shared person ids into `send-notification`,
  which scopes its `event_shares` query to those ids (KI-003, verified
  2026-08-16 release review).

### Acceptance Criteria

- [x] Recipient receives a push notification when added to an event on a physical device
- [x] Notification shows event title and date (and time if present)
- [x] Tapping the notification opens the event detail screen
- [x] No notification is sent if the sharer is hidden by the recipient
- [x] No notification is sent if the recipient has no push token
- [x] Only newly shared recipients are notified on an additive share (KI-003)

### Open Questions

- None

---

## SMS Invitations

**Status:** Implemented

### Problem

Push notifications only reach users who have installed the app. Non-app users (contacts in `my_people` who haven't signed up) previously received no notification at all when an event was shared with them — they had no way to know they'd been included. This limits the app's usefulness to groups where everyone has already downloaded it.

### Solution

When an event is shared, the `send-notification` Edge Function also sends an SMS via Twilio to every recipient:

- **Non-app users:** SMS with event details (title, date, time), the event URL when one exists, and the sharer's phone number as display identity. No app or web links — the SMS is the whole message. During internal testing it also carries a signup invite (`Want to invite your friends to things too? Email kilani.ramsey@gmail.com to get signed up.`, added 2026-08-17) so an interested recipient can ask the owner for beta access.
- **App users:** the same link-free SMS in addition to their push notification (push is the tappable path into the event). A missing push token does not suppress the SMS.

This means the only person who needs the app is the one sending events. Friends are informed by text; the only acquisition element in the message is the internal-testing signup invite (an email CTA, no links). (Revised 2026-08-09: SMS previously carried web/store/deep links; removed deliberately — see `docs/distribution-strategy.md`. Revised 2026-08-17: non-app SMS gained the signup-invite line for the internal-testing phase. At launch the two URLs return together as [SMS Links at Launch](#sms-links-at-launch): store link for non-users, event deep link for app users.)

### Technical Notes

- No SDK dependency: Twilio REST API called directly via `fetch` with Basic auth in `supabase/functions/send-notification/index.ts`
- New Supabase secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, plus a sender — `TWILIO_MESSAGING_SERVICE_SID` (preferred; built-in STOP opt-out handling) or `TWILIO_PHONE_NUMBER`. No other secrets gate SMS (`IOS_APP_STORE_URL` placeholder was removed 2026-08-09; `WEB_APP_URL` is no longer read by this function). Launch restores store-URL secrets and the event-link base together — [SMS Links at Launch](#sms-links-at-launch)
- Graceful degradation: if any Twilio secret is missing, SMS is silently skipped — push notifications are unaffected
- SMS failures use `.catch(console.error)` and never propagate to the caller
- SMS sends are collected as `Promise<void>[]` and flushed with `Promise.all` after the Expo push batch — concurrent, non-blocking
- Hidden-person check applies to SMS as well: if the sharer is hidden by the recipient, neither push nor SMS is sent
- STOP opt-out language appended to non-app-user SMS per CASL requirements
- `phone_number` for recipients comes from `my_people.phone_number` (E.164); sharer's display identifier comes from `users.phone_number`
- Returns `{ sent: number, sms: number }` (push messages queued, SMS sends dispatched)

### Acceptance Criteria

- [x] Non-app users receive an SMS with event title, date/time, sharer phone, and the event URL when one exists — no app/web links; during internal testing the message includes the signup-invite line
- [x] App users receive both a push notification and a plain-text SMS when shared an event
- [x] SMS is skipped silently when Twilio secrets are not configured
- [x] SMS is skipped when the recipient has no phone number in `my_people`
- [x] SMS is not sent to app users when the sharer is hidden by the recipient
- [x] SMS failures never cause the Edge Function to return an error response

### Open Questions

- Launch SMS URLs (store + event deep link) live in [SMS Links at Launch](#sms-links-at-launch) — one change, both variants.

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
- Follow-up: the confirm itself is lacking — [Sign Out Pop-up](#sign-out-pop-up).

---

## Display Names

**Status:** Implemented (2026-08-12)

### Problem

Notification SMS identifies the sharer by raw phone number ("+1 416 555 1234 added you to…"). This is worse than it sounds: the SMS arrives from a Twilio Messaging Service pool number, so the recipient's phone can never match it to a saved contact — the body text is the *only* identity signal. A nameless share is effectively an anonymous text, and the SMS is the entire product surface for non-app recipients.

### Solution (as shipped)

Capture a display name with a **hard gate at first share — never at sign-up**. The name is only ever consumed at share time (`send-notification` and calendar attribution are its only readers), so the ask lives in the share screen where it is self-justifying: an inline field with one line of context ("Your friends get a text when you share — this is the name they'll see") appears while `display_name` is null, and Share stays disabled until it's saved. Users who never share are never asked; the no-forced-onboarding rule stays absolute. The gate binds the Share *action*, not the share screen, which is also the mandatory step after event creation.

This supersedes the originally spec'd capture UX ("one skippable field after OTP verification"). A skippable sign-up prompt had the worst of both worlds: friction for recipients who may never share, and a permanent nameless state for skippers (a skip was forever — there was no edit path). The share-time gate guarantees no nameless share can ever go out and asks at the moment the user is most motivated to be recognizable. First share already continues into the [contacts explainer](#contacts-permission-explainer) (or People, on web). [Inline add-by-phone](#inline-add-by-phone-in-share-sheet) would fold typing a number into that same screen; it is not required for the gate to work.

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

**Status:** Planned — convenience, not a blocker. A new user can already share.

### What this is not

This is not a missing first-share path. After creating an event, Share is a required step (Cancel is available), and adding people already works:

- **Native:** an empty list auto-starts the [contacts explainer](#contacts-permission-explainer) → OS prompt → picker. Deny → recovery with “Add a number instead.” The empty-state “Add People” button restarts that flow (`onAddPeople`); it does not strand the user on People.
- **Web:** the empty state goes to People for the manual name+phone form. That is the only add path in the browser because there is no contacts API — and web is not a user surface.

The “dead end” wording that used to live here was true before the explainer shipped (2026-08-12). It is not true now.

### Problem

Adding someone who isn’t in the contacts picker — or finding someone in a long people list — still takes a detour (picker, manual-add modal, or a trip to People). The share sheet itself has no search field and no inline add.

### Proposed Solution

A "name or phone number" input at the top of the share sheet ([components/ShareSheet.tsx](components/ShareSheet.tsx)). Typing filters existing people; digits that match nobody offer an inline "Add +1 416 555 1234" row. Tapping it normalizes to E.164, inserts the `my_people` row (same path as the manual form), and selects the new person for sharing — one step, no navigation.

### Technical Notes

- Reuse `normalizeToE164` ([lib/contacts.ts](lib/contacts.ts)) and the upsert from [app/(app)/people.tsx](app/(app)/people.tsx) (`onConflict: 'owner_id,phone_number'`) — extract a shared helper rather than duplicating
- Must work identically on web and native; no contacts permission involved
- Respect the 50-person cap (disable the add row with a message when full)
- Keep the existing add paths: native empty-state “Add People” still restarts the contacts flow; “Manage” / People stays for editing the list. Inline add is an extra on-sheet path, not a replacement.
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

**Status:** Planned — convenience, not a blocker. Recipients who already know the number can add them via People (or the share-time manual hatch) and share back today.

### What this is not

This is not required for a new user to send or receive events, and it is not required to test the share loop with people who already have each other in My People (the usual tester setup).

### Problem

If your first experience is *receiving* an event, you see "From Alice" but the app does not give you Alice's phone: `my_people` is owner-scoped by RLS, and the notification SMS arrived from Twilio, not from her. Sharing back means typing a number you already know. One-tap add would close that loop when you don't have it handy, so the invite channel compounds without a re-entry.

### Proposed Solution

On the event detail screen ([app/(app)/event/[id].tsx](app/(app)/event/[id].tsx)) for an event with "From X" attribution, offer a one-tap "Add X to your people". This creates a `my_people` row for the sharer and makes sharing back to them zero-friction. Once added (or if already present), the action doesn't appear.

### Technical Notes

- The event detail screen already loads attribution (`sharedByPersonId`, `sharerName`) and hidden state. `sharer_person_id` is the recipient's own `my_people` row for the sharer — it is null when they aren't in the list yet, which is exactly when this action should show.
- The sharer's phone is not currently exposed to recipients. Expose it via a narrow `SECURITY DEFINER` function (or extend `get_calendar_events`) that returns the phone only for events actually shared with the caller. The SMS names the person (display name) and arrives from Twilio, not from their number — this is a new read and should stay that narrow.
- Don't show the action for hidden sharers (unhide stays a separate deliberate act)
- Pairs naturally with [Display Names](#display-names): pre-fill the person name from attribution when available

### Acceptance Criteria

- [ ] Received events show an add-sharer action when the sharer isn't already in your people
- [ ] After adding, sharing back to them works without re-entering their number
- [ ] The action never appears for self-created events, already-added sharers, or hidden sharers

### Open Questions

- None

---

## Richer Link Autofill

**Status:** Planned — upgrade, not a blocker. Paste-a-link already works: the URL is stored, Open Graph title/description/image fill when the page allows it, and the user can always type a title and pick a date.

### What this is not

This is not a new add-event path. [Add Event](app/(app)/add-event.tsx) already pastes a URL, calls `og-metadata` on blur, and saves `url` / `title` / `description` / `image_url`. Failures are best-effort and must stay that way — a dead preview must never block Save.

This is also not a license to scrape Ticketmaster (or anyone else) with a headless browser. Walled gardens go through their official APIs or they stay "URL stored, type the rest."

### Problem

Onboarding says "Paste an event link and the details fill in automatically." That is only true for pages that serve `og:title` / `og:description` / `og:image` to a plain GET from a datacenter IP (blogs, many Eventbrite/Luma/Partiful pages, `example.com`). The links people actually paste — Ticketmaster, AXS, and similar — usually return a 403 or a challenge page. Even a successful OG fetch never sets date or time; those stay "today" / empty unless the user edits them.

So a Ticketmaster paste often lands as **Untitled event** on today, with the listing URL attached. The URL is worth keeping (Open link, SMS). The walkthrough oversells the rest.

### Proposed Solution

Keep the current paste → blur → preview → confirm → Save flow. Make the preview actually fill a calendar row for real event listings.

Do it in two layers, cheapest first:

1. **JSON-LD Event parse (open web).** In `og-metadata`, also read `application/ld+json` `Event` / `MusicEvent` / `TheaterEvent` and return `startDate` (and end/venue later if we want). Add Event sets date and time from that when present. This is the same edge function, no new vendors. Helps any host that already publishes schema.org in the HTML we can fetch.

2. **First-party APIs for walled gardens.** For hosts that block the HTML fetch, parse the URL and call their official API. Ticketmaster Discovery (`/event/{id}` → name, `localDate`, `localTime`, image) is the first candidate. Eventbrite is the obvious second. Artist/tour pages that list many nights must not silently pick a date — show a picker or fall back to "URL stored, you pick the night."

Until layer 2 ships for a host, soften the onboarding line so it matches today: paste a link, confirm the title and date. The product doc already says that.

### Technical Notes

- `og-metadata` (`supabase/functions/og-metadata/index.ts`) stays JWT-gated, 5s / 1MB capped, fail-open. Extend the JSON body to `{ title, description, image_url, event_date, event_time }` — all nullable.
- Client: `fetchOgMetadata` in [app/(app)/add-event.tsx](app/(app)/add-event.tsx) already writes title/description/image. Also set the date/time fields when the response has them; never overwrite a date the user already changed.
- Edit Event does not fetch OG today. URL is editable on Edit (KI-004 fixed
  2026-08-16); refetching OG on a URL change is this upgrade, not the bugfix.
- Ticketmaster: API key as a function secret; parse `/event/{id}` only for the automatic path. Do not add a scraping/bypass dependency.
- Timezones: prefer the listing's local date/time (Discovery's `localDate` / `localTime`, JSON-LD `startDate` without forcing UTC). Same "land on the day the user meant" rule as the web date inputs.
- Dedup is unchanged: `find_or_create_event` still keys on `(url, title, event_date, event_time)`. Better autofill makes collisions more likely and more correct.
- Tests: this is the gap. Jest the parser (OG + JSON-LD fixtures, including a TM-shaped Event block). Playwright: paste a fixture URL (mock `og-metadata`) and assert title + date fill; a failed preview still saves. Manual E-102 stays best-effort against live hosts.

### Acceptance Criteria

- [ ] Open-web event pages that publish JSON-LD fill title and date/time, not just OG title
- [ ] A Ticketmaster `/event/{id}` link fills title, date/time, and image via Discovery (or we explicitly do not claim TM in onboarding)
- [ ] A blocked/failed preview still saves the URL; Save never waits on the fetch
- [ ] Artist/tour multi-date URLs do not invent a single night
- [ ] Onboarding copy matches what we actually do
- [ ] Autofill is covered by Jest (parser) and Playwright (form wiring), not only E-102

### Open Questions

- Ticketmaster only, or Eventbrite in the same slice?
- After a URL change on Edit Event, should OG refetch (architecture says yes;
  the screen does not today)? KI-004 (URL field was read-only) is fixed.
- Venue/location: we have no field. Leave it in description, or add a field later?

---

## People List Scrolling

**Status:** Planned — polish, not a blocker. Adding people, circles, hide/unhide, and the account footer all work today. Related: [Circles UX](#circles-ux) (the circles product/UX pass — not this scroll rewrite).

### What this is not

This is not a missing People-screen capability and not a tester blocker. Do not treat it as a rewrite of My People, circles, or hide. The owner asked to record that the list *feel* is off so a later pass can fix the scroll, not invent new people features. A later pass on circles themselves lives under [Circles UX](#circles-ux).

### Problem

The People screen ([app/(app)/people.tsx](app/(app)/people.tsx)) does not scroll as one page. Circles live in a pinned block above a nested `FlatList` that only scrolls the people rows (Hidden is that list's footer). Header, count, circles, and the account footer stay put; only the middle pane moves.

That split is what feels wrong: the people list is a cramped inner scroller, not a document. A few circles shrink the people viewport; a long list means scrolling a hole in the middle of the screen while circles sit frozen above it. On web (`react-native-web`) a nested `FlatList` also picks up odd overscroll.

### Proposed Solution

Treat Circles, People, and Hidden as one scrollable document between the pinned chrome (Back / My People / Add, plus the count) and the pinned account footer (Your name / Sign out / Delete account). Pick the list primitive on the implementation pass — a page-level `ScrollView`, a `SectionList`, or a `FlatList` with Circles as the header are all fine if the result is one motion.

Do not change add/remove/hide semantics, the 50-person cap, or the empty state (already a non-scrolling centered block).

### Technical Notes

- Today's tree: pinned header + count → `circlesSection` `View` (maps circles + the new-circle input) → `peopleSection` (`flex: 1`) wrapping a `FlatList` of people, with Hidden as `ListFooterComponent` → pinned footer.
- Keep the header and account footer reachable without scrolling. Those are chrome, not list content.
- The new-circle name field currently sits in the pinned circles block. If the whole middle scrolls, decide whether that input travels with the Circles section or stays pinned — see Open Questions.
- `e2e/people.spec.ts`, `e2e/hide.spec.ts` (Hidden / Unhide scoping), and People visual snapshots will need a look if the layout changes. Selection-retry helpers in `e2e/helpers.ts` still apply.
- Native is the product; judge the feel on a phone-sized viewport, not desktop Chrome alone.

### Acceptance Criteria

- [ ] Circles, people, and hidden scroll together as one list — no inner pane that moves while circles stay frozen
- [ ] Header (Back / title / Add) and account footer stay on screen
- [ ] Existing people, circle, and hide/unhide actions still work; no data-model change
- [ ] Jest + e2e stay green; People visual snapshots updated only if the layout actually moves pixels

### Open Questions

- Should the "New circle name" input scroll away with Circles, or stay pinned under the header?
- Is the odd feel only the split scroll, or also row spacing / section weight? Owner flagged scrolling and "how the people list feels" — start with one document scroll; don't restyle rows unless that pass still feels off. Owner 2026-08-18 separately confirmed person rows are too tall ([KI-011](manual-tests/known_issues.md)); that is a density regression to fix on its own, not as part of the scroll rewrite.

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

Web is unchanged (no contacts API → manual form). [Inline add-by-phone](#inline-add-by-phone-in-share-sheet) on the share sheet is a separate planned convenience — first share already works without it.

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
- [x] Re-signing up with the same phone number starts a clean account and receives any pending shares — **owner 2026-08-18: this last clause is the surprise.** Friends' previously shared events come back ([KI-007](manual-tests/known_issues.md)); self-created copies do not. Not a tester blocker.
- [x] SQL tests cover the forwarding-preservation case

### Open Questions

- Immediate deletion, no grace period — the confirm dialog is the grace period.
- Should a returning phone get pending-share delivery (today) or a truly empty calendar (owner expectation on 2026-08-18 smoke)? See [KI-007](manual-tests/known_issues.md).

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
  - *Universal links / App Links + AASA/assetlinks hosting as a web-beta SMS path*: rejected as an acquisition channel into the web build (2026-08-09). The launch-time version is [SMS Links at Launch](#sms-links-at-launch) — event deep link for app users only, store link for non-users, never the web app. A2P campaign description must mention both link types **before** that ships — registered content must match what we actually send, and our own domain in cold texts is the top carrier spam-filter trigger, now risking campaign suspension rather than per-message blocks (noted 2026-08-19, after the 10DLC registration)
  - *PWA install prompts*: installing the PWA unlocks no contacts capability on any platform, so it can't honestly be pitched as fixing the add-people problem
  - *Shareable event invite links*: duplicates the group-chat behavior the app replaces with extra steps; not a contacts bootstrap worth building
  - *Bulk paste of contact lists*: target users don't maintain such lists
- [Sign Out](#sign-out) — implemented separately

---

## Creator-Linked Events (Edits Propagate)

**Status:** Considering (2026-08-13) — we don't know if we want this. The current forwarding model is intentional and accepted; this entry exists only so the idea isn't lost. It is not roadmap and not a commitment.

### What this would be

Today, sharing is forwarding (see [Forwarding Shares](#forwarding-shares)): every recipient gets their own independent copy, and nobody's edit ever reaches anyone else's calendar. The idea: an event stays tied to its creator, so when the creator edits the time, title, or any other detail, the update propagates to everyone who received a copy.

### Why it might be wanted

- Fixing a detail after sharing leaves every recipient with the stale version. Today the only repair paths are re-sharing (which delivers a second, divergent copy) or telling people out of band.
- It matches the hosted-event mental model (Partiful, Facebook events) some users will bring: "it's Sarah's event, and Sarah updated it."

### Why it's questionable

- It cuts against the model's load-bearing properties: "a share is a completed action" and "your data is your data — nobody else can change it." Forwarding is precisely what makes edit-cascades impossible (one person's edit can never rewrite a hundred calendars) and removal purely personal.
- It introduces the first cross-user write path: someone else's edit would re-point or rewrite your `user_events` row. Today that is impossible by construction (RLS + immutable snapshots + fork-on-edit).
- The conflict question has no good answer: a recipient can edit their own copy — when the creator's edit then propagates, whose version wins? Overwriting the recipient's edit violates "your calendar is yours"; skipping their copy makes propagation patchy and unpredictable.
- Notification questions: a creator edit is person-triggered, so notifying recipients would fit the notification rule — but every edit becoming a message to every recipient is a volume problem the forwarding model never has.

### Decision

Undecided — maybe never. Revisit only if real users turn out to be confused by edits not reaching the people they shared with.

If we do want a time fix to reach the people you told, do **not** build this hosted-event version (one shared mutable row, creator owns it, everyone is a subscriber). The direction is [Per-User Events (Copy + Follow)](#per-user-events-copy--follow): everyone already has their own row; copies follow the sender until someone edits locally. That keeps remove personal and answers “whose version wins” (the person who hit Save). This Considering entry stays as the thing we are *not* building unless we change our minds about hosting.

---

## Per-User Events (Copy + Follow)

**Status:** Planned (2026-08-13) — **incomplete, do not implement.** Testers should get the current forwarding/fork build. This is a later storage-and-edit rewrite. What follows is a direction from a design conversation, not a complete spec. A dedicated design pass has to finish it before anyone writes a migration. Listing it is not a commitment to the exact shape below. **The design-pass gate was answered by the owner on 2026-08-21 (next section): proceed to the design pass; implementation still waits on its spec.**

### Confirm the WHY with the owner first (gate, 2026-08-13)

The question "does this rewrite actually make sense?" is deliberately left **unanswered** — the owner wants to be asked before anyone builds this. Before any design pass, spec, or migration, the agent picking this up must put that question to the owner and walk the trade-off:

- **For:** deletes the B-1 bug class (multi-call client-side saves), [KI-002](manual-tests/known_issues.md), the disappearing "From X" attribution, and the re-share double-copy. Storage finally matches the product story ("your calendar is yours; a share is a send"). Edit becomes a one-row UPDATE of your own row.
- **Against:** the largest change in the project — schema replacement, backfill from a lossy fork graph, cutover, test rewrites. And it ships a product change (edits propagate to followers) inside what looks like a storage refactor. The interim B-1 fixes (below) may also make day-to-day pain low enough that the rewrite can wait — or be descoped entirely.

Work starts only after the owner confirms why we are doing this. An agent that skips that conversation is doing it wrong, however good the write-up below looks.

**Answered (2026-08-21):** the owner confirmed both halves of the why — the storage rewrite (engineering) and edits-propagate-to-followers (product) are both wanted, and wanted now. The design pass is unblocked; implementation still waits on that pass producing a real spec (schema, backfill SQL, cutover order, tests). The owner also required that the current behavior be documented well enough to re-implement if the rewrite goes wrong — see the "Extensive rollback plan" cutover bullet below.

### Owner decisions (2026-08-21)

- **No edit-triggered notifications in v1.** Edits cascade silently — no push, no SMS, at no depth of the follow tree. Rationale: the person editing doesn't realize hitting Save would notify anyone; the app is mostly a one-time send (usually with a link attached) after which people reach out to confirm details person-to-person; date/time aren't essential enough to interrupt anyone over. Adding date/time pings later is deliberately left open as a separate future decision — not designed here.
- **Following ends on any save.** The simple rule: edit anything — even a typo fix — and your copy stops following. No field-level following.
- **Two senders = two entries.** Receiving the same listing from two different people puts two rows on your calendar, each following its own sender. No cross-sender dedup on receive.
- **Extensive rollback plan is part of the implementation.** Not a follow-up: the spec must include the archive + restore point + data rollback path required below, and implementation does not start without it.

### Why this is on the roadmap — the B-1 postmortem (2026-08-13)

This entry stopped being theoretical on 2026-08-13, when the release review ([manual-tests/manual_test_report_2026-08-13-release.md](manual-tests/manual_test_report_2026-08-13-release.md)) returned DON'T SHIP on B-1: edit Save was aborted client-side at the 2s *read* budget, the user got an `AbortError` stack dump, and the old title persisted even though the server may have committed.

The five-call save (`find_or_create_event` → re-point `user_events` → on unique conflict, merge shares → delete the old row) exists only because events are global immutable blobs and calendars are pointers. It dates to the initial commit (2026-02-16 — the `2024…` migration timestamps are a scaffolding year-typo, not inherited legacy) and was **not a mistake when written**: under the original share-by-reference model, many calendars pointed at ONE row, and immutability was the only thing stopping a sharer's edit from rewriting strangers' calendars. The forwarding rewrite (2026-08-07) gave every recipient their own copy and removed that justification — but nobody revisited the foundation. Share got a server-side transaction RPC (`share_event`) on 2026-08-07; edit never did. That asymmetry is B-1's real parent, and it is why the durable fix belongs at the data-model level, not in another timeout tweak.

### Interim B-1 fix (ships first, on the current model)

Decided 2026-08-13: B-1 is a release blocker and cannot wait for this rewrite, so the current model gets the cheap, model-independent fixes: split `lib/timeoutSignal.ts` into `withFetchTimeout` / `withWriteTimeout` (no defaults, so the wrong budget cannot be typed), friendly write failures (`showAlert` + reconcile-read, never a stack dump), reads that fail fast without blanking the screen, a latency e2e spec (a delayed `find_or_create_event` must still save), and conventions rules so the patterns cannot regress. Every one of those layers survives this rewrite unchanged — none of it is throwaway.

**Considered and rejected:** an interim `edit_event` SECURITY DEFINER RPC wrapping the five-call fork sequence in one server transaction. It would be throwaway work the day this rewrite lands. Do not build it while this feature is live on the roadmap; if this feature is descoped, build that RPC instead — the B-1 class is not acceptable as a permanent resident.

### What this is not

- A tester blocker. The core loop is shipped. Invite testers on the current model.
- A new Share button. Re-share is the Share control that already sits on an event you received.
- Partiful-style hosted events. That idea lives under [Creator-Linked Events](#creator-linked-events-edits-propagate) and is Considering / maybe never.
- A license to start coding or run a migration from this write-up.

### Problem

The product is a heads-up: you tell people about a listing (or a park hang), they keep it on their calendar, taking it off yours never takes it off theirs. That is already how we talk about [Forwarding Shares](#forwarding-shares).

The storage does not match. Events are three tables doing git for a calendar:

| Table | What it actually is |
|-------|---------------------|
| `events` | A global, frozen blob. Same title+date+time+url = one row for the whole world. Never updated. |
| `user_events` | Your pointer at that blob. Your calendar is a list of pointers. |
| `event_shares` | A log of who you told — except the calendar also uses it to reconstruct “From X” and hide, because the copy never recorded who sent it. |

Those three fight, so we piled on compensations: fork-on-edit (new blob, move *your* pointer, everyone else stays on the old one), a client-side merge when pointers collide, orphan-snapshot GC (`cleanup-events`), `find_or_create_event`, and `SECURITY DEFINER` RPCs that rebuild “your calendar” by joining other people’s rows. Symptoms already in the wild: [KI-002](manual-tests/known_issues.md) (dedup drops description/image), “From X” can vanish after the sender edits, re-sharing after an edit can plant a second copy.

We do not want event history. The blob+pointer split is not buying us a feature; it is there because the blob is global.

### Why change (later)

Same screens. Storage matches the story we already tell: your calendar is yours; a share is a send; if you got the time wrong, the people you told — and people still following them — see the right time. Simpler backend, a few behavior fixes, one small product change (follow until local edit). Testers on today’s build will barely notice the difference after a future ship.

### Proposed direction (draft)

Keep `users`, `my_people`, circles, `hidden_people`. Replace the three event tables with two:

- **`events`**: a row on **your** calendar. The listing fields, plus `from_event_id` (the sender’s row this was copied from; `NULL` if you created it), `from_person_id` (so the UI can say “From Bob”), and `frozen` (you edited this yourself; stop following `from_event_id`).
- **`sends`**: who you told. Share-sheet ✓ Shared, the “Shared with” list, and the pending queue for people with no account yet.

Incoming and outgoing are opposite arrows. `from_event_id` is where it came from. `sends` is who you sent it to. Putting both on the event row is what makes this feel like mush.

**Create:** insert your row; `from_event_id` empty.

**Share (including today’s re-share):** copy **your** current row onto their calendar with `from_event_id = your row`, and write a send-log line. Sarah sends to Bob; Bob has his own row, From Sarah. Bob taps Share, picks Carol; Carol gets a copy of **Bob’s** row, From Bob. If they don’t have an account, only the send-log line exists until they sign up — then we copy from your row as it is *now*.

**Follow until local edit:** Save updates your row and sets `frozen` — any save ends following, even a typo fix (owner decision, 2026-08-21). Then update every row that still points at you and isn’t frozen. Those updates walk the same way to *their* followers. Sarah hits Save → Bob still following Sarah → Bob’s row updates → Carol still following Bob → Carol’s row updates. Bob hits Save → he stops following Sarah, and Carol (still following him) gets *his* version. Carol hits Save → she stops following Bob.

That cascade is the rule applied twice, not a hosted object. Sarah never “messages” Carol. Carol is still looking at the concert Bob sent her. The time field changing is the listing getting corrected.

**Remove / delete account:** delete your row. Followers already have the fields on their own rows, so they keep the event; `from_event_id` goes dangling and they no longer receive updates. Same personal-remove rule as today. This is why share must **copy** at send time, not grant access to your row — access is the old pointer model forwarding was written to kill.

**Notifications (owner decision, 2026-08-21):** edits propagate **silently** — no push, no SMS, at no depth of the follow tree. The person editing may not realize a save would notify anyone, and the app is a one-time send after which people confirm details person-to-person. Followers simply see the corrected listing the next time they open the app. Adding date/time pings later stays open as a separate future decision.

**Dedup:** drop the global unique index on `(url, title, date, time)`. Two people adding “Lunch” at the same slot are two heads-ups, not one shared blob (KI-002 goes away). Receiving the same listing from two different people creates **two rows**, each following its own sender (owner decision, 2026-08-21) — no cross-sender dedup on receive. Whether a per-user “already have this listing” check still applies on the *create* path is a design-pass detail.

### Follow propagation is ONE server call, not a client loop

Design answer to "how does the follow cascade avoid N database calls" (2026-08-13): the client makes a single call — a SECURITY DEFINER RPC (e.g. `save_event`). Inside **one transaction** the function:

1. UPDATEs the caller's own row with the new field values and marks it `frozen` (an edit ends following);
2. propagates with a set-based recursive UPDATE (`WITH RECURSIVE` over `from_event_id`, restricted to non-`frozen` rows, carrying a visited-id set — which also answers the cycles open question by construction: a row is never updated twice, so A↔B loops terminate);
3. commits — the whole follow tree updates or nothing does. There is no partial-propagation state.

It must be SECURITY DEFINER because the cascade writes *other people's* rows — impossible under RLS from the client. The function verifies `auth.uid()` owns the source row, then runs the tree update with definer rights. No notifications fire on edit at all (owner decision, 2026-08-21): data walks the tree, and every follower is pull-only — there is no ping path to scope.

The client write is a set-to-value update of one row, so it is naturally idempotent — silent retry + reconcile-read on timeout are safe with no idempotency key. That is what removes the B-1 failure mode by construction rather than by budget tuning.

### User-visible vs not

Calendar, share sheet, hide, remove, SMS, display names stay. No new onboarding.

| Situation | Today | After a future ship of this |
|-----------|--------|------------------------------|
| You fix the time after sending | They keep 7pm (you forked) | People still following you get 8pm; that walks the follow tree |
| You edit after sending | No ping | Still no ping — followers silently see the new version next time they open the app |
| You edit, then they open the event | “From you” can vanish | Attribution stays |
| Re-share after you edited | Can plant a second copy | Same event; ✓ Shared for people you already sent it to |
| Two people add “Lunch” at the same slot | One can steal the other’s description | Two independent rows |

### Making it work — the cutover is part of the feature

This is not “build the new tables and start fresh.” Existing calendars (staging, tester data, later production) must survive. The feature is the target shape **plus** backfill **plus** cutover **plus** verification. None of that is designed yet; it still has to be in scope so nobody ships an empty new schema.

A later design pass, then a later implementation, has to cover:

- **Backfill.** Every `user_events` + snapshot join becomes a real per-user `events` row (copy title, url, date, time, description, image onto that owner). No empty new table.
- **Sends + follow pointers.** Each `event_shares` row becomes a `sends` line on the *sender’s* new row, and (when the recipient already has a copy) `from_event_id` / `from_person_id` on the recipient’s row. Pending contacts (no account) stay send-log-only until signup.
- **Forks already in the wild.** If the sender already forked, recipients still pointing at the old blob are *not* following the sender’s current row. The migration must decide frozen vs dangling `from_event_id` vs “best-effort relink.” Today’s graph is already lossy after edits; the backfill will be too. That’s a design problem, not a surprise at ship time.
- **Cutover.** One migration when this ships: rewrite `share_event`, `get_calendar_events`, pending delivery, RLS; delete `find_or_create_event`, the global unique index, the client-side edit merge, and orphan-snapshot GC. Client and backend move together. No long dual-write. Architecture docs / agent context update in the same change — they stay the source of truth for **shipped** behavior until then.
- **Extensive rollback plan (owner requirement, 2026-08-21 — part of the implementation, not a follow-up).** The current behavior works and must stay re-implementable if the rewrite goes wrong. The spec's rollback section must include, at minimum: (1) a named restore point — tag the last forwarding-model commit (`forwarding-model-final`) before the cutover lands, so the old behavior (`docs/events-technical-architecture.md`, agent context, migrations, `supabase/tests/forwarding_semantics.sql`, client) is one findable point; (2) an archived plain-language description of the old model's rules (share = copy at send time, edits never propagate, remove is personal, global dedup, attribution reconstructed from the share log) *including the bugs it carried* (B-1 class, KI-002), so a future revert knows both the behavior and its price; (3) old tables renamed, not dropped, for a defined soak window after cutover; (4) a database snapshot immediately before the migration runs; (5) the backfill rehearsed against a copy of real data before the real run; (6) a written revert procedure (code revert + how data flows back) executed at least once on staging before any production cutover; (7) post-cutover verification queries (row counts, spot-check shared events on both calendars) with explicit go/no-go criteria for keeping the new model. Code rollback is a git revert; data rollback is the one-way door — this plan is what keeps the door open.
- **Verify.** Rewrite [`supabase/tests/forwarding_semantics.sql`](supabase/tests/forwarding_semantics.sql) and the Jest/e2e paths that assume snapshot ids / `userEventId`. Manual pass: existing shared events still on both calendars, ✓ Shared intact, hide/remove/delete-account still personal. Old events keep their details; they do not get a silent rewrite of history beyond stamping follow/send as best we can.

### Acceptance Criteria

- [ ] Do not implement from this section. A dedicated design pass must close the open questions and produce a real spec (schema, backfill SQL, cutover order, tests) before any migration is written.
- [ ] The spec includes the extensive rollback plan above; implementation does not start without it.
- [ ] When that spec exists, the implementation includes data migration as above — not a follow-up someone will remember later.
- [ ] v1 ships no edit-triggered notifications (push or SMS) — edits propagate silently.

### Open Questions

Answered by the owner (2026-08-21), no longer open: whether the rewrite makes sense (yes — see the gate above); what ends following (any save); two senders delivering the same listing (two rows, each following its own sender); edit-triggered notifications (none in v1 — silent cascade; future pings are a separate decision); rollback scope (extensive plan required as part of implementation — see the cutover bullets).

Remaining design work. An agent that starts coding from this list is doing it wrong.

- Exact new schema and RLS.
- Exact backfill SQL: how to pick `from_event_id` when several people shared the same snapshot; what to do when the sender’s pointer already moved (fork).
- Cycles (A and B share the same listing to each other) — termination is answered by construction (visited set, above); the design pass confirms the user-visible result reads sensibly.
- Hide + a correction walking in through someone else (proposed default: hide filters shares *from* a person, not corrections arriving via someone you follow).
- Pending SMS users: answered in draft (their copy is stamped from the sender’s row as it is at sign-up, so pre-sign-up edits are simply included) — design pass confirms.
- The rollback plan's specifics: soak-window length, snapshot + revert procedure, go/no-go checks.
- What, if anything, remains of [Creator-Linked Events](#creator-linked-events-edits-propagate) after this.

---

## Branded OTP SMS

**Status:** Implemented (2026-08-17) — config, not code. Found in the 2026-08-15 owner device smoke (`manual-tests/manual_test_report_2026-08-15-device.md`). Shipped via Management API auth-config PATCH. Current template (updated 2026-08-18, dropped the "Never share it" suffix): `sms_template = "Events: {{ .Code }} is your sign-in code."` (36 chars with a 6-digit code, single GSM-7 segment, names the app, code prominent). No app code changes; no EAS rebuild.

### Problem

The sign-in verification SMS does not identify the app. A bare "123456 is your code"-style message reads like a wrong number on a phone full of texts, and first-time testers will not connect it to the app they just installed.

### Proposed Solution

Edit the phone-auth SMS template in the Supabase dashboard (Authentication → Sign In / Up → SMS template) or via the Management API auth-config PATCH so the message names the app, e.g. "Your Events code: 123456". No app code changes; no EAS rebuild. Keep it to one SMS segment and keep the code prominent — carrier filters and Twilio toll-free verification both care.

### Acceptance Criteria

- [x] A real sign-in SMS names Events and contains the code — owner confirmed on a real sign-in 2026-08-17
- [x] Test-OTP accounts (`+15555550100` / `+15555550103`) still verify — confirmed programmatically after the PATCH (they bypass the template)

---

## Share SMS Content & Formatting

**Status:** Implemented (2026-08-17) — server-side only (edge function; no app rebuild). Found in the 2026-08-15 owner device smoke.

### Problem

The share notification SMS read plainly and omitted the event description. Template at the time (`supabase/functions/send-notification/index.ts`): `{name} added you to {title} on {date}{time}` + the event URL when present, plus "Reply STOP to unsubscribe" on the non-app-user variant only.

### Solution (as shipped 2026-08-17)

Both variants (app user and non-app user) are now one identical message:

```
[Name] wants to go to "[Title]" with you
[Date], [Time]
[Description excerpt]
[Event URL]

Reply STOP to unsubscribe.
```

- **Framing:** "wants to go with you" replaces "added you to" (owner decision 2026-08-16: a share means "I want to go with you," not "this exists" — it echoes the walkthrough's "Found something you want to go to?"). No-title events fall back to `wants to go to an event with you`. Push titles take the same verb; push bodies use the comma separator.
- **STOP footer on every message** (previously non-app only): A2P best practice is opt-out instructions on every message, and Twilio intercepts STOP account-wide either way.
- **Description excerpt** when present: word-boundary truncated at 90 chars; titles at 80.
- **GSM-7 normalization** on title/description (curly quotes → straight, em/en dashes → `-`, `…` → `...`, `·` → `,`, newlines collapsed) so one non-GSM-7 character can't force UCS-2 encoding (70-char segments) and multiply per-message cost.
- Verified by a real share to the owner's number 2026-08-17 (`send-notification` returned `{"sent":1,"sms":1}`); owner approved the exact wording on the received text.

Standing constraints from `docs/distribution-strategy.md` (2026-08-09) held: the SMS carries the event's own URL but **no app/web links** — it is a pure notification, not an acquisition channel — and it must not read like spam to carrier filters. That no-app-link rule stands through internal testing; the launch pair is [SMS Links at Launch](#sms-links-at-launch).

### Acceptance Criteria

- [x] New template includes a short description excerpt when the event has one
- [x] Owner approves the exact wording on a real text before it ships — approved 2026-08-17
- [x] Any `send-notification` tests/SQL covering message shape are updated in the same change — vacuous: no automated test asserts on message shape; the docs (`events-technical-architecture.md`, `distribution-strategy.md`) and manual-test expectations (E-107, N-006) were updated in the same commit instead

---

## Screen Transition Polish (Android)

**Status:** Planned — polish; not a tester blocker. Found in the 2026-08-15 owner device smoke.

### Problem

On Android, swiping between screens shows a brief white bar on the right edge of the display and the motion reads as janky. Distinct from [KI-012](manual-tests/known_issues.md) (system Back / gesture-nav back sometimes does not navigate) — this item is the flash during a swipe that *does* change screens.

### Proposed Solution

Investigate on a development build before changing anything. Likely suspects: the stack card background not matching the theme background during the slide, or an old-architecture `react-native-screens` artifact (the app runs `newArchEnabled: false`; the new-arch migration may make this moot — see SETUP.md → Required for native builds). Reproduce in both Paper and Evening; a hard-coded light background would be invisible in Paper and glaring in Evening, which is itself diagnostic.

### Acceptance Criteria

- [ ] No white flash at the screen edge during push/pop transitions on Android, in either theme

---

## Manual Add Discoverability on Native

**Status:** Planned — acceptable for early testers as-is (owner ruling 2026-08-15: most users will use the contacts flow). Found in the 2026-08-15 owner device smoke; the owner could not find manual add at all until told the path.

### Problem

On native, the only route to the manual name+phone form is: contacts explainer → Continue → **Deny** the OS prompt → recovery screen → "Add a number instead" (`components/ContactsPermissionFlow.tsx`). Choosing "Not now" on the explainer dismisses the flow with no manual-add offer, and once contacts permission is granted the People screen's Add goes straight to the contacts picker — there is no way to add someone whose number you know but who isn't in your contacts.

### Proposed Solution

Offer the manual form from more than the denial recovery: a quiet entry on the native People screen and/or from the picker's empty/search-miss state, and reconsider what "Not now" should offer. Overlaps [Inline Add-by-Phone in Share Sheet](#inline-add-by-phone-in-share-sheet) — pick them up together so the entry points stay consistent. The web People screen already has the manual form; this is about native parity of *access*, not new capability.

### Acceptance Criteria

- [ ] A user who never grants contacts permission can still add a person without hunting through a denial flow
- [ ] Entry points match wherever the app offers contact import (People, share sheet)

---

## Touch Targets & Footer Safe Area (People Screen)

**Status:** Implemented (2026-08-15). Was the owner's main pre-tester item; the footer overlap was explicitly *not* a tester blocker (testers are expected to use gesture nav) but shipped in the same one-screen pass.

**As shipped:** the People screen gets real `minHeight: 44` targets on every bare-text action (header Back/Add, circle Edit/Delete, person Remove, hidden Unhide, modal Cancel/Save, retry banner) via a shared `textAction` style — rows were already ≥44 tall, so only the screen header grew — and the account footer now pads `4 + insets.bottom`. Owner 2026-08-18: person rows now feel too tall ([KI-011](manual-tests/known_issues.md)); a later agent should check whether this pass (or a later list `minHeight`) inflated them. Do not chase in an unrelated task. The 3-button nav overlap is **not** closed: it still covers the bottom of the screen on Samsung 3-button nav (People Delete account originally; Events calendar event list as of 2026-08-17). That is [KI-005](manual-tests/known_issues.md), not a People-only leftover. The audit pass over the same bare-text pattern elsewhere used zero-pixel-shift fixes so no `visual.spec.ts` baseline moved: calendar People button grew to 44 inside the 48px header row, event-detail Back/Retry and the add/edit-event Cancel/Save pairs got `hitSlop`, share-screen header actions got real `minHeight: 44` (unbaselined), and share-sheet chips grew to 44 with `Manage` on hitSlop. Caveat for the next agent: react-native-web only honors `hitSlop` for move/up boundary checks — the *initial* tap on web is still DOM-hit-tested, so hitSlop'd targets stay glyph-sized in the browser (a dev surface); on native they get the full expanded target. Verified by DOM measurement at 390×844 (every People/share action ≥44px, footer fully on screen) plus a full green e2e run with unchanged baselines.

### Problem

Two tap/edge hygiene defects on the People screen (`app/(app)/people.tsx`), both found in the 2026-08-15 owner device smoke:

- Text-only actions (person-row Remove, circle Edit/Delete, Hidden Unhide, header Back/Add) are tappable only on the glyph bounds — roughly 20px tall, under the 44pt convention in `.cursor/rules/project.mdc`. The owner found them hard to tap on a real phone.
- The fixed account footer has no bottom safe-area inset, so on devices with 3-button navigation (and on iOS with the home indicator) the system bar covers the Delete account button.

### Proposed Solution

One pass over the screen: real padding/min-height (≥44pt) on row and header text buttons (or `hitSlop` where layout must not shift), and `paddingBottom` from `useSafeAreaInsets()` on the footer. Then audit the same bare-text-button pattern on the other screens (share sheet, event detail, calendar header) — carefully: `e2e/visual.spec.ts` baselines cover some of those screens, so intentional pixel movement needs regenerated snapshots (`npx playwright test e2e/visual.spec.ts --update-snapshots`) reviewed like any other change.

### Acceptance Criteria

- [x] Every People-screen action has a ≥44pt effective touch target
- [ ] The footer actions clear the 3-button nav bar and the iOS home indicator — still open as [KI-005](manual-tests/known_issues.md) (People and Events; likely other screens)
- [x] Visual-diff baselines regenerated and reviewed if any snapshotted screen shifted — vacuous: no snapshotted screen shifted (the suite passed without regenerating)

---

## Notification Permission Explainer

**Status:** Implemented (2026-08-17) — upgrade, was never a blocker. Push registration, delivery, and tap-to-event already worked (N-005). Same “explain, then ask” idea as [Contacts Permission Explainer](#contacts-permission-explainer). Jest/e2e-covered; native device acceptance is N-010 on the next binary.

### Problem

On native, the first authenticated launch fired the OS notification prompt with no in-app reason (`registerForPushNotifications` in `app/_layout.tsx`). Contacts used to do the same; we replaced that with an explainer because the OS dialog does not carry our why. Notifications are worse: iOS has no usage-description equivalent, so the system copy is only “Allow Notifications.” A cold ask also burns iOS’s one-shot if the user taps Don’t Allow before they know what the ping is for.

### Solution (as shipped)

A real explainer, then the system prompt — shown once, on the first authenticated launch, after the calendar settles.

1. **Explainer:** “Events notifies you when someone shares an event with you.” Continue fires the OS prompt. Not now dismisses without calling the OS (so iOS hasn’t used up its one ask) and is persisted (`notification_explainer_answered` in AsyncStorage) — the ask never reappears.
2. **OS prompt:** Allow → the Expo push token registers as before. Don’t Allow → nothing; no recovery screen — SMS still reaches them.
3. **Sequencing:** the explainer never stacks on the empty-calendar walkthrough. The calendar triggers the check only when the walkthrough isn’t taking over, so a brand-new user sees the walkthrough first and the explainer back on the calendar.

Already granted → the token registers on launch with no extra UI. Denied with no OS re-ask → nothing. Web unchanged (no browser prompt, no explainer).

Copy decision (2026-08-17): the spec’s draft ended “— never anything else”; the owner cut the tail as defensive and future-falsifiable. The statement names the only trigger without promising it forever.

### Technical Notes

- [`lib/pushNotifications.ts`](lib/pushNotifications.ts): `getNotificationPermission()` (`{ status, canAskAgain }`), `requestNotificationPermission()` (the explainer’s Continue is the only caller), `getExpoPushToken()` (never requests; web → null).
- Flow owner: [`components/NotificationPermissionGate.tsx`](components/NotificationPermissionGate.tsx), rendered by the calendar screen with a `checkKey` bumped after fetches that don’t yield to the walkthrough. UI: [`components/NotificationExplainer.tsx`](components/NotificationExplainer.tsx), cloned from the contacts explainer.
- [`app/_layout.tsx`](app/_layout.tsx) no longer calls `requestPermissionsAsync` — the launch effect only picks up the token when permission is already granted.
- Jest: [`__tests__/components/NotificationPermissionGate.test.tsx`](__tests__/components/NotificationPermissionGate.test.tsx) + sequencing assertions in [`__tests__/app/app/index.test.tsx`](__tests__/app/app/index.test.tsx). Web no-op pin: [`e2e/notification-explainer.spec.ts`](e2e/notification-explainer.spec.ts). Native acceptance: N-010.

### Acceptance Criteria

- [x] Native first ask shows an in-app explanation before the OS prompt, never the OS prompt cold (device confirmation: N-010)
- [x] Not now does not burn the iOS one-shot and does not reappear on every launch — persisted forever, no re-ask
- [x] Already granted still registers the push token with no extra UI
- [x] Web behavior unchanged (no browser permission prompt)
- [x] Copy states the only trigger: someone shared an event with you

### Open Questions

- None on the original spec (decided 2026-08-17: Not now persists forever with no later re-ask; no post-deny recovery screen — SMS covers it). Follow-up: the explainer itself is unclear — [Notification Explainer Clarity](#notification-explainer-clarity).

---

## Explain Before Share (No Unshare)

**Status:** Implemented (2026-08-17) — copy / first-share education. Recorded 2026-08-16 from internal testing. No-unshare is already how sharing works ([Forwarding Shares](#forwarding-shares)).

### Problem

Sharing is like sending a text: once you’ve shared it, they know about the event, and you can’t take it back. The product enforces that (`✓ Shared`, additive-only, no unshare) but did not say so **before** the first send — the one-liner appeared only after someone was already marked ✓ Shared, and used the storage model (“their own copy”) instead of the metaphor.

### Solution (as shipped 2026-08-17)

One sentence on the share screen (`app/(app)/share.tsx`):

> Sharing is like sending a text — once you send it, you can't take it back.

The line renders whenever people are listed — before the first send, not only after a share exists. (With an empty people list the screen is the add-people path; the line appears as soon as people exist, which is always before the first possible send.)

Decisions on the original open questions: **always-visible line** (a first-send confirm would stack a third interruption on the display-name gate + contacts explainer; first-share-only would need “has ever shared” state for a purely educational line) and **share screen only** (the walkthrough is skippable and auto-shows at most once, so it can’t guarantee “before the first send”; the share screen is the mandatory step after every event creation). The remove-event confirm (“This only affects you…”) covers the other direction and is unchanged.

**Event-detail note considered and removed (owner decision, 2026-08-17).** The “Shared with” section on the event detail briefly carried the same sentence. The moment someone thinks about *un*sharing lives on the share screen — the only share action on the detail screen routes there, where ✓ Shared rows are non-interactive and the line is always shown — and the remove-event confirm covers the adjacent take-it-back path. The detail screen’s “Shared with” list is a plain record with no controls; a note there answered an unasked question. Do not re-add it without revisiting this paragraph.

### Acceptance Criteria

- [x] Before the first Share send, the user is told they can’t take it back
- [x] The explanation uses the text metaphor, not implementation language
- [x] Later opens of an already-shared event still make the completed, non-unsendable state obvious — via the share sheet (✓ Shared rows + the line) and the remove-event confirm; the event-detail note was deliberately dropped (see above)

### Open Questions

- None

---

## Share Delivery Status

**Status:** Planned — upgrade, not a blocker. Recorded 2026-08-16 from internal testing. Related: [Share Sent Confirmation](#share-sent-confirmation) (that you sent it). Additive-share re-notify (KI-003) is fixed.

### Problem

After you share, those people show as ✓ Shared. That only means the share was recorded. The sender cannot tell who actually got the message.

`send-notification` is fire-and-forget after `share_event`. SMS failures — including Twilio STOP / unsubscribed — are swallowed. The sender is sent back as if it went through.

### Proposed Solution

Like Partiful: after you’ve shared with people, instead of only a checkmark, show whether each person received it or not. If someone has replied STOP / unsubscribed, it should be visible that the message never made it to them.

### Foundation (from the 2026-08-17 Twilio diagnosis)

`sendSms()` in `supabase/functions/send-notification/index.ts` discards the Twilio Messages API response, so every failure mode is invisible outside the Twilio console. Empirical evidence from the account's last 30 days: 5 real share-notification SMS carrier-blocked (`30034`, unregistered 10DLC — 4 of them to one person who received nothing), 1 landline rejection (`30006`), zero of it visible in our own logs.

Layer 1 (independently shippable): parse the response — capture the message `sid` on accept, log `error_code` / `error_message` on synchronous rejection (21xxx). Failures become visible in Supabase edge-function logs in seconds.

Layer 2 (the feature itself): persist per-recipient status. Store the message SID against each `(user_event, person)` at send time; add a `twilio-status` edge function as the StatusCallback webhook (verifying the Twilio request signature) to record terminal states (`delivered` / `failed` / `undelivered` + error code, incl. `21610` STOP); the share sheet renders per-person received/not-received from that table instead of a bare ✓.

### Acceptance Criteria

- [ ] After sharing, the sender can see per person whether the message was received
- [ ] A recipient who has unsubscribed (STOP) is shown as not having received it
- [ ] ✓ Shared is no longer the only signal

### Open Questions

- What “received” means for app users (push vs SMS vs calendar copy already delivered).
- How STOP / bounce / no-token states are distinguished, if at all.
- Does layer 1 ship alone first, or land with the feature? (Recommendation: alone — a few lines, immediately useful.)

---

## US Phone Numbers

**Status:** Planned — needs investigation, not a blocker. Recorded 2026-08-16 from internal testing.

### Problem

US phone numbers are not working for testers. The client already parses with a US default (`lib/contacts.ts` `normalizeToE164(..., 'US')`, sign-in `parsePhoneNumber(input, 'US')`) and stores E.164. Manual-add placeholder is `+1 416 555 1234`. The failure is suspected to be on the Twilio path (or something in that path), not a missing US default in the parser.

### Proposed Solution

Support US phone numbers end-to-end (add person, sign-in, share SMS). Look into Twilio as part of this upgrade. Do not assume the client parser is the bug until that’s checked.

### Acceptance Criteria

- [ ] A real US number can be added and shared to
- [ ] Share SMS to that number is delivered (or a visible failure — see [Share Delivery Status](#share-delivery-status))
- [ ] Sign-in with a US number works when the number is a real user, not only a 555 test OTP

### Open Questions

- What exactly fails today (Twilio geo permissions, A2P/toll-free, sender pool, Auth SMS vs `send-notification` SMS, number format at send time). Not diagnosed yet — that’s the work.
- 2026-08-17 diagnosis (Twilio API pull) answers a big chunk of that: the sender `+15709385240` is an unregistered 10DLC long code — no A2P brand, no campaign on the “Events” Messaging Service — and US carriers hard-block its traffic with `30034`. The country split is total: **0 of 5 US-bound real SMS delivered (all `30034`) vs 39 of 39 Canadian-bound delivered** — Canadian carriers don’t run A2P filtering, US carriers do. Both legs (Auth OTP and `send-notification`) share the one sender, so both fail for US recipients. Completing A2P registration (the starter Trust Hub profile has been stuck `in-review` since 2026-02-16; owner is re-registering via the A2P Brands wizard, which creates a fresh sole-proprietor profile) is the fix. Not a geo-permissions issue (zero `21408`s) and not a client parser issue. Same pull found the account’s “fair” messaging health was ~95% self-inflicted: e2e/manual test sign-ins firing SMS at the fictional 555 test numbers (`21211`) — fixed 2026-08-17 by once-per-run e2e sign-in (`e2e/auth.setup.ts`).

---

## Add to Other Calendars

**Status:** Planned — upgrade, not a blocker. Recorded 2026-08-16 from internal testing.

### Problem

Events live only on the in-app calendar. Event detail can open the listing URL; there is no way to add the event to Google Calendar, Apple Calendar, or other calendar apps.

### Proposed Solution

Let the user add an event to Google Calendar and other calendar apps.

### Acceptance Criteria

- [ ] From an event, the user can add it to Google Calendar
- [ ] Other calendar apps are supported too (Apple Calendar and the usual phone calendars)

### Open Questions

- Which calendars in the first slice, and whether this is an export the user triggers vs a sync.

---

## Notification On/Off

**Status:** Implemented (2026-08-17). Related: [Notifications](#notifications), [SMS Invitations](#sms-invitations). Distinct from [Notification Permission Explainer](#notification-permission-explainer) (that's the OS ask).

### Problem

There is no way to turn off share notifications. App users always get both a push and an SMS for every share. Hide mutes one person (and their events). Denying the OS prompt only stops push. Twilio STOP only stops SMS. None of those is "push but not text" or "don't ping me."

### Solution (as shipped 2026-08-17)

Two independent per-account preferences on the `users` row — `notify_push` and `notify_sms`, both `NOT NULL DEFAULT true` (existing accounts keep today's behavior). The control lives in the People footer: a **Notifications** row opens a modal (same pattern as "Your name") with a switch per channel and the line "Events still land on your calendar either way." Flips are optimistic, persist via `users_update_own` RLS, and revert with a short alert on failure.

Enforcement is server-side in `send-notification`: the recipient's prefs are read at send time — push is queued only when `notify_push` is on, the app-user SMS only when `notify_sms` is on. The hidden-sharer check still skips both ahead of the pref checks. Non-app recipients have no `users` row and are unaffected (Twilio STOP remains their opt-out). Token registration and the notification explainer are untouched — the Expo token stays registered so re-enabling push is instant. Owner smoke 2026-08-18: the switches are too small ([KI-008](manual-tests/known_issues.md)), Android Back does not dismiss the modal ([KI-009](manual-tests/known_issues.md)), and Push can be on without OS permission ([KI-010](manual-tests/known_issues.md) — intended follow-up: no permission → Push off; turning it on re-runs the explainer then the OS ask). Owner 2026-08-20: system Back on the Samsung 3-button navbar sometimes does not go back at all — [KI-012](manual-tests/known_issues.md) (KI-009 is one sheet in that class; iOS sheet swipe-down is the same Modal gap, stack edge-swipe is not; not designed this pass).

Two layout notes from the ship: the switches live in a modal rather than inline in the footer because the People screen's chrome is all pinned — three extra footer rows collapsed the list viewport to zero on short viewports (the documented pre-existing crunch from [People List Scrolling](#people-list-scrolling)). The same pass capped the circles block (~3 rows, internal scroll) and gave the people list a `minHeight` so the screen can't collapse regardless of circle count.

### Technical Notes

- Migration `20260817000001`: `users.notify_push` / `users.notify_sms` booleans, default true. No new RLS (`users_update_own` already covers the write); NOT NULL so prefs are never ambiguous.
- `send-notification`: recipient fetch now selects `expo_push_token, notify_push, notify_sms`; each channel is gated on its pref (`!== false`, so a missing row keeps today's behavior).
- `app/(app)/people.tsx`: footer **Notifications** row → pageSheet modal with two `ThemedSwitch` rows; loads prefs with the footer read (last-good on failure), writes with `withWriteTimeout`, switches disabled mid-flight.
- `components/ThemedSwitch.tsx` (new, conventions-enforced): react-native-web's on-state thumb ignores `thumbColor` and falls back to a Material teal default outside the palettes — the wrapper wires track/thumb (and web's `activeThumbColor`) from role tokens.
- Tests: `supabase/tests/notification_prefs_test.sql` (defaults, independent flips, NOT NULL); Jest in `__tests__/app/app/people.test.tsx` (render, write, revert-on-failure, read-failure keeps defaults); e2e in `e2e/people.spec.ts` (flips persist across reload on all three form factors). Live-verified against the deployed function 2026-08-17: B with SMS off → `{"sent":0,"sms":0}`; back on → `{"sent":0,"sms":1}`. Manual: E-111.

### Acceptance Criteria

- [x] Push can be turned off without affecting SMS, and vice versa
- [x] Both off means neither is sent; both on is today's behavior
- [x] The event still appears on their calendar in every combination

### Open Questions

- Placement resolved: People footer → Notifications modal.
- Permission-gated Push (KI-010): if the OS has not granted notifications, should the switch be forced off and an on-flip reopen the explainer? Owner 2026-08-18: yes. SMS stays independent.

---

## Button Size & Clickability

**Status:** Planned — polish, not a tester blocker. Recorded 2026-08-18 from owner device smoke of preview `a7ce79c8`. Related: [Touch Targets & Footer Safe Area (People Screen)](#touch-targets--footer-safe-area-people-screen) (the 2026-08-15 44pt pass), [KI-008](manual-tests/known_issues.md) (Notifications switches).

### Problem

Something about the buttons does not feel good on a real phone. The 2026-08-15 pass made People/share/calendar text actions ≥44pt, but controls still feel small or fussy to hit — the Notifications switches are the concrete example (KI-008). This is a feel pass over size and clickability, not a one-control patch.

### Proposed Solution

Revisit button size and clickability across the app on a native device: switches, text actions, primary Save/Share, and modal chrome. Aim for controls that are easy to hit without looking like a tablet layout.

### Acceptance Criteria

- [ ] Native smoke no longer calls out controls as annoying to tap
- [ ] Notifications switches specifically meet the 44pt target (KI-008)

### Open Questions

- Whether this stays a dedicated pass or lands with KI-008 / KI-009 as a Notifications-modal-only fix.

---

## Share Sent Confirmation

**Status:** Planned — upgrade, not a blocker. Recorded 2026-08-16 from internal testing. Related: [Share Delivery Status](#share-delivery-status) (whether each person received it).

### Problem

After Share succeeds, the screen just goes back (`router.back()` in `app/(app)/share.tsx`). There is no confirmation that it was sent.

### Proposed Solution

When you send a share, confirm that it has been sent.

### Acceptance Criteria

- [ ] After a successful share, the sender sees a confirmation that it was sent

### Open Questions

- How this sits next to per-person received status — a one-shot “sent” vs the lasting ✓ / received rows.

---

## Notification Explainer Clarity

**Status:** Planned — polish, not a tester blocker. Recorded 2026-08-20 from owner feedback. **Not designed; do not implement from this section.** Related: [Notification Permission Explainer](#notification-permission-explainer) (the shipped pre-ask).

### Problem

The way we tell people we are about to ask for notification permission is a little weird. When that screen appears, it is unclear what is about to happen, and unclear what tapping Continue means.

Today the explainer (`components/NotificationExplainer.tsx`) is one sentence — “Events notifies you when someone shares an event with you.” — and a Continue / Not now pair. Continue fires the OS prompt. The screen never says a system dialog is next, or that Continue is the ask.

### Proposed Solution

Not designed. The need is: when the explainer appears, it should be obvious that a system permission prompt is about to happen, and obvious what Continue does. Copy, layout, and button labels are all open.

### Acceptance Criteria

- [ ] On the notification permission explainer, it is clear that a system permission prompt is about to appear
- [ ] It is clear what Continue does

### Open Questions

- Copy, button labels, and whether the screen itself changes — none of that is decided.

---

## Circles UX

**Status:** Planned — recorded 2026-08-20 from owner feedback. **Not designed; do not implement from this section.** Circles already ship as an optional share shortcut; this is a later pass on that implementation. Related: [People List Scrolling](#people-list-scrolling) (list feel on My People — not a circles rewrite). The circle-editor sheet is one of the Modals that swallow Android system Back ([KI-012](manual-tests/known_issues.md)); that is a platform Back gap, not a circles-UX spec.

### Problem

The current circles implementation is lacking. Circles are hard to use, not explained well, and not intuitive.

They exist today as saved selections: create/edit/delete on My People, chip shortcuts on the share sheet that resolve to individual people. Sharing stays person-to-person; circles are a UI convenience, not a visibility model (`docs/events-product.md`).

### Proposed Solution

Not designed. Do not invent a new circles model, copy, or layout from this section.

### Acceptance Criteria

- [ ] Do not implement from this section. A later pass, with the owner, decides what better looks like.

### Open Questions

- How circles should work, how they should be explained, and how they should feel — none of that is decided.

---

## Sign Out Pop-up

**Status:** Planned — polish, not a tester blocker. Recorded 2026-08-20 from owner feedback. **Not designed; do not implement from this section.** Related: [Sign Out](#sign-out) (the shipped action).

### Problem

The sign-out pop-up is lacking, especially on native.

Today, Sign out on the People footer calls `showConfirm` (`lib/dialogs.ts`): title “Sign out”, message “Sign out of [formatted phone]?”, Cancel / Sign Out. On native that is `Alert.alert`; on web it is `window.confirm`. The original Sign Out spec required a confirm, and that gate exists — the pop-up itself is the thin part, and it reads worse on the device than in the browser.

### Proposed Solution

Not designed. The need is: the sign-out pop-up should not feel lacking, especially on native. Copy, layout, buttons, and the surface itself are all open.

### Acceptance Criteria

- [ ] The sign-out pop-up does not feel lacking, especially on native

### Open Questions

- Copy, button labels, and the surface itself — none of that is decided.

---

## SMS Links at Launch

**Status:** Planned — launch-time. Store links were already the launch CTA in `docs/distribution-strategy.md` (2026-08-09). The app-user event deep link was recorded as Considering on 2026-08-18. Owner confirmed 2026-08-20 that the two are one change: store link for non-users, event deep link for app users. Testers asked for the deep link. **Do not implement before the app is listed. Ship both in the same `send-notification` change — never one variant without the other.** Related: [SMS Invitations](#sms-invitations), [Notifications](#notifications), [Share SMS Content & Formatting](#share-sms-content--formatting).

Previously titled "Open Event from SMS Link."

### Problem

Share SMS is link-free today (2026-08-09): event details, the event's own listing URL when one exists, STOP, and — for people without an account — an email signup invite. That is correct for internal testing.

Two gaps show up the moment the app is listed:

1. **Non-app recipients** have no store path. The email invite is a beta hatch, not how people get the app.
2. **App users** whose push is missed, muted, or never granted have only a plain-text SMS. Testers asked for a tap that opens that event — the same destination as the push.

These are not two features. Both are the first app/store URLs in a cold share text since the links were stripped. They share A2P-campaign and carrier-filter risk, and the deep link's "app isn't on this phone" fallback *is* a store CTA — so shipping one without the other leaves a hole.

### The split (load-bearing)

Who gets which extra URL:

| Recipient | Extra SMS line | Must not be |
|-----------|----------------|-------------|
| Non-app (`my_people.user_id IS NULL`) | Store link(s) — App Store / Play — replacing the email signup invite | An event deep link, or any URL into the web build |
| App user (`my_people.user_id IS NOT NULL`) | One https event deep link that opens the native app on that event (same as tapping the push) | A store link, a custom-scheme `events-app://` URL, or a web-app session |

The event's own original listing URL stays in both variants when present — that is event content, not app promo.

Do not send the event deep link to non-app users (it would open the web product, which is the 2026-08-09 rejection). Do not send store links to people who already have the app.

### Why they ship together

- **Same function, same day.** Both are lines in `buildSmsBody` in `send-notification`. A store-only or deep-link-only ship is an incomplete launch SMS.
- **A2P first.** Registered campaign content must match what we send. Our own domain (or store URLs) in cold texts is the top carrier spam-filter trigger and now risks campaign suspension, not just per-message blocks (noted 2026-08-19 after 10DLC). Update the A2P campaign description to mention **both** the store CTA and the app event link before the first live send.
- **Deep-link fallback is a store problem.** An "app user" on a new phone, or who deleted the app, will not open the native app. A universal https link that falls through to `shared-events.pages.dev` dumps them on the demoted web surface. The non-app store CTA is the honest fallback — which is why the two URLs are one design, even though any given message carries only one of them.
- **Infrastructure.** Universal links / App Links (AASA + assetlinks on the link domain) are what make the app-user URL open the app. Until listings exist there is nowhere honest for the non-app CTA to go, and nothing for AASA to upgrade.

### History (do not repeat)

SMS used to append a custom-scheme deep link (`events-app://event/[id]`), then a `WEB_APP_URL/event/[id]` https link aimed at everyone, including people without the app. Stripped 2026-08-09: the SMS is a notification, not an acquisition channel, and links from unfamiliar senders read as spam. The custom scheme also never linkifies in SMS clients. This pair keeps the no-web-acquisition rule (non-users get stores, not the web app) and puts the event link only on people who already have an account.

### Proposed Solution

At launch, in the same `send-notification` change:

1. Non-app variant: replace `SIGNUP_INVITE_LINE` with store-link copy. Restore `IOS_APP_STORE_URL` / `ANDROID_PLAY_STORE_URL` (or equivalent) as function secrets. Do not use `WEB_APP_URL` as the non-app CTA.
2. App-user variant: append one https event link (`WEB_APP_URL/event/[id]` or a dedicated link domain) once Apple AASA and Android assetlinks are hosted on that domain and the native app has associated domains / intent filters. Push remains the primary tap; this is the SMS backup.
3. Hosting AASA/assetlinks is in scope for this change. The link must open `/(app)/event/[eventId]` when the app is installed. If it is not, do not strand the person on the full web app — prefer store buttons or OS store handling.
4. Copy, exact URL layout (both store URLs vs one chooser), and the no-app fallback page are decided at implementation with the owner — not invented from this section.

### Acceptance Criteria

- [ ] Non-app share SMS replaces the email signup invite with store link(s); still has event details, listing URL when present, and STOP
- [ ] App-user share SMS includes a tappable https link that opens the native app on that event when the app is installed
- [ ] Non-app SMS never contains the event deep link; app-user SMS never contains the store CTA
- [ ] Custom-scheme `events-app://` URLs are not used
- [ ] A2P campaign description mentions both link types before the first live send
- [ ] Both variants ship in the same release; neither ships during internal testing
- [ ] Owner approves the exact wording on a real text before it ships (same bar as [Share SMS Content & Formatting](#share-sms-content--formatting))

### Open Questions

- Store CTA copy, and whether the SMS carries both store URLs, one smart URL, or a tiny store-chooser page (we cannot know the recipient's OS from a phone number).
- Link domain: `shared-events.pages.dev` vs a custom domain (AASA on `pages.dev` is often painful).
- What a universal-link miss shows instead of the full web app.
- Whether `WEB_APP_URL` stays the event-link base or a dedicated link domain is introduced.
