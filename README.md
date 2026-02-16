# Events App

A React Native (Expo) app for sharing events with your people. No feeds, no notifications, no social graph — just a calendar of events shared between people who know each other.

Built with Expo (managed workflow) and Supabase (Postgres, Auth, Edge Functions).

---

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Expo CLI** — comes with `npx`, no global install needed
- **Expo Go** (optional) — install on your phone from the App Store or Google Play to test on a real device
- **Supabase account** — free tier at [supabase.com](https://supabase.com)

---

## 1. Install Dependencies

```bash
cd events-app
npm install
```

---

## 2. Create a Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Pick a name, set a database password, and choose a region close to your users.
3. Wait for the project to finish provisioning (usually under a minute).

### Find your keys

Once the project is ready, go to **Project Settings > API Keys** (in the left sidebar). You need two values:

- **Project URL** — looks like `https://abcdefghijk.supabase.co` (found in **Project Settings > General**)
- **Publishable key** — starts with `sb_publishable_...`. If you don't have one yet, click **Create new API Keys** on the API Keys page. This is the client-side key that's safe to include in app code.

> **Legacy keys:** If your project still shows the older JWT-based keys (`anon` starting with `eyJ...`), those work too but Supabase recommends migrating to the new publishable/secret key format. See [Supabase API Keys docs](https://supabase.com/docs/guides/api/api-keys) for details.

---

## 3. Configure Environment Variables

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

Edit `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://abcdefghijk.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Use your **publishable key** here (or the legacy `anon` key if your project hasn't migrated yet — both work). The `EXPO_PUBLIC_` prefix makes these available to the app at build time. Do not commit this file (it is in `.gitignore`).

---

## 4. Enable Phone Auth

1. In the Supabase Dashboard, go to **Authentication > Providers** (left sidebar).
2. Find **Phone** in the provider list and enable it.
3. For development, you can use the built-in Supabase test OTP. Under **Authentication > Settings**, scroll to "Test Users" or "Test OTP" and add a phone number / OTP pair (e.g. `+15555550100` / `123456`). This lets you sign in without a real SMS provider.
4. For production, connect a real SMS provider (Twilio, MessageBird, or Vonage) under the Phone provider settings. Enter your provider credentials (Account SID, Auth Token, and Messaging Service SID for Twilio).

---

## 5. Run Database Migrations

The app's database schema, security policies, triggers, and functions are defined in SQL migration files. Run them **in order**.

### Option A: Supabase SQL Editor (no CLI needed)

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

If any migration fails, check the error message — it usually means a previous migration wasn't run, or was run out of order.

### Option B: Supabase CLI

If you have the [Supabase CLI](https://supabase.com/docs/guides/cli) installed and linked to your project:

```bash
supabase db push
```

This runs all migrations in the `supabase/migrations/` folder in order.

---

## 6. Deploy Edge Functions

The app uses three Supabase Edge Functions (Deno/TypeScript). You need the [Supabase CLI](https://supabase.com/docs/guides/cli) to deploy them.

### Install the CLI (if you haven't)

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

### Link to your project

```bash
supabase login
supabase link --project-ref your-project-ref
```

Your project ref is the `abcdefghijk` part of your Supabase URL (`https://abcdefghijk.supabase.co`). You can also find it in **Project Settings > General**.

### Deploy the functions

The two cleanup functions are called server-side (from cron), not from the app. Deploy them with `--no-verify-jwt` so they can be called with a secret key instead of a legacy JWT:

```bash
supabase functions deploy og-metadata
supabase functions deploy cleanup-people --no-verify-jwt
supabase functions deploy cleanup-events --no-verify-jwt
```

`og-metadata` is called from the app (which sends the publishable key), so it keeps the default JWT verification.

### What each function does

| Function | Purpose | When it runs |
|----------|---------|-------------|
| `og-metadata` | Fetches Open Graph metadata (title, description, image) from a pasted URL for link previews | Called by the app when a user pastes a URL in the "Add event" screen |
| `cleanup-people` | Removes people from `my_people` who haven't been shared with in 6 months | Scheduled via cron (see below) |
| `cleanup-events` | Deletes event shares, user_events, and events older than 6 months | Scheduled via cron (see below) |

### Schedule the cleanup cron jobs

The two cleanup functions should run on a schedule. In the Supabase Dashboard:

1. Go to **Database > Extensions** and enable the `pg_cron` and `pg_net` extensions if they aren't already.
2. Go to **Project Settings > API Keys** and create a **secret key** (`sb_secret_...`) if you don't have one. This key has elevated privileges and is used to authorize the cron calls.
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

Replace `abcdefghijk` with your project ref and `sb_secret_...` with your **secret key** from **Project Settings > API Keys**.

> **Why a secret key?** The cleanup functions use `SUPABASE_SERVICE_ROLE_KEY` internally (auto-injected by Supabase) to bypass RLS when deleting old data. The secret key in the cron header authorizes the HTTP call to invoke the function. Since the cleanup functions were deployed with `--no-verify-jwt`, they accept the new-format secret key in the `apikey` header.
>
> **Legacy alternative:** If your project hasn't migrated to the new key format, you can use the `service_role` JWT key instead — pass it as `'Authorization', 'Bearer ' || 'your-service-role-key'` and skip the `--no-verify-jwt` flag when deploying.

---

## 7. Start the App

```bash
npm start
```

This launches the Expo dev server. You'll see a QR code and several options:

- **Press `i`** to open in the iOS Simulator (macOS only, requires Xcode)
- **Press `a`** to open in the Android Emulator (requires Android Studio)
- **Scan the QR code** with Expo Go on your phone to run on a real device

### Testing on a real device

1. Make sure your phone and computer are on the same Wi-Fi network.
2. Open Expo Go and scan the QR code from the terminal.
3. The app will load over the network. Changes you save will hot-reload automatically.

### Testing phone auth

If you set up a test OTP in step 4, use that phone number and code to sign in. On a real device with a real SMS provider configured, you'll receive an actual SMS.

---

## Project Structure

```
events-app/
├── app/                           Expo Router file-based routing
│   ├── (auth)/                    Auth screens (unauthenticated)
│   │   ├── sign-in.tsx            Phone number entry
│   │   └── verify.tsx             OTP code verification
│   ├── (app)/                     Main app screens (authenticated)
│   │   ├── index.tsx              Calendar — the main screen
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
