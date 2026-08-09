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
3. **The owner says "ship it."** The agent runs the release click-through
   review first (see "Agentic UX review"): a complete pass over every scenario
   in the manual regression suite against the staging preview, desktop +
   mobile viewports, ending in `VERDICT: SHIP` / `VERDICT: DON'T SHIP`. On
   DON'T SHIP, fix forward on staging and re-review.
4. **On SHIP, the agent fast-forwards the exact green-tested staging commit
   to `production`** (`git push origin staging:production`). Branch protection
   on `production` requires the full-suite checks on that commit, so an
   untested or red commit is physically rejected. The push deploys production.

## What runs where

| Trigger | Workflow | What runs |
|---------|----------|-----------|
| Push to `staging` | `staging.yml` | **Full suite** (`full-suite.yml`): tsc, convention checks, Jest, SQL semantics, web build, Playwright e2e on desktop Chrome / Mobile Safari / Mobile Chrome. If green, redeploys the staging preview with the tested bundle. |
| Ship time (owner says "ship it") | in-session `computerUse` subagent | Complete click-through of every manual-suite scenario against the staging preview → `VERDICT: SHIP` / `DON'T SHIP` + report PR. Gate for promotion. |
| PR → `production` (optional path) | `agent-ux-review.yml` | CI-launched copy of the same review. Inert until `CURSOR_API_KEY` is set. |
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
   management — plus **pixel-diff baselines** (`e2e/visual.spec.ts`,
   snapshots committed in `e2e/visual.spec.ts-snapshots/`) that catch
   unintended pixel movement on key screens for free on every push, before any
   agent-review money is spent. Regenerate after INTENTIONAL design changes
   with `npx playwright test e2e/visual.spec.ts --update-snapshots` and review
   the diffs like any other change.
4. **Agentic UX review** — the phased ship-time click-through; see below.

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

## Agentic UX review (the release click-through)

The review happens **at ship time, batched per release** — not on every push
— and it is **phased so money stops being spent the moment a blocker is
known**:

- **Phase 0 (free):** staging pipeline green, including pixel-diff baselines.
- **Phase 1 (pennies):** one Grok-fast agent smoke-sweeps the happy paths.
  Any failure → `DON'T SHIP`, stop.
- **Phase 2 (the budget):** five parallel `computerUse` tracks per
  `manual-tests/release_review_checklist.md` (auth+first-run, event lifecycle,
  sharing/people, the visual matrix over screen × form factor × theme, edge
  states). A confirmed blocker in any track halts the rest.
- **Phase 3:** a stronger model re-judges the flagged evidence only.

The orchestrator instructions an agent follows at ship time live in
`scripts/release-review-orchestrator.md`. Two ways to execute the review
itself:

1. **In-session (default, no setup):** the agent you say "ship it" to runs
   the phases with `computerUse` subagents (model `cursor-grok-4.5-high-fast`
   for the click-through tracks). Runs in the current cloud VM; needs no
   GitHub secrets.
2. **CI-launched (optional):** `agent-ux-review.yml` fires on release PRs
   (staging → production) and manual dispatch, launching a Cursor Cloud Agent
   via the Cloud Agents API with `scripts/agent-ux-review-prompt.md` (the
   single-agent variant of the same checklist). Requires the repo secret
   `CURSOR_API_KEY`; the model comes from the repo variable `UX_REVIEW_MODEL`
   (default `cursor-grok-4.5-high-fast`), with automatic fallback to the
   account default if the ID is rejected.

Either way the output is a report PR against `staging` whose first line is
`VERDICT: SHIP` / `VERDICT: DON'T SHIP`. A DON'T SHIP blocks promotion until
fixed and re-reviewed.

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
- Cloudflare Pages project `shared-events`: set the **production branch** to
  `production` (Pages dashboard → project → Settings → Builds & deployments →
  Production branch, or
  `curl -X PATCH "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/shared-events" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" -d '{"production_branch":"production"}'`).
  Pages decides production vs preview by comparing the deploy's branch to
  this setting — while it still says `master`, every `--branch=production`
  deploy lands as a **preview** and https://shared-events.pages.dev silently
  stops updating. (2026-08-09 incident: production served a stale build for
  ~25h because merges to `master` never deployed.)

## Deploying the staging preview by hand

```bash
npm run deploy:staging     # builds dist/ then wrangler pages deploy --branch=staging
```

Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in the environment,
same as production deploys. (The old `develop.shared-events.pages.dev` alias
is superseded by the staging one and will simply stop updating.)
