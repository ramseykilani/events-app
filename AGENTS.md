# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a React Native (Expo SDK 54) events-sharing app. The frontend runs via the Expo dev server; the backend is a remote Supabase project (Postgres + Auth + Edge Functions). There is no local backend to start.

### Running the app (web mode)

```bash
npx expo start --web --port 8081
```

The app opens at `http://localhost:8081`. This is the only way to test in a headless cloud VM (no iOS/Android simulators available). The web build requires `react-native-web` — it is listed in `package.json` after initial setup.

### Environment variables

The app requires a `.env` file at the repo root with two values (see `.env.example`):

- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable (anon) key

Without real Supabase credentials the UI renders but auth/data calls fail with network errors. To test end-to-end auth flows, real credentials and a configured Supabase project are needed.

### Linting / type checking

There is no ESLint configuration. The only static check available is TypeScript:

```bash
npx tsc --noEmit
```

There are pre-existing TS errors in `app/(app)/onboarding.tsx` and `lib/showError.ts` — these do not block the app from running (Expo uses Babel/Metro for transpilation, not `tsc`).

### Tests

No automated test framework is configured in this project.

### Key gotchas

- `react-native-web` must be installed for web mode to work (`npx expo install react-native-web`). It is already in `package.json` dependencies.
- The Expo dev server reads `.env` automatically — no `dotenv` setup needed.
- Supabase migrations in `supabase/migrations/` must be applied in filename order against the Supabase project before the app functions end-to-end.
- Edge Functions in `supabase/functions/` are Deno/TypeScript (excluded from the main `tsconfig.json`).
