# Events App

A React Native (Expo) app for sharing events with your people. No feeds, no notifications, no social graph — just a calendar of events shared between people who know each other.

Built with Expo (managed workflow) and Supabase (Postgres, Auth, Edge Functions).

---

## Why This Exists

Most event apps try to be social networks. This one doesn't. The idea is simple: you find something you want to go to, you add it, and you share it with the right people. When they share something back, it shows up on your calendar. That's it.

There's no public profile, no follower count, no algorithmic feed. You pick up to 50 people from your contacts, group them into circles, and share events with whoever makes sense. If someone you know is also on the app, their events appear on your calendar automatically.

---

## Features

- **Calendar view** — Your home screen is a calendar. Tap a day to see events. Pull to refresh.
- **Add from a link** — Paste a URL and the title, description, and image fill in automatically via Open Graph metadata. Or create an event from scratch.
- **Share with people and circles** — After creating an event, pick who sees it. Select individuals, tap a circle to select a whole group, or mix and match.
- **My People** — Import up to 50 people from your phone contacts. The app stores their phone number and resolves it to a user account automatically — both when you add the contact and when that person signs up.
- **Circles** — Named groups of your people (e.g. "Close friends", "Work", "Basketball"). Makes sharing faster.
- **Event detail** — View full event info, open the original link, reshare to more people, edit your copy, or delete events you created.
- **Onboarding** — A short walkthrough for new users explaining how the app works.
- **Phone auth** — Sign in with your phone number via SMS OTP. No passwords, no email.
- **Data retention** — Automated weekly cleanup removes events older than 6 months and people you haven't shared with in 6 months.

---

## How It Works

### Data Model

The database has seven tables:

| Table | Purpose |
|-------|---------|
| `users` | Extends Supabase `auth.users` with a phone number |
| `my_people` | Your curated contact list (max 50). Each row is a phone number you've imported, optionally resolved to a `users` row |
| `circles` | Named groups of your people |
| `circle_members` | Join table between circles and people |
| `events` | Immutable event snapshots (URL, title, description, image, date, time). Deduplicated by URL + title + date + time |
| `user_events` | Ownership — links a user to an event they've added to their calendar |
| `event_shares` | Routing — links a `user_event` to a person it was shared with |

### Sharing Flow

1. You create an event (or the app deduplicates against an existing one).
2. A `user_events` row is created linking you to that event.
3. You pick people/circles on the share screen. An `event_shares` row is created for each person.
4. When that person opens their calendar, `get_calendar_events` finds shares targeting them (via `my_people.user_id`) and returns those events.

### Phone Number Resolution

Sharing relies on linking `my_people` rows to actual user accounts via `my_people.user_id`. This is resolved in two directions:

- **When a contact is added** — A BEFORE INSERT trigger on `my_people` looks up `users` by phone number and sets `user_id` immediately if the person is already registered.
- **When a user signs up** — An AFTER INSERT trigger on `users` finds any `my_people` rows with a matching phone number and sets their `user_id`.

Both triggers use flexible phone matching (ignoring a leading `+`) to handle format differences between Supabase Auth and `libphonenumber-js` E.164 normalization.

### Security

Every table has Row-Level Security (RLS) enabled. Policies ensure:

