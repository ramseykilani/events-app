# Device Smoke Report — 2026-08-15

## Run metadata

- Runner: owner on device; agent recorded results
- Date: 2026-08-15
- Branch: `staging`
- Build: EAS preview APK `5f477380-e794-46e1-a5cc-1b8ba70cb336`, built from `d7f9433` (full suite green)
- Device: Samsung Android, 3-button navigation bar enabled (not gesture nav)
- Backend: production Supabase project (shared with web staging)

## Results

| Scenario | Status | Notes |
|---|---|---|
| N-001 Sign-in with a real phone number | pass | OTP SMS arrived, landed on calendar, session persists across kill/relaunch. |
| N-002 Contacts permission and import | pass | Explainer appears before the OS prompt; grant → picker lists device contacts → selections appear in My People. Denial-recovery branch exercised as part of N-003. |
| N-003 Manual add fallback | pass | Path: explainer → Continue → **Deny** the OS prompt → recovery screen → "Add a number instead" → name + phone saves; invalid number alerts and saves nothing. Caveat documented as a feature candidate: "Not now" on the explainer is a dead end — the denied path is the only native route to the manual form. |
| N-004 Event creation with native pickers | pass | Native date/time pickers open and set values; saved event appears on the calendar. |
| N-005 Share → push between two devices | **fail (push path) / pass (delivery path)** | Agent-assisted variant ran 2026-08-15 ~06:20 UTC: agent (staging web, account `+15555550100` / display name "E2E User A") added the owner's number and shared "Push test from Cursor" (2026-08-15 6:00 PM). SMS received ✓; the shared event appears in-app and persists across opens ✓; share attribution and "✓ Shared" state correct ✓. **Push never arrived ✗** despite notifications enabled on the device. Root cause confirmed read-only via Expo GraphQL: the Expo project has `googleServiceAccountKeyForFcmV1: null` (legacy FCM also unset) — Expo's push service accepts the message but cannot authenticate to FCM, so Android pushes are dropped server-side. Not device- or APK-related; the sideloaded APK is fine. Push-tap portion stays open until the FCM v1 key is uploaded and this is re-run. |
| N-006 SMS content (share to a non-user) | partial | SMS delivered (self-send observed; sends to friends pending their confirmation). Content matches the template: `{name} added you to {title} on {date}{time}` + event URL. Two-template behavior confirmed in `supabase/functions/send-notification/index.ts`: the "Reply STOP to unsubscribe" footer is only on the **non-app-user** variant — the owner (an app user) correctly did not see it; friends' copies should carry it (confirm when they reply). Event description is not included (by design) and the formatting read poorly to the owner — both routed to FEATURES.md. |
| N-007 Edit and remove | partial | Edit (fork) and remove verified on the owner's own calendar. Recipient-keeps-their-copy not verified — needs a second account/device. |
| N-008 Sign out | pass | Confirm dialog shows formatted number; lands on sign-in; back does not reach protected screens; sign back in shows the same calendar. |
| N-009 Theme + safe areas | pass with finding | Theme switches and persists across relaunch. Finding: with 3-button navigation, the system nav bar covers the People screen's Delete account button — the fixed footer has no bottom safe-area inset. Owner ruling 2026-08-15: **not a tester blocker** (testers expected to use gesture nav); recorded in FEATURES.md alongside the touch-target item. |

## Owner feedback routed to FEATURES.md

All recorded as Planned entries (see FEATURES.md for the full text):

- Branded OTP SMS (verification text should name the app)
- Share SMS content & formatting (include description; nicer layout)
- Screen transition polish (white bar flash on the right edge during Android screen swipes)
- Manual add discoverability on native (the "Not now" dead end)
- Touch targets + footer safe area on the People screen (owner: the touch targets are the main pre-tester item; the nav-bar overlap is explicitly non-blocking)

## Summary

- Overall result: the build is functional on a real device; the launch crash from the superseded build (`3c0f99e5`) is resolved.
- Known blockers: none for core use per owner ruling — but note **Android push is down project-wide** (all builds, all users) until the FCM v1 service-account key is uploaded to the Expo project's credentials. SMS still covers share notifications meanwhile. iOS push will likewise need the APNs key configured on Expo before TestFlight.
- Follow-up actions: upload the FCM v1 key to Expo (Expo dashboard → project → Credentials → Android → FCM V1 service account key, or `eas credentials`; the Firebase project `rkilani-events` from `google-services.json` is the same GCP project the Play service account was created in — its key or a new key needs the Firebase Cloud Messaging API enabled), then re-run the N-005 push portion; verify N-007 recipient side with a second account; confirm friends' SMS carry the STOP footer; then the touch-target fix before tester invites.
