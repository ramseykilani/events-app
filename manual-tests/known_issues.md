# Known Issues Ledger

The live list of known, accepted issues and by-design limitations present on
`staging`. This file is the open list; the dated release-review reports
(`manual_test_report_<YYYY-MM-DD>-release.md`) are the history.

Who reads this:

- **Release-review track agents** are briefed with the open entries at launch
  (the orchestrator pastes them into every track prompt). Do NOT flag, halt
  on, or screenshot anything listed here — these are known and accepted. If
  one appears materially WORSE than its entry describes, flag that as a new
  finding. If unsure whether what you see matches an entry, flag it as new and
  let the skeptic pass dismiss it.
- **Fixer agents** pick entries up as independent tasks, one at a time, via
  the normal staging flow.

Who writes this: the release-review orchestrator updates it in the same
docs-only commit as each release report — confirmed minor issues are added,
entries verified fixed by the review's re-check are removed. Blockers are
never added: a blocker must be fixed, not accepted.

## Open issues

### KI-001 — Text occasionally fails to paint on first mount of a pushed screen (web only)

- Severity: minor
- Status: open
- Found: 2026-08-07, `manual-tests/manual_test_report_2026-08-07-ui-polish.md`
- Expected: all text on a newly pushed screen renders immediately.
- Actual: on web, text inside a newly pushed screen can occasionally fail to
  paint on first mount (observed once: share-sheet people names, event-detail
  Back label). Interactions still work and the text self-heals on revisit or
  any repaint.
- Repro: not reliably reproducible — suspected
  react-native-screens/react-native-web transition raster quirk. Cosmetic,
  web-only. Do not chase unless it becomes reproducible.

### KI-002 — An edit can silently drop the typed description/image when the dedup key collides

- Severity: minor
- Status: open
- Found: 2026-08-13, while diagnosing the B-1 blocker in
  `manual-tests/manual_test_report_2026-08-13-release.md`
- Expected: editing an event's description or image always ends up on the
  snapshot you own.
