# Events — Technical Architecture

A mid-level architecture overview.

---

## Stack

- **Frontend:** React Native (Expo managed workflow, SDK 54)
- **Backend:** Supabase (Postgres database, Auth, Edge Functions)
- **Auth:** Supabase Phone Auth (SMS OTP)
- **Link Previews:** Supabase Edge Function that fetches Open Graph metadata from pasted URLs
- **Push Notifications:** Expo Push Notifications (via `expo-notifications`)

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
| expo_push_token | text (nullable) | Expo push token, upserted on authenticated app launch |
| created_at | timestamptz | |

The user's name comes from however they appear in your phone's contact list. The app never asks for or stores a display name.

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

**Identity resolution:** `phone_number` is only used at two moments: when inserting a new person (dedup) and when a new user signs up (the onboarding trigger populates `user_id` across all matching my_people rows). All runtime queries use `user_id`, never `phone_number`.

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
| created_by_user_id | uuid (FK → users, NOT NULL) | Who originally created this snapshot. Informational only — does not grant mutation rights over other users' copies. |
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
| user_event_id | uuid (FK → user_events) | |
| person_id | uuid (FK → my_people) | The individual person this event is shared with |
| created_at | timestamptz | |

Unique constraint on (user_event_id, person_id).

When you share an event, the app resolves your selection (circles and/or individuals) into individual person rows. Circles are a UI shortcut — at the data level, sharing is always person-to-person. This also updates last_shared_at on the relevant my_people rows.

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

This is the main query the app runs. It finds all events that have been shared with the current user, excluding events from hidden people:

```
Given: current user's user_id, start_date, end_date
→ Find all my_people rows where user_id = current_user_id (i.e. where other users have added me)
→ Join: event_shares.person_id → my_people.id
→ Join: event_shares.user_event_id → user_events → events
→ LEFT JOIN hidden_people on (owner_id = current_user_id AND person_id = sharer's my_people.id)
→ WHERE hp.id IS NULL (exclude hidden)
→ Return: event details + sharer_contact_name + sharer_person_id + sharer_user_id
→ Filter by date range
```

`sharer_person_id` is the sharer's `my_people.id` in the recipient's contact list. It is returned so the event detail screen can offer a hide/unhide action without a separate lookup.

All joins use user_id, never phone_number. Implemented as a Supabase RPC (Postgres function) for performance.

### "Share this too"

When a user sees an event on their calendar and wants to share it with their own people:

1. Create a user_events row linking the user to that exact event row (same snapshot — all details inherited as-is)
2. User must select who to share with (mandatory)
3. event_shares rows are created (resolved to individual people)
4. last_shared_at updated on relevant my_people rows

---

## Key Flows

### 1. Sign Up

1. User enters phone number
2. Supabase sends SMS OTP
3. User enters code → Supabase creates auth user
4. User record created in users table
5. Database trigger runs: matches phone number against all my_people rows, populates user_id where matched
6. App navigates to the setup-people screen (see flow 2)

### 2. Setting Up Your People

The setup-people screen lives in the `(auth)` group — it runs immediately after sign-up, before the user reaches the main calendar. Contact permission is requested here for the first time.

1. App requests access to device contacts (Expo Contacts API)
2. User selects up to 50 contacts from their phone — these become their in-app people list
3. Phone numbers are normalized to E.164 and stored in my_people
4. App checks which phone numbers already exist in users table and shows a subtle indicator for contacts already on the app
5. User proceeds to the main calendar

Contact permission can also be triggered later from the People screen or when the user taps "Share" — users who skip setup can still add people later. Circles can be set up at any point from the People screen.

### 3. Share an Event (New)

1. User taps the FAB (floating action button) on the calendar screen
2. User enters event details. Two paths:
   - **With URL:** User pastes a URL. App calls the OG metadata Edge Function. Title is auto-filled and editable. User enters or confirms date and time.
   - **Without URL:** User types a title and enters date and time. No link preview.
