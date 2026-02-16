# Events App

A React Native (Expo) app for sharing events with your people. Built with Supabase.

## Setup

1. Create a Supabase project at [supabase.com](https://supabase.com).

2. Copy `.env.example` to `.env` and add your Supabase URL and anon key:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Enable Phone Auth in Supabase Dashboard > Authentication > Providers > Phone.

4. Run the database migrations in `supabase/migrations/` **in order** via the Supabase SQL Editor (or `supabase db push` if using the Supabase CLI):
   - `20240216000001_schema.sql` — Tables and indexes
   - `20240216000002_triggers.sql` — Auth and identity resolution triggers
   - `20240216000003_rls.sql` — Row-Level Security policies
   - `20240216000004_calendar_rpc.sql` — Calendar query RPC
   - `20240216000005_fifty_person_cap.sql` — 50-person cap trigger
   - `20240216000006_cleanup_functions.sql` — Cleanup SQL functions
   - `20240216000007_events_public_select.sql` — Events SELECT policy fix
   - `20240216000008_find_or_create_event.sql` — Dedup RPC for event creation

5. Deploy the Edge Functions:
   - `og-metadata` — Link preview (fetches Open Graph metadata from URLs)
   - `cleanup-people` — Six-month auto-removal of inactive people (schedule via cron)
   - `cleanup-events` — Event data retention cleanup (schedule via cron)

6. Install dependencies and start the app:
   ```bash
   npm install
   npm start
   ```

## Project Structure

```
app/
  (auth)/          Sign-in and OTP verification screens
  (app)/           Authenticated screens (calendar, events, sharing, people)
  context/         Session context provider
  _layout.tsx      Root layout with auth routing
components/        Reusable UI (Calendar, EventCard, ShareSheet, PeoplePicker)
lib/               Supabase client, TypeScript types, contacts helper
supabase/
  migrations/      Database schema, RLS policies, and RPC functions
  functions/       Edge Functions (og-metadata, cleanup-people, cleanup-events)
```
