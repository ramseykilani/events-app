VERDICT: DON'T SHIP

# Release Review: staging @ 2265ab1

- Reviewed staging commit: 2265ab1e9f5b83ab38208c2eec8865dc65a0c64a
- Date: 2026-08-13
- Runner: Cursor cloud agent (orchestrator). Halted at Phase 0 — no click-through tracks launched.
- Target: https://staging.shared-events.pages.dev

The verdict certifies ONLY the reviewed commit. If `staging` moved past it
(anything other than this report commit and docs/tests-only changes), this
review is void — re-run the protocol from Phase 0.

This report supersedes the earlier same-day DON'T SHIP for `f4335ac`
(commit `8227208`, event-detail infinite spinner). Two fix commits landed
after that (`8877adf`, then `2265ab1`). Phase 0 against the new tip is red.

## Executive summary

Phase 0 failed: the Staging pipeline for `2265ab1` is **red**. `full-suite /
checks` (tsc, conventions, Jest, SQL) passed; `full-suite / e2e` failed.
Deploy staging preview was skipped. Per the orchestrator, a red pipeline
stops the review — Phase 1–3 were not started, production was not promoted,
and no APK was built.

The e2e failure is a **core edit-fork regression** introduced by `2265ab1`
("Paint event detail immediately and abort hung fetches"). After editing an
event title and tapping Save, Mobile Safari still shows the **pre-edit**
title on the detail screen. The same spec passed on desktop Chrome and
Mobile Chrome in the same run, and the previous staging tip (`8877adf`) had
a green full suite including this spec.

## Checklist evidence

### Phase 0 — Gates