- You can only read/write your own people, circles, and events.
- You can only see events that were shared with you or that you created.
- Sensitive operations (user creation, calendar queries) use `SECURITY DEFINER` functions to avoid RLS recursion.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile app | [React Native](https://reactnative.dev/) via [Expo](https://expo.dev/) (managed workflow) |
| Routing | [Expo Router](https://docs.expo.dev/router/introduction/) (file-based) |
| Backend | [Supabase](https://supabase.com/) (Postgres, Auth, Edge Functions) |
| Auth | Phone number + SMS OTP via Supabase Auth |
| Database | PostgreSQL with RLS, triggers, and RPC functions |
| Edge Functions | Deno/TypeScript (link preview fetching, scheduled cleanup) |
| Language | TypeScript throughout |

---

## Getting Started

### Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Expo CLI** — comes with `npx`, no global install needed
- **Expo Go** (optional) — install on your phone from the App Store or Google Play to test on a real device
- **Supabase account** — free tier at [supabase.com](https://supabase.com)

---

### 1. Install Dependencies

```bash
cd events-app
npm install
```

---

### 2. Create a Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Pick a name, set a database password, and choose a region close to your users.
3. Wait for the project to finish provisioning (usually under a minute).

#### Find your keys

Once the project is ready, go to **Project Settings > API Keys** (in the left sidebar). You need two values:

- **Project URL** — looks like `https://abcdefghijk.supabase.co` (found in **Project Settings > General**)
- **Publishable key** — starts with `sb_publishable_...`. If you don't have one yet, click **Create new API Keys** on the API Keys page.

---

### 3. Configure Environment Variables

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

Edit `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://abcdefghijk.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

The `EXPO_PUBLIC_` prefix makes these available to the app at build time. Do not commit this file (it is in `.gitignore`).

---

### 4. Enable Phone Auth

1. In the Supabase Dashboard, go to **Authentication > Providers** (left sidebar).
2. Find **Phone** in the provider list and enable it.
3. For development, you can use the built-in Supabase test OTP. Under **Authentication > Settings**, scroll to "Test Users" or "Test OTP" and add a phone number / OTP pair (e.g. `+15555550100` / `123456`). This lets you sign in without a real SMS provider.
4. For production, connect a real SMS provider (Twilio, MessageBird, or Vonage) under the Phone provider settings. Enter your provider credentials (Account SID, Auth Token, and Messaging Service SID for Twilio).

---

### 5. Run Database Migrations

The app's database schema, security policies, triggers, and functions are defined in SQL migration files. Run them **in order**.

#### Option A: Supabase SQL Editor (no CLI needed)

1. In the Supabase Dashboard, go to **SQL Editor** (left sidebar).
2. Open each file below (from `supabase/migrations/`), paste its contents into the editor, and click **Run**. Do them one at a time, in order:

| File | What it does |
|------|-------------|
| `20240216000001_schema.sql` | Creates all tables (`users`, `my_people`, `circles`, `circle_members`, `events`, `user_events`, `event_shares`) with indexes and constraints |
| `20240216000002_triggers.sql` | Creates triggers that auto-create a `users` row on signup and resolve `my_people.user_id` when a new user's phone number matches |
| `20240216000003_rls.sql` | Enables Row-Level Security on all tables and creates access policies (who can read/write what) |
| `20240216000004_calendar_rpc.sql` | Creates the `get_calendar_events` RPC function used by the calendar screen to fetch events shared with you |
| `20240216000005_fifty_person_cap.sql` | Creates a trigger that enforces the 50-person limit on `my_people` |
| `20240216000006_cleanup_functions.sql` | Creates the `cleanup_old_events` SQL function for data retention |
| `20240216000007_events_public_select.sql` | Corrects the events SELECT policy so events are only readable by their creator, owner, or share recipient |
| `20240216000008_find_or_create_event.sql` | Creates the `find_or_create_event` RPC that handles event dedup server-side |
| `20240216000009_ensure_user_rpc.sql` | Creates the `ensure_user_exists` RPC for reliable user-row creation on first sign-in, and fixes RLS recursion on `event_shares` SELECT |
| `20240216000010_fix_event_shares_insert_delete_recursion.sql` | Breaks remaining RLS recursion between `event_shares` and `user_events` using a `SECURITY DEFINER` helper; replaces SELECT/INSERT/DELETE policies on `event_shares` |
| `20240216000011_fix_calendar_events_owned.sql` | Rewrites `get_calendar_events` RPC to also return events the user owns (not just events shared with them) |
| `20260217000000_allow_event_delete.sql` | Adds an RLS policy allowing users to delete events they created |
| `20260217000001_fix_delete_cascade.sql` | Adds RLS policies so the event creator can cascade-delete related `user_events` and `event_shares` rows |
| `20260218000000_resolve_my_people_user_id_on_insert.sql` | Adds a BEFORE INSERT trigger on `my_people` to resolve `user_id` immediately when a contact is added for an existing user, and updates `ensure_user_exists` to correct placeholder phone numbers |
| `20260218000001_fix_user_phone_and_rebackfill.sql` | Syncs `users.phone_number` from `auth.users.phone`, re-resolves `my_people.user_id` with flexible phone matching (handles `+` prefix differences), and updates all phone-matching triggers and functions |

If any migration fails, check the error message — it usually means a previous migration wasn't run, or was run out of order.

#### Option B: Supabase CLI

If you have the [Supabase CLI](https://supabase.com/docs/guides/cli) installed and linked to your project:

```bash
supabase db push
```

This runs all migrations in the `supabase/migrations/` folder in order.

---

### 6. Deploy Edge Functions

The app uses three Supabase Edge Functions (Deno/TypeScript). You need the [Supabase CLI](https://supabase.com/docs/guides/cli) to deploy them.

#### Install the CLI (if you haven't)

See the [official install docs](https://supabase.com/docs/guides/cli/getting-started) for the latest instructions. Common methods:

```bash
# macOS
brew install supabase/tap/supabase

# Windows (Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# npm (via the npx wrapper — no global install needed)
npx supabase <command>
```

#### Link to your project

```bash
supabase login
supabase link --project-ref your-project-ref
```

Your project ref is the `abcdefghijk` part of your Supabase URL (`https://abcdefghijk.supabase.co`). You can also find it in **Project Settings > General**.

#### Deploy the functions

The two cleanup functions are called server-side (from cron), not from the app. Deploy them with `--no-verify-jwt` so they can be invoked with a secret key:

```bash
supabase functions deploy og-metadata
supabase functions deploy cleanup-people --no-verify-jwt
supabase functions deploy cleanup-events --no-verify-jwt
```

#### What each function does

| Function | Purpose | When it runs |
|----------|---------|-------------|
| `og-metadata` | Fetches Open Graph metadata (title, description, image) from a pasted URL for link previews | Called by the app when a user pastes a URL in the "Add event" screen |
| `cleanup-people` | Removes people from `my_people` who haven't been shared with in 6 months | Scheduled via cron (see below) |
| `cleanup-events` | Deletes event shares, user_events, and events older than 6 months | Scheduled via cron (see below) |

#### Schedule the cleanup cron jobs

The two cleanup functions should run on a schedule. In the Supabase Dashboard:

1. Go to **Database > Extensions** and enable the `pg_cron` and `pg_net` extensions if they aren't already.
2. Go to **Project Settings > API Keys** and create a **secret key** if you don't have one.
3. Go to **SQL Editor** and run:

```sql
-- Run people cleanup weekly (Sunday at 3am UTC)
SELECT cron.schedule(
  'cleanup-people-weekly',
  '0 3 * * 0',
  $$SELECT net.http_post(
    url := 'https://abcdefghijk.supabase.co/functions/v1/cleanup-people',
    headers := jsonb_build_object(
      'apikey', 'sb_secret_...'
    )
  );$$
);

-- Run events cleanup weekly (Sunday at 4am UTC)
SELECT cron.schedule(
  'cleanup-events-weekly',
  '0 4 * * 0',
  $$SELECT net.http_post(
    url := 'https://abcdefghijk.supabase.co/functions/v1/cleanup-events',
    headers := jsonb_build_object(
      'apikey', 'sb_secret_...'
    )
  );$$
);
```

Replace `abcdefghijk` with your project ref and `sb_secret_...` with your secret key from **Project Settings > API Keys**.

---

### 7. Start the App

```bash
npm start
```

This launches the Expo dev server. You'll see a QR code and several options:

- **Press `i`** to open in the iOS Simulator (macOS only, requires Xcode)
- **Press `a`** to open in the Android Emulator (requires Android Studio)
- **Scan the QR code** with Expo Go on your phone to run on a real device

#### Testing on a real device

1. Make sure your phone and computer are on the same Wi-Fi network.
2. Open Expo Go and scan the QR code from the terminal.
3. The app will load over the network. Changes you save will hot-reload automatically.

#### Testing phone auth

If you set up a test OTP in step 4, use that phone number and code to sign in. On a real device with a real SMS provider configured, you'll receive an actual SMS.

---

## Project Structure

```
events-app/
├── app/                           Expo Router file-based routing
│   ├── (auth)/                    Auth screens (unauthenticated)
│   │   ├── _layout.tsx            Auth stack layout
│   │   ├── sign-in.tsx            Phone number entry
│   │   ├── verify.tsx             OTP code verification
│   │   └── setup-people.tsx       Import contacts during onboarding
│   ├── (app)/                     Main app screens (authenticated)
│   │   ├── _layout.tsx            App stack layout
│   │   ├── index.tsx              Calendar — the main screen
│   │   ├── onboarding.tsx         Welcome walkthrough for new users
│   │   ├── add-event.tsx          Create a new event (URL or manual)
│   │   ├── edit-event.tsx         Edit an event (creates a fork)
│   │   ├── event/[id].tsx         Event detail view
│   │   ├── share.tsx              Select people/circles to share with
│   │   └── people.tsx             Manage your people list and circles
│   ├── context/
│   │   └── SessionContext.tsx      Auth session state provider
│   └── _layout.tsx                Root layout with auth routing
├── components/
│   ├── Calendar.tsx               Calendar view with day selection
│   ├── EventCard.tsx              Event preview card (image, title, date)
│   ├── ShareSheet.tsx             People list with circle quick-select
│   └── PeoplePicker.tsx           Device contact picker modal
├── lib/
│   ├── supabase.ts                Supabase client initialization
│   ├── contacts.ts                Device contacts access + E.164 normalization
│   ├── showError.ts               Verbose error dialog for debugging
│   └── types.ts                   TypeScript types matching the DB schema
├── supabase/
│   ├── migrations/                SQL migrations (schema, RLS, RPCs, triggers)
│   └── functions/                 Edge Functions (Deno/TypeScript)
│       ├── og-metadata/           Link preview metadata fetcher
│       ├── cleanup-people/        6-month inactive people removal
│       └── cleanup-events/        6-month event data retention
├── .env.example                   Environment variable template
├── app.json                       Expo configuration
├── package.json                   Dependencies and scripts
└── tsconfig.json                  TypeScript configuration
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the Expo dev server |
| `npm run ios` | Start and open in iOS Simulator |
| `npm run android` | Start and open in Android Emulator |
| `npm run web` | Start and open in the browser |
| `npm test -- --runInBand` | Run automated regression tests |
| `npm run test:watch` | Run Jest in watch mode |
| `npm run test:coverage` | Generate test coverage report |
| `npm run test:manual` | Run manual-suite preflight and print instructions |
| `npm run test:manual:strict` | Manual-suite preflight with strict failure checks |
| `npm run test:manual:start` | Manual-suite preflight then start Expo web server |

---

## Manual Regression (for cloud agents)

1. Run `npm run test:manual`.
2. Start app in web mode (`npx expo start --web --port 8081`) if not already running.
3. Execute scenarios in `manual-tests/cloud_manual_regression.md`.
4. Record results in `manual-tests/manual_test_report_template.md`.

---

## Testing in Cursor Cloud (with copy/paste prompts)

### A) Run automated regression tests

From repo root:

```bash
npm test -- --runInBand
```

Optional:

```bash
npm run test:coverage
```

**Prompt for a new agent (automated tests):**

```text
Run the automated regression suite for this repo. Execute `npm test -- --runInBand` and report failures with root-cause analysis. If tests fail, fix issues and re-run until green, then summarize what changed.
```

### B) Run manual regression tests (agent + computer-use)

1. Run strict preflight:

```bash
npm run test:manual:strict
```

2. Start the app for manual testing:

```bash
npm run test:manual:start
```

3. Execute scenarios in `manual-tests/cloud_manual_regression.md`.
4. Record outcomes in `manual-tests/manual_test_report_template.md`.
5. Attach screenshots/videos for executed scenarios.

**Prompt for a new agent (manual suite):**

```text
Run the manual regression suite for this repo. Start with `npm run test:manual:strict`, then run `npm run test:manual:start` to launch Expo web on port 8081. Execute all Core scenarios in `manual-tests/cloud_manual_regression.md` using computer-use, capture a demo video plus key screenshots, and fill `manual-tests/manual_test_report_template.md` with pass/fail + artifact paths. Then summarize results and blockers.
```
