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

- **events** = immutable snapshots. Each one is a declaration: "here is an event, as I understand it." Once created, an event row is never mutated.
- **user_events** = ownership of that declaration. This user created or adopted this snapshot.
- **event_shares** = routing edges. This declaration was shared with this person.
- **Edits fork; they never mutate shared state.** If you correct a time or title, a new snapshot is created. Anyone who already re-shared the old version keeps their version. Your data is your data — nobody else can change it.

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
| id | uuid (PK) | |
| created_by_user_id | uuid (FK → users, nullable) | Who originally created this snapshot. Informational only — does not grant mutation rights over other users' copies. NULL once the creator deletes their account (FK is ON DELETE SET NULL so snapshots survive their creator). |
| url | text (nullable) | Link to the public event listing. Optional — linkless events like "park hang 4pm" are valid. |
| title | text (nullable) | Auto-filled from OG metadata if URL provided, editable by the user |
| description | text (nullable) | From OG metadata |
| image_url | text (nullable) | From OG metadata |
| event_date | date | |
| event_time | time (nullable) | |
| created_at | timestamptz | |

Check constraint: `url IS NOT NULL OR title IS NOT NULL` — every event must have at least a URL or a title.

Unique constraint on (url, title, event_date, event_time) for dedup when all fields match exactly. Two people can share the same URL with different titles or times — those are separate snapshots.

**Events are immutable.** Once created, an event row is never updated. Edits create a new row (see Editing Flow below).

**user_events**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | The person who owns this declaration |
| event_id | uuid (FK → events) | |
| created_at | timestamptz | |

Unique constraint on (user_id, event_id).

**event_shares**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| user_event_id | uuid (FK → user_events) | The sharer's copy the share was made from |
| person_id | uuid (FK → my_people) | The individual person this event was shared with |
| created_at | timestamptz | When the share happened |

Unique constraint on (user_event_id, person_id).

**Sharing is forwarding.** Sharing an event with someone delivers them their own `user_events` copy of the same snapshot at share time (via the `share_event` RPC) — like forwarding a text. A share is a completed action and cannot be unsent; removing your own copy never affects anyone else's calendar.

`event_shares` is the *record* of that action, not the delivery mechanism. It drives the "Shared with" list, notification sends, "Shared by X" attribution, and pending delivery for contacts without an account (their copies arrive on sign-up via the `deliver_pending_shares` trigger). Recipients' calendar visibility does NOT depend on `event_shares`.

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

### Indexes

Add indexes on the following columns to prevent the calendar query from degrading as data grows:

- `my_people.owner_id`
- `my_people.user_id`
- `event_shares.person_id`
- `user_events.user_id`
- `events.event_date`

### Cascade Rules

- Deleting a my_people row cascades to related circle_members, event_shares, and hidden_people rows
- Deleting a user_events row cascades to related event_shares rows

---

## Core Queries

### "Show me my calendar" (`get_calendar_events` RPC)

This is the main query the app runs. Every row it returns is one of the caller's own `user_events` copies — sharing delivers copies, so visibility never depends on someone else's rows. `event_shares` is only consulted for attribution and the hide filter:

```
Given: current user's user_id, start_date, end_date
→ Guard: raise unless p_user_id = auth.uid() (the function is SECURITY DEFINER)
→ Base: the caller's own user_events → events, filtered by date range
→ Attribution: for each event, the most recent incoming share of the same
  snapshot (event_shares → sharer's user_events where the share's my_people
  contact resolves to the caller) from a person the caller has NOT hidden
→ Hide filter: suppress an event only if it has at least one incoming share
  and ALL incoming shares are from hidden people; events with no incoming
  shares (added by the caller) always show
→ Return: event details + sharer_contact_name + sharer_person_id +
  sharer_user_id (null sharer name/person for self-added events;
  sharer_user_id falls back to the caller). sharer_contact_name is the
  caller's own contact_name for the sharer when present, else the sharer's
  display_name, else NULL (no "From X" line rendered)
```

`sharer_person_id` is the sharer's `my_people.id` in the recipient's contact list. It is returned so the event detail screen can offer a hide/unhide action without a separate lookup.

All joins use user_id, never phone_number. Implemented as a Supabase RPC (Postgres function) for performance.

### "Share this too"

When a user sees an event on their calendar and wants to share it with their own people:

1. Ensure the user has their own user_events row for that exact event row (they normally do already — received events arrive as copies)
2. User must select who to share with (mandatory)
3. The `share_event` RPC records event_shares rows (resolved to individual people) and delivers each recipient who has an account their own user_events copy
4. last_shared_at updated on relevant my_people rows (inside the RPC)

---

## Key Flows

### 1. Sign Up

