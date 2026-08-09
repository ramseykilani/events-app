# Development Workflow

How changes move from an agent to production, what gets tested where, and why.

## Branches

| Branch | Environment | What it's for |
|--------|-------------|---------------|
| `staging` | https://staging.shared-events.pages.dev | Every finished change lands here. The owner's "try it when I feel like it" app. |
| `production` | https://shared-events.pages.dev | The live app. Only green-tested staging commits get promoted. |

Both sites are the same Cloudflare Pages project — branch aliases mean no
extra infrastructure. They share the production Supabase backend, so use the
test-OTP accounts (AGENTS.md) on staging rather than real phone numbers.

## The process

1. **Owner describes a feature. An agent implements it and pushes straight to
   `staging`.** No PR, no review round-trip. Hard rule for agents: the fast
   checks (`tsc`, conventions, Jest, SQL) must pass locally first.
2. **Every push to `staging` runs the full suite in CI.** When green, the
   staging preview redeploys automatically. When red, the branch shows it and
   the next agent fixes forward — staging is allowed to be briefly red,
   production never is.
3. **When it feels right, the owner looks at the staging preview** — and/or
   asks for the agentic UX review (a cloud agent that clicks through the
   preview on desktop and phone viewports and opens a report PR).
4. **The owner says "ship it."** An agent fast-forwards the exact
   green-tested staging commit to `production`
   (`git push origin staging:production`). Branch protection on `production`
   requires the full-suite checks on that commit, so an untested or red commit
   is physically rejected. The push deploys production.

## What runs where

| Trigger | Workflow | What runs |
|---------|----------|-----------|
| Push to `staging` | `staging.yml` | **Full suite** (`full-suite.yml`): tsc, convention checks, Jest, SQL semantics, web build, Playwright e2e on desktop Chrome / Mobile Safari / Mobile Chrome. If green, redeploys the staging preview with the tested bundle. |
| Green `staging.yml` run | `agent-ux-review.yml` | Launches the Cursor UX-review agent against the staging preview; opens a report PR. Inert until `CURSOR_API_KEY` is set. |
| PR → `staging` (optional) | `ci-fast.yml` | Fast checks only. PRs into staging are optional paper trail. |
| PR → `production` (optional path) | `release.yml` | Rejects any source branch that isn't `staging`, re-runs the full suite. Defense in depth; normal promotion is the fast-forward push above. |
| Push to `production` | `deploy-web.yml` | Production deploy. |

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
   factors. Covers: sign-in validation and OTP cooldown/errors, no browser
   notification-permission prompt on web, onboarding controls, calendar shell
   + navigation, theme switching with persistence, add/edit/remove event (web
   date inputs, fork semantics), share-sheet disabled/selected states, the
   A→B share flow with forwarding semantics, hide/unhide, people/circle
   management.
4. **Agentic UX review** — a cloud agent clicking through the deployed preview
   with judgment (visual polish, copy, mobile feel), reported as a PR.

## The e2e suite

Playwright, in `e2e/`, configured by `playwright.config.ts`.

```bash
npm run build:web          # the suite serves dist/ locally by default
npm run test:e2e           # all projects: desktop-chrome, mobile-safari, mobile-chrome
npm run test:e2e:mobile    # mobile projects only

# Run against a deployed build instead of a local one:
E2E_BASE_URL=https://staging.shared-events.pages.dev npm run test:e2e
```

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

## Agentic UX review

`agent-ux-review.yml` fires after every green Staging pipeline (or manually
via workflow_dispatch) and launches a Cursor Cloud Agent through the Cloud
Agents API (`POST /v1/agents`) with `scripts/agent-ux-review-prompt.md`. The
agent gets a full desktop VM, tests the staging preview on desktop and
mobile-emulated viewports following the manual regression suite, and opens a
report PR against `staging` with its findings and screenshots. If reviews are
too frequent, delete the `workflow_run` trigger and keep workflow_dispatch —
then reviews run only when someone asks.

One-time setup: add the repo secret `CURSOR_API_KEY` (Cursor Dashboard → API
Keys). Until then the workflow exits quietly. The agent's own VM secrets
(`EXPO_PUBLIC_SUPABASE_*`, test accounts) come from the Cursor dashboard like
any cloud agent run. The review agent's model defaults to
`cursor-grok-4.5-high-fast` (screenshot-driven review doesn't need the top
coding model); set the repo variable `UX_REVIEW_MODEL` to override, and if the
configured ID is rejected the workflow retries with the account default.

**Alternative without CI plumbing:** create a Cursor Automation
(cursor.com/automations) with a "Push to branch: staging" trigger and the same
prompt file as the instructions. Enable only one of the two, or every push
gets two reviews.

Note: `workflow_run` triggers read the workflow file from the default branch,
so the automatic trigger starts once that branch (production) contains it.

## GitHub settings (one time)

### Secrets and variables (Settings → Secrets and variables → Actions)

| Name | Kind | Needed for |
|------|------|-----------|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Secrets | e2e in CI (bundle build signs in to Supabase). Both are always visible in the Supabase dashboard → Project Settings → API keys. Without them the e2e job skips with a warning instead of failing. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Secrets | Preview + production deploys. The account ID is on the Cloudflare dashboard's right rail; the token is shown once at creation — make a new one (Profile → API Tokens → Create, Account → Cloudflare Pages: Edit) and paste it into both GitHub and Cursor secrets. |
| `DEPLOY_WEB` = `true` | Variable | Enables both deploy jobs. Requires the four secrets above. |
| `CURSOR_API_KEY` | Secret | Agentic UX review (Cursor Dashboard → API Keys → new key). |
| `UX_REVIEW_MODEL` | Variable | Optional override of the UX-review agent's model; defaults to `cursor-grok-4.5-high-fast`. |

### Branch protection (Settings → Branches)

- `staging`: add a rule with the defaults (blocks force pushes and deletion).
  No PR or check requirements — agents push directly.
- `production`: add a rule with **Require status checks to pass before
  merging** and select `full-suite / checks` and `full-suite / e2e` (they
  appear in the picker after the suite has run once). Defaults block force
  pushes and deletion. Do **not** require pull requests — promotion is a
  fast-forward push, and the required checks still guarantee only green-tested
  commits land.
- Settings → General → **Default branch** → `production`, then delete the old
  `master` branch. (`workflow_run` triggers and PR defaulting read from the
  default branch.)

## Deploying the staging preview by hand

```bash
npm run deploy:staging     # builds dist/ then wrangler pages deploy --branch=staging
```

Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in the environment,
same as production deploys. (The old `develop.shared-events.pages.dev` alias
is superseded by the staging one and will simply stop updating.)
