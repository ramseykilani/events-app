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

- `staging`: `3dccff5` — Staging pipeline green 2026-08-12. Ahead of
  production by the Display Names, contacts-explainer, and docs commits;
  awaiting the owner's "ship it".
- `production`: `d43e11d` — deployed 2026-08-09 (https://shared-events.pages.dev).

## Latest native builds

None yet. First build is the Android preview APK dry run that validates the
agent-run EAS loop, then the owner runs `manual-tests/native_device_smoke.md`
on real hardware.

## Testers

0 invited. Plan: owner smoke first, then ~3 friends via Play internal testing
(Gmail opt-in link), growing toward ~100. iPhone testers come later via
TestFlight (external for non-team friends).
