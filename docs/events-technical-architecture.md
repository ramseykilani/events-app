# Events — Technical Architecture

A mid-level architecture overview.

---

## Stack

- **Frontend:** React Native (Expo managed workflow, SDK 54)
- **Backend:** Supabase (Postgres database, Auth, Edge Functions)
- **Auth:** Supabase Phone Auth (SMS OTP)
- **Link Previews:** Supabase Edge Function that fetches Open Graph metadata from pasted URLs
- **Push Notifications:** Expo Push Notifications (via `expo-notifications`)
- **SMS Notifications:** Twilio REST API (called directly from the `send-notification` Edge Function — no SDK)

---

## Conceptual Model

Every piece of data in Events is subjective. There is no centralized source of truth — only nodes sharing information with other nodes.

- **events** = a row on your calendar (Copy + Follow model, cutover 2026-08-24 — `docs/per-user-events-copy-follow-spec.md`). Each row is one user's own listing: "here is an event, as I understand it." Only the owner can read or remove it (RLS); only `save_event` (SECURITY DEFINER) writes it.
- **sends** = who you told. The share record: ✓ Shared, "Shared with", notifications, and the pending-delivery queue for contacts without an account.
- **Sharing copies your row.** Sharing delivers each recipient their own `events` row with your current field values, linked back to yours (`from_event_id` = your row, `from_user_id` = you). A share is a completed action — no unshare, and removing your row never affects anyone else's calendar.
- **Copies follow their sender until edited locally.** When you save an edit, `save_event` updates your row and silently cascades the new values to every row still following it (recursively, through re-share chains). Any field-changing save sets `frozen` on the saver's row, which ends its following — your data is your data. A save that changes nothing does not end following (the no-op rule).

---

## Data Model

### Tables

**users**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Supabase auth user ID |
| phone_number | text (unique) | E.164 format, e.g. +14165551234 |
| display_name | text (nullable) | Self-chosen attribution name ("X wants to go to ... with you"). Captured by a hard gate on the first share — never at sign-up, and users who never share are never asked. Editable from the People screen footer; never removable. CHECK constraint: non-empty after trim, ≤50 chars, no newlines (the value is interpolated unescaped into SMS bodies, and RLS lets users write their own row via raw REST) |
| expo_push_token | text (nullable) | Expo push token, upserted on authenticated app launch |
| notify_push | boolean (not null, default true) | Recipient pref: gate the Expo push for shares. Toggled from the People footer → Notifications modal |
| notify_sms | boolean (not null, default true) | Recipient pref: gate the share SMS. Same toggle location |
| created_at | timestamptz | |

A user's name is never revealed in response to a phone-number lookup: `users` rows are select/update own-only via RLS, and the only cross-user reads are `send-notification` (service role) and the calendar RPC's share attribution — both limited to people the user actually shared with. Names are not verified; a user can call themselves anything, which is acceptable because shares only reach their own chosen contacts (the same trust model as contact names).

**my_people**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| owner_id | uuid (FK → users) | |
| phone_number | text | Used only for onboarding match and dedup |
| user_id | uuid (FK → users, nullable) | Populated when/if this phone number signs up |
| contact_name | text | Name as it appears in the owner's phone contacts |
| added_at | timestamptz | |
| last_shared_at | timestamptz | Updated each time the owner shares an event with this person. Used for 6-month auto-removal. |

Unique constraint on (owner_id, phone_number).

This is the user's in-app contact list — up to 50 people they've chosen to share events with. Not their full phone contact list. A curated subset.

**Identity resolution:** `phone_number` is only used at two moments: when inserting a new person (dedup) and when a new user signs up (the onboarding trigger populates `user_id` across all matching my_people rows). Most runtime queries use `user_id`, never `phone_number`. The one exception is `send-notification`, which reads `my_people.phone_number` to deliver SMS to both app users and non-app users.

**Enforcing the 50-person cap:** A Postgres function (trigger or RPC) checks the count of my_people rows for a user before allowing inserts. Simple count.

**circles**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| owner_id | uuid (FK → users) | |
| name | text | e.g. "Rave crew", "Theater friends" |
| created_at | timestamptz | |

**circle_members**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| circle_id | uuid (FK → circles) | |
| person_id | uuid (FK → my_people) | References someone in the owner's people list |

Unique constraint on (circle_id, person_id).

Circles are saved selections — shortcuts for quickly selecting a group of people from your list. A person can be in multiple circles or no circles at all. Circles are purely an organizational convenience.

