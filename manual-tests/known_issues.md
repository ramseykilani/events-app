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
  " theirs"); user B creates "Lunch" (same url/date/time, description
  "mine") — B dedupes onto A's row and B's calendar shows "theirs".
- Fix (separate task, not yet scheduled): include description/image_url in
  the dedup key, or have the RPC return the full row so the client seeds and
  navigates from the actual database row rather than the form values.

### KI-003 — Additive share re-notifies people already on the event (including yourself)

- Severity: minor
- Status: open
- Found: 2026-08-15, owner device smoke of preview `eab4bcd7` (promoted
  `8f3b660`). Owner ruling: accepted for this release; do not halt testers.
- Expected: sharing an event with additional people notifies **only those new
  recipients**. People already marked ✓ Shared — including a self-share
  (your own number in My People) — are not pinged again.
- Actual: `share.tsx` correctly sends only new person ids to `share_event`,
  then fire-and-forgets `send-notification` with `{ userEventId }`. The edge
  function loads **every** `event_shares` row for that `user_event` and
  sends push + SMS to each, with no "already notified" filter and no skip
  when `recipient user_id === sharer user_id`. So adding new people to an
  event you previously shared (including with yourself) re-delivers the
  original "X added you to …" notification to existing recipients.
- Repro: create an event, share it to your own number (or any recipient);
  later open Share, add someone new, confirm. You (and every prior
  recipient) get the notification again.
- Fix (separate task, not this release): pass the newly-shared person ids
  into `send-notification` (or have the RPC return them) and only notify
  those; skip the sharer. Optionally persist a notified-at on `event_shares`
  so retries cannot double-send either.

## Known limitations (by design — do not flag)

- **The native date/time picker never opens on web.**
  `@react-native-community/datetimepicker` is unsupported in the browser; the
  add/edit event forms deliberately use HTML `date`/`time` inputs on web
  instead. A native-style picker not appearing is correct behavior.
- **No browser notification-permission prompt.** Web never requests
  notification permission — web users get SMS instead. Its absence is a pass
  condition, not a bug.
