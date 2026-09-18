# Device Smoke Report — 2026-09-04

## Run metadata

- Runner: owner on device; agent recorded results
- Date: 2026-09-04
- Branch: `production` (`545ca23`, reviewed `d4fee04`)
- Build: EAS preview APK `3cf3bc2b-7200-4ffa-8065-127ea10d4ec8`
- Device: Android (owner smoke of the 2026-09-04 ship)
- Backend: production Supabase project

## Results

Owner: **pass.** ("Looks good!") No new findings. Push testers to Play
internal versionCode **10** and TestFlight build **12**.

| Scenario | Status | Notes |
|---|---|---|
| N-001 Sign-in | pass | Not separately flagged. |
| N-002 Contacts | pass | Not separately flagged. |
| N-003 Manual add | pass | Not separately flagged. |
| N-004 Native pickers | pass | Not separately flagged. |
| N-005 Share → push | pass | Not separately flagged. |
| N-006 SMS | pass | Not separately flagged. |
| N-007 Edit and remove | pass | Not separately flagged. |
| N-008 Sign out | pass | Not separately flagged. |
| N-009 Theme + safe areas | pass | Not separately flagged. KI-005 / KI-017 not re-raised this run. |
| N-010 Notification explainer | pass | Not separately flagged. KI-008 / KI-009 / KI-012 not re-raised this run. |

## Findings (not blockers)

None new. Open ledger unchanged: KI-001, 005, 006, 007, 008, 009, 010, 011,
012, 014, 016, 017.

## Summary

- Overall result: **pass.** Play internal versionCode **10** and TestFlight
  build **12** submitted (same ship).
- Known blockers: none.
