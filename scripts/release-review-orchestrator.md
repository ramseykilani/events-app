# Ship-It Protocol (orchestrator instructions)

Read this when the owner says anything like "ship it", "push to production",
"release staging". You are the orchestrator: you run the gates, you spend the
review budget wisely (fail fast — never complete an expensive review when a
blocker is already known), and you alone promote.

## Read first — what you may not do

You are the **reviewer**, not the developer. During this protocol you may NOT
edit app code, commit or push fixes, run migrations, or modify the product in
any way. The only git writes allowed are: the release-report commit to
`staging` (report file plus `manual-tests/known_issues.md` updates — docs
only), the promotion push to `production` on SHIP, and the post-promotion
rollout bookkeeping (`STATUS.md`). Never a code change.

A found bug is a **successful review outcome**, not a task. The moment ANY
phase or track surfaces a real blocker: halt all sub-agents, write the report
with `VERDICT: DON'T SHIP`, push it to `staging`, summarize the blocker for
the owner, and END YOUR TURN. "Stop" means the session stops — not "stop the
tracks and fix it." Fixes are independent tasks: the owner hands the report
to a fresh agent (or another session), which fixes through the normal staging
flow. The next "ship it" starts a brand-new protocol run from Phase 0 against
the new tip. Never continue a review across a staging change.

The review is bound to the staging tip recorded in Phase 0. If `staging`
moves for any reason while the review runs, this review is void — restart
from Phase 0 against the new tip.

For this task, "complete" means a verdict delivered — not a shippable app.

The checklist that defines "complete" is
`manual-tests/release_review_checklist.md`. Every item must be evidenced.

## Phase 0 — Gates (seconds, free). Stop on any failure.

- [ ] Record the staging tip: `git fetch origin staging &&
      git rev-parse origin/staging`. This is the **reviewed commit** — the
      report certifies it, and promotion re-checks it.
- [ ] The Staging pipeline for the staging tip is green in CI
      (`gh run list --branch staging --limit 1`), including `full-suite / e2e`
      (which contains the pixel-diff baselines) — and NOT merely in progress.
      The e2e suite and the review agents share the same Supabase test
      accounts; running them concurrently causes OTP/session contention and
      false failures. Never start Phase 1 while a pipeline run is in flight.
- [ ] If the pipeline never ran e2e (secrets warning), run the full suite
      locally instead: `npm run build:web && CI=1 npm run test:e2e`.
- [ ] **Short-circuit:** if a release report on `staging`
      (`manual-tests/manual_test_report_<date>-release.md`) has
      `VERDICT: SHIP` whose reviewed commit is an ancestor of the staging tip
      AND the delta since is docs/tests/tooling only (no `app/`,
      `components/`, `lib/`, `constants/`, or `supabase/` changes), cite that
      report and skip to Promotion. Any code delta means running the full
      protocol.

## Phase 1 — Smoke sweep (~5–10 min). Stop on any failure.

Launch ONE `computerUse` subagent (model `cursor-grok-4.6-high-fast`) with the
Phase 1 section of the checklist against
https://staging.shared-events.pages.dev. If anything fails → write the report
(see "Verdict & report") with `VERDICT: DON'T SHIP`, push it to `staging`,
and END YOUR TURN. Do not start Phase 2.

## Phase 2 — Deep tracks. Halt remaining tracks on a blocker.

Run the five checklist tracks as separate `computerUse` subagents (model
`cursor-grok-4.6-high-fast`), each with ONLY its track's checklist section
plus the shared rules below. Two platform realities (learned in the first
drill): (1) a session can only drive ONE computerUse subagent at a time, even
with `environment: cloud` — so in-session tracks run SEQUENTIALLY; (2) a
resumed computerUse agent accumulates every action's screenshot in its
context and will eventually fail to launch ("too many images") — so each
track must be a FRESH subagent. Resume a track at most once, only to re-check
a single ambiguous step; anything more means launching fresh. You never
resume to verify a fix — you never fix. True parallelism is available via the
CI-launched path (`agent-ux-review.yml`, each run its own VM) or multiple
API-launched cloud agents. Tracks 1–3 mutate data and use separate accounts
(track 1: fresh throwaway test OTP — add via the Supabase Management API per
AGENTS.md and REMOVE it after; track 2: account A; track 3: accounts A+B;
tracks 4–5 are read-only-ish and share A).

Shared rules for every track (paste into each track prompt, followed by the
current open entries from `manual-tests/known_issues.md`):

- Test accounts are shared fixtures — clean up everything you create; unhide
  anyone you hid.
- Screenshot ONLY flagged issues plus one final-state shot per form factor
  (token discipline).
- Severity: a **blocker** makes the release wrong — broken core flow (auth,
  create, share, remove), data loss, crash, debug output shown to users,
  anything a user can't reasonably live with. A **minor** is cosmetic or an
  edge-case papercut. If you're unsure whether something is a blocker, it IS
  a blocker — a false DON'T SHIP costs one report; a false SHIP ships a
  broken release.
