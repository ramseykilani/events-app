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
| `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`, `EXPO_ASC_API_KEY_P8_BASE64` | Cursor + GitHub | **Added 2026-08-15** (Admin Team Key). A running cloud-agent VM does not pick up newly added secrets — iOS build/submit needs a **fresh** session. Strip whitespace from `EXPO_APPLE_TEAM_ID` before submit — a leading newline makes it length 11 and EAS rejects it as `Invalid Apple Team ID`. Real team id is `65AU7LR65M`. |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Cursor + GitHub | **Added 2026-08-15**. Same fresh-session rule for `eas submit`. |
| Expo push credentials — Android FCM v1 key | Expo project credentials | **Added 2026-08-15** (owner, via Expo dashboard → Credentials → Android). Push delivery verified on device same day. |
| Expo push credentials — iOS APNs key | Expo project credentials | **Added 2026-08-17** (owner, via Expo dashboard → Credentials → iOS). Confirmed same day via EAS GraphQL: `iosAppCredentials.pushKey.keyIdentifier` is `8T775QY87V` (`applePushKeys` created `2026-08-17T01:29:16Z`). This is the Apple Developer **Keys → Apple Push Notifications service (APNs)** `.p8` — not the ASC Admin Team Key used for TestFlight submit. No rebuild: Expo uses the key at send time; existing TestFlight installs pick up iOS share-notify push after the next authenticated launch (force-quit and reopen Events). Delivery not yet verified on device (N-005). |

## Code state

- `production`: `0baab0e` — 2026-08-16 ship (reviewed `e36a0cb`). Live: https://shared-events.pages.dev. Includes KI-003 (notify only new recipients) and KI-004 (edit URL editable).
- `staging`: same commit plus STATUS notes. Owner smoked the preview APK; tester binaries (0.1.0 / build 3) are on Play internal and TestFlight.

## Latest native builds

| Profile | Platform | Date | Link | State |
|---------|----------|------|------|-------|
| preview (internal APK) | Android | 2026-08-16 | https://expo.dev/accounts/rkilani/projects/events-app/builds/0c242921-5afb-4e1e-89e0-b5998d0811c1 | Owner smoke **passed** 2026-08-17 on promoted `0baab0e` (KI-003 + KI-004). APK https://expo.dev/artifacts/eas/lU0gemdHBwVKkCZhLpgCS8iVI8l6ZjNnOMGaR73g4bM.apk. Sideload only — testers get the production AAB/IPA. |
| production (Play internal) | Android | 2026-08-17 | https://expo.dev/accounts/rkilani/projects/events-app/builds/9010f493-7484-4f38-839b-638bbc16e4a4 | **On the internal track** (release status `completed`). 0.1.0 / versionCode **3**. Submit https://expo.dev/accounts/rkilani/projects/events-app/submissions/8035cdc7-f41a-49d5-b0fc-2aeb9676b1a5 succeeded. Play Console → Testing → Internal testing → copy the opt-in link (Play does not email testers). |
| production (TestFlight) | iOS | 2026-08-17 | https://expo.dev/accounts/rkilani/projects/events-app/builds/6e56a6b3-b830-4689-a4f6-b851d0b5f8e0 | **Ready for internal testing.** 0.1.0 / build **3** (`internal: in beta testing`). Submit https://expo.dev/accounts/rkilani/projects/events-app/submissions/043391df-f24f-4b60-ade0-7cb1e2a6d51c succeeded (added to internal group **Team (Expo)**). https://appstoreconnect.apple.com/apps/6801756936/testflight/ios. **No Beta App Review.** |
| production (superseded) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/6d41b098-dd4c-40d7-b715-94380cc8728e | Previous internal-track AAB. 0.1.0 / versionCode 2. Replaced by versionCode 3. |
| production (superseded) | iOS | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/bea7755e-c7e5-4286-a8e0-78a7e23d1677 | Previous TestFlight. 0.1.0 / build 2. Replaced by build 3. Dist cert + profile created 2026-08-15. |
| preview (superseded) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/eab4bcd7-0900-4517-986b-28657dccbe49 | Owner smoke **passed** on `8f3b660`. KI-003 was accepted on that build; do not use for this release. |
| preview (superseded) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/5f477380-e794-46e1-a5cc-1b8ba70cb336 | Earlier smoke; do not distribute. |
| preview (superseded) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/3c0f99e5-aa69-464c-a204-9166682e5974 | Launch-crash build; do not distribute. |

