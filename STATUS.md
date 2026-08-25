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

- `production`: `dce52ee` — 2026-08-24 **Copy + Follow cutover** ship (reviewed `4f85f76`; report `manual-tests/manual_test_report_2026-08-24-release.md`, VERDICT SHIP). Live: https://shared-events.pages.dev. Per-user `events` rows + `sends` replace the snapshot/pointer/share-log model; edits cascade silently to followers; `cleanup-events` is gone; legacy tables (`legacy_events`/`legacy_user_events`/`legacy_event_shares`) are renamed, client-revoked, and kept for a 30-day soak (drop migration + `owns_user_event` cleanup is a follow-up after the soak). Pre-cutover pg_dump + revert procedure: `docs/archive/`. Restore point tag: `forwarding-model-final`.
- `staging`: same as production. 2026-08-24: **KI-014** logged (web month-chevron glyphs don't paint — functional but invisible; web-only minor found by the release review's visual matrix). Earlier: **KI-013** logged 2026-08-24 (Android spinner after a day unused — fix shipped in this release; pending owner on-device confirmation). Tester binaries: 0.1.0 / versionCode **5** (Play internal) and build **6** (TestFlight) — the cutover builds, delivered by store auto-update.

## Latest native builds

| Profile | Platform | Date | Link | State |
|---------|----------|------|------|-------|
| production (Play internal) | Android | 2026-08-24 | https://expo.dev/accounts/rkilani/projects/events-app/builds/7e1e3719-8da4-4707-8014-2e80794d5f4c | **Copy + Follow cutover build** (built pre-migration per the spec's cutover step 4; store processing overlaps the outage, auto-update delivers it). 0.1.0 / versionCode **5**. Submit https://expo.dev/accounts/rkilani/projects/events-app/submissions/588b558a-164d-4960-ab55-451890738bcf succeeded. AAB https://expo.dev/artifacts/eas/6g2Rg3RjvUfKYcILIkxK-xJfL79mQt3KytJqM-5lXRE.aab |
| production (TestFlight) | iOS | 2026-08-24 | https://expo.dev/accounts/rkilani/projects/events-app/builds/c1336d45-961a-44da-9e10-ee8dbf4c6780 | **Copy + Follow cutover build** (same cutover step 4). 0.1.0 / build **6**. Submit https://expo.dev/accounts/rkilani/projects/events-app/submissions/3e3e76ce-b26a-48e4-b797-fda61a8d37d0 succeeded (group **Team (Expo)**); Apple processing ~5–10 min. IPA https://expo.dev/artifacts/eas/gxxge4oLL90i5MsD-71LkhGZmNhbej6N-Zlb-gzeqVo.ipa |
| preview (internal APK) | Android | 2026-08-17 | https://expo.dev/accounts/rkilani/projects/events-app/builds/a7ce79c8-84f5-4763-973c-c5a2b669fbe3 | Owner smoke **passed** 2026-08-18 on promoted `78b9e5a`. Findings KI-006–KI-010 (not blockers). APK https://expo.dev/artifacts/eas/Z1n6Od5Obeh0yuBJX_Qi-B1sK7UUg61OEy42MFkCyvg.apk. Sideload only — testers get the production AAB/IPA. |
| preview (superseded) | Android | 2026-08-16 | https://expo.dev/accounts/rkilani/projects/events-app/builds/0c242921-5afb-4e1e-89e0-b5998d0811c1 | Owner smoke **passed** 2026-08-17 on promoted `0baab0e` (KI-003 + KI-004). APK https://expo.dev/artifacts/eas/lU0gemdHBwVKkCZhLpgCS8iVI8l6ZjNnOMGaR73g4bM.apk. Do not use for this release. |
| production (superseded) | Android | 2026-08-18 | https://expo.dev/accounts/rkilani/projects/events-app/builds/d0dd7f05-75a6-4159-a9dd-adfcf8cd26e0 | Previous internal-track AAB. 0.1.0 / versionCode 4. Replaced by versionCode 5 (2026-08-24 cutover build). |
| production (superseded) | iOS | 2026-08-18 | https://expo.dev/accounts/rkilani/projects/events-app/builds/62920fb6-d632-49d4-97ec-b0dcdc3bbb1f | Previous TestFlight. 0.1.0 / build 4. Replaced by build 6 (2026-08-24 cutover build). |
| production (superseded) | Android | 2026-08-17 | https://expo.dev/accounts/rkilani/projects/events-app/builds/9010f493-7484-4f38-839b-638bbc16e4a4 | Previous internal-track AAB. 0.1.0 / versionCode 3. Replaced by versionCode 4. |
| production (superseded) | iOS | 2026-08-17 | https://expo.dev/accounts/rkilani/projects/events-app/builds/6e56a6b3-b830-4689-a4f6-b851d0b5f8e0 | Previous TestFlight. 0.1.0 / build 3. Replaced by build 4. |
| preview (superseded) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/eab4bcd7-0900-4517-986b-28657dccbe49 | Owner smoke **passed** on `8f3b660`. KI-003 was accepted on that build; do not use for this release. |
| preview (superseded) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/5f477380-e794-46e1-a5cc-1b8ba70cb336 | Earlier smoke; do not distribute. |
| preview (superseded) | Android | 2026-08-15 | https://expo.dev/accounts/rkilani/projects/events-app/builds/3c0f99e5-aa69-464c-a204-9166682e5974 | Launch-crash build; do not distribute. |

