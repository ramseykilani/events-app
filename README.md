# Events App

A React Native (Expo) app for sharing events with your people. Built with Supabase.

## Setup

1. Create a Supabase project at [supabase.com](https://supabase.com).

2. Copy `.env.example` to `.env.local` and add your Supabase URL and anon key:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Enable Phone Auth in Supabase Dashboard > Authentication > Providers > Phone.

4. Run the database migrations in `supabase/migrations/` in order via the Supabase SQL Editor.

5. Deploy the Edge Functions:
   - `og-metadata` - Link preview (OG metadata)
   - `cleanup-people` - Six-month auto-removal of inactive people (schedule via cron)
   - `cleanup-events` - Event data retention (schedule via cron)

6. Start the app:
   ```bash
   npm start
   ```

## Project Structure

- `app/` - Expo Router screens
- `components/` - Reusable UI components
- `lib/` - Supabase client, types, contacts
- `supabase/migrations/` - Database schema and RLS
- `supabase/functions/` - Edge Functions