iOS `eas submit --non-interactive` (eas-cli 22): env vars alone fail with “App Store Connect API Keys cannot be set up in --non-interactive mode”. Decode `EXPO_ASC_API_KEY_P8_BASE64` to gitignored `AuthKey.p8`, **strip** `EXPO_APPLE_TEAM_ID`, then temporarily set local `eas.json` `submit.production.ios` to `ascApiKeyPath` / `ascApiKeyId` / `ascApiKeyIssuerId` / `appleTeamId` (`65AU7LR65M`) plus the committed `ascAppId`. Pass `--groups "Team (Expo)"`. `git checkout -- eas.json` after submit — never commit those fields. Do not pass `--what-to-test`.

## Testers

- **Play internal (track, not Internal app sharing):** owner Gmail allowlisted 2026-08-15. Current release on the internal testing **track** is 0.1.0 / versionCode **3** (submitted 2026-08-17). Play does **not** email testers — add each friend's Play Store Gmail to the email list, then send the same opt-in link (Play Console → Testing → Internal testing → Testers). Already-joined testers get the update in Play Store; new friends still need the `internaltest` opt-in in Chrome. The “Anyone you shared the link with can download” toggle is **Internal app sharing**, a different product — do not use it for friends (hidden Play Store setting, 60-day links, re-signed cert / FCM, separate upload from `eas submit`). 0 friends invited so far.
- **2026-08-16 — Play Store “Item not found” (sleeping satellite):** a friend hit this after opening the invite link. The AAB is on the internal track; that screenshot is Play Store failing the **install**, which is expected until he has joined on the **web** opt-in page. Android hijacks `play.google.com` links into Play Store, so tapping the invite in Messages never shows **Become a tester**. Correct link is Console → Testing → Internal testing → Testers → Copy link (`https://play.google.com/apps/internaltest/…` — not `/apps/testing/` (closed track, empty here) and not `/store/apps/details`). His Play Store Gmail must be on a list that is **checked** for this track, then Save. He opens the `internaltest` URL in Chrome (paste, don’t tap), joins, then installs. First-publish can take a few hours (Google). Do not rebuild.
- **TestFlight (internal — first iPhone testers):** Internal group `Team (Expo)` (`hasAccessToAllBuilds`). Build **3** is **in beta testing** (uploaded 2026-08-17). iOS share-notify push is unblocked as of 2026-08-17 (APNs key `8T775QY87V` on Expo) — existing TestFlight installs do **not** need a new build; testers should force-quit and reopen Events so the push token re-registers, then N-005. Apple requires internal testers to be App Store Connect users (Account Holder, Admin, App Manager, Developer, or Marketing). Owner override 2026-08-15: **invite the first iPhone tester onto the ASC team with Marketing** so they skip Beta App Review. Steps: Users and Access → + → their Apple ID email → role **Marketing** → uncheck “All Apps” / grant **Shared Events** only → they accept the Apple invite → TestFlight → Internal Testing → **Team (Expo)** → Testers → add them → Apple emails the TestFlight invite. Do **not** start External Testing / Beta App Review for this. External (email/public link, review ~24–48h) is only for a later, larger list.
- ASC Users and Access currently: owner only (`kilani.ramsey@gmail.com`, Account Holder + Admin). No pending invitations. Team (Expo) tester list is empty until the Marketing invite is accepted and they’re added.

Plan remains: ~3 friends via Play internal, growing toward ~100. First iPhone testers via **internal** TestFlight (Marketing role on Shared Events only).
