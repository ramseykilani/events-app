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

## Setup

See [SETUP.md](SETUP.md) for full installation instructions, environment configuration, database migrations, edge function deployment, and EAS build setup.
