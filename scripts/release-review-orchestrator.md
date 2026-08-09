# Ship-It Protocol (orchestrator instructions)

Read this when the owner says anything like "ship it", "push to production",
"release staging". You are the orchestrator: you run the gates, you spend the
review budget wisely (fail fast — never complete an expensive review when a
blocker is already known), and you alone promote.

The checklist that defines "complete" is
`manual-tests/release_review_checklist.md`. Every item must be evidenced.

## Phase 0 — Gates (seconds, free). Stop on any failure.

- [ ] The Staging pipeline for the staging tip is green in CI
      (`gh run list --branch staging --limit 1`), including `full-suite / e2e`
      (which contains the pixel-diff baselines) — and NOT merely in progress.
      The e2e suite and the review agents share the same Supabase test
      accounts; running them concurrently causes OTP/session contention and
      false failures. Never start Phase 1 while a pipeline run is in flight.
- [ ] If the pipeline never ran e2e (secrets warning), run the full suite
      locally instead: `npm run build:web && CI=1 npm run test:e2e`.

## Phase 1 — Smoke sweep (~5–10 min). Stop on any failure.

Launch ONE `computerUse` subagent (model `cursor-grok-4.5-high-fast`) with the
Phase 1 section of the checklist against
https://staging.shared-events.pages.dev. If anything fails → write the report
(see below) with `VERDICT: DON'T SHIP` and STOP. Do not start Phase 2.

## Phase 2 — Deep tracks. Halt remaining tracks on a blocker.

Run the five checklist tracks as separate `computerUse` subagents (model
`cursor-grok-4.5-high-fast`), each with ONLY its track's checklist section plus
the shared rules below. Two platform realities (learned in the first drill):
(1) a session can only drive ONE computerUse subagent at a time, even with
`environment: cloud` — so in-session tracks run SEQUENTIALLY; (2) a resumed
computerUse agent accumulates every action's screenshot in its context and
will eventually fail to launch ("too many images") — so each track must be a
FRESH subagent (never resume for a new track; resume only to verify a fix for
that track). True parallelism is available via the CI-launched path
(`agent-ux-review.yml`, each run its own VM) or multiple API-launched cloud
agents. Tracks 1–3 mutate data and use separate accounts (track 1: fresh
throwaway test OTP — add via the Supabase Management API per AGENTS.md and
REMOVE it after; track 2: account A; track 3: accounts A+B; tracks 4–5 are
read-only-ish and share A).

Shared rules for every track: test accounts are shared fixtures — clean up
everything you create; unhide anyone you hid; screenshot ONLY flagged issues
plus one final-state shot per form factor (token discipline); note any
blocker immediately and stop your track.

If ANY track returns a blocker: do not wait for the others (cancel them if
still running), write the report with `VERDICT: DON'T SHIP`, and stop.

## Phase 3 — Skeptic pass

Launch ONE subagent (default/inherit model — judgment matters here) with only
the flagged evidence and the visual-matrix screenshots. It confirms or
dismisses each flag and looks for anything the tracks missed. False alarms get
dismissed with a reason; confirmed or new flags block the release.

## Verdict & report

Write `manual-tests/manual_test_report_<YYYY-MM-DD>-release.md` from
`manual-tests/manual_test_report_template.md` with the FULL checklist
evidenced, commit it on branch `cursor/release-review-<date>-c3a1`, and open a
PR against `staging` titled "Release review: staging @ <short-sha>" whose
first line is `VERDICT: SHIP` or `VERDICT: DON'T SHIP`.

## Promotion (only on VERDICT: SHIP)

```bash
git fetch origin && git push origin origin/staging:production
```

Branch protection requires the full-suite checks to be green on that exact
commit — if the push is rejected, the checks aren't green; fix that first,
never bypass. The production push deploys automatically. Confirm the deploy
(`gh run list --branch production --limit 1`) and tell the owner the release
is live.

## If the verdict is DON'T SHIP

Summarize the blockers for the owner plainly. When they (or another agent
session) say the fixes are in, re-run this protocol from Phase 0 — early
phases are cheap by design, so re-running is always fine.