- Actual: `find_or_create_event` dedupes on `(url, title, event_date,
  event_time)` only — `description` and `image_url` are not part of the key
  (`supabase/migrations/20240216000008_find_or_create_event.sql`). If an
  edit's four key fields match an existing snapshot (e.g. two people
  independently added the same listing, or the edited values happen to match
  an older snapshot), the caller is attached to that existing row, and a
  differing typed description/image_url is silently dropped in favor of the
  existing row's values. This is also the only path where a preview-cache
  seed can differ from the server row (the seeded detail briefly shows the
  typed description, then the fetch swaps in the row's).
- Repro: user A creates "Lunch" (url null, date D, time T, description
  "theirs"); user B creates "Lunch" (same url/date/time, description
  "mine") — B dedupes onto A's row and B's calendar shows "theirs".
- Fix (separate task, not yet scheduled): include description/image_url in
  the dedup key, or have the RPC return the full row so the client seeds and
  navigates from the actual database row rather than the form values.

### KI-005 — Android 3-button navigation bar covers the bottom of the screen

- Severity: minor
- Status: open
- Found: 2026-08-15 owner device smoke on Samsung with 3-button navigation
  (not gesture nav), `manual-tests/manual_test_report_2026-08-15-device.md`
  N-009 (People / Delete account). Still present 2026-08-17 on the Events
  calendar.
- Expected: in-app content sits fully on screen, clear of the system
  navigation bar.
- Actual: with the Samsung / 3-button navigation bar on, the bar covers a
  strip along the bottom of the app.
- Where it shows up (native Android, 3-button nav):
  - People (`app/(app)/people.tsx`) — first report: the bar covered the
    Delete account button in the account footer.
  - Events / calendar (`components/Calendar.tsx`, title "Events") — the bar
    covers the bottom of an event in the selected-day list.
  - Likely the bottom of the window in general, not those two screens only.
    Other screens have not been exhaustively re-checked on a 3-button-nav
    device.
- Repro: Android device, 3-button (Samsung) navigation bar enabled. Open
  People and look at the footer, or open Events with at least one event on
  the selected day. Not reported under gesture navigation. Web has no
  3-button nav (do not flag there).
- Owner ruling 2026-08-15: not a tester blocker (testers expected to use
  gesture nav). Recorded here so release review and device smoke do not
  re-flag the same overlap.

### KI-006 — Android hangs on a spinner after installing an updated APK until force-quit

- Severity: minor
- Status: open
- Found: 2026-08-18 owner smoke of preview APK `a7ce79c8` (promoted `78b9e5a`),
  Android. Owner ruling: not a tester blocker. May be specific to sideloading
  a new APK over a previous install.
- Expected: after an update, the first open reaches the calendar (or sign-in)
  without extra steps.
- Actual: the first open after installing the new APK shows a continuous
  spinner. Force-quitting from Android recents (swipe away) and opening
  again loads normally.
- Repro: install a newer APK over an existing Events install → open the app
  → spinner until swipe-away → reopen. Not observed on a subsequent cold
  start of the same binary. Web is unaffected (do not flag there).
- Fix (separate task): confirm whether this is Expo splash / session restore
  racing a fresh native binary, then either wait out the first session
  restore or recover without requiring a force-quit.

### KI-007 — Delete account + re-signup puts friends' shared events back on the calendar

- Severity: minor
- Status: open
- Found: 2026-08-18 owner smoke of preview APK `a7ce79c8`. Owner deleted the
  account to reset for testing, signed back in with the same phone, and
  friends' previously shared events were on the calendar again. Events
  added by agents during testing were gone. Owner ruling: not a tester
  blocker; delete feels incomplete.
- Expected: after delete + re-signup, the calendar is empty of the old
  account's copies (a clean slate).
- Actual: `delete_my_account()` does delete the caller's `user_events`.
  Other people's `my_people` rows for this phone revert to pending
  (`user_id` SET NULL). Re-signup resolves those rows and
  `deliver_pending_shares` copies every still-recorded incoming share onto
  the new account — so friends' events return, and self-created / agent-
  created copies (no remaining incoming share) do not. Confirm copy says
  it deletes your calendar and does not mention this.
- Repro: have a friend share an event to you → Delete account → sign in
  again with the same number → the friend's event is back.
- Fix (separate task): either also drop incoming `event_shares` (and the
  friends' `my_people` row, or a tombstone) so a returning phone is not
  treated as a first-time invite, or keep the re-delivery and tell the
  user in the confirm dialog. Acceptance in FEATURES.md currently lists
  "receives any pending shares" as intended — this finding is that the
  owner does not want a deleted account to come back with the old
  incoming calendar.

### KI-008 — Notifications modal switches are too small to tap comfortably

- Severity: minor
- Status: open
- Found: 2026-08-18 owner smoke of preview APK `a7ce79c8`. Owner ruling:
  not a tester blocker.
- Expected: Push and SMS switches are easy to hit (≥44pt).
- Actual: the `ThemedSwitch` controls in the People → Notifications modal
  (`app/(app)/people.tsx`) feel too small on a phone. Broader button
  size/clickability is also a Planned feature in `FEATURES.md`.
- Repro: People footer → Notifications → tap either switch. Native
  Android; not a web-review item.

### KI-009 — Android system Back does not close the Notifications modal

- Severity: minor
- Status: open
- Found: 2026-08-18 owner smoke of preview APK `a7ce79c8`. Owner ruling:
  not a tester blocker.
- Expected: the system Back button dismisses the Notifications sheet, same
  as Close.
- Actual: Back does nothing; only the in-sheet Close control dismisses it.
  The Notifications (and Your name) modals omit `onRequestClose`, which
  other sheets (`NotificationExplainer`, `ManualAddPersonModal`, contacts
  explainers) already wire.
- Repro: People → Notifications → Android Back. Close still works.
- Fix (separate task): `onRequestClose={() => setShowNotifPrefs(false)}`
  on that Modal (and the name-edit Modal for the same pattern).

### KI-010 — Push toggle ignores OS notification permission

- Severity: minor
- Status: open
- Found: 2026-08-18 owner smoke of preview APK `a7ce79c8`. Owner ruling:
  not a tester blocker.
- Expected: without OS notification permission, Push notifications is off.
  Turning it on shows the notification explainer, then the OS prompt.
- Actual: `users.notify_push` is independent of OS permission. You can
  flip Push on after Not now / Don't Allow; `send-notification` will still
  skip push when there is no token, so the toggle is a preference that
  does not match what the OS will deliver. The explainer is one-shot
  (`notification_explainer_answered`) and is not re-entered from this
  switch.
- Repro: deny (or Not now) the OS prompt → People → Notifications → Push
  still shows on (default true) and can be flipped.
- Fix (separate task): when permission is not granted, render Push as off;
  an on-flip reopens the explainer (Continue → OS ask; Not now leaves it
  off). SMS stays independent.

## Known limitations (by design — do not flag)

- **The native date/time picker never opens on web.**
  `@react-native-community/datetimepicker` is unsupported in the browser; the
  add/edit event forms deliberately use HTML `date`/`time` inputs on web
  instead. A native-style picker not appearing is correct behavior.
- **No browser notification-permission prompt.** Web never requests
  notification permission — web users get SMS instead. Its absence is a pass
  condition, not a bug.
