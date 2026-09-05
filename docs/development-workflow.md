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
   `staging`.** No PR, no review round-trip, no feature branch. Hard rule for
   agents: the fast checks (`tsc`, conventions, Jest, SQL) must pass locally
   first. Cursor Cloud's default "create `cursor/…`, open a PR" template does
   **not** apply in this repo — ignore it and push `staging`. Delete any
   leftover `cursor/…` branch; only `staging` and `production` are long-lived.
2. **Every push to `staging` runs the full suite in CI.** When green, the
   staging preview redeploys automatically. When red, the branch shows it and
   the next agent fixes forward — staging is allowed to be briefly red,
   production never is.
3. **The owner says "ship it."** The agent runs the release click-through
   review first (see "Agentic UX review"): a complete pass over every scenario
   in the manual regression suite against the staging preview, desktop +
   mobile viewports, ending in `VERDICT: SHIP` / `VERDICT: DON'T SHIP`. The
   review is read-only on the product — on DON'T SHIP the review session ends
   with the report on `staging`; fixes are independent tasks (a fresh agent
   works from the report's blocker briefs), and the next "ship it" starts a
   fresh review from Phase 0 against the new tip.
4. **On SHIP, the agent fast-forwards the exact green-tested staging commit
   to `production`** (`git push origin staging:production`). Branch protection
   on `production` requires the full-suite checks on that commit, so an
   untested or red commit is physically rejected. The push deploys production.

## What runs where

| Trigger | Workflow | What runs |
|---------|----------|-----------|
| Push to `staging` | `staging.yml` | **Full suite** (`full-suite.yml`): tsc, convention checks, Jest, SQL semantics (`checks`), in parallel with Playwright e2e as three parallel matrix legs (desktop Chrome / Mobile Safari / Mobile Chrome), each in the Playwright container image with its own standing account pair. If green, redeploys the staging preview with the tested bundle. Superseded queued pushes are cancelled (`cancel-in-progress`) — the latest tip covers everything. |
| Ship time (owner says "ship it") | in-session `computerUse` subagent | Complete click-through of every manual-suite scenario against the staging preview → `VERDICT: SHIP` / `DON'T SHIP` + report committed to `staging`. Gate for promotion. |
| PR → `production` (optional path) | `agent-ux-review.yml` | CI-launched copy of the same review. Inert until `CURSOR_API_KEY` is set. |
| PR → `staging` (optional) | `ci-fast.yml` | Fast checks only. PRs into staging are optional paper trail. |
| PR → `production` (optional path) | `release.yml` | Rejects any source branch that isn't `staging`, re-runs the full suite. Defense in depth; normal promotion is the fast-forward push above. |
| Push to `production` | `deploy-web.yml` | Production deploy. |

All workflows share one `node_modules` actions cache keyed on OS/arch/Node
version/lockfile hash — a hit skips `npm ci` entirely (the tarball-only
`cache: npm` left npm ci's full re-extract on the critical path, measured
anywhere from 13s to 7min per job depending on runner health). A lockfile
or Node-version bump misses once and re-saves; there are no restore-keys,
so a stale tree can never skip the install.

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
   with the **Regenerate visual baselines** workflow (Actions →
   workflow_dispatch, pick the screen): it re-takes the pictures on CI's own
   runners, verifies, commits, and re-runs the staging pipeline. Never commit
   a locally regenerated mobile-safari baseline — WebKit text rendering
   depends on the installed fonts, and cloud-VM renders differ from CI's
   runners (the 2026-08-17 red streak). Fallback if the workflow is
   unavailable: commit the failed run's `*-actual.png` from the
   playwright-report artifact (NOT `*-diff.png`).
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

Auth uses the Supabase test accounts documented in AGENTS.md
(`E2E_PHONE_A/B` override which accounts a run uses — parallel agents claim
pool pairs C–F so local runs never race CI's A/B). With
`E2E_ACCOUNT_PASSWORD` set, the setup project signs in via the token
endpoint and fires no SMS; without it, it drives the OTP UI once per account
per run. Registered test numbers are in `sms_test_otp`, so that OTP request
returns `message_id: test-otp` and does not call Twilio. `send-notification`
skips NANP area-code 555, so sharing to a test account does not hit Twilio
either. Specs reuse the stored session. New features ship with a new or
extended spec — the suite grows toward covering every web action, and specs
describe intended behavior: never weaken a test to match what was built.

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
- **Phase 2 (the budget):** five `computerUse` tracks per
  `manual-tests/release_review_checklist.md` (auth+first-run, event lifecycle,
  sharing/people, the visual matrix over screen × form factor × theme, edge
  states) — sequential in-session, one fresh subagent per track. Severity is
  two-tier: a **blocker** (broken core flow, data loss, crash, debug output
  shown to users) halts everything immediately — evidence gathered after a
  known blocker is contaminated by it; a **minor** (cosmetic, edge-case
  papercut) is flagged and the track continues. Tracks are briefed with the
  open entries in `manual-tests/known_issues.md` so accepted issues aren't
  re-flagged.
- **Phase 3:** a stronger model re-judges the flagged evidence only —
  dismissing false alarms, confirming minors, and upgrading any misjudged
  flag to a blocker.

The orchestrator instructions an agent follows at ship time live in
`scripts/release-review-orchestrator.md`. Two ways to execute the review
itself:

1. **In-session (default, no setup):** the agent you say "ship it" to runs
   the phases with `computerUse` subagents (model `cursor-grok-4.6-high-fast`
   for the click-through tracks). Runs in the current cloud VM; needs no
   GitHub secrets.
2. **CI-launched (optional):** `agent-ux-review.yml` fires on release PRs
   (staging → production) and manual dispatch, launching a Cursor Cloud Agent
   via the Cloud Agents API with `scripts/agent-ux-review-prompt.md` (the
   single-agent variant of the same checklist). Requires the repo secret
   `CURSOR_API_KEY`; the model comes from the repo variable `UX_REVIEW_MODEL`
   (default `cursor-grok-4.6-high-fast`), with automatic fallback to the
   account default if the ID is rejected.

Either way the output is a report committed straight to `staging`
(`manual-tests/manual_test_report_<date>-release.md`, docs-only) whose first
line is `VERDICT: SHIP` / `VERDICT: DON'T SHIP`, with self-contained briefs
per blocker and per confirmed minor — the report IS the bug record; there is
no separate tracker. Confirmed minors also land in
`manual-tests/known_issues.md` (the open-issues ledger future reviews are
briefed from) in the same commit. A DON'T SHIP blocks promotion until fixed
(independent fix tasks, fresh sessions) and re-reviewed from Phase 0. On
SHIP, the report ships with the code: the orchestrator waits for the suite to
go green on the report commit, verifies the staging tip is still the reviewed
commit plus docs-only deltas, and only then fast-forwards to `production` —
so production always contains the review that blessed it.

## GitHub settings (one time)

### Secrets and variables (Settings → Secrets and variables → Actions)

| Name | Kind | Needed for |
|------|------|-----------|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Secrets | e2e in CI (bundle build signs in to Supabase). Both are always visible in the Supabase dashboard → Project Settings → API keys. Without them the e2e job skips with a warning instead of failing. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Secrets | Preview + production deploys. The account ID is on the Cloudflare dashboard's right rail; the token is shown once at creation — make a new one (Profile → API Tokens → Create, Account → Cloudflare Pages: Edit) and paste it into both GitHub and Cursor secrets. |
| `DEPLOY_WEB` = `true` | Variable | Enables both deploy jobs. Requires the four secrets above. |
| `CURSOR_API_KEY` | Secret | Agentic UX review (Cursor Dashboard → API Keys → new key). |
| `UX_REVIEW_MODEL` | Variable | Optional override of the UX-review agent's model; defaults to `cursor-grok-4.6-high-fast`. |

### Branch protection (Settings → Branches)

- `staging`: add a rule with the defaults (blocks force pushes and deletion).
  No PR or check requirements — agents push directly.
- `production`: add a rule with **Require status checks to pass before
  merging** and select `full-suite / checks` and `full-suite / e2e` (they
  appear in the picker after the suite has run once). `full-suite / e2e` is
  the no-op aggregator job that depends on the three `e2e-browsers (...)`
  matrix legs — the matrix's own per-leg checks are not the required ones.
  Defaults block force pushes and deletion. Do **not** require pull requests —
  promotion is a fast-forward push, and the required checks still guarantee
  only green-tested commits land.
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

## Native builds & beta distribution (EAS)

The native app is the product (see `docs/distribution-strategy.md`); the web
build is the dev/staging surface. Native builds are produced by EAS Build from
this same codebase — profiles in `eas.json`, project ID in `app.config.js`
(`extra.eas.projectId`). **Builds and submits are agent-run** — not CI, not
the owner's machine. The ship-it protocol
(`scripts/release-review-orchestrator.md` → Native rollout) drives them after
a git promotion; auth setup and exact commands live in AGENTS.md → Native
builds (agent-run); current enrollment/secrets/build/tester state lives in
`STATUS.md`.

### One-time prerequisites (owner)

- Apple Developer Program membership ($99/yr) — active since 2026-08-12.
- Play Console account ($25 one-time, **personal**) — identity verification
  complete 2026-08-15. Personal is correct for this app: the
  organization-only categories are financial, health, VPN, and government
  apps. The personal-account "12 testers for 14 days" closed-test rule gates
  a *production* listing only, not internal testing.
- `EXPO_TOKEN` (Expo dashboard → Access Tokens) in Cursor + GitHub secrets —
  done 2026-08-12.
- App Store Connect API key — **done 2026-08-15.** Admin Team Key; `.p8` on
  the owner's machine (`F:\Code\Events\events-keys`). Secrets:
  `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`,
  `EXPO_ASC_API_KEY_P8_BASE64`. This key submits IPAs to App Store Connect.
  It is **not** an APNs push key. The APNs key (`8T775QY87V`) was uploaded to
  Expo 2026-08-17 (STATUS.md).
  ASC listing name is **Shared Events** (`Events` was taken); bundle ID
  `com.rkilani.events`; home-screen name stays `Events`.
- Play service account — **done 2026-08-15.** GCP project `rkilani-events`,
  invited in Play Console with release access. Secret:
  `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (base64). Privacy policy / data-safety /
  content-rating / App access are still open and wait for a closed test or
  production listing — not internal testing. Reviewer sign-in is unsolved
  (phone OTP); do not put CI test OTPs in Play or App Store Connect.

### The release loop (native part)

1. Git promotion to `production` deploys the **web** app only — no native
   binary moves on its own.
2. The agent builds the owner's smoke APK from the promoted commit
   (`preview` profile → sideloadable APK) and hands over the install link
   plus the smoke checklist (`manual-tests/native_device_smoke.md`).
3. On the owner's pass, the agent builds + submits `production` to the Play
   internal track (TestFlight once iPhone testers exist). On fail, fix
   forward on staging — testers never see the build.

`production` auto-increments build numbers (`appVersionSource: remote` in
`eas.json` — EAS owns the build counter, don't set versions manually).
Builds are metered (free plan: 15 Android + 15 iOS per month) — the loop
spends 1–2 per release; don't build speculatively.

### Distributing to testers

- **Android — Play internal testing track:** Play Console → Internal testing
  → Testers → add Gmails to an email list → copy the **opt-in** link (Play
  does not email). Up to ~100, no review. The link is not open: Play still
  checks the list, so add each friend's Play Store Gmail first, then send
  everyone the same link. Owner Gmail is already on it. This is the
  friends-and-friends-of-friends path. `eas submit` lands here; testers
  then get Play updates on the next submit.
- **Play Store “Item not found” (sleeping satellite):** that screen is Play
  Store failing the install, not a missing AAB. Tapping any
  `play.google.com` link on Android opens Play Store and 404s until the
  person has joined on the **web** opt-in page. Copy the link from Internal
  testing → Testers (`https://play.google.com/apps/internaltest/…`). Do not
  send `/apps/testing/` (that is closed testing; alpha/beta are empty) or
  `/store/apps/details`. His Gmail must be on a list that is **checked**
  for this track, then Save. He pastes the `internaltest` URL into Chrome
  (same Google account as Play Store), taps **Become a tester**, then
  downloads. First-publish can take a few hours.
- **Do not use Play Internal app sharing** (Internal testing → Internal app
  sharing → “Anyone you shared the link with can download”) as the friends
  path. Different product: separate upload (not the submitted AAB), testers
  must enable a hidden Play Store setting (tap Play Store version 7 times),
  links expire in 60 days / 100 downloads each, Play re-signs with a
  different cert (breaks the FCM SHA we just verified), and Google can
  refuse the download if the person has no access to the store listing.
- **iOS — TestFlight internal (the friends path):** up to 100, **no Beta App
  Review**. Testers must be App Store Connect users with Account Holder,
  Admin, App Manager, Developer, or Marketing. Invite each iPhone tester
  under Users and Access as **Marketing** with **Shared Events** only (not
  Admin, not All Apps), wait until they accept, then add them to internal
  group **Team (Expo)**. Apple emails the TestFlight invite. Do not submit
  the build for External Testing just to reach the first testers — that
  queues Beta App Review (~24–48h) for no gain.
- **iOS — TestFlight external:** email/public link, up to 10k, first build
  of each version goes through Beta App Review. Use later, when the list
  outgrows “people we will put on the ASC team.”
- TestFlight builds expire 90 days after upload — rebuild periodically during
  a long beta.

### After each build lands on the owner's phone

Run `manual-tests/native_device_smoke.md` before inviting anyone new — the
native-only paths (contacts picker, datetimepicker, push, notification tap)
have no automated coverage. The push step has a one-device agent-assisted
variant (N-005).
