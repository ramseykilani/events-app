VERDICT: SHIP | DON'T SHIP

# Release Review: staging @ <short-sha>

- Reviewed staging commit: <full sha>   ← the commit this verdict certifies
- Date:
- Runner:
- Target: https://staging.shared-events.pages.dev

The verdict certifies ONLY the reviewed commit. If `staging` moved past it
(anything other than this report commit and docs/tests-only changes), this
review is void — re-run the protocol from Phase 0.

## Checklist evidence

Fill in every item from `manual-tests/release_review_checklist.md` — a
one-line note per item plus evidence paths for flags. An item may only be
marked N/A with a reason. If the review halted early, list the items that
never ran under "Tracks not run" below; do not tick them.

## Blockers

One entry per blocker. Each brief must be self-contained: a fresh agent with
zero context must be able to fix the bug from this section alone.

### B-1 — <one-line title>

- Expected:
- Actual:
- Repro: <exact steps, including account used, viewport, and theme>
- Evidence: <screenshot/recording paths>
- Reviewed commit: <sha>

## Known minor issues

Confirmed non-blocking issues the release ships with. Same brief format as
blockers. Each entry here is also added to `manual-tests/known_issues.md`
(with a KI-xxx id) in the same commit as this report.

### KI-xxx — <one-line title>

- Expected:
- Actual:
- Repro: <exact steps, including account used, viewport, and theme>
- Evidence: <screenshot/recording paths>
- Reviewed commit: <sha>

## Ledger updates

- Added to `manual-tests/known_issues.md`: <KI ids, or "none">
- Verified fixed and removed: <KI ids, or "none">
- Still present (kept): <KI ids, or "none">

## Tracks not run

<Only when the review halted early on a blocker: which phases/tracks never
ran. Delete this section for a complete review.>
