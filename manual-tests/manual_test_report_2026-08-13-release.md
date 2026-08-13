VERDICT: DON'T SHIP

# Release Review: staging @ fc6393a

- Reviewed staging commit: `fc6393a51f877a4fc482f33337a10a5b420507c3`
- Date: 2026-08-13
- Runner: Cursor cloud agent (orchestrator). Halted at Phase 2 Track 2.
- Target: https://staging.shared-events.pages.dev

The verdict certifies ONLY the reviewed commit. If `staging` moved past it
(anything other than this report commit and docs/tests-only changes), this
review is void — re-run the protocol from Phase 0.

This report supersedes the earlier same-day DON'T SHIP reports for
`2265ab1` (commit `65b5c2a`, Phase 0 red e2e / edit fork stale title on
Mobile Safari) and `f4335ac` (commit `8227208`, event-detail infinite
spinner). Those tips were reverted/fixed forward; this run is against the
current green staging tip `fc6393a` ("Log KI-002: dedup key excludes
description/image_url").

## Executive summary

Phase 0 green (full suite including e2e + staging preview deploy). Phase 1
smoke sweep PASS (create / share / remove / independent copies). Track 1
(auth & first-run, fresh OTP `+15555550999`) PASS. Track 2 (event
lifecycle) **FAIL** on item 4: **Edit Save aborts after 2s, shows a stack
trace to the user, and does not persist the new title.** Remaining tracks
were not started. Production was not promoted. No APK was built.

This is a different symptom than B-1 on `2265ab1` (WebKit showed the old
title after a save that appeared to succeed, with no error dialog). Here
the write is aborted client-side and `showError` dumps `AbortError: Timed
out` plus a stack. Do not treat a "paint the preview" fix as the solution.

## Checklist evidence

### Phase 0 — Gates

- [x] Staging tip recorded: `fc6393a51f877a4fc482f33337a10a5b420507c3`
- [x] Staging pipeline green including `full-suite / e2e`. Run
      [31675306382](https://github.com/ramseykilani/events-app/actions/runs/31675306382)
      (`Log KI-002: dedup key excludes description/image_url`), conclusion
      **success**. Jobs: `full-suite / checks` success; `full-suite / e2e`
      success (Playwright desktop Chrome + Mobile Safari + Mobile Chrome,
      including pixel-diff baselines); `Deploy staging preview` success.
- [x] Short-circuit not applicable: last SHIP report
      (`manual_test_report_2026-08-09-release.md`, reviewed `483a419`) is
      an ancestor, but the delta includes `app/`, `components/`, `lib/`,
      and `supabase/`. Same-day reports were DON'T SHIP, not SHIP.

### Phase 1 — Smoke sweep

Target: https://staging.shared-events.pages.dev, desktop ~1280px, Paper.
Accounts A `+15555550100` / B `+15555550103`. Event
`Ship smoke 2026-08-13 7842` created, shared, removed on both sides
(cleanup complete).

- [x] App loads at the staging URL; sign-in with test OTP works
- [x] Calendar renders; today's day list shows expected state (A had
      existing events)
- [x] Create an event (title only, today) → appears on calendar
- [x] Share it to account B → B sees it ("From E2E Account A")
- [x] Remove the event on A → gone on A, still on B; remove on B (cleanup)
- [x] No browser permission prompts, no visible errors, no app console errors
      (framework warnings only: expo-notifications-on-web, font CDN)

### Phase 2 Track 1 — Auth & first-run

Phone viewport 390×844. Throwaway test OTP `+15555550999` / `123456`
(added via Management API for this track, **removed after** — project
`sms_test_otp` restored to A+B only).

- [x] Sign-in: invalid phone → friendly alert ("Invalid phone number");
      valid phone → OTP screen
- [x] OTP: wrong code `000000` → friendly alert ("That code is incorrect
      or no longer valid…"); no debug dump. Resend showed ~60s countdown.
      Correct `123456` → in; walkthrough auto-showed
- [x] Brand-new account: walkthrough auto-showed once; Next advanced
      pages 1→2→3; Get Started landed on calendar
- [x] Reopen walkthrough via Help (`?`); Skip returned to calendar
- [x] Sign back in later: walkthrough did NOT auto-show
- [x] Offline/edge: DevTools Offline + reload showed Chrome's
      ERR_INTERNET_DISCONNECTED / retry UI, not a blank screen or
      spinner-forever; returning online recovered the calendar
- [x] Expired/old OTP → N/A: test-OTP pair always accepts `123456`;
      cannot force true expiry without waiting `sms_otp_exp` (240s).
      Wrong-code friendly alert already evidenced on item 2.

### Phase 2 Track 2 — Event lifecycle (halted at item 4)

Phone viewport 390×844, Paper, account A. Prefix `ShipT2`.

- [x] Add event: empty title+URL → Save disabled; title-only
      `ShipT2 title-only 8347` worked; URL `https://example.com` autofilled
      title "Example Domain" without blocking save
- [x] Date/time inputs: HTML date/time; `ShipT2 dated 5192` set to
      2026-08-20 15:30 landed on Aug 20 (not 19/21); detail showed
      "Thu, Aug 20 · 3:30 PM"
- [x] Event detail: formatted date, Share / Edit / Remove present, Open
      link opened example.com, Share opened the sheet
- [ ] Edit: change title → detail shows new title — **FAIL / BLOCKER**
      (see B-1). Stopped here.
- [ ] Remove: confirm dialog → event gone; cancellation leaves it
- [ ] Content stress: 200-char title, 2000-char description, URL-only
- [ ] Many events on one day (create 8+)
- [ ] Calendar: month navigation, event dots, pull-to-refresh

## Blockers

### B-1 — Edit Save times out, dumps a stack trace, and does not keep the new title

- Expected: Editing an event title and tapping Save forks a new snapshot
  (`find_or_create_event` + `user_events.event_id` update). The detail
  screen shows the **new** title within a few seconds. Failures, if any,
  are a short friendly message — never a stack trace.
- Actual: Save on the edit form raises a `window.alert` titled **Error**
  with body **Timed out** plus **Stack: AbortError: Timed out at
  AbortSignal…** (the `showError` dump). The form still shows the typed
  new title. After dismissing and returning to detail, the **old** title
  is still shown, with a "Could not refresh. Retry." banner. Chrome
  Network (DevTools open) marked `find_or_create_event` (and related
  `user_events` / `get_calendar_events` calls) red — the client aborted
  the write. Reproduced twice in the same session. Create in the same
  session (items 1–3) had succeeded.
- Repro:
  1. Open https://staging.shared-events.pages.dev at phone viewport
     ~390×844, Paper theme.
  2. Sign in as account A: `+15555550100` / OTP `123456`.
  3. Add event, title `ShipT2 title-only 8347` (or any unique title),
     Save, Cancel the share sheet, open the event from today's list.
  4. Tap Edit. Append ` edited` to the title. Tap Save.
  5. Observe: browser alert "Error / Timed out / Stack: AbortError…".
     Dismiss. Detail still has the pre-edit title (and may show
     "Could not refresh. Retry.").
  6. Account: A. Viewport: 390×844 (Chrome device emulation). Theme: Paper.
- Evidence:
  - `manual-tests/evidence/2026-08-13-release-fc6393a/b1-edit-save-timeout-dialog.webp`
    — edit URL still
    `/edit-event?eventId=1938fcec-a62c-46c6-a8ef-e8f5ec8a66c3&userEventId=f808168e-0115-4c5d-a876-00cc9dd51c20`;
    title field `ShipT2 title-only 8347 edited`; alert Error / Timed out
    / stack; Network: `find_or_create_event` red.
  - `manual-tests/evidence/2026-08-13-release-fc6393a/b1-detail-old-title-after-failed-edit.webp`
    — `/event/1938fcec-…` (same old id); title **ShipT2 title-only 8347**
    (no ` edited`); "Could not refresh. Retry."; Share / Edit / Remove
    still present.
- Reviewed commit: `fc6393a51f877a4fc482f33337a10a5b420507c3`
- Likely code (for the fixer — do not treat as the only cause):
  `app/(app)/edit-event.tsx` `handleSave` wraps **both**
  `find_or_create_event` and the follow-up `user_events` update in a
  single `withTimeout` (`lib/timeoutSignal.ts`, `FETCH_TIMEOUT_MS = 2000`)
  and passes that `AbortSignal` into supabase-js. When the 2s budget
  fires, the RPC is aborted, `catch` calls `showError('Error', err)`, and
  `showError` (`lib/showError.ts`) always appends `err.stack` — that is
  the dialog in the screenshot. `add-event.tsx` uses the same 2s wrapper
  around create; create worked in this session, so the budget is
  **borderline**, not universally dead. Event detail `load()` also uses
  `withTimeout` / `withRetries`, which matches the "Could not refresh"
  banner after the failed save.
  Do **not** retry aborted writes blindly: the server may have committed
  `find_or_create_event` after the client aborted, and a retry could
  attach the user to a different snapshot or drop description/image
  (KI-002). Write paths should not share the 2s "people hit refresh"
  fetch budget; user-facing failures on Save must go through a short
  alert, not `showError`'s stack dump. This is also **not** the
  `2265ab1` stale-state reuse bug (no error, old title painted from a
  reused `[id]` screen) — that commit is not on this tip.
- Cleanup: Track 2 halted before removing its events. On account A
  (`+15555550100`), leftover rows to ignore or delete via the app's
  Remove Event (caller's `user_events` only — never delete `events`
  rows): `ShipT2 title-only 8347`, the "Example Domain" event from
  `https://example.com`, `ShipT2 dated 5192` on 2026-08-20. Harmless if
  left; titles are unique enough that the next review will not collide.

## Known minor issues

None confirmed this run (halted at Track 2). KI-001 and KI-002 were not
re-checked.

## Ledger updates

- Added to `manual-tests/known_issues.md`: none (blockers never enter the ledger)
- Verified fixed and removed: none
- Still present (kept): KI-001, KI-002 (not re-checked this run)

## Tracks not run

- Track 2 items 5–8 (remove, content stress, 8+ events, calendar nav)
- Track 3: Sharing, people, circles
- Track 4: Visual sweep matrix
- Track 5: Edge & platform checks
- Phase 3: Skeptic pass

## Notes for the next ship-it

Fix B-1 on staging through the normal flow (fast checks first, then a
green `full-suite / e2e`). Do not promote. The next "ship it" re-runs
this protocol from Phase 0 against the new tip. Early phases are cheap;
re-running is expected.

The throwaway Track 1 OTP `+15555550999` was removed from
`sms_test_otp` after the track. That auth user may still exist
(harmless). Re-add a **fresh unused** 555 number if Track 1 needs a
zero-event account again — do not reuse `50102` or `50999` if those
users already have the onboarding flag / events.
