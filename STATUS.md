# Status

Living state for the release pipeline. **Agents: read this before any release
or build work, and update it whenever you change any of it.** Feature specs
live in `FEATURES.md`; how work flows lives in `docs/development-workflow.md`;
this file is where things stand right now.

## Store enrollment

| Store | State | Date |
|-------|-------|------|
| Apple Developer Program | Active (App Store Connect access confirmed, agreements accepted) | 2026-08-12 |
| Play Console | Personal account; identity verification in progress | 2026-08-12 |
| Expo | Account active; EAS project linked (`app.config.js` → `extra.eas.projectId`) | — |

## Secrets

| Secret | Where | State |
|--------|-------|-------|
| `EXPO_TOKEN` | Cursor + GitHub | Added 2026-08-12 |
| `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`, `EXPO_ASC_API_KEY_P8_BASE64` | Cursor + GitHub | Pending — owner creates the ASC API key (AGENTS.md → Native builds) |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Cursor + GitHub | Pending — blocked on Play identity verification, then service-account setup |

## Code state

- `staging`: `d7f9433` — launch-crash fix (EAS Supabase env vars + `lib/supabase.ts` placeholder fallback); full suite green 2026-08-15.
- `production`: `7e7c2b4` — deployed 2026-08-15 (https://shared-events.pages.dev).
  Release review: `manual-tests/manual_test_report_2026-08-15-release.md`.

## Latest native builds

| Profile | Platform | Date | Link | State |
|---------|----------|------|------|-------|
| preview (internal APK) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/5f477380-e794-46e1-a5cc-1b8ba70cb336 | Built from `d7f9433` (full suite green). Bundle verified to contain the real Supabase URL. Awaiting owner smoke (`manual-tests/native_device_smoke.md`). Testers must not get this until that pass. |
| preview (superseded — do not distribute) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/3c0f99e5-aa69-464c-a204-9166682e5974 | FAILED owner smoke: crashed instantly at launch. Root cause: the EAS project had no `EXPO_PUBLIC_SUPABASE_*` environment variables, so the bundle inlined empty values and `createClient` threw at module scope before React mounted. Fixed by creating the vars on all EAS environments + the `lib/supabase.ts` fallback (`7b7517b`). |
| production (Play internal / TestFlight) | — | — | — | Not started — waits on owner smoke pass, then Play identity verification for submit. |

## Testers

0 invited. Plan: owner smoke first, then ~3 friends via Play internal testing
(Gmail opt-in link), growing toward ~100. iPhone testers come later via
TestFlight (external for non-team friends).
