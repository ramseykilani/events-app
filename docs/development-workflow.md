# Development Workflow

How changes move from a branch to production, what gets tested where, and why.

## Branches

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `master` | Production. Nothing lands here except via a `develop → master` PR. | https://shared-events.pages.dev |
| `develop` | Standing integration branch. All feature work merges here first. | https://develop.shared-events.pages.dev |
| feature branches (`cursor/*`, `feature/*`, …) | One change each, branched off `develop`, merged back via PR. | — |

The develop preview is a Cloudflare Pages **branch alias**: any
`wrangler pages deploy --branch=develop` updates
`https://develop.shared-events.pages.dev`. No extra infrastructure — the same
project, same Wrangler config, different branch name. It shares the production
Supabase backend, so use the test-OTP accounts (AGENTS.md) there rather than
real phone numbers.

## What runs where

| Trigger | Workflow | What runs |
|---------|----------|-----------|
| PR → `develop` | `ci-fast.yml` | `tsc --noEmit`, convention checks, Jest, SQL semantics suite. Fast — this is the only gate on individual features. |
| Push to `develop` (i.e. every merged feature) | `develop.yml` | **Full suite** (`full-suite.yml`): all fast checks + web build + Playwright e2e on desktop Chrome, Mobile Safari (WebKit) and Mobile Chrome. If green, redeploys the develop preview with the exact bundle the e2e job tested. |
| Green `develop.yml` run | `agent-ux-review.yml` | Launches a Cursor Cloud Agent that drives the develop preview like a user (desktop + mobile viewports, manual regression suite) and opens a report PR. Inert until `CURSOR_API_KEY` is set — see "Agentic UX review" below. |
| PR `develop → master` (release PR) | `release.yml` | Refuses any source branch that isn't `develop`, then re-runs the **full suite** on the merge result. This is the release gate. |
| Push to `master` | `deploy-web.yml` | Production deploy (unchanged). |

Because the full suite already ran on the tip of `develop`, a release PR is
normally a formality: open it, watch it go green, merge. The agentic UX review
(or a manual pass with `manual-tests/cloud_manual_regression.md` when it's not
configured yet) is the pre-release sanity check on the preview.

## Layers of the safety net

Ordered cheapest → most expensive; each layer catches what the layer above
can't:

