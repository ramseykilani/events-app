VERDICT: DON'T SHIP

# Release Review: staging @ 5def1c5

- Reviewed staging commit: 5def1c5749a910cb5c202b7a10e9270dd8214d76
- Date: 2026-09-04
- Runner: Cursor cloud agent (release-review orchestrator per `scripts/release-review-orchestrator.md`)
- Target: https://staging.shared-events.pages.dev

The verdict certifies ONLY the reviewed commit. If `staging` moved past it
(anything other than this report commit and docs/tests-only changes), this
review is void — re-run the protocol from Phase 0.

Note: `staging` advanced to `84aa596` ("STATUS: Bot push trigger live and
proven end-to-end") while this review ran. The delta is `STATUS.md` only —
docs, no product code — so the Phase 0 finding below applies unchanged to the
new tip (its pipeline will fail identically until B-1 is fixed). This report
commit was rebased onto `84aa596` for the push.

Review halted at **Phase 0**: the Staging pipeline for the reviewed commit is
red. Phase 1 and Phase 2 never ran — and could not have reviewed the right
code anyway, because the failed run skipped `Deploy staging preview`, so the
staging preview still serves the older green commit `3f9f2f0`.

Phase 0 detail: origin/staging `5def1c5`; Staging pipeline
https://github.com/ramseykilani/events-app/actions/runs/33846867322 —
`full-suite / checks` success, **`full-suite / e2e` failure** (3 failed, 164
passed), `Deploy staging preview` skipped. Short-circuit did not apply — the
delta since the 2026-09-02 SHIP (`ffd9eb4`) carries `app/`, `lib/`, and
`supabase/` changes (Affiliate Link Tagging, Beta Signup Pipeline, the
sign-in SMS consent line).

## Checklist evidence

### Phase 0 — Gates

- [x] Staging tip recorded: `5def1c5749a910cb5c202b7a10e9270dd8214d76`
- [x] Staging pipeline for the tip green — **FAILED**. Run 33846867322:
  `full-suite / e2e` red (details in B-1). Gate stops the review here.
- [x] Short-circuit check — N/A: code delta since the 2026-09-02 SHIP report
  (`app/(auth)/sign-in.tsx`, `app/(app)/event/[id].tsx`, `lib/affiliate*.ts`,
  `lib/reservedPhone.ts`, `supabase/functions/*`, two migrations), so a full
  protocol run was required.

### Tracks not run

Phase 1 (smoke sweep), Phase 2 Tracks 1–5, and Phase 3 (skeptic pass) never
ran — halted at Phase 0 per protocol. No checklist items beyond Phase 0 are
ticked; none may be inferred from this report.

## Blockers

### B-1 — Sign-in visual baselines predate the intentional SMS consent line; `full-suite / e2e` red on the staging tip

- Expected: the Staging pipeline is green on the reviewed commit; the
  `e2e/visual.spec.ts` sign-in pixel baselines match the current sign-in
  screen.
- Actual: `full-suite / e2e` fails deterministically on all three projects at
  `e2e/visual.spec.ts:72` "sign-in screen matches baseline" — desktop-chrome
  27490 px (3%), mobile-safari 24761 px (10%), mobile-chrome 20763 px (7%),
  identical across both retry attempts (fonts loaded, stable screenshot — not
  flake). Root cause is pinned: commit `82e0f0c` "Add SMS consent line to
  sign-in screen (A2P opt-in CTA)" intentionally added the consent line plus
  Terms/Privacy links to `app/(auth)/sign-in.tsx`, and the pixel baselines
  (`e2e/visual.spec.ts-snapshots/sign-in-desktop-chrome-linux.png`,
  `sign-in-mobile-chrome-linux.png`, `sign-in-mobile-safari-linux.png`) were
  last regenerated in `c44b03b` (Design System Consolidation) — before that
  change. The downloaded run artifacts show the actual render carrying the
  new consent line ("By tapping Send code, you agree to receive SMS sign-in
  codes from Shared Events … Reply STOP to opt out." + Terms of Service ·
  Privacy Policy) where the baseline has none. **This is not a product bug**:
  the change is intentional and owner-approved (STATUS.md → A2P 10DLC — the
  consent line is the campaign-resubmission evidence), and its Jest +
  `e2e/auth.spec.ts` coverage passes. Only the pixel snapshots are stale.
- Repro: re-run the Staging workflow on `5def1c5` (or push any commit to
  staging) → `full-suite / e2e` → exactly 3 failures:
  `visual.spec.ts › sign-in screen matches baseline` on desktop-chrome,
  mobile-chrome, mobile-safari.
- Fix (the documented path — AGENTS.md → Tests): run the **Regenerate visual
  baselines** workflow (Actions tab → pick the sign-in screen) so CI's own
  runners re-take the three `sign-in-*.png` baselines, verify, and commit
  them to staging. Never commit a locally regenerated mobile-safari baseline
  (VM fonts ≠ CI fonts). Then confirm the Staging pipeline goes green on the
  new tip — green also redeploys the staging preview, which the failed run
  skipped — and re-run this protocol from Phase 0 against the new tip.
- Evidence: run
  https://github.com/ramseykilani/events-app/actions/runs/33846867322 (e2e
  job 100942080559); orchestrator artifacts
  `/opt/cursor/artifacts/signin_actual_with_consent_line.png` (current
  render) vs `/opt/cursor/artifacts/signin_baseline_without_consent_line.png`
  (stale baseline), both from the run's playwright-report artifact.
- Reviewed commit: 5def1c5749a910cb5c202b7a10e9270dd8214d76

## Known minor issues

None identified — the review halted at Phase 0, before any track ran.

## Ledger updates

- Added to `manual-tests/known_issues.md`: none (blockers never enter the
  ledger; B-1 must be fixed, not accepted)
- Verified fixed and removed: none (Track 5's ledger re-check never ran)
- Still present (kept): unchanged — KI-001, KI-005, KI-006, KI-007, KI-008,
  KI-009, KI-010, KI-011, KI-012, KI-014, KI-016

## Tracks not run

Phase 1 (smoke sweep) and Phase 2 Tracks 1–5 (auth & first-run; event
lifecycle; sharing/people/circles; visual matrix; edge & platform) never
started — Phase 0's pipeline gate failed, and the skipped preview deploy
meant the staging URL did not serve the reviewed commit. Phase 3 (skeptic
pass) had no flagged evidence to examine. The next "ship it" re-runs the full
protocol from Phase 0 against the new staging tip.