- [x] Staging tip recorded: `2265ab1e9f5b83ab38208c2eec8865dc65a0c64a`
- [ ] Staging pipeline green including `full-suite / e2e` — **FAIL**. Run
      [31662043947](https://github.com/ramseykilani/events-app/actions/runs/31662043947)
      (`Paint event detail immediately and abort hung fetches`), conclusion
      **failure**. Jobs: `full-suite / checks` success; `full-suite / e2e`
      failure; `Deploy staging preview` skipped. Pixel-diff baselines are
      inside that e2e job, so they did not certify this tip.
- [x] Short-circuit not applicable: last SHIP report
      (`manual_test_report_2026-08-09-release.md`) is an ancestor, but the
      delta includes `app/`, `components/`, `lib/`, and `supabase/`. The
      earlier 2026-08-13 report was `VERDICT: DON'T SHIP` for `f4335ac`, not
      a SHIP ancestor of this tip.

### Phase 1 — Smoke sweep

Not run (halted at Phase 0).

## Blockers

### B-1 — Edit Save on Mobile Safari returns to the old title (fork not shown)

- Expected: Editing an event title and tapping Save forks a new snapshot and
  the detail screen shows the **new** title (Share / Edit / Remove still
  present). Covered by `e2e/event-detail.spec.ts` ("event detail: share
  sheet, edit fork, formatted date, remove") on all three Playwright
  projects, including `mobile-safari`.
- Actual: On `[mobile-safari]`, after `titleInput.fill(editedTitle)` and
  Save, `visibleText(page, editedTitle)` is not found within 15s. The
  screenshot and accessibility tree show the **original** title (no
  ` edited` suffix), formatted date `Thu, Aug 13`, and Share / Edit / Remove
  Event — not a spinner, not the "Could not load this event" Retry UI, not
  the edit form. Failed on the first attempt and on retry #1 (same shape).
  Same CI run: 57 passed / 1 failed; desktop Chrome and Mobile Chrome passed
  this spec. Parent tip `8877adf` ("Fix event detail hanging on an infinite
  spinner") had a green Staging run including this spec
  ([31657475297](https://github.com/ramseykilani/events-app/actions/runs/31657475297)).
- Repro:
  1. Build and run Playwright against the `2265ab1` web bundle (CI already
     did this): `npm run build:web && npx playwright test e2e/event-detail.spec.ts --project=mobile-safari`.
  2. The spec signs in via the e2e fixture (account A `+15555550100`),
     creates `E2E detail mobile-safari <timestamp>`, opens detail, taps
     Edit, appends ` edited` to the title, taps Save.
  3. Observe: detail still shows the pre-edit title. CI titles:
     `E2E detail mobile-safari 1786589696151` (attempt 1) and
     `E2E detail mobile-safari 1786589714666` (retry 1). Expected visible
     text was those strings plus ` edited`.
  4. Viewport: Mobile Safari (Playwright WebKit). Theme: default Paper.
- Evidence:
  - CI run: https://github.com/ramseykilani/events-app/actions/runs/31662043947
  - Playwright report artifact: https://github.com/ramseykilani/events-app/actions/runs/31662043947/artifacts/9166660274
  - `manual-tests/evidence/2026-08-13-release-2265ab1/b1-edit-save-shows-old-title-attempt1.png`
  - `manual-tests/evidence/2026-08-13-release-2265ab1/b1-edit-save-shows-old-title-retry1.png`
  - Accessibility snapshot from CI (both attempts): `button "Back"`; text
    `E2E detail mobile-safari <ts> Thu, Aug 13`; `button "Share"`;
    `button "Edit"`; `button "Remove Event"`. No `edited` substring.
- Reviewed commit: `2265ab1e9f5b83ab38208c2eec8865dc65a0c64a`
- Likely code (for the fixer — do not treat as the only cause):
  `2265ab1` seeds event detail from `lib/eventPreviewCache.ts` and aborts
  fetches after `FETCH_TIMEOUT_MS` (2s) with retries
  (`lib/timeoutSignal.ts`). Edit save in `app/(app)/edit-event.tsx` writes a
  preview for `newEventId` then `router.replace(\`/(app)/event/${newEventId}\`)`.
  `app/(app)/event/[id].tsx` initializes `event` / `userEventId` /
  `hasContentRef` from the preview **once** (`useState(seeded)`). Expo
  Router on web often **reuses** the `[id]` screen when replacing Edit with
  another `/event/:id`, so React state can keep the **old** snapshot. If
  `load()` for the new id is aborted, times out, or does not re-run,
  `hasContentRef.current` stays true and the catch path keeps the stale
  event with Share/Edit/Remove — matching the screenshot (old title, actions
  present, no error UI). WebKit is slower than Chromium, which would explain
  why only `mobile-safari` failed. Also confirm Save actually persisted the
  fork (if `find_or_create_event` returned the old id because the edited
  title never made it into the form state, replace would reopen the old
  snapshot). The previous spinner hang (B-1 on `f4335ac`) is a different
  symptom; do not ship a "paint immediately" fix that trades an infinite
  spinner for a silent stale snapshot.
- Cleanup: e2e creates unique titles and tries to remove them; leftover
  `E2E detail mobile-safari *` rows on account A are possible if Save forked
  but the spec died before Remove. Safe to delete the caller's `user_events`
  for those titles; do not delete `events` rows.

## Known minor issues

None confirmed this run (halted at Phase 0). KI-001 was not re-checked.

## Ledger updates

- Added to `manual-tests/known_issues.md`: none
- Verified fixed and removed: none
- Still present (kept): KI-001 (not re-checked this run)

## Tracks not run

- Phase 1: Smoke sweep
- Track 1: Auth & first-run
- Track 2: Event lifecycle
- Track 3: Sharing, people, circles
- Track 4: Visual sweep matrix
- Track 5: Edge & platform checks
- Phase 3: Skeptic pass

## Notes for the next ship-it

Fix B-1 on staging through the normal flow (fast checks **and** a green
`full-suite / e2e`, including `mobile-safari` `e2e/event-detail.spec.ts`).
Do not promote. The next "ship it" re-runs this protocol from Phase 0
against the new tip. Staging preview was **not** redeployed for `2265ab1`
(deploy job skipped on the red e2e); https://staging.shared-events.pages.dev
is still the last green bundle (`8877adf` or earlier), so a click-through
against that URL would not be testing this tip.
