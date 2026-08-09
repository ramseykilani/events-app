VERDICT: SHIP

# Release Review Report — staging @ 483a419

## Run metadata
- Runner: Cursor cloud agent (orchestrator) + 5 track subagents (computerUse, cursor-grok-4.5-high-fast) + skeptic pass (generalPurpose)
- Date: 2026-08-09
- Branch: staging
- Commit reviewed at ship decision: 483a419 (includes all fixes below)
- Environment: staging preview, https://staging.shared-events.pages.dev
- Protocol: `scripts/release-review-orchestrator.md` + `manual-tests/release_review_checklist.md`

## Executive summary

First full run of the phased release review. **Two release-blocking bugs were
found and fixed before production**, plus a cluster of design-QA fixes from the
skeptic pass. All tracks final-verdict CLEAN; skeptic final verdict SHIP.

### Blockers found and fixed (would have shipped without this review)

1. **Infinite boot spinner on web reload** (Track 1). A tab reload/close
   mid-auth-operation could orphan the supabase-js Web Lock; every later
   `getSession()` waited forever. Real users hitting reload would see a
   permanent spinner with no recourse. Fix: no-op auth lock on web (matching
   native) + boot gate no longer blocks on the profile RPC. Commit `40aeb9b`.
   Re-verified CLEAN by the same track agent (multiple reloads, tab
   close/reopen, two accounts).
2. **Events silently saved to year 1906** (Track 2). The browser's segmented
   date widget makes year typos easy (2026 → 1906); two independent agent
   attempts produced 1906. Event vanished a century into the past. Fix: input
   min/max + save-time plausibility guard with a clear message, on both add
   and edit. Commit `aff508a`. Re-verified CLEAN. (Orchestrator initially
   misjudged this as a false positive after a DB-level check showed correct
   storage for a *programmatically-filled* date — the typed-input path was the
   bug. Lesson recorded: verify claims through the same input path the agent
   used.)

### Design-QA fixes (skeptic pass)

- URL input rendered ~¼ width on desktop web (row layout without flex) — fixed
  `flex: 1`, pixel baseline regenerated and guarding it. Commit `125e776`.
- Contrast below the design doc's ≥4.5:1 floor: paper linkText 4.27→5.40,
  paper textTertiary 2.60→4.83, evening textTertiary 3.38→5.14 (commit
  `125e776`).
- Calendar: selected-day dot now uses the `calendarSelectedText` token (was
  library-default white); month header takes the theme's title font. Commit
  `483a419`.
- My (orchestrator) matrix capture script had inverted theme-toggle logic,
  producing falsified "paper" cells — caught by the skeptic via checksum
  comparison. Recaptured with token-verified themes.

### Resolved flags

- Dangling "signed-out session shows calendar" artifact: independently
  reproduced as NOT an auth bypass — the track agent cleared site data without
  reloading, leaving the in-memory session alive. Deterministic check: fresh
  context → `/sign-in`, zero event data, stable across reloads.
- Track 3 initially self-reported CLEAN with untested items — rejected by the
  orchestrator, completed on second pass, and now additionally backed by
  deterministic e2e coverage (`share.spec.ts`, `hide.spec.ts`,
  `people.spec.ts`, all green in CI).

## Results (checklist roll-up)

| Area | Result | Notes |
|---|---|---|
| Phase 0 gates (CI full suite + pixel diffs) | pass | CI run 31317027072 green on staging tip |
| Phase 1 smoke sweep | pass | incl. forwarding cycle A→B→remove |
| Track 1 auth & first-run | pass (after fix) | blocker #1; first-run walkthrough verified on a fresh throwaway account |
| Track 2 event lifecycle | pass (after fix) | blocker #2; content stress, bulk-day, month nav all pass |
| Track 3 sharing/people/circles | pass | machine-verified by CI e2e |
| Track 4 visual matrix | pass (after recapture) | 12 cell matrix re-reviewed post-fix |
| Track 5 edge/platform | pass | console clean, double-submit guards, keyboard reachability, deep link, back/forward, safe areas |
| Phase 3 skeptic | SHIP | evidence independently reproduced (checksums, code, CI, live probe) |
| Native-only (SMS content, push tokens) | skip | stays manual by design |

## Known non-blocking nits (for the backlog)

- Text-action touch targets ("Skip", "Back", list "Edit"/"Remove") deserve a
  hitSlop audit against the 44pt convention.
- Shared test account A carries ~19 historical events; worth an occasional
  tidy so review screenshots stay readable.
- HTML date inputs on desktop web remain merely-OK UX (native widget); the
  guard makes mistypes safe, but a friendlier picker could be a future polish
  item.

## Follow-up actions

- None blocking. Production promotion is the owner's call (`git push origin
  origin/staging:production` once the staging pipeline is green on 483a419).