iOS `eas submit --non-interactive` (eas-cli 22): env vars alone fail with “App Store Connect API Keys cannot be set up in --non-interactive mode”. Decode `EXPO_ASC_API_KEY_P8_BASE64` to gitignored `AuthKey.p8`, **strip** `EXPO_APPLE_TEAM_ID`, then temporarily set local `eas.json` `submit.production.ios` to `ascApiKeyPath` / `ascApiKeyId` / `ascApiKeyIssuerId` / `appleTeamId` (`65AU7LR65M`) plus the committed `ascAppId`. Pass `--groups "Team (Expo)"`. `git checkout -- eas.json` after submit — never commit those fields. Do not pass `--what-to-test`.

## Testers

- **Play internal (track, not Internal app sharing):** owner Gmail allowlisted 2026-08-15. Current release on the internal testing **track** is 0.1.0 / versionCode **4** (submitted 2026-08-18, smoked `78b9e5a`). Play does **not** email testers — add each friend's Play Store Gmail to the email list, then send the same opt-in link (Play Console → Testing → Internal testing → Testers). Already-joined testers get the update in Play Store; new friends still need the `internaltest` opt-in in Chrome. The “Anyone you shared the link with can download” toggle is **Internal app sharing**, a different product — do not use it for friends (hidden Play Store setting, 60-day links, re-signed cert / FCM, separate upload from `eas submit`). 0 friends invited so far.
- **2026-08-16 — Play Store “Item not found” (sleeping satellite):** a friend hit this after opening the invite link. The AAB is on the internal track; that screenshot is Play Store failing the **install**, which is expected until he has joined on the **web** opt-in page. Android hijacks `play.google.com` links into Play Store, so tapping the invite in Messages never shows **Become a tester**. Correct link is Console → Testing → Internal testing → Testers → Copy link (`https://play.google.com/apps/internaltest/…` — not `/apps/testing/` (closed track, empty here) and not `/store/apps/details`). His Play Store Gmail must be on a list that is **checked** for this track, then Save. He opens the `internaltest` URL in Chrome (paste, don’t tap), joins, then installs. First-publish can take a few hours (Google). Do not rebuild.
- **TestFlight (internal — first iPhone testers):** Internal group `Team (Expo)` (`hasAccessToAllBuilds`). Build **4** is uploaded 2026-08-18 (Apple processing, then in beta testing). iOS share-notify push is unblocked as of 2026-08-17 (APNs key `8T775QY87V` on Expo). Apple requires internal testers to be App Store Connect users (Account Holder, Admin, App Manager, Developer, or Marketing). Owner override 2026-08-15: **invite the first iPhone tester onto the ASC team with Marketing** so they skip Beta App Review. Steps: Users and Access → + → their Apple ID email → role **Marketing** → uncheck “All Apps” / grant **Shared Events** only → they accept the Apple invite → TestFlight → Internal Testing → **Team (Expo)** → Testers → add them → Apple emails the TestFlight invite. Do **not** start External Testing / Beta App Review for this. External (email/public link, review ~24–48h) is only for a later, larger list.
- ASC Users and Access currently: owner only (`kilani.ramsey@gmail.com`, Account Holder + Admin). No pending invitations. Team (Expo) tester list is empty until the Marketing invite is accepted and they’re added.

Plan remains: ~3 friends via Play internal, growing toward ~100. First iPhone testers via **internal** TestFlight (Marketing role on Shared Events only).
