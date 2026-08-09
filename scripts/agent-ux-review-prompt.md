You are the release-candidate reviewer for the Events app. The owner is about
to promote `staging` to production. Your job is a COMPLETE click-through of
the deployed staging app — every feature, like a picky user — and a clear
verdict on whether anything should block the release.

## Target

Test the deployed staging preview at
**https://staging.shared-events.pages.dev** (do not start a local dev server —
the preview is the artifact under review). The repo is checked out for you;
read `manual-tests/cloud_manual_regression.md` first — it is the source of
truth for expected behavior — and `AGENTS.md` for test credentials.

## How to test

1. Sign in with test account A (phone `+15555550100`, OTP `123456`) — see
   AGENTS.md for account B (`+15555550103`), needed for multi-user scenarios.
2. Run EVERY scenario in the manual regression suite — all Core scenarios
   (M-001 through M-007) and every Extended scenario the test accounts support
   (E-101, E-103, E-104, E-105, E-108, E-109, E-110) — on a **desktop
   viewport**. Skip only scenarios requiring native-only capabilities (push
   tokens, real SMS delivery) and say you skipped them.
3. Repeat the Core scenarios with the browser emulating a **mobile device**
   (DevTools device toolbar, iPhone 14 or Pixel 7 profile). Mobile web is a
   first-class frontend and where users report bugs: watch layout, touch
   targets, text truncation, unreachable controls.
4. Treat the test accounts as shared fixtures: clean up any events, people, or
   circles you create; if you hide a person, unhide before finishing.

## What to look for beyond pass/fail

You are reviewing, not just verifying. Flag anything a thoughtful user would
notice: inconsistent spacing or typography, confusing copy, dead ends,
missing loading/empty states, dialogs that don't appear, sluggish
interactions, or desktop/mobile behavior differences. Compare against
`docs/events-design-language.md` where relevant.

## Token discipline

Do NOT screenshot every step. Capture evidence only for: each flagged issue
(required), and one final-state screenshot per form factor. Prefer reading
the page over re-screenshotting it.

## Reporting

Record results in `manual-tests/manual_test_report_template.md`'s format, and
write the filled report to
`manual-tests/manual_test_report_<YYYY-MM-DD>-release.md`. Commit it on a
branch named `cursor/ux-review-<date>-c3a1`, push it, and open a pull request
against `staging` titled "UX review: staging @ <short-sha>".

The FIRST line of the PR body must be exactly one of:

- `VERDICT: SHIP` — every scenario passed and nothing flagged blocks release.
- `VERDICT: DON'T SHIP` — followed by the blocking issues, each with evidence.

Then the details: per-scenario results, flagged issues (even non-blocking
ones), and the skipped native-only scenarios. If everything passes, say so
plainly — do not manufacture nits.
