# Device Smoke Report — 2026-08-15 (preview `eab4bcd7`)

## Run metadata

- Runner: owner on device
- Date: 2026-08-15
- Branch / commit: production `8f3b660` (reviewed product `577426c`)
- Build: EAS preview APK `eab4bcd7-0900-4517-986b-28657dccbe49` (0.1.0 / 1)
- Backend: production Supabase project

## Results

Owner report: smoke tests look good. This is the binary that includes the
People 44pt targets and footer safe-area fix (N-009 / 3-button nav).

Prior coverage on the superseded preview (`5f477380`,
`manual_test_report_2026-08-15-device.md`) already passed N-001–N-006, N-008,
and the owner-side of N-007. This pass is the go-ahead for Play internal.

| Scenario | Status | Notes |
|---|---|---|
| Suite overall | pass | Owner: "Smoke tests look good." Release proceeds. |
| N-009 footer / 3-button nav | pass (this build's fix) | Touch-target + footer inset shipped in `577426c`. |
| Additive share notifications | finding, accepted | See below. Not a tester blocker. |
| N-007 recipient-side | still open | Needs a second account/device. |

## Finding — additive share re-notifies existing recipients

For an event already shared with the owner (self-share), adding new people
caused the owner to receive the notification again.

Logged as **KI-003** in `manual-tests/known_issues.md`. Root cause:
`send-notification` fans out to every `event_shares` row for the
`user_event`, not only the newly shared person ids. Owner ruling 2026-08-15:
document it, do not stop this release.

## Summary

- Overall result: **pass** — proceed to production AAB → Play internal track.
- Testers should not flag KI-003 (called out in `native_device_smoke.md`).
- Follow-up (independent of this ship): KI-003 notify-only-new-recipients;
  N-007 recipient-side with a second account.
