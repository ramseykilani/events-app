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
| Expo push credentials — Android FCM v1 key | Expo project credentials | **Added 2026-08-15** (owner, via Expo dashboard → Credentials → Android). Push delivery verified on device same day. iOS still needs an APNs key uploaded before TestFlight push works. |

## Code state

- `production`: `8f3b660` — 2026-08-15 ship. Reviewed product `577426c`. Live: https://shared-events.pages.dev. Review: `manual-tests/manual_test_report_2026-08-15-release-577426c.md`.
- `staging`: `b9cb967` — KI-003 (additive share re-notifies) documented on top of that ship. Owner smoke of preview `eab4bcd7` passed (`manual-tests/manual_test_report_2026-08-15-device-eab4bcd7.md`).

## Latest native builds

| Profile | Platform | Date | Link | State |
|---------|----------|------|------|-------|
| preview (internal APK) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/eab4bcd7-0900-4517-986b-28657dccbe49 | Built from promoted `8f3b660` (0.1.0 / 1). **Owner smoke passed.** Finding accepted as KI-003 (additive share re-notifies existing recipients, including a self-share). |
| preview (superseded — do not distribute) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/5f477380-e794-46e1-a5cc-1b8ba70cb336 | Built from `d7f9433`. Earlier smoke; superseded by `eab4bcd7`. |
| preview (superseded — do not distribute) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/3c0f99e5-aa69-464c-a204-9166682e5974 | FAILED owner smoke: launch crash from missing EAS `EXPO_PUBLIC_SUPABASE_*` vars. |
| production (Play internal) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/6d41b098-dd4c-40d7-b715-94380cc8728e | AAB built (0.1.0 / versionCode **2**) from `b9cb967` (same app code as `8f3b660` + docs). **Submit blocked:** Play rejected `play-submit@rkilani-events.iam.gserviceaccount.com` — `SUBMISSION_SERVICE_ANDROID_SERVICE_ACCOUNT_IS_MISSING_PERMISSIONS`. Submission https://expo.dev/accounts/rkilani/projects/events-app/submissions/5bc92c7e-88bb-44d3-a4a9-f396ed02d8b5. Owner action: Play Console → Users and permissions → invite that service account on app `com.rkilani.events` with release / testing-track access (Admin on the app is the sure grant). Then `eas submit --platform android --profile production --non-interactive --latest`. |
| production (TestFlight) | iOS | — | — | Credentials are in. Wait until at least one iPhone tester has said yes. Friends who are not on the App Store Connect team go via **external** TestFlight (Beta App Review on the first build of each version). First agent iOS build may need one interactive `eas build --platform ios --profile production` on the owner's machine if non-interactive credential bootstrap fails (bundle ID / APNs). |

## Testers

- **Play internal:** owner Gmail allowlisted 2026-08-15. Play does **not** email testers — the owner shares the opt-in link. 0 friends invited. Talk to people first, get the Gmail they use on the phone, then add them and send the link. Do that after the production AAB is on the internal track (the opt-in link often appears only once a release is published).
- **TestFlight:** 0. Do not add friends to the App Store Connect team just to get them a build. Internal TestFlight is team-only (Apple does email those invites). External group + public link / email is the friends path, after Beta App Review.

Plan remains: full smoke checklist, then ~3 friends via Play internal, growing toward ~100. iPhone testers later.