**events**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Owner-scoped: identifies this row on this user's calendar. Generated by the client for new events (`crypto.randomUUID()`), which makes `save_event` idempotent. |
| owner_id | uuid (FK → users) | Whose calendar this row is on. ON DELETE CASCADE — your rows die with your account. |
| url | text (nullable) | Link to the public event listing. Optional — linkless events like "park hang 4pm" are valid. |
| title | text (nullable) | Auto-filled from OG metadata if URL provided, editable by the user |
| description | text (nullable) | From OG metadata |
| image_url | text (nullable) | From OG metadata |
| location | text (nullable) | Location feature (2026-09-01): free-text venue/address ("Sarah's place", "Signal, 175 Morgan Ave") — no Places autocomplete. Renders as a tappable Google Maps search row on the detail screen; feeds calendar exports and the share-SMS venue line. |
| event_date | date | |
| event_time | time (nullable) | |
| from_event_id | uuid (FK → events, nullable) | The sender's row this copy came from. NULL = the owner created it (or the link was cleared when the sender removed their row / deleted their account — ON DELETE SET NULL). Never updated after copy creation, so the follow graph is a forest. |
| from_user_id | uuid (FK → users, nullable) | The sender's account, for attribution + hide. SET NULL when the sender deletes their account (attribution disappears). |
| frozen | boolean | The owner edited this row; it no longer follows `from_event_id`. Any field-changing save sets it (owner decision 2026-08-21). |
| archived_at | timestamptz (nullable) | Archive Received Events (2026-09-01): set = archived — off the calendar, restorable from the Archived screen. Written only by `set_event_archived`, never by `save_event` (archiving is not an edit and never ends following). |
| created_at | timestamptz | |
| updated_at | timestamptz | Bumped by `save_event` on edits and cascade updates. |

Check constraint: `url IS NOT NULL OR title IS NOT NULL` — every event must have at least a URL or a title.

There is deliberately **no global dedup**: two people adding "Lunch" at the same slot are two independent rows. A partial unique index on `(owner_id, from_event_id) WHERE from_event_id IS NOT NULL` guarantees one copy per sender-row per recipient — a re-share from the same sender row cannot plant a second row, while two different senders sharing the same listing still yield two rows (owner decision 2026-08-21).

