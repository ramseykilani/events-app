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
| Play Console | Personal account; **identity verification complete**. App created, package `com.rkilani.events`. Service account in GCP project `rkilani-events`, Play Android Developer API enabled, account invited with **testing track + manage user lists** (enough for internal submit — confirmed 2026-08-15). | 2026-08-15 |
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

- `production`: `8f3b660` — 2026-08-15 ship. Live: https://shared-events.pages.dev.
- `staging`: ahead on docs/config (KI-003, iOS export-compliance flag, TestFlight submit profile). App behavior matches production except the iOS `ITSAppUsesNonExemptEncryption` plist bit (TestFlight-only).

## Latest native builds

| Profile | Platform | Date | Link | State |
|---------|----------|------|------|-------|
| preview (internal APK) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/eab4bcd7-0900-4517-986b-28657dccbe49 | Owner smoke **passed**. KI-003 accepted. |
| production (Play internal) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/6d41b098-dd4c-40d7-b715-94380cc8728e | **On the internal track.** 0.1.0 / versionCode 2. Submit https://expo.dev/accounts/rkilani/projects/events-app/submissions/de5a90ef-cf34-4455-ad38-a507d41a8a0b succeeded after testing-track + manage-user-lists. Play Console → Testing → Internal testing → copy the opt-in link (Play does not email testers). |
| production (TestFlight) | iOS | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/bea7755e-c7e5-4286-a8e0-78a7e23d1677 | **Uploaded to App Store Connect.** 0.1.0 / build 2. Processing ~5–10 min, then https://appstoreconnect.apple.com/apps/6801756936/testflight/ios. Dist cert + profile created this session. Internal group **Team (Expo)** exists (ASC team only). Friends go on an **external** group (Beta App Review on this first version). iOS push still needs an APNs key on Expo before TestFlight push works. |
| preview (superseded) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/5f477380-e794-46e1-a5cc-1b8ba70cb336 | Earlier smoke; do not distribute. |
| preview (superseded) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/3c0f99e5-aa69-464c-a204-9166682e5974 | Launch-crash build; do not distribute. |

## Testers

- **Play internal:** owner Gmail allowlisted 2026-08-15. Release is on the track. Play does **not** email testers — share the opt-in link from Play Console → Testing → Internal testing. Add each friend's Play Store Gmail before sending the link. 0 friends invited so far.
- **TestFlight:** Internal group `Team (Expo)` (Expo auto-setup) — ASC users only. For the friend who is ready: App Store Connect → TestFlight → External Testing → New Group → add their email → enable this 0.1.0 (2) build. First external build of a version goes through **Beta App Review** (~24–48h). Do not add them to the App Store Connect team just to skip that.

Plan remains: ~3 friends via Play internal, growing toward ~100. iPhone testers via external TestFlight.