1. User enters phone number
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
3. **URL match check (if URL provided):** The app queries for existing events with the same URL. If matches are found, the user is shown the existing entry with a prompt like "This event has already been entered with these details — use these?" They can accept (links to existing row, no duplicate) or dismiss and enter their own details.
4. Event row is created (or matched to an existing row if URL, title, date, and time all exactly match)
5. user_events row is created
6. **Sharing screen (mandatory):** Shows the user's people list (up to 50). Circles appear as quick-select buttons at the top — tapping one selects everyone in that group. The user can also tap individual people. Any combination works.
7. The `share_event` RPC records event_shares rows (one per person, circles resolved to individuals) and delivers each recipient who has an account their own user_events copy — contacts without an account get theirs on sign-up
8. last_shared_at updated on relevant my_people rows (inside the RPC)
9. `send-notification` Edge Function is called fire-and-forget with the newly shared person ids, and notifies only those recipients (KI-003 — an additive share must not re-ping people already on the event)

### 4. Share an Existing Event (From Calendar)

1. User sees an event on their calendar that someone shared with them — it is already their own copy (forwarding)
2. User taps the event, taps "Share"
3. If the user somehow has no user_events row for the snapshot yet, one is created (adopt)
4. **Sharing screen (mandatory):** User must select at least one person before confirming. People the event was already shared with render as completed actions ("✓ Shared") and cannot be deselected — a share delivers the recipient their own copy, so it can't be unsent
5. `share_event` records the new shares and delivers copies; notifications are sent to the newly shared people only

There is no unshare. The share sheet is additive: it shows existing shares as done and only offers people who don't have the event yet.

### 5. Edit an Event (Fork, Not Mutate)

Events are immutable snapshots. Editing creates a fork:

1. User opens an event they've shared and taps edit
2. A new events row is created with the updated fields. created_by_user_id is set to the editing user.
3. The user's existing user_events row is updated to reference the new event_id
4. The old event row remains completely untouched
5. Anyone who previously re-shared the old version still has their version — no propagation, no shared mutation

If the edited fields exactly match a snapshot the user already owns (unique constraint on user_events), the app merges into that existing copy: shares the old copy had that the target lacks are moved over, then the old user_events row is deleted.

This means each user's view of an event is their own. Nobody can change your data.

### 5a. Remove an Event

Removing an event from your calendar deletes only your own user_events row (your event_shares share records cascade with it). Because sharing delivered everyone their own copy up front, this is purely personal — nobody else's calendar changes when you remove an event, whether you created it or re-shared it. The events row itself is never deleted by the app; snapshots with no remaining user_events are reclaimed by the `cleanup-events` cron job.

### 5b. Delete Account

"Delete account" sits at the bottom of the People screen (below Sign out, destructive-styled) behind a single confirm dialog. Confirming calls the `delete_my_account()` RPC (SECURITY DEFINER, granted to `authenticated` only), which deletes the caller's own `auth.users` row — client-side auth-user deletion isn't possible with the anon key, so the RPC is the deletion path. The app then signs out locally; SessionContext routes to sign-in.

The cascades do the rest: `public.users` (and with it the push token), `my_people`, `circles`, `hidden_people`, `user_events`, and `event_shares` all die with the account. Other users' `my_people` rows pointing at the deleted account get `user_id` SET NULL — the contact reverts to a pending phone-number entry, so future shares get the non-app SMS and a re-signup triggers pending-share delivery. Events the deleted user created stay on recipients' calendars with `created_by_user_id` SET NULL; snapshots left with zero owners are reclaimed by `cleanup-events`. Re-signing up with the same phone number starts a clean account.

### 6. Hide / Unhide a Person

1. User opens an event detail for an event someone else shared with them
2. A "Hide [name]" button appears at the bottom (the sharer's name is known via `sharer_person_id` from the calendar RPC)
3. Tapping Hide inserts a hidden_people row and navigates back — the person's events immediately disappear from the calendar (server-side filter)
4. If the person is already hidden, the button reads "Unhide [name]" — tapping it deletes the hidden_people row and their events reappear
5. The People screen shows a "Hidden" section at the bottom listing all hidden people, each with an "Unhide" button

### 7. Six-Month Auto-Removal (Declutter People)

A scheduled Supabase Edge Function (`cleanup-people`, cron, runs daily or weekly):

1. Query my_people where last_shared_at is older than 6 months (or null and added_at is older than 6 months)
2. Delete those rows (cascades to circle_members, event_shares, and hidden_people)
3. No notification to anyone. They quietly disappear from the list.

This keeps the user's people list clean and relevant. Users can always re-add someone from their phone contacts.

### 8. Event Data Retention

A scheduled Supabase Edge Function (`cleanup-events`, cron, runs daily or weekly) calls `cleanup_old_events()`, which does exactly one thing:

1. Delete events rows that have no remaining user_events (orphaned snapshots)

Under forwarding semantics every user_events row is someone's personal copy, so cleanup never deletes user_events or event_shares — only snapshots nobody owns anymore. Old events simply age off screens as dates pass; there is no hard expiry of anyone's data.

---

## Notifications (Push + SMS)

The `send-notification` Edge Function sends a push notification and/or SMS to each recipient when an event is shared with them.

**Registration (push):** On authenticated app launch, the app requests notification permissions, obtains the Expo push token, and upserts it to `users.expo_push_token`.

**Sending flow:**
1. `share.tsx` calls the Edge Function fire-and-forget after event_shares are created, passing `userEventId`
2. The function requires a valid user JWT and verifies the caller owns that user_events row — otherwise 401/403
3. Function queries all event_shares for that userEventId, including `my_people.phone_number`, and fetches the event's `url`
4. Fetches the sharer's `users.phone_number` and `users.display_name` once. Attribution order for app users: the recipient's own `contact_name` for the sharer → `display_name` → phone. For non-app users: `display_name` → phone. (The share screen gates sharing on a saved display name, so the phone fallback is pre-feature legacy state.)
5. For each recipient:
   - **Non-app user** (`my_people.user_id IS NULL`): sends an SMS with event info and the event URL (when present) — no app/web links; the SMS is the whole message
   - **App user** (`my_people.user_id IS NOT NULL`): checks whether the sharer is in the recipient's hidden_people (lookup is by the recipient's my_people; skips both push and SMS if hidden), then queues a push notification when a token exists and an SMS containing the event URL (when present). Push is the tappable path into the event; the SMS is a plain notification with no links. A missing push token never suppresses the SMS.