**sends**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| event_id | uuid (FK → events) | The sender's own row the send was made from. ON DELETE CASCADE. |
| person_id | uuid (FK → my_people) | The individual person this event was sent to (the **sender's** contact row). ON DELETE CASCADE. |
| created_at | timestamptz | When the send happened |
| sms_sid | text, nullable | Twilio message SID for the notification SMS (webhook lookup key; unique where present). NULL = no SMS attempted. |
| sms_status | text, nullable | `queued` / `sent` / `delivered` / `undelivered` / `failed` (CHECK). Written by send-notification at send time and by the twilio-status webhook at carrier time. NULL = no SMS / pre-feature row. |
| sms_error_code | text, nullable | Twilio error code on failure (e.g. `21610` STOP, `30034` carrier block). |
| sms_status_at | timestamptz | When the current status was recorded. |
| response | text, nullable | Who's Coming: the recipient's answer to this send — `yes` / `no` (CHECK), NULL = hasn't said. Last write wins. Written only via `respond_to_send` (app) or the `send-response` receipt API (SMS link); read by the asker through `sends_select_owner`. |
| responded_at | timestamptz | When the current answer was set; `send-response-notification` requires it to be fresh (~2 min) so replayed invokes can't re-ping the asker. |
| response_token | uuid | Capability for the SMS receipt link (`send-response` edge function). Unique; stable across re-shares (`share_event` is ON CONFLICT DO NOTHING). Never selected by the client. (Readable by the asker under `sends_select_owner` like any sends column — accepted 2026-08-28: a token holder can only read/spoof the answer on the asker's own list, which only the asker sees; column-level exclusion was rejected as a per-new-column maintenance hazard.) |

Unique constraint on (event_id, person_id).

**Who's Coming (the response slot).** Every send is also the ask: the recipient's yes/no lives on the send, visible only to the asker ("Shared with"). A forward is a new ask answered to the forwarder — Carol answers Bob, not Alice. Recipients answer in the app via `respond_to_send` (their own row id in, changed-flag out) or from the receipt page linked on the share SMS — both variants carry the link, so answering never requires the app (`events-reply.pages.dev/?t=<response_token>`, backed by the `--no-verify-jwt` `send-response` function; GET is inert so link prefetch can't answer). When an answer *changes*, the asker gets a push (`send-response-notification`, or the receipt function directly) — never an SMS, never a badge, and not when the asker hid the responder. The SMS line exists only while the `RESPONSE_LINK_BASE_URL` function secret is set — unsetting it strips the link without touching the in-app path. Removing the event copy does not change the answer; the answer dies only with the asker's event (sends cascade).

**Sharing is forwarding.** Sharing an event with someone delivers them their own `events` row — a copy of your row as it is at send time (via the `share_event` RPC) — like forwarding a text. A share is a completed action and cannot be unsent; removing your own row never affects anyone else's calendar.

`sends` is the *record* of that action, not the delivery mechanism. It drives the "Shared with" list, the share sheet's ✓ Shared, notification sends, and pending delivery for contacts without an account (their copies arrive on sign-up via the `deliver_pending_shares` trigger, stamped from the sender's row as it is at that moment). Recipients' calendar visibility does NOT depend on `sends` — the delivered `events` row is their copy.

Incoming and outgoing are opposite arrows: `from_event_id`/`from_user_id` on your row say where it came from; `sends` on your row say who you sent it to.

When you share an event, the app resolves your selection (circles and/or individuals) into individual person rows. Circles are a UI shortcut — at the data level, sharing is always person-to-person. The RPC also updates last_shared_at on the relevant my_people rows.

**hidden_people**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| owner_id | uuid (FK → users) | The user who did the hiding |
| person_id | uuid (FK → my_people) | The person being hidden — must be in owner's my_people list |
| hidden_at | timestamptz | |

Unique constraint on (owner_id, person_id).

Hiding is one-way: it affects only the owner's calendar and notifications. The hidden person is unaware and unaffected. Hiding is only possible from within an event that person shared — you cannot pre-emptively hide someone from the People screen. The People screen's Hidden section is for undoing hides only.

RLS: owner-only (users can only CRUD their own hidden_people rows).

**affiliate_programs** (Affiliate Link Tagging — FEATURES.md)
| Column | Type | Notes |
|--------|------|-------|
| id | text (PK) | Program slug, e.g. `ticketmaster` |
| domains | text[] | Registered domains the program covers (regional TLDs listed explicitly); matching is host-equals-or-subdomain |
| url_template | text | The network's tracking-link format; `{url}` is replaced with the percent-encoded destination |
| enabled | boolean | Per-program switch, default false |
| created_at | timestamptz | |

**affiliate_config**
| Column | Type | Notes |
|--------|------|-------|
| id | boolean (PK, CHECK id) | Single-row table |
| enabled | boolean | The global on/off switch, default false |

The machine-readable on/off registry for outbound listing-link tagging. Ships dark (global off, no program rows); activation is a service-role SQL update — no deploy, no app release (runbook: docs/affiliate-programs.md → The switch). Read by the app (lib/affiliateRegistry.ts, cached, fail-open untagged) and by send-response (server-side, per request). Never consulted for SMS.

RLS: world-readable SELECT (config, not user data); no write policies — service role only.

### Indexes

Add indexes on the following columns to prevent the calendar query from degrading as data grows:

- `my_people.owner_id`
- `my_people.user_id`
- `sends.person_id`
- `events(owner_id, event_date)`
- `events(from_event_id)` WHERE from_event_id IS NOT NULL (partial)

### Cascade Rules

- Deleting a my_people row cascades to related circle_members, sends, and hidden_people rows
- Deleting an events row cascades to its sends rows; followers' rows keep their field values with `from_event_id` SET NULL
- Deleting a user cascades to their events rows (and with them their sends); followers' rows get `from_event_id`/`from_user_id` SET NULL

---

## Core Queries

### "Show me my calendar" (`get_calendar_events` RPC)

This is the main query the app runs. Every row it returns is one of the caller's own `events` rows — RLS is owner-only, so visibility never depends on someone else's rows. Attribution and hide resolve through a live join on `from_user_id`:

```
Given: current user's user_id, start_date, end_date
→ Guard: raise unless p_user_id = auth.uid() (the function is SECURITY DEFINER)
→ Base: the caller's own events rows, filtered by date range
→ Attribution: the caller's my_people row for the sender (owner_id = caller,
  user_id = from_user_id) → its contact_name, else the sender's display_name
  (live users join), else NULL (no "From X" line rendered)
→ Hide filter: each row has exactly one sender, so the old "suppress events
  whose only incoming shares are from hidden people" collapses to suppressing
  rows whose direct sender is hidden (hidden_people on the caller's contact
  row for the sender)
→ Return: the row's own id + event details + sharer_contact_name +
  sharer_person_id + sharer_user_id (null sharer name/person for self-added
  events; sharer_user_id falls back to the caller)
```

`sharer_person_id` is the sharer's `my_people.id` in the recipient's contact list. It is returned so the event detail screen can offer a hide/unhide action without a separate lookup. Because the join is live, adding the sharer as a contact *after* the share upgrades attribution to the contact name and makes hide available (the "Add Sharer to Your People" path).

All joins use user_id, never phone_number. Implemented as a Supabase RPC (Postgres function) for performance.

### "Share this too"

When a user sees an event on their calendar and wants to share it with their own people:

1. Every row on the calendar is the caller's own, so there is nothing to adopt — the row is already theirs
2. User must select who to share with (mandatory)
3. The `share_event` RPC records sends rows (resolved to individual people) and delivers each recipient who has an account their own events row — a copy of the caller's current row, following it (`from_event_id` = the caller's row)
4. last_shared_at updated on relevant my_people rows (inside the RPC)

Re-sharing copies the re-sharer's row, so the new recipient follows the re-sharer (A→B→C: C's row follows B's row, and B's edits — not A's — reach C directly; A's edits reach C only while B keeps following A).

---

## Key Flows

### 1. Sign Up

1. User enters phone number. The sign-in screen shows a short orientation first (what the app is, plus why the number — it is the account and how friends share events with you) before the OTP send.
2. Supabase sends SMS OTP
3. User enters code → Supabase creates auth user
4. User record created in users table
5. Database trigger runs: matches phone number against all my_people rows, populates user_id where matched — and the `deliver_pending_shares` trigger delivers the new user their own copies of every event that was shared with them while they were off the app
6. App lands on the main calendar. Because the triggers already linked matching my_people rows and delivered copies, events shared with this phone number are visible immediately — no setup step required.
7. If the user has no events at all and hasn't seen the walkthrough yet, the onboarding walkthrough (`app/(app)/onboarding.tsx`) is shown once. It is always reopenable via the `?` button in the calendar header.

### 2. Setting Up Your People

