# Setup

Full installation instructions for the Events app.

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
5. Set the phone-auth SMS template (Authentication → Sign In / Up → SMS template, or Management API `sms_template`) to `Events: {{ .Code }} is your sign-in code.` so the verification text names the app. Keep it to one GSM-7 segment.

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

## EAS Builds (Android / iOS)

EAS (Expo Application Services) produces native APK/AAB/IPA builds that run without Expo Go.

### Prerequisites

- [EAS CLI](https://docs.expo.dev/eas/): `npm install -g eas-cli`
- An [Expo](https://expo.dev/) account

### Supabase environment variables (required)

EAS builds do not read your local `.env` — and `eas.json` carries no `env` block — so the Supabase config must exist as EAS project environment variables. Without them the bundle inlines empty values and the app crashes instantly at launch (`createClient` throws at module scope). Do this once:

```bash
eas env:create --environment development --environment preview --environment production \
  --name EXPO_PUBLIC_SUPABASE_URL --value https://your-project.supabase.co --visibility plaintext
eas env:create --environment development --environment preview --environment production \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value sb_publishable_... --visibility plaintext
```

Both values are publishable (they ship inside every client bundle), so plaintext visibility is correct. Inspect or manage them in the EAS dashboard under your project → **Environment variables**, or with `eas env:list --environment preview`.

### google-services.json

`google-services.json` is committed to the repo, so EAS builds pick it up automatically. `app.config.js` also honors a `GOOGLE_SERVICES_JSON` file environment variable if an override is ever needed per environment:

```bash
eas env:create --name GOOGLE_SERVICES_JSON --type file --value "$(cat google-services.json)" --environment preview
```

### Login and build

```bash
eas login

# Internal APK for testing (Android)
eas build --profile preview --platform android

# Production build
eas build --profile production --platform android
```

### Required for native builds

The following are needed in EAS builds but not in Expo Go (which bundles them itself). If the app crashes instantly on launch, one of these is the likely cause:

| Requirement | Why | Fix |
|------------|-----|-----|
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS environment variables | The bundle inlines them at build time; with neither set, `createClient` used to throw at module scope = instant crash (2026-08-15 incident; the client now falls back to a placeholder so a missing config degrades to failing data calls instead). | See "Supabase environment variables (required)" above |
| `expo-splash-screen` | Expo Router uses it to control when the splash screen hides. Missing = instant crash. | `npx expo install expo-splash-screen` |
| `edgeToEdgeEnabled: true` in `app.config.js` | Requires `react-native-edge-to-edge` in native builds. Expo Go ignores it. | Install `react-native-edge-to-edge` or remove the flag |
| New architecture (`newArchEnabled`) | **Currently set to `false`** — disabled due to a `react-native-screens` bug ([`ScreenStack.getChildDrawingOrder()` off-by-one](https://github.com/software-mansion/react-native-screens/issues)) that causes an instant crash on Android in native builds. Re-enable once `react-native-screens` ships a fix. When re-enabling, test with a development build on Android first. | Set `newArchEnabled: true` in `app.config.js` and rebuild |

### Getting crash logs without ADB

If the APK crashes silently, the easiest way to see the error is to build a **development build** instead, which shows a red error screen:

```bash
npx expo install expo-dev-client
eas build --profile development --platform android
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
