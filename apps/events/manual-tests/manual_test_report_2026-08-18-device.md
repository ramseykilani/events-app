# Device Smoke Report — 2026-08-18

## Run metadata

- Runner: owner on device; agent recorded results
- Date: 2026-08-18
- Branch: `production` (`78b9e5a`, reviewed `d22d619`)
- Build: EAS preview APK `a7ce79c8-84f5-4763-973c-c5a2b669fbe3`
- Device: Android (owner smoke of the 2026-08-17 ship)
- Backend: production Supabase project

## Results

Owner: **pass.** Push to testers. Findings below are logged as minors / a
Planned feature — not blockers.

| Scenario | Status | Notes |
|---|---|---|
| N-001 Sign-in | pass | Covered as part of the smoke (including after delete-account). |
| N-002 Contacts | pass | Not separately flagged. |
| N-003 Manual add | pass | Not separately flagged. |
| N-004 Native pickers | pass | Not separately flagged. |
| N-005 Share → push | pass | Not separately flagged this run. |
| N-006 SMS | pass | Not separately flagged. |
| N-007 Edit and remove | pass | Not separately flagged. |
| N-008 Sign out | pass | Not separately flagged. |
| N-009 Theme + safe areas | pass | KI-005 not re-raised. |
| N-010 Notification explainer | pass with findings | Explainer path not called out as broken. Follow-ups: KI-008 (switches small), KI-009 (Back vs Close), KI-010 (Push toggle vs OS permission). |

## Findings (not blockers)

Logged in `manual-tests/known_issues.md` and `FEATURES.md`:

- **KI-006** — After installing the updated APK, the first open hangs on a
  continuous spinner until the app is swiped away in Android recents and
  opened again. Owner: may be a function of it being a new APK.
- **KI-007** — Deleted the account to reset for testing; after sign-in,
  friends' previously shared events were still on the calendar. Agent-added
  test events were gone. Delete of own copies works; pending-share delivery
  on re-signup restores incoming friends' events.
- **KI-008** — Push / SMS toggles are a bit too small and annoying to tap.
- **KI-009** — Android Back from the Notifications screen does nothing;
  Close works. The modal has no `onRequestClose`.
- **KI-010** — Push can be toggled even without OS notification permission.
  Owner: without permission, Push should be off; turning it on should show
  the explainer then the OS prompt.
- **Button Size & Clickability** (FEATURES.md, Planned) — something about
  the buttons does not feel good; revisit size and clickability.

## Summary

- Overall result: **pass.** Tester binaries (Play internal + TestFlight)
  proceed from promoted `78b9e5a`.
- Known blockers: none.