- On a blocker: note it immediately and stop your track.
- On a minor: screenshot it, note it, and KEEP TESTING — minors never halt.
- Known issues: the entries pasted from `manual-tests/known_issues.md` are
  known and accepted. Do NOT flag, halt on, or screenshot them. If one
  appears materially WORSE than its entry describes, flag that as a new
  finding. If unsure whether what you see matches an entry, flag it as new —
  the skeptic pass will dismiss duplicates.

Why fail-fast on blockers: evidence gathered after a known blocker is
contaminated by it — in an app this size, a broken core flow cascades into
every later track, and you can't tell a new bug from a downstream symptom.
Halt, report, and let the re-run after the fix produce clean evidence.

If ANY track returns a blocker: do not wait for the others (cancel them if
still running), write the report with `VERDICT: DON'T SHIP`, push it to
`staging`, and END YOUR TURN.

## Phase 3 — Skeptic pass

Launch ONE subagent (default/inherit model — judgment matters here) with only
the flagged evidence and the visual-matrix screenshots. For each flag it
decides: false alarm (dismiss with a reason — including "matches KI-xxx"),
confirmed **minor** (goes in the report's Known minor issues section), or
confirmed **blocker** (a track judged too generously — this UPGRADES the
verdict to DON'T SHIP). It also looks for anything the tracks missed.

## Verdict & report

Write `manual-tests/manual_test_report_<YYYY-MM-DD>-release.md` from
`manual-tests/release_review_report_template.md`: first line `VERDICT: SHIP`
or `VERDICT: DON'T SHIP`, the reviewed commit SHA, the FULL checklist
evidenced (or the un-run tracks listed), and a self-contained brief per
blocker and per confirmed minor (expected vs actual, exact repro with
account/viewport/theme, evidence paths) — a fresh agent must be able to fix
the bug from the brief alone.

Update `manual-tests/known_issues.md` in the same commit: add confirmed
minors as KI-xxx entries (on either verdict — they exist on staging), remove
entries the review's re-check verified fixed. Blockers NEVER enter the
ledger: a blocker must be fixed, not accepted.

Commit the report plus ledger updates as a docs-only commit and push it
**straight to `staging`** — no PR, no report branch. Then summarize the
verdict for the owner plainly (blocker briefs on DON'T SHIP) and, on DON'T
SHIP, END YOUR TURN.

## Promotion (only on VERDICT: SHIP)

1. Push the report commit to `staging` (above) — the report ships WITH the
   code it certifies, so production always contains the review that blessed
   it.
2. Wait for the full suite to go green on the report commit
   (`gh run list --branch staging --limit 1`). Branch protection requires the
   checks on the exact promoted commit, so this wait is mandatory — but it is
   CI only: no agent re-review, the delta is docs-only.
3. **Guard:** verify the staging tip is the reviewed commit plus docs/tests-
   only deltas (this report, ledger updates). If `staging` carries any
   unreviewed code, this review is void — do NOT promote; re-run from
   Phase 0.
4. Promote:

   ```bash
   git fetch origin && git push origin origin/staging:production
   ```

   Branch protection requires the full-suite checks to be green on that exact
   commit — if the push is rejected, the checks aren't green; fix that first,
   never bypass.
5. The production push deploys automatically. Confirm the deploy
   (`gh run list --branch production --limit 1`) and tell the owner the
   release is live.

## Native rollout (after promotion)

The production push deploys the **web** app only — no native binary moves on
its own. Testers get updates through this explicit sequence (auth setup and
command details: AGENTS.md → Native builds (agent-run); current state:
`STATUS.md`):

1. Build the owner's smoke APK from the exact promoted commit:
   `eas build --platform android --profile preview --non-interactive --wait`.
   Hand the owner the artifact link plus the smoke checklist from
   `manual-tests/native_device_smoke.md` — print it inline; never make them
   go find it.
2. Wait for the owner's explicit pass/fail. On fail: the fix is an
   independent task on staging (fresh session, per the DON'T SHIP handoff),
   and the next ship-it re-runs this protocol from Phase 0. Testers never
   see the build.
3. On pass: build and submit production to the Play internal track:
   `eas build --platform android --profile production --non-interactive --wait`
   then `eas submit --platform android --profile production --non-interactive --latest`.
   iOS (TestFlight) joins once iPhone testers exist — same profiles, with the
   ASC key env vars exported.
4. Update `STATUS.md` (build numbers, links, date) and tell the owner the
   build is rolling out to testers.

If the EAS secrets are not in the environment (`EXPO_TOKEN`, and for submits
the Play/ASC credentials), stop after the git promotion and tell the owner
exactly which secret to add — the web release is already live either way.
Builds are metered (free plan: 15 Android + 15 iOS per month); this loop
spends 1–2 per release, so never build speculatively.

## If the verdict is DON'T SHIP

The report on `staging` is the bug record — hand the owner the file path.
Fixes are independent tasks: a fresh agent session works from the report's
blocker briefs and pushes through the normal staging flow (fast checks first,
per AGENTS.md). When the owner next says "ship it", re-run this protocol from
Phase 0 against the new tip — early phases are cheap by design, so re-running
is always fine.
