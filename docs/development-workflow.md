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
| PR → `develop` | `ci-fast.yml` | `tsc --noEmit`, Jest, SQL semantics suite. Fast — this is the only gate on individual features. |
| Push to `develop` (i.e. every merged feature) | `develop.yml` | **Full suite** (`full-suite.yml`): all fast checks + web build + Playwright e2e on desktop Chrome, Mobile Safari (WebKit) and Mobile Chrome. If green, redeploys the develop preview with the exact bundle the e2e job tested. |
| PR `develop → master` (release PR) | `release.yml` | Refuses any source branch that isn't `develop`, then re-runs the **full suite** on the merge result. This is the release gate. |
| Push to `master` | `deploy-web.yml` | Production deploy (unchanged). |

Because the full suite already ran on the tip of `develop`, a release PR is
normally a formality: open it, watch it go green, merge. Run the manual
regression suite (`manual-tests/cloud_manual_regression.md`) against the
develop preview before opening a release PR when the accumulated changes touch
UI or flows — including a mobile-viewport pass (Chrome DevTools device
emulation) for the core scenarios.

## The e2e suite

Playwright, in `e2e/`, configured by `playwright.config.ts`.

```bash
npm run build:web          # the suite serves dist/ locally by default
npm run test:e2e           # all projects: desktop-chrome, mobile-safari, mobile-chrome
npm run test:e2e:mobile    # mobile projects only

# Run against a deployed build instead of a local one:
E2E_BASE_URL=https://develop.shared-events.pages.dev npm run test:e2e
```

What it covers: calendar smoke on every form factor, add-event through the web
HTML date/time inputs (then removal), and the two-account share flow — A
shares to B, B sees it immediately, A removes their copy, B's copy survives
(E-104/E-108), then both copies are cleaned up.

Auth uses the Supabase test-OTP accounts documented in AGENTS.md
(`E2E_PHONE_A/B`, `E2E_OTP_A/B` env vars override them). One sign-in per run
via a setup project; specs reuse the stored session.

Two test-environment quirks worth knowing (both handled in `e2e/fixtures.ts`
and `e2e/helpers.ts`, with comments):

- **Web Locks**: supabase-js coordinates auth via `navigator.locks`, which is
  browser-process-wide per origin. Playwright reuses browser processes, and a
  document destroyed mid-lock (reload, context close) orphans it — every later
  document then hangs in `getSession()`. Test contexts drop `navigator.locks`
  so supabase-js uses its no-op lock instead.
- **Stale sessions**: test accounts are shared, and a new sign-in can revoke
  tokens a previous run left in storage. `signIn()` clears cookies and
  localStorage first so a dead session can't boot into a loading screen.

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