People are added from the People screen (or when tapping Share) — there is no forced setup step after sign-up.

1. App shows an explainer (“Events uses your contacts so you can pick who to text when you share”), then the OS contacts prompt. This fires on first Share or when opening People with an empty list — never at sign-up. Deny lands on a recovery screen (Open Settings, with a quiet add-a-number hatch).
2. User selects up to 50 contacts from their phone — these become their in-app people list
3. Phone numbers are normalized to E.164 and stored in my_people
4. Circles can be set up at any point from the People screen

### 3. Share an Event (New)

1. User taps the FAB (floating action button) on the calendar screen
2. User enters event details. Two paths:
   - **With URL:** User pastes a URL. App calls the OG metadata Edge Function. Title is auto-filled and editable. User enters or confirms date and time.
   - **Without URL:** User types a title and enters date and time. No link preview.
3. **URL match check (if URL provided):** The app queries the caller's own rows for the same URL (events RLS is owner-only, so this is per-user by construction). If matches are found, the user is shown the existing entry with a prompt like "This event has already been entered with these details — use these?" They can accept (jumps to the existing row, no duplicate) or dismiss and enter their own details.
4. The events row is created via `save_event` with a client-generated id (idempotent — a retried create with the same id is a no-op)
5. **Sharing screen (mandatory):** Shows the user's people list (up to 50). Circles appear as quick-select buttons at the top — tapping one selects everyone in that group. The user can also tap individual people. Any combination works.
6. The `share_event` RPC records sends rows (one per person, circles resolved to individuals) and delivers each recipient who has an account their own events copy — contacts without an account get theirs on sign-up
7. last_shared_at updated on relevant my_people rows (inside the RPC)
8. `send-notification` Edge Function is called fire-and-forget with the newly shared person ids, and notifies only those recipients (KI-003 — an additive share must not re-ping people already on the event)

### 4. Share an Existing Event (From Calendar)

1. User sees an event on their calendar that someone shared with them — it is already their own row (forwarding)
2. User taps the event, taps "Share"
3. **Sharing screen (mandatory):** User must select at least one person before confirming. People the event was already shared with render as completed actions ("✓ Shared") and cannot be deselected — a share delivers the recipient their own copy, so it can't be unsent
4. `share_event` records the new sends and delivers copies of the caller's current row; notifications are sent to the newly shared people only

There is no unshare. The share sheet is additive: it shows existing sends as done and only offers people who don't have the event yet. The share screen says so up front — whenever people are listed, a quiet line reads "Sharing is like sending a text — once you send it, you can't take it back."

### 5. Edit an Event (Save, and Followers Follow)

Every events row is owned by exactly one user, and editing updates that row in place — one `save_event` call inside one server transaction:

1. User opens one of their events and taps edit
2. The client skips the RPC entirely when nothing changed (a no-op save must not end following; the server's own no-op rule is defense in depth)
3. `save_event` updates the caller's row and marks it `frozen` — any field-changing save ends following (owner decision 2026-08-21)
4. The same call then cascades the new values to every row still following this one, walking the follow tree (`WITH RECURSIVE` over `from_event_id`, non-frozen rows only, UNION visited-set so a row is never updated twice and a cycle terminates by construction). The whole follow tree updates or nothing does — there is no partial-propagation state.
5. The cascade is **silent**: no push, no SMS, at any depth (owner decision 2026-08-21). Followers see the corrected listing next time they open the app.

A frozen intermediary prunes its whole subtree from later cascades: if Bob edited his copy, Sarah's later edit reaches neither Bob nor people following Bob. Forwarding a frozen copy works normally — the new recipient's row follows *your* row, and your future edits cascade to them.

This keeps each user's data their own: a correction walks in through the person you follow, and your own Save always wins over an incoming cascade (the cascade skips rows marked frozen; a concurrent follower save wins the lock race via the outer UPDATE's `NOT frozen` re-check).

### 5a. Remove or Archive an Event