3. **URL match check (if URL provided):** The app queries for existing events with the same URL. If matches are found, the user is shown the existing entry with a prompt like "This event has already been entered with these details — use these?" They can accept (links to existing row, no duplicate) or dismiss and enter their own details.
4. Event row is created (or matched to an existing row if URL, title, date, and time all exactly match)
5. user_events row is created
6. **Sharing screen (mandatory):** Shows the user's people list (up to 50). Circles appear as quick-select buttons at the top — tapping one selects everyone in that group. The user can also tap individual people. Any combination works.
7. event_shares rows are created (one per person, circles resolved to individuals)
8. last_shared_at updated on relevant my_people rows
9. `send-notification` Edge Function is called fire-and-forget to notify recipients

### 4. Share an Existing Event (From Calendar)

1. User sees an event on their calendar that someone shared with them
2. User taps the event, taps "Share"
3. user_events row is created linking the user to that same event row — all details inherited as-is
4. **Sharing screen (mandatory):** User must select at least one person before confirming
5. event_shares rows created, last_shared_at updated, notifications sent

### 5. Edit an Event (Fork, Not Mutate)

Events are immutable snapshots. Editing creates a fork:

1. User opens an event they've shared and taps edit
2. A new events row is created with the updated fields. created_by_user_id is set to the editing user.
3. The user's existing user_events row is updated to reference the new event_id
4. The old event row remains completely untouched
5. Anyone who previously re-shared the old version still has their version — no propagation, no shared mutation

This means each user's view of an event is their own. Nobody can change your data.

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

A scheduled Supabase Edge Function (`cleanup-events`, cron, runs daily or weekly):

1. Delete event_shares where the associated event's event_date is older than 6 months
2. Delete user_events rows that have no remaining event_shares
3. Delete events rows that have no remaining user_events

Retain only future events and the past 6 months (based on event_date, not created_at). Cascade rules handle orphaned rows. No historical hoarding.

---

## Push Notifications

The `send-notification` Edge Function sends a push notification to each recipient when an event is shared with them.

**Registration:** On authenticated app launch, the app requests notification permissions, obtains the Expo push token, and upserts it to `users.expo_push_token`.

**Sending flow:**
1. `share.tsx` calls the Edge Function fire-and-forget after event_shares are created, passing `userEventId`
2. Function queries all event_shares for that userEventId
3. For each recipient: looks up their push token, checks hidden_people (skips if the sharer is hidden by the recipient), sends via Expo Push API
4. Notification body: `{ title: "[Name] added you to [Event Title]", body: "[date] · [time]", data: { eventId } }`
5. `DeviceNotRegistered` errors from Expo Push API clear the stale token

**Tap handler:** Configured in `app/_layout.tsx` — tapping a notification navigates to `/(app)/event/[eventId]`.

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

- **users:** Users can read their own row. Phone number lookups restricted to server-side functions.
- **circles:** Users can only CRUD their own circles.
- **circle_members:** Users can only CRUD members of their own circles.
- **events:** Readable only if the user created the event (via user_events) or has been shared the event (via event_shares). No global public read access.
- **user_events:** Users can create/delete their own. Readable if the viewer has been shared the event.
- **event_shares:** Creatable by the user_event owner. Readable by the person the event was shared with.
- **hidden_people:** Owner-only CRUD.

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
│   │   ├── event/[id].tsx          # Event detail — who shared it, share/hide button
│   │   ├── onboarding.tsx          # Walkthrough shown after first sign-up
│   │   ├── people.tsx              # My People — manage list, circles, hidden people
│   │   └── share.tsx               # Sharing screen — select people/circles
│   ├── (auth)/                     # Unauthenticated screens
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx
│   │   ├── verify.tsx
│   │   └── setup-people.tsx        # Contact selection — runs immediately after sign-up
│   ├── _context/
│   │   └── SessionContext.tsx      # Auth session state
│   └── _layout.tsx                 # Root layout — push notification registration + tap handler
├── components/
│   ├── Calendar.tsx                # Calendar view component
│   ├── EventCard.tsx               # Event preview (OG image, title, date)
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
