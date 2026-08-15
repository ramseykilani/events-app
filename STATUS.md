# Status

Living state for the release pipeline. **Agents: read this before any release
or build work, and update it whenever you change any of it.** Feature specs
live in `FEATURES.md`; how work flows lives in `docs/development-workflow.md`;
this file is where things stand right now.

## Store enrollment

| Store | State | Date |
|-------|-------|------|
| Apple Developer Program | Active (App Store Connect access confirmed, agreements accepted) | 2026-08-12 |
| App Store Connect app | Created. Bundle ID `com.rkilani.events`. Store listing name **Shared Events** (`Events` was already taken). Home-screen name stays `Events`. Push Notifications **capability** is on the App ID. The `.p8` at `F:\Code\Events\events-keys` is the **App Store Connect API key** (submit to TestFlight) — that is not an APNs push key. Never commit it. | 2026-08-15 |
| Play Console | Personal account; **identity verification complete**. App created, package `com.rkilani.events`. Service account in GCP project `rkilani-events`, Play Android Developer API enabled, account invited with **testing track + manage user lists** (enough for internal submit — confirmed 2026-08-15). | 2026-08-15 |
| Expo | Account active; EAS project linked (`app.config.js` → `extra.eas.projectId`) | — |

Play "Finish setting up your app" (privacy policy URL, data-safety form, content rating, App access / reviewer sign-in) is **not done** and is **not required** for internal testing. Those wait for a closed test or production listing. App access is also unsolved: the app is phone-OTP only, and Play/Apple reviewers cannot create accounts or receive SMS — do not put the CI test OTPs in either console.

## Secrets

| Secret | Where | State |
|--------|-------|-------|
| `EXPO_TOKEN` | Cursor + GitHub | Added 2026-08-12 |
| `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`, `EXPO_ASC_API_KEY_P8_BASE64` | Cursor + GitHub | **Added 2026-08-15** (Admin Team Key). A running cloud-agent VM does not pick up newly added secrets — iOS build/submit needs a **fresh** session. |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Cursor + GitHub | **Added 2026-08-15**. Same fresh-session rule for `eas submit`. |
| Expo push credentials — Android FCM v1 key | Expo project credentials | **Added 2026-08-15** (owner, via Expo dashboard → Credentials → Android). Push delivery verified on device same day. |
| Expo push credentials — iOS APNs key | Expo project credentials | **Not on Expo.** Confirmed 2026-08-15 via EAS GraphQL: `iosAppCredentials.pushKey` is null and the `rkilani` account has `applePushKeys: []`. The ASC Admin Team Key we added for TestFlight submit is a different `.p8` (Users and Access → Integrations → App Store Connect API). iOS push needs a **Keys → Apple Push Notifications service (APNs)** `.p8` uploaded at [Expo iOS credentials](https://expo.dev/accounts/rkilani/projects/events-app/credentials). TestFlight install still works without it; share notify falls back to SMS. |

## Code state

- `production`: `8f3b660` — 2026-08-15 ship. Live: https://shared-events.pages.dev.
- `staging`: ahead on docs/config (KI-003, iOS export-compliance flag, TestFlight submit profile). App behavior matches production except the iOS `ITSAppUsesNonExemptEncryption` plist bit (TestFlight-only).

## Latest native builds

| Profile | Platform | Date | Link | State |
|---------|----------|------|------|-------|
| preview (internal APK) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/eab4bcd7-0900-4517-986b-28657dccbe49 | Owner smoke **passed**. KI-003 accepted. |
| production (Play internal) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/6d41b098-dd4c-40d7-b715-94380cc8728e | **On the internal track.** 0.1.0 / versionCode 2. Submit https://expo.dev/accounts/rkilani/projects/events-app/submissions/de5a90ef-cf34-4455-ad38-a507d41a8a0b succeeded after testing-track + manage-user-lists. Play Console → Testing → Internal testing → copy the opt-in link (Play does not email testers). |
| production (TestFlight) | iOS | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/bea7755e-c7e5-4286-a8e0-78a7e23d1677 | **Ready for internal testing.** 0.1.0 / build 2 (`internalBuildState: READY_FOR_BETA_TESTING`). https://appstoreconnect.apple.com/apps/6801756936/testflight/ios. Dist cert + profile created 2026-08-15. Internal group **Team (Expo)** (`hasAccessToAllBuilds`). First iPhone testers go on this internal group — **no Beta App Review**. Do not submit this build for external review. |
| preview (superseded) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/5f477380-e794-46e1-a5cc-1b8ba70cb336 | Earlier smoke; do not distribute. |
| preview (superseded) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/3c0f99e5-aa69-464c-a204-9166682e5974 | Launch-crash build; do not distribute. |

## Testers

- **Play internal:** owner Gmail allowlisted 2026-08-15. Release is on the track. Play does **not** email testers — share the opt-in link from Play Console → Testing → Internal testing. Add each friend's Play Store Gmail before sending the link. 0 friends invited so far.
- **TestFlight (internal — first iPhone testers):** Internal group `Team (Expo)`. Build 2 is ready. Apple requires internal testers to be App Store Connect users (Account Holder, Admin, App Manager, Developer, or Marketing). Owner override 2026-08-15: **invite the first iPhone tester onto the ASC team with Marketing** so they skip Beta App Review. Steps: Users and Access → + → their Apple ID email → role **Marketing** → uncheck “All Apps” / grant **Shared Events** only → they accept the Apple invite → TestFlight → Internal Testing → **Team (Expo)** → Testers → add them → Apple emails the TestFlight invite. Do **not** start External Testing / Beta App Review for this. External (email/public link, review ~24–48h) is only for a later, larger list.
- ASC Users and Access currently: owner only (`kilani.ramsey@gmail.com`, Account Holder + Admin). No pending invitations. Team (Expo) tester list is empty until the Marketing invite is accepted and they’re added.

Plan remains: ~3 friends via Play internal, growing toward ~100. First iPhone testers via **internal** TestFlight (Marketing role on Shared Events only).