**Self-created events** (`from_user_id IS NULL`) are deleted: removing deletes your own events row (its sends records cascade with it). Because sharing delivered everyone their own row up front, this is purely personal — nobody else's calendar changes when you remove an event. Followers' rows keep their field values with `from_event_id` SET NULL (following ends; attribution via `from_user_id` survives while the sender's account exists). There is no garbage collector in this model: every row has exactly one owner, and removing a row is final.

**Received events** (`from_user_id IS NOT NULL`) are archived instead (Archive Received Events, 2026-09-01) — reversible removal, because a mis-tapped delete had no self-recovery (the share sheet locks already-shared people, and RLS hides the recipient's calendar from the sender, so "send it again?" was a dead end). Archive sets `archived_at` via the `set_event_archived` RPC (SECURITY DEFINER, owner-only, idempotent — a write matching the current state is a no-op). It deliberately does NOT go through `save_event`: archiving is not an edit, so it never sets `frozen` and never cascades — an archived row keeps following its sender and edits still land on it. The calendar RPC filters archived rows (`AND e.archived_at IS NULL`); the detail screen still loads them by id, so push/deep links keep working and show Restore. The Archived screen (`app/(app)/archived.tsx`, entered via a plain-words "Archived" link at the foot of the calendar, shown only when the archive is non-empty) lists them via `get_archived_events` — upcoming first (nearest at top), then past (most recent first), with the same live attribution join as the calendar but no hide filter (hide filters the calendar, not the drawer). Restore clears `archived_at`; there is no remove-forever anywhere for received events. Archiving an *upcoming* received event whose Who's Coming answer is NULL or Yes offers to tell the asker No (the answer rides the archive moment — "get this off my calendar" users never return to the event screen); past events and existing No answers archive silently. Neither archive nor restore notifies anyone.

The classification boundary is `from_user_id`, not `from_event_id`: `from_user_id` survives the sender deleting their event row, so a sender-removed received event still shows Archive; only an account-deletion orphan (both scrubbed) shows Delete — accepted corner (owner call 2026-09-01).

### 5b. Delete Account

"Delete account" sits at the bottom of the People screen (below Sign out, destructive-styled) behind a single confirm dialog. Confirming calls the `delete_my_account()` RPC (SECURITY DEFINER, granted to `authenticated` only), which deletes the caller's own `auth.users` row — client-side auth-user deletion isn't possible with the anon key, so the RPC is the deletion path. The app then signs out locally; SessionContext routes to sign-in.

The cascades do the rest: `public.users` (and with it the push token), `my_people`, `circles`, `hidden_people`, `events` (the caller's rows), and `sends` all die with the account. Followers' rows survive with `from_event_id`/`from_user_id` SET NULL — they keep the event, following ends, and attribution disappears. Other users' `my_people` rows pointing at the deleted account get `user_id` SET NULL — the contact reverts to a pending phone-number entry, so future shares get the non-app SMS and a re-signup triggers pending-share delivery. That last part is why friends' previously shared events can reappear after delete + sign-in with the same number ([KI-007](../manual-tests/known_issues.md)); it is working as coded, not a failed delete of the caller's rows. Re-signing up with the same phone number starts a new account (new `auth.users` / `users` row).

### 5c. Add to Other Calendars (Snapshot Export)

Event detail carries an "Add to calendar" row with two icon buttons — a one-shot **export**, never subscribe/sync (owner decision 2026-09-01; FEATURES.md → Add to Other Calendars). Once the event lands in someone's Google/Apple/Outlook calendar, later in-app edits do not reach it — the accepted price of no-subscribe.

1. **Google button** — opens the Google Calendar template link (`calendar.google.com/calendar/render?action=TEMPLATE&…`) via `Linking.openURL` on every platform; no auth, no SDK.
2. **Apple / Outlook / Other button** — web downloads a JS-generated `.ics` (Blob + object URL); iOS presents Apple's pre-filled New Event sheet (`expo-calendar` `createEventInCalendarAsync`, permission-free EventKit UI); Android fires `ACTION_INSERT` (`expo-intent-launcher`) into the calendar app's new-event screen.

Field mapping is shared pure functions in `lib/calendarLinks.ts` (`buildGoogleUrl` / `buildIcs` / `buildNativeDetails`): timed event → floating 1-hour block (no `Z`/`TZID`/`ctz` — the recipient's calendar interprets it in their own zone, matching the app's local-date semantics); no `event_time` → all-day (exclusive next-day end); free-text `location` → Google's `location=` param, the .ics `LOCATION:` line, and the native compose UIs' location field (omitted everywhere when empty); full description + listing URL in the body; "Untitled event" fallback; stable `.ics` UID `<event-id>@shared-events` so UID-deduping apps update rather than duplicate on re-add.

The Who's Coming receipt page (`receipt/index.html`) renders the same two links from an inline vanilla-JS port of the builders (static page, no build step), fed by the `send-response` GET's `description` + `location` + `url` fields — a read-only extension that expands no disclosure (the share SMS already carries a description excerpt and the full listing URL to the same token holder). The receipt page also renders the location line under the date. The receipt `.ics` UID derives from the send's `response_token` — the GET deliberately exposes no event id.

### 6. Hide / Unhide a Person

1. User opens an event detail for an event someone else shared with them
2. A "Hide [name]" button appears at the bottom (the sharer's name is known via `sharer_person_id` from the calendar RPC)
3. Tapping Hide inserts a hidden_people row and navigates back — the person's events immediately disappear from the calendar (server-side filter)
4. If the person is already hidden, the button reads "Unhide [name]" — tapping it deletes the hidden_people row and their events reappear
5. The People screen shows a "Hidden" section at the bottom listing all hidden people, each with an "Unhide" button

### 7. Six-Month Auto-Removal (Declutter People)

A scheduled Supabase Edge Function (`cleanup-people`, cron, runs daily or weekly):

1. Query my_people where last_shared_at is older than 6 months (or null and added_at is older than 6 months)
2. Delete those rows (cascades to circle_members, sends, and hidden_people)
3. No notification to anyone. They quietly disappear from the list.

This keeps the user's people list clean and relevant. Users can always re-add someone from their phone contacts.

### 8. Event Data Retention

There is no event garbage collector. Every events row has exactly one owner, so there are no orphan snapshots to reclaim — removing a row deletes it, and rows otherwise live until their owner removes them or deletes their account. Old events simply age off screens as dates pass; there is no hard expiry of anyone's data. (The pre-cutover model's `cleanup-events` cron and `cleanup_old_events()` were removed in the Copy + Follow cutover, 2026-08-24.)

---

## Notifications (Push + SMS)

The `send-notification` Edge Function sends a push notification and/or SMS to each recipient when an event is shared with them.

**Registration (push):** On authenticated app launch, the app upserts the Expo push token to `users.expo_push_token` when notification permission is already granted — launch never asks. The OS prompt fires only from the notification explainer's Turn on notifications (`components/NotificationPermissionGate.tsx`, shown once on the first native launch after the calendar settles, never stacked on the walkthrough); Not now is persisted (`notification_explainer_answered` in AsyncStorage) and never re-asks, and a denied OS prompt gets no recovery screen (SMS still reaches them). Web never requests notification permission.

**Sending flow:**
1. `share.tsx` calls the Edge Function fire-and-forget after the sends are recorded, passing `{ eventId, personIds }` — `eventId` is the *sender's* own row id
2. The function requires a valid user JWT and verifies the caller owns that events row — otherwise 401/403
3. Function queries all sends for that eventId, including `my_people.phone_number`, and reads the sender's row for the event fields
4. Fetches the sharer's `users.phone_number` and `users.display_name` once. Attribution order for app users: the recipient's own `contact_name` for the sharer → `display_name` → phone. For non-app users: `display_name` → phone. (The share screen gates sharing on a saved display name, so the phone fallback is pre-feature legacy state.)
5. For each recipient:
   - **Non-app user** (`my_people.user_id IS NULL`): sends an SMS with event info and the event URL (when present) — no app/web links; the SMS is the whole message. During internal testing it also carries the signup-invite line (see the SMS body below)
   - **App user** (`my_people.user_id IS NOT NULL`): checks whether the sharer is in the recipient's hidden_people (lookup is by the recipient's my_people; skips both push and SMS if hidden), then queues a push notification when a token exists and the recipient's `users.notify_push` is on, and an SMS containing the event URL (when present) when `users.notify_sms` is on. Push is the tappable path into the event; the SMS carries the same Who's Coming receipt link as the non-app variant (while `RESPONSE_LINK_BASE_URL` is set) so answering never requires opening the app. A missing push token never suppresses the SMS. The two prefs are independent per-account toggles (People footer → Notifications); events land on the recipient's calendar regardless — they only gate the pings.
   - **Push ids are per-recipient:** row ids are owner-scoped, so the function resolves each app recipient's own copy (`events WHERE from_event_id = <sender row id> AND owner_id = <recipient>`) and puts *that* id in `data.eventId` — otherwise the tap would land on "Event not found." If the copy is missing (the recipient removed it in the race between share and notify), the push is skipped and the SMS still sends.
6. Push messages are batch-sent to the Expo Push API; SMS messages are fired concurrently via the Twilio REST API, each with a per-message `StatusCallback` pointing at the `twilio-status` function (a per-message callback overrides the Messaging Service's, so no Twilio console configuration). Recipients whose number is NANP area-code 555 (the reserved fictional range used by test accounts) are skipped and never reach Twilio.
7. `DeviceNotRegistered` errors from Expo Push API clear the stale token
8. Each SMS's synchronous outcome is written onto its sends row (Share Delivery Status): accepted → `sms_sid` + `sms_status='queued'`; a 21xxx rejection → `sms_status='failed'` + `sms_error_code` (and a `console.error` — the response parsing that ended the log-blindness of the 2026-08-17 diagnosis). Network errors still only log and never propagate — missing Twilio credentials silently disable SMS

**Delivery status webhook (`twilio-status`):** Twilio POSTs message status callbacks here (deployed `--no-verify-jwt` — Twilio cannot present a user JWT). Auth is Twilio's request signature: `X-Twilio-Signature` = base64 HMAC-SHA1(`TWILIO_AUTH_TOKEN`, callback URL + sorted POST params), verified fail-closed. The function records `sent` and terminal states (`delivered` / `failed` / `undelivered` + `ErrorCode`, incl. `21610` STOP) onto the sends row keyed by `sms_sid`. A late non-terminal callback never downgrades a terminal state; an unknown SID answers 500 so Twilio retries (the first callback can beat the send-time SID write). The share sheet renders per-person status from these columns (`lib/deliveryStatus.ts`): success is assumed — everyone shows "✓ Shared" (app users and SMS-only contacts alike; no sent/delivered ladder), and only terminal failures change the label — "✕ Unsubscribed" for `21610` (STOP), "✕ Undelivered" for any other failure.

**Push notification body:** `{ title: "[Name] wants to go to [Event Title] with you", body: "[date], [time]", data: { eventId: <recipient's own row id> } }`

**SMS body:** `"[Name] wants to go to [EventTitle] with you\n[DateStr], [TimeStr]\nWhere: [LocationExcerpt]\n[DescriptionExcerpt]\n[EventURL]\n\nComing? [ReceiptURL]\n\nReply STOP to unsubscribe."` — the title is quoted when present and falls back to `wants to go to an event with you` when null; the venue line (`Where: …`, Location feature 2026-09-01), the description excerpt (word-boundary truncated at 90 chars), and the event URL line are each omitted when absent. Name is the recipient's `contact_name` → `display_name` → phone for app users, and `display_name` → phone for non-app users. Titles and descriptions are normalized to GSM-7-safe punctuation so one stray character can't force UCS-2 segment pricing. Both variants carry the `Coming? <receipt url>` line while `RESPONSE_LINK_BASE_URL` is set (FEATURES.md → Coming Link in Every Share SMS; body shape is pinned by `__tests__/edge-functions/smsBody.test.ts`). The non-app variant inserts one more paragraph before the STOP footer: `Want to invite your friends to things too? Get the beta: https://events-landing.pages.dev/signup` (internal-testing CTA — the self-serve signup form, FEATURES.md → Beta Signup Pipeline; replaced the email-the-owner line 2026-09-03). At launch, store links (non-users) and an event deep link (app users) replace that invite in the same change — see SMS Links at Launch.

SMS deliberately carries no app or web links (decision 2026-08-09, see `docs/distribution-strategy.md`): the only URLs in a message are the event's own original URL, the Who's Coming receipt link (a dedicated one-page host, never the web app), and — during internal testing — the signup form link (owner-approved 2026-09-03: an onboarding pointer for an already-interested recipient, not a share link). This keeps first impressions off the web build and link-free SMS reads less like spam to carrier filters. The one acquisition element is the non-app signup invite.

**At launch** the two URLs return in the same `send-notification` change (`FEATURES.md` → SMS Links at Launch): store links replace the email invite for non-app recipients; an https event deep link (opens the native app on that event) is added for app users. Do not ship one without the other, and do not implement before the app is listed.

**Tap handler (push):** Configured in `app/_layout.tsx` — tapping a notification navigates to `/(app)/event/[id]` with the recipient's own row id. The detail screen resolves ids it doesn't own via a fallback (`events WHERE from_event_id = :id` — the caller's copy of a followed sender's row) before showing "Event not found" / access-removed.

**Response notifications (Who's Coming):** when a recipient's answer *changes* (first answer or a flip — never a page open, never a re-tap of the same answer), the asker gets a push: `{ title: "[Name] said yes" | "[Name] said no", body: "[Event Title] · [date], [time]", data: { eventId: <asker's own row id> } }`. Two write paths, one notifier (`supabase/functions/_shared/responseNotify.ts`): the app path calls `respond_to_send` and then `send-response-notification` fire-and-forget (JWT-verified; the function re-resolves the send, requires `responded_at` within two minutes so replayed invokes can't re-ping, honors the asker's `notify_push`, and skips when the asker has hidden the responder); the SMS receipt path writes via the `send-response` function and notifies directly. Push only — never an SMS per answer, no badges, no "3 haven't responded" nags. The receipt link in the share SMS (both variants: `Coming? https://events-reply.pages.dev/?t=<response_token>`) is emitted only while the `RESPONSE_LINK_BASE_URL` secret is set.

**Required Supabase secrets:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, plus a sender (`TWILIO_MESSAGING_SERVICE_SID` preferred, `TWILIO_PHONE_NUMBER` as fallback). No other secrets gate SMS. `RESPONSE_LINK_BASE_URL` (set 2026-08-28) gates only the Who's Coming receipt-link line — unset it to strip that line with no redeploy.

---

## Link Preview Edge Function

A Supabase Edge Function (`og-metadata`, Deno/TypeScript) that:

1. Accepts a URL
2. Fetches the page HTML (with a timeout cap and response size cap to prevent abuse)
3. Parses Open Graph meta tags: `og:title`, `og:description`, `og:image`
4. Falls back to `<title>` tag if no OG title
5. Returns JSON: `{ title, description, image_url }`

Only fetch OG metadata when a URL is present and when the URL changes during an edit.

---

## Row-Level Security (RLS)

Supabase RLS policies ensure users can only access data they should see. Key policies:

- **users:** Users can read and update their own row (update exists so the app can persist `expo_push_token`). Phone number lookups restricted to server-side functions.
- **circles:** Users can only CRUD their own circles.
- **circle_members:** Users can only CRUD members of their own circles.
- **events:** Owner-only, period — users can SELECT and DELETE their own rows; there are no client INSERT/UPDATE policies at all. Creates and edits go through `save_event` (SECURITY DEFINER, ownership verified) so the frozen/cascade logic cannot be bypassed, recipient copies are written only by `share_event` / `deliver_pending_shares` (definer), and `archived_at` is written only by `set_event_archived` (definer, owner-only). All cross-user writes happen inside those functions.
- **sends:** Readable by the owner of the event they hang off (for ✓ Shared and "Shared with"). Written only by the definer functions.
- **hidden_people:** Owner-only CRUD.
- **affiliate_programs / affiliate_config:** World-readable SELECT (world-readable configuration, not user data — the events ban on `USING (true)` does not apply). No client write policies; activation is service-role SQL.
- **auth.users:** No client access. Account deletion goes through `delete_my_account()` (SECURITY DEFINER, `authenticated` only), which deletes exactly the caller's row.
- **legacy_events / legacy_user_events / legacy_event_shares:** the pre-cutover tables, renamed (not dropped) for a 30-day soak window and revoked from `anon`/`authenticated` so no client path can read stale data. A follow-up migration drops them (and `owns_user_event`) after the soak.

---

## Project Structure

```
events-app/
├── app/
│   ├── (app)/                      # Authenticated screens
│   │   ├── _layout.tsx
│   │   ├── index.tsx               # Calendar (main screen)
│   │   ├── add-event.tsx           # Paste URL or enter details, set date/time
│   │   ├── edit-event.tsx          # Edit screen — one save_event call; any change ends following
│   │   ├── event/[id].tsx          # Event detail — who shared it, share/hide/archive (received) or remove (self-created), Add to calendar export row
│   │   ├── archived.tsx            # Archived drawer — archived received events; Restore is the only action
│   │   ├── onboarding.tsx          # Optional walkthrough — auto-shows once when the calendar is empty
│   │   ├── people.tsx              # My People — manage list, circles, hidden people
│   │   └── share.tsx               # Sharing screen — select people/circles; existing shares show as completed
│   ├── (auth)/                     # Unauthenticated screens
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx
│   │   └── verify.tsx
│   ├── _context/
│   │   └── SessionContext.tsx      # Auth session state
│   └── _layout.tsx                 # Root layout — push notification registration + tap handler
├── components/
│   ├── Calendar.tsx                # Calendar view component
│   ├── ContactsExplainer.tsx       # Pre-OS contacts permission screen
│   ├── ContactsDeniedRecovery.tsx  # Settings + quiet add-number after deny
│   ├── ContactsPermissionFlow.tsx  # Native contacts ask (Share + People)
│   ├── EventCard.tsx               # Event preview (OG image, title, date)
│   ├── ManualAddPersonModal.tsx    # Name + phone fallback (web + deny hatch)
│   ├── PeoplePicker.tsx            # Contact selection for adding to people list
│   └── ShareSheet.tsx              # Sharing UI — people list with circle quick-select
├── constants/
│   └── Colors.ts                   # Theme color tokens
├── docs/                           # This documentation
├── hooks/
│   └── useTheme.ts                 # Theme hook (light/dark)
├── lib/
│   ├── addToCalendar.ts            # Calendar export hand-off (web; .ios/.android variants resolved by Metro)
│   ├── calendarLinks.ts            # Pure Google template URL + RFC 5545 .ics builders (snapshot export)
│   ├── contacts.ts                 # Phone contact access + E.164 normalization
│   ├── showError.ts                # Error display utility
│   ├── supabase.ts                 # Supabase client init
│   └── types.ts                    # TypeScript types matching DB schema
├── manual-tests/                   # Manual regression suite for cloud agents
├── receipt/                        # Who's Coming receipt page (static; events-reply.pages.dev) — answer + calendar links
├── supabase/
│   ├── functions/
│   │   ├── cleanup-people/         # Cron: 6-month auto-removal
│   │   ├── og-metadata/            # Link preview metadata fetch
│   │   ├── send-notification/      # Push + SMS share notifications
│   │   ├── send-response/          # Receipt-page API (no JWT; per-send response_token)
│   │   └── twilio-status/          # SMS delivery-status webhook (Twilio-signed)
│   └── migrations/                 # Applied in filename order
├── __tests__/                      # Jest + React Native Testing Library
├── AGENTS.md                       # Agent/Cursor-specific instructions
├── FEATURES.md                     # Feature specs and implementation status
├── app.config.js
├── eas.json
└── package.json
```

---

## Dependencies

- **expo** (~54) — managed workflow
- **expo-router** — file-based navigation
- **expo-calendar** — iOS permission-free New Event sheet (Add to Other Calendars)
- **expo-contacts** — device contact list access
- **expo-intent-launcher** — Android calendar ACTION_INSERT (Add to Other Calendars)
- **expo-notifications** — push notification registration and handling
- **expo-linear-gradient** — gradient UI elements
- **@react-native-community/datetimepicker** — native date/time picker
- **@supabase/supabase-js** — Supabase client
- **react-native-calendars** — calendar UI component
- **react-native-gesture-handler** — gesture support
- **libphonenumber-js** — phone number normalization to E.164
- **@react-native-async-storage/async-storage** — local persistence (Supabase session)

---

## What's Deliberately Not Here

- No real-time subscriptions (pull on open, not push)
- No image upload or storage (images are just OG URLs)
- No messaging or chat
- No analytics or tracking
- No admin dashboard
- No payment processing

The app fetches fresh data when you open it. That's the entire data sync strategy.

---

## Security Notes

### Firebase API key in `google-services.json`

`google-services.json` is in the repo. The Firebase API key it contains is a **client-side identifier**, not a server secret. Firebase security is enforced through Security Rules and the SHA-1 certificate fingerprint of the app binary, not by keeping this key private.

The practical risk from an exposed Firebase Android API key is billing abuse. To close it, add an **API key restriction** in Google Cloud Console: restrict the key to requests originating from the `com.rkilani.events` package with its signing certificate SHA-1. This eliminates the residual risk.

### Supabase service role key

The `SUPABASE_SERVICE_ROLE_KEY` used by the `send-notification` edge function is a true server secret. It bypasses RLS and grants full database access. It lives only in Supabase edge function environment variables — never in the app, never in git.
