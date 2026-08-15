# Status

Living state for the release pipeline. **Agents: read this before any release
or build work, and update it whenever you change any of it.** Feature specs
live in `FEATURES.md`; how work flows lives in `docs/development-workflow.md`;
this file is where things stand right now.

## Store enrollment

| Store | State | Date |
|-------|-------|------|
| Apple Developer Program | Active (App Store Connect access confirmed, agreements accepted) | 2026-08-12 |
| App Store Connect app | Created. Bundle ID `com.rkilani.events`. Store listing name **Shared Events** (`Events` was already taken). Home-screen name stays `Events`. Push Notifications enabled on the App ID. `.p8` kept on the owner's machine at `F:\Code\Events\events-keys` — never commit it. | 2026-08-15 |
| Play Console | Personal account; **identity verification complete**. App created, package `com.rkilani.events`. Service account in GCP project `rkilani-events`, Play Android Developer API enabled, account invited with release / testing-track permissions. | 2026-08-15 |
| Expo | Account active; EAS project linked (`app.config.js` → `extra.eas.projectId`) | — |

Play "Finish setting up your app" (privacy policy URL, data-safety form, content rating, App access / reviewer sign-in) is **not done** and is **not required** for internal testing. Those wait for a closed test or production listing. App access is also unsolved: the app is phone-OTP only, and Play/Apple reviewers cannot create accounts or receive SMS — do not put the CI test OTPs in either console.

## Secrets

| Secret | Where | State |
|--------|-------|-------|
| `EXPO_TOKEN` | Cursor + GitHub | Added 2026-08-12 |
| `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`, `EXPO_ASC_API_KEY_P8_BASE64` | Cursor + GitHub | **Added 2026-08-15** (Admin Team Key). A running cloud-agent VM does not pick up newly added secrets — iOS build/submit needs a **fresh** session. |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Cursor + GitHub | **Added 2026-08-15**. Same fresh-session rule for `eas submit`. |

## Code state

- `staging`: `c4fc7fe` — smoke-state correction on top of the People List Scrolling note and launch-crash fix. Full suite green on `d7f9433` (2026-08-15).
- `production`: `7e7c2b4` — deployed 2026-08-15 (https://shared-events.pages.dev).
  Release review: `manual-tests/manual_test_report_2026-08-15-release.md`.

## Latest native builds

| Profile | Platform | Date | Link | State |
|---------|----------|------|------|-------|
| preview (internal APK) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/5f477380-e794-46e1-a5cc-1b8ba70cb336 | Built from `d7f9433` (full suite green). Bundle verified to contain the real Supabase URL. Owner confirmed 2026-08-15 the app launches; the full smoke checklist (`manual-tests/native_device_smoke.md`) has NOT been run yet. Testers must not get this until that pass. |
| preview (superseded — do not distribute) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/3c0f99e5-aa69-464c-a204-9166682e5974 | FAILED owner smoke: crashed instantly at launch. Root cause: the EAS project had no `EXPO_PUBLIC_SUPABASE_*` environment variables, so the bundle inlined empty values and `createClient` threw at module scope before React mounted. Fixed by creating the vars on all EAS environments + the `lib/supabase.ts` fallback (`7b7517b`). |
| production (Play internal) | Android | — | — | Waits on the full owner smoke checklist. Credentials are in. After that pass, a **fresh** session: `eas build --platform android --profile production --non-interactive --wait` then `eas submit --platform android --profile production --non-interactive --latest`. |
| production (TestFlight) | iOS | — | — | Credentials are in. Wait until the smoke checklist passes **and** at least one iPhone tester has said yes. Friends who are not on the App Store Connect team go via **external** TestFlight (Beta App Review on the first build of each version). First agent iOS build may need one interactive `eas build --platform ios --profile production` on the owner's machine if non-interactive credential bootstrap fails (bundle ID / APNs). |

## Testers

- **Play internal:** owner Gmail allowlisted 2026-08-15. Play does **not** email testers — the owner shares the opt-in link. 0 friends invited. Talk to people first, get the Gmail they use on the phone, then add them and send the link. Do that after the production AAB is on the internal track (the opt-in link often appears only once a release is published).
- **TestFlight:** 0. Do not add friends to the App Store Connect team just to get them a build. Internal TestFlight is team-only (Apple does email those invites). External group + public link / email is the friends path, after Beta App Review.

Plan remains: full smoke checklist, then ~3 friends via Play internal, growing toward ~100. iPhone testers later.
