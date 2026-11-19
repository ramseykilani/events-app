# Status

Living state for I Love You. Agents: read this before release or build work
and update it when any of it changes. Specs: `FEATURES.md`. Setup steps:
`SETUP.md`.

## Hosted services

| Service | State |
|---------|-------|
| Supabase project | **Not created.** Migrations and functions have only run on the CLI's local stack. |
| Twilio | **Not created.** |
| LiveKit Cloud | **Not created.** Calls verified only against a local `livekit-server --dev` (v1.9.12). |
| Expo / EAS project | **Not created.** `ILY_EAS_PROJECT_ID` unset; no native build exists. |
| Firebase (FCM) / APNs key | **Not created.** No push has been delivered to a device. |
| Web/PWA hosting | **None.** |
| App Store Connect / Play Console listings | **None.** Needs a privacy policy page first (FEATURES.md). |

## Code state (branch `i-love-you`, local commits only)

Verified in the cloud VM on 2026-11-19:

- `npm run typecheck`, `npm run test:conventions`: clean for both apps.
- Jest: I Love You 14 suites / 74 tests; Events unchanged at 41 / 354.
- SQL semantics (scratch Postgres 16): pairing 15, channels 13, messages 15,
  push claims 8 assertions — all pass; Events' SQL suite still passes.
- Migrations also applied cleanly to the Supabase CLI local stack
  (Postgres 17, with the real `realtime` and `storage` schemas).
- Playwright (`e2e/`, Chromium, local stack + LiveKit dev server): setup +
  13 specs × desktop-chrome/mobile-chrome — last full run 25 passed, 2
  layout-specific skips by design. One earlier full run had a single failure
  in the mobile reorder step of `channels.spec.ts` (an up-move landed at the
  top instead of one place up) that did not reproduce in two isolated runs or
  the next full run — treat channel reordering under concurrent Realtime
  echoes as not yet trusted.
- Desktop shell: Linux debug build compiled and launched under Xvfb. **No
  macOS or Windows build.**

## Not verified anywhere yet

- Anything native: iOS/Android builds, push delivery, Android notification
  channels on a device, iOS thread grouping/interruption levels, Reply from a
  notification, native call audio, the native image picker/recorder.
- Calls over the public internet (TURN, LiveKit Cloud).
- `send-push` against the Expo push service (no device tokens exist; the
  claim and payload logic are tested in SQL and Jest).
- PWA installation on macOS/Windows by hand; Tauri on macOS/Windows.
- The pinned LiveKit RN SDK line (2.9.8 / WebRTC 137) building under SDK 54.
