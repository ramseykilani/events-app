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
| [Web Support](#web-support) | Implemented | Dev/staging/CI surface only |
| [Display Names](#display-names) | Implemented | |
| [Contacts Permission Explainer](#contacts-permission-explainer) | Implemented | First Share already adds people |
| [Themeable Icons (Emoji Audit)](#themeable-icons-emoji-audit) | Implemented | |
| [Delete Account](#delete-account) | Implemented | |
| [Inline Add-by-Phone in Share Sheet](#inline-add-by-phone-in-share-sheet) | Planned | Convenience. A new user can already share. |
| [Add Sharer to Your People](#add-sharer-to-your-people) | Planned | Convenience. Recipients who know the number can add them today. |
| [People List Scrolling](#people-list-scrolling) | Planned | Polish. The People screen works; the list feel does not. |
| [Per-User Events (Copy + Follow)](#per-user-events-copy--follow) | Planned | Later rewrite. Incomplete — do not implement. Owner must confirm the why before any design pass. Not a tester blocker. |
| [Creator-Linked Events (Edits Propagate)](#creator-linked-events-edits-propagate) | Considering | Maybe never — recorded so the idea isn't lost |

## Using and testing

No product feature is blocking the core loop. A new user can sign in, land on the calendar, create an event, add people, share, and receive shares (push + SMS). Hide, forward, edit (fork), remove (own copy only), sign out, and delete account are all shipped.

How people get onto a first share today:

- **Native:** an empty people list on first Share auto-starts the [contacts explainer](#contacts-permission-explainer) → OS prompt → picker. Deny → recovery with Settings and an “Add a number instead” hatch. Then select and send.
- **Web:** no contacts API, so the empty state goes to People for the manual name+phone form. Web is not a user surface (`docs/distribution-strategy.md`).

**Web testing is unblocked** — local `npx expo start --web`, the staging preview, and the full automated suite (Jest, SQL, Playwright). That is how agents and CI test; it is not how users get the app.

**Native distribution is the remaining gate for real use**, not a missing feature. The first Android preview APK crashed at launch (missing EAS Supabase env vars); the replacement build launches (2026-08-15) but the full device smoke checklist has not been run. Store enrollment and submit secrets landed the same day (`STATUS.md`). After that checklist passes: production AAB → Play internal track, then ~3 friends. Native-only paths (contacts picker, datetimepicker, push, notification tap) still have no automated coverage — run `manual-tests/native_device_smoke.md` on each new binary.

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

## People List Scrolling

**Status:** Planned — polish, not a blocker. Adding people, circles, hide/unhide, and the account footer all work today.

### What this is not

This is not a missing People-screen capability and not a tester blocker. Do not treat it as a rewrite of My People, circles, or hide. The owner asked to record that the list *feel* is off so a later pass can fix the scroll, not invent new people features.

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
- Is the odd feel only the split scroll, or also row spacing / section weight? Owner flagged scrolling and "how the people list feels" — start with one document scroll; don't restyle rows unless that pass still feels off.

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

**Status:** Planned (2026-08-13) — **incomplete, do not implement.** Testers should get the current forwarding/fork build. This is a later storage-and-edit rewrite. What follows is a direction from a design conversation, not a complete spec. A dedicated design pass has to finish it before anyone writes a migration. Listing it is not a commitment to the exact shape below. **And the design pass itself is gated: confirm the why with the owner first (next section).**

### Confirm the WHY with the owner first (gate, 2026-08-13)

The question "does this rewrite actually make sense?" is deliberately left **unanswered** — the owner wants to be asked before anyone builds this. Before any design pass, spec, or migration, the agent picking this up must put that question to the owner and walk the trade-off:

- **For:** deletes the B-1 bug class (multi-call client-side saves), [KI-002](manual-tests/known_issues.md), the disappearing "From X" attribution, and the re-share double-copy. Storage finally matches the product story ("your calendar is yours; a share is a send"). Edit becomes a one-row UPDATE of your own row.
- **Against:** the largest change in the project — schema replacement, backfill from a lossy fork graph, cutover, test rewrites. And it ships a product change (edits propagate to followers) inside what looks like a storage refactor. The interim B-1 fixes (below) may also make day-to-day pain low enough that the rewrite can wait — or be descoped entirely.

Work starts only after the owner confirms why we are doing this. An agent that skips that conversation is doing it wrong, however good the write-up below looks.

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

**Follow until local edit:** Save updates your row and sets `frozen`. Then update every row that still points at you and isn’t frozen. Those updates walk the same way to *their* followers. Sarah hits Save → Bob still following Sarah → Bob’s row updates → Carol still following Bob → Carol’s row updates. Bob hits Save → he stops following Sarah, and Carol (still following him) gets *his* version. Carol hits Save → she stops following Bob.

That cascade is the rule applied twice, not a hosted object. Sarah never “messages” Carol. Carol is still looking at the concert Bob sent her. The time field changing is the listing getting corrected.

**Remove / delete account:** delete your row. Followers already have the fields on their own rows, so they keep the event; `from_event_id` goes dangling and they no longer receive updates. Same personal-remove rule as today. This is why share must **copy** at send time, not grant access to your row — access is the old pointer model forwarding was written to kill.

**Notifications:** data can cascade; pings should not. Date/time change: notify the people **you** told. Further followers see it the next time they open the app. Title-only fixes stay silent.

**Dedup:** per-user “already have this listing” is enough. Drop the global unique index on `(url, title, date, time)`. Two people adding “Lunch” at the same slot are two heads-ups, not one shared blob (KI-002 goes away).

### Follow propagation is ONE server call, not a client loop

Design answer to "how does the follow cascade avoid N database calls" (2026-08-13): the client makes a single call — a SECURITY DEFINER RPC (e.g. `save_event`). Inside **one transaction** the function:

1. UPDATEs the caller's own row with the new field values and marks it `frozen` (an edit ends following);
2. propagates with a set-based recursive UPDATE (`WITH RECURSIVE` over `from_event_id`, restricted to non-`frozen` rows, carrying a visited-id set — which also answers the cycles open question by construction: a row is never updated twice, so A↔B loops terminate);
3. commits — the whole follow tree updates or nothing does. There is no partial-propagation state.

It must be SECURITY DEFINER because the cascade writes *other people's* rows — impossible under RLS from the client. The function verifies `auth.uid()` owns the source row, then runs the tree update with definer rights. Notifications deliberately do **not** cascade: after commit, only the caller's direct `sends` are pinged, and only for date/time changes; further followers are pull-only. Data walks the tree; pings go one hop.

The client write is a set-to-value update of one row, so it is naturally idempotent — silent retry + reconcile-read on timeout are safe with no idempotency key. That is what removes the B-1 failure mode by construction rather than by budget tuning.

### User-visible vs not

Calendar, share sheet, hide, remove, SMS, display names stay. No new onboarding.

| Situation | Today | After a future ship of this |
|-----------|--------|------------------------------|
| You fix the time after sending | They keep 7pm (you forked) | People still following you get 8pm; that walks the follow tree |
| Date/time change | No extra ping | Ping people you told; further followers are pull-only |
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
- **Verify.** Rewrite [`supabase/tests/forwarding_semantics.sql`](supabase/tests/forwarding_semantics.sql) and the Jest/e2e paths that assume snapshot ids / `userEventId`. Manual pass: existing shared events still on both calendars, ✓ Shared intact, hide/remove/delete-account still personal. Old events keep their details; they do not get a silent rewrite of history beyond stamping follow/send as best we can.

### Acceptance Criteria

- [ ] Do not implement from this section. A dedicated design pass must close the open questions and produce a real spec (schema, backfill SQL, cutover order, tests) before any migration is written.
- [ ] When that spec exists, the implementation includes data migration as above — not a follow-up someone will remember later.

### Open Questions

Remaining design work. An agent that starts coding from this list is doing it wrong.

- **Does this rewrite still make sense?** (Owner question, deliberately open since 2026-08-13 — see "Confirm the WHY with the owner first" above. Nothing below is touched until the owner answers it.)
- Exact new schema and RLS.
- Exact backfill SQL: how to pick `from_event_id` when several people shared the same snapshot; what to do when the sender’s pointer already moved (fork).
- Whether `frozen` is a flag, or “I saved,” or “any local field change.”
- Cycles (A and B share the same listing to each other).
- Two people send you the same concert — one row or two; who you follow.
- Hide + a correction walking in through someone else.
- Pending SMS users and edits before they sign up.
- Notification copy, and whether date/time pings are in scope at all for v1 of this.
- Rollback / expand-contract if the migration is wrong on live tester data.
- What, if anything, remains of [Creator-Linked Events](#creator-linked-events-edits-propagate) after this.