6. Push messages are batch-sent to the Expo Push API; SMS messages are fired concurrently via the Twilio REST API
7. `DeviceNotRegistered` errors from Expo Push API clear the stale token
8. SMS failures are logged via `console.error` and never propagate — missing Twilio credentials silently disable SMS

**Push notification body:** `{ title: "[Name] wants to go to [Event Title] with you", body: "[date], [time]", data: { eventId } }`

**SMS body (app user and non-app user — identical):** `"[Name] wants to go to [EventTitle] with you\n[DateStr], [TimeStr]\n[DescriptionExcerpt]\n[EventURL]\n\nReply STOP to unsubscribe."` — the title is quoted when present and falls back to `wants to go to an event with you` when null; the description excerpt (word-boundary truncated at 90 chars) and the event URL line are each omitted when absent. Name is the recipient's `contact_name` → `display_name` → phone for app users, and `display_name` → phone for non-app users. Titles and descriptions are normalized to GSM-7-safe punctuation so one stray character can't force UCS-2 segment pricing.

SMS deliberately carries no app or web links (decision 2026-08-09, see `docs/distribution-strategy.md`): the only URL in a message is the event's own original URL. This keeps first impressions off the web build and link-free SMS reads less like spam to carrier filters. Store links may return as the non-app CTA once the app is listed.

**Tap handler (push):** Configured in `app/_layout.tsx` — tapping a notification navigates to `/(app)/event/[eventId]`.

**Required Supabase secrets:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, plus a sender (`TWILIO_MESSAGING_SERVICE_SID` preferred, `TWILIO_PHONE_NUMBER` as fallback). No other secrets gate SMS.

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
- **events:** Readable only if the user owns a copy (via user_events), created the snapshot, or has been shared the event (via event_shares). No global public read access. No delete policy — the app never deletes events rows (see "Remove an Event"); orphaned rows are reclaimed by the cleanup cron.
- **user_events:** Users can create/delete their own. Copies for other users' recipients are created only by the `share_event` RPC (SECURITY DEFINER), which verifies the caller owns the user_event being shared.
- **event_shares:** Creatable by the user_event owner (via `share_event`). Readable by the share owner and by the person the event was shared with.
- **hidden_people:** Owner-only CRUD.
- **auth.users:** No client access. Account deletion goes through `delete_my_account()` (SECURITY DEFINER, `authenticated` only), which deletes exactly the caller's row.

---

## Project Structure

```
events-app/
├── app/
│   ├── (app)/                      # Authenticated screens
│   │   ├── _layout.tsx
│   │   ├── index.tsx               # Calendar (main screen)
│   │   ├── add-event.tsx           # Paste URL or enter details, set date/time
│   │   ├── edit-event.tsx          # Edit screen — creates a fork, not a mutation
│   │   ├── event/[id].tsx          # Event detail — who shared it, share/hide/remove buttons
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
│   ├── contacts.ts                 # Phone contact access + E.164 normalization
│   ├── showError.ts                # Error display utility
│   ├── supabase.ts                 # Supabase client init
│   └── types.ts                    # TypeScript types matching DB schema
├── manual-tests/                   # Manual regression suite for cloud agents
├── supabase/
│   ├── functions/
│   │   ├── cleanup-events/         # Cron: purge old event data
│   │   ├── cleanup-people/         # Cron: 6-month auto-removal
│   │   ├── og-metadata/            # Link preview metadata fetch
│   │   └── send-notification/      # Push notification dispatch
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
- **expo-contacts** — device contact list access
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