1. **Convention checks** (`npm run test:conventions`, `scripts/check-conventions.mjs`)
   — mechanical enforcement of the rules users experience as inconsistencies:
   every touchable has `accessibilityRole` (JSX-aware via the TypeScript AST),
   no `Alert.alert` outside the dialog helpers (it's a no-op on web), no
   hard-coded hex colors outside `constants/Colors.ts`. Intentional exceptions
   carry an inline `conventions-ok` comment with the reason.
2. **Jest + SQL semantics** — units, components, DB invariants.
3. **Playwright e2e** (`e2e/`) — real browser, real Supabase, three form
   factors. Covers: sign-in validation and OTP cooldown/errors, onboarding
   controls, calendar shell + navigation, theme switching with persistence,
   add/edit/remove event (web date inputs, fork semantics), share-sheet
   disabled/selected states, the A→B share flow with forwarding semantics,
   hide/unhide, people/circle management.
4. **Agentic UX review** — a cloud agent clicking through the deployed preview
   with judgment (visual polish, copy, mobile feel), reported as a PR.

## Agentic UX review

`agent-ux-review.yml` fires after every green Develop pipeline (or manually
via workflow_dispatch) and launches a Cursor Cloud Agent through the Cloud
Agents API (`POST /v1/agents`) with `scripts/agent-ux-review-prompt.md`. The
agent gets a full desktop VM, tests the develop preview on desktop and
mobile-emulated viewports following the manual regression suite, and opens a
report PR against `develop` with its findings and screenshots.

One-time setup: add the repo secret `CURSOR_API_KEY` (Cursor Dashboard → API
Keys). Until then the workflow exits quietly. The agent's own VM secrets
(`EXPO_PUBLIC_SUPABASE_*`, test accounts) come from the Cursor dashboard like
any cloud agent run.

**Alternative without CI plumbing:** create a Cursor Automation
(cursor.com/automations) with a "Push to branch: develop" trigger and the same
prompt file as the instructions. Enable only one of the two, or every push
gets two reviews.

Note: `workflow_run` triggers read the workflow file from the default branch,
so the automatic trigger starts after this reaches `master`; before that, use
workflow_dispatch or the Automation.

## The e2e suite

Playwright, in `e2e/`, configured by `playwright.config.ts`.

```bash
npm run build:web          # the suite serves dist/ locally by default
npm run test:e2e           # all projects: desktop-chrome, mobile-safari, mobile-chrome
npm run test:e2e:mobile    # mobile projects only

# Run against a deployed build instead of a local one:
E2E_BASE_URL=https://develop.shared-events.pages.dev npm run test:e2e
```

What it covers, per form factor: sign-in validation + OTP cooldown + wrong
code (M-001/M-002), onboarding controls (M-003), calendar shell and navigation
(M-004), theme switching with reload persistence, add-event through the web
HTML date/time inputs (M-005/E-110), share-sheet disabled-until-selected
(M-006), event detail share/edit-fork/remove with formatted-date rendering
(M-007), people + circles management (E-101), the two-account share flow with
forwarding semantics (E-104/E-108), and hide/unhide suppression (E-105).

Auth uses the Supabase test-OTP accounts documented in AGENTS.md
(`E2E_PHONE_A/B`, `E2E_OTP_A/B` env vars override them). One sign-in per run
via a setup project; specs reuse the stored session.

Test-environment quirks worth knowing (all handled in `e2e/fixtures.ts` and
`e2e/helpers.ts`, with comments):

- **Web Locks**: supabase-js coordinates auth via `navigator.locks`, which is
  browser-process-wide per origin. Playwright reuses browser processes, and a
  document destroyed mid-lock (reload, context close) orphans it — every later
  document then hangs in `getSession()`. Test contexts drop `navigator.locks`
  so supabase-js uses its no-op lock instead.
- **Stale sessions**: test accounts are shared, and a new sign-in can revoke
  tokens a previous run left in storage. `signIn()` clears cookies and
  localStorage first so a dead session can't boot into a loading screen.
- **Stacked screens**: React Navigation keeps covered screens mounted
  (`display:none`), so locators can resolve to elements on both the visible
  screen and the one underneath — use `visibleText()` / `.filter({ visible:
  true })` after navigation. Modals are the opposite: they overlay WITHOUT
  hiding what's beneath, so anything inside a modal must be scoped to
  `getByRole('dialog')`.
- **Modal teardown**: a closing modal keeps the main screen's inputs
  unfocusable for ~1s on web — helpers wait for the dialog to unmount before
  touching what's underneath.
- **Selection taps**: list-row taps can be eaten by a re-render; selection
  helpers retry until the row's ✓ appears (guarded against double-toggle).

## GitHub settings to make the gates real

Workflows can't enforce themselves — set branch protection once in
**Settings → Branches**:

- `master`: require a pull request; require status checks
  `Only develop may merge to master`, `checks`, `e2e` (from *Release gate*);
  block direct pushes.
- `develop`: require a pull request; require status check `fast-checks`
  (from *PR checks*). Direct pushes to `develop` are what the develop pipeline
  assumes won't happen; keep them blocked.

## CI secrets/variables

Same set the existing deploy workflow uses
(Settings → Secrets and variables → Actions):

- Secrets: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Variable: `DEPLOY_WEB=true` (also gates the develop preview deploy)

## Deploying the develop preview by hand

```bash
npm run deploy:develop     # builds dist/ then wrangler pages deploy --branch=develop
```

Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in the environment,
same as production deploys.
