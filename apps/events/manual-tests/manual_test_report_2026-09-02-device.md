# Device Smoke Report — 2026-09-02

## Run metadata

- Runner: owner on device; agent recorded results
- Date: 2026-09-02
- Branch: `production` (`23ca55f`, reviewed `ffd9eb4`)
- Build: EAS preview APK `209792d2-05a6-49f0-afcf-cf8318c6d539`
- Device: Android (owner smoke of the 2026-09-02 ship)
- Backend: production Supabase project

## Results

Owner: **pass.** Push tester Android to Play internal. Findings below are
logged as minors — not blockers. No iPhone testers yet; TestFlight not cut.

| Scenario | Status | Notes |
|---|---|---|
| N-001 Sign-in | pass | Not separately flagged. |
| N-002 Contacts | pass | Not separately flagged. |
| N-003 Manual add | pass | Not separately flagged. |
| N-004 Native pickers | pass | Not separately flagged. |
| N-005 Share → push | pass | Not separately flagged. |
| N-006 SMS | pass | Not separately flagged (Coming? receipt line is in this binary). |
| N-007 Edit and remove | pass | Not separately flagged. |
| N-008 Sign out | pass | Not separately flagged (Settings gear path). |
| N-009 Theme + safe areas | pass with findings | KI-005 re-confirmed on My People: names sit under the 3-button nav bar. New: KI-017 gear too close to Add. |
| N-010 Notification explainer | pass | Not separately flagged. KI-008 / KI-009 / KI-012 not re-raised this run. |

## Findings (not blockers)

Logged in `manual-tests/known_issues.md`:

- **KI-005** — still open. The 2026-09-01 `insets.bottom` pass did not
  clear names on the My People list; they remain visible under the
  Samsung 3-button nav bar. Owner: not a blocker, "just kind of gross."
- **KI-017** — My People header gear sits too close to Add. Owner: not a
  blocker.

## Summary

- Overall result: **pass.** Play internal versionCode **9** and TestFlight build **11** submitted (same ship). iOS device smoke of New Architecture still open.
- Known blockers: none.
