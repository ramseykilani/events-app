# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a React Native (Expo SDK 54) events-sharing app. The backend is a remote Supabase project (Postgres + Auth + Edge Functions). There is no local backend to start.

**Strategy (2026-08-09):** the native app is the product; the web build is the dev/staging/CI surface and is never promoted to users. See `docs/distribution-strategy.md`. Beta distribution is TestFlight internal + Play internal testing; native builds are EAS-run (`docs/development-workflow.md` → Native builds). Agents test via the web build (`npx expo start --web --port 8081`) — the only option in a headless cloud VM — but user-facing design decisions should assume native.

### Running the app (web mode)

```bash
npx expo start --web --port 8081
```

The app opens at `http://localhost:8081`. This is the only way to test in a headless cloud VM (no iOS/Android simulators available). The web build requires `react-native-web` — it is listed in `package.json` after initial setup.

### Environment variables

The app requires a `.env` file at the repo root with two values (see `.env.example`):

- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable (anon) key

Without real Supabase credentials the UI renders but auth/data calls fail with network errors. To test end-to-end auth flows, real credentials and a configured Supabase project are needed.

If `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are available as environment variables (injected via Cursor Secrets), create the `.env` file from them:

```bash
printf 'EXPO_PUBLIC_SUPABASE_URL=%s\nEXPO_PUBLIC_SUPABASE_ANON_KEY=%s\n' "$EXPO_PUBLIC_SUPABASE_URL" "$EXPO_PUBLIC_SUPABASE_ANON_KEY" > .env
```

### Signing in (test OTP)

Two test OTPs are configured on the Supabase project (both expire March 31, 2027):

- Phone `+15555550100`, code `123456` (account A)
- Phone `+15555550103`, code `123456` (account B)

Use either to sign in without a real SMS provider. The second number is useful for testing multi-user scenarios (e.g. sharing events between two accounts). After sign-in the app goes straight to the calendar; the onboarding walkthrough auto-shows only when the user has no events at all, and can be reopened via the `?` button.

Note: account B was re-pointed from `+16462655565` (a real-format Manhattan number that would receive real texts) to the reserved fictional 555 range — never point test accounts at real-format numbers. `+15555550101` is **not** a configured test number — Twilio rejects it with `sms_send_failed`. For a truly fresh account (e.g. M-003 onboarding auto-show), temporarily add a third test OTP via the Management API (`PATCH /v1/projects/{ref}/config/auth` with both `sms_test_otp` and `sms_test_otp_valid_until`), then remove it when done. Sign out lives at the bottom of the People screen (behind a confirm dialog); on web you can also sign out with `localStorage.clear(); location.reload();` in the browser console.

### Linting / type checking

There is no ESLint configuration. The only static check available is TypeScript:

```bash
npx tsc --noEmit
```

The tree is currently `tsc`-clean — keep it that way.

### Branching, merging & releases

Two long-lived branches, named after their environments (see `docs/development-workflow.md` for the full model):

- `staging` — where all finished work lands. The staging preview at `https://staging.shared-events.pages.dev` redeploys automatically when the full suite is green on a push.
- `production` — the live app at `https://shared-events.pages.dev`.

**Push policy (set by the repo owner):** agents push finished work **straight to `staging`** — no PR, no human review, no feature branch. Hard rule: before pushing, the fast checks must pass locally (`npx tsc --noEmit && npm run test:conventions && npm test -- --runInBand && npm run test:sql`). Every push then runs the full suite in CI; if it goes red, the next agent fixes forward before anything ships. PRs into staging are optional paper trail, never required.

**This overrides Cursor Cloud's default git workflow.** Cloud-agent runs often inject a template: create `cursor/<name>-…` off `production`, open a PR with `ManagePullRequest`, leave the feature branch around. Do not follow that here. The only long-lived branches are `staging` and `production`. Implement on `staging` (or a throwaway local branch you fast-forward into it), push `staging`, and delete any `cursor/…` branch you accidentally created. Recorded 2026-08-12 after an agent shipped the contacts explainer via that template and had to clean it up.

**Only promote `staging → production` when the owner explicitly says to ship/release/push to prod.** The ship-it protocol lives in **`scripts/release-review-orchestrator.md`** — follow it exactly. Summary: Phase 0 free gates (staging pipeline green incl. pixel diffs; record the staging tip as the reviewed commit) → Phase 1 cheap Grok smoke sweep (halt on failure) → Phase 2 five deep tracks per `manual-tests/release_review_checklist.md` (sequential in-session, one fresh subagent per track; a blocker halts everything — never finish an expensive review when a bug is already known; minors are flagged, never halt) → Phase 3 skeptic pass adjudicates severity on flagged evidence → report committed straight to `staging` with `VERDICT: SHIP` / `DON'T SHIP` (no PR) → only on SHIP: wait for the suite to go green on the report commit, verify the staging tip is still the reviewed commit plus docs-only deltas, then `git push origin origin/staging:production`. Branch protection requires the full-suite checks on the promoted commit, so untested code physically cannot ship.

**A ship-it review is read-only on the product.** On any blocker: halt everything, write the DON'T SHIP report, push it to `staging`, and end the turn — never fix or push code mid-review. A found bug is a successful review outcome, not a task; fixes are independent tasks handed to a fresh session after the owner reads the report, and the next "ship it" re-runs the protocol from Phase 0 against the new tip (early phases are cheap by design).

The review is batched per release on purpose: one complete click-through at ship time beats a shallow review on every push, and it keeps token spend proportional to releases, not commits.

**Model policy:** use the session's default model for development. For agentic click-through/manual testing (computerUse subagents, the UX-review automation), use `cursor-grok-4.6-high-fast` — screenshot review doesn't need the top coding model. The CI-launched UX review defaults to it too (repo variable `UX_REVIEW_MODEL` overrides; discover IDs via `GET https://api.cursor.com/v1/models`).

The full suite (`.github/workflows/full-suite.yml`) = tsc + conventions + Jest + SQL semantics + web build + Playwright e2e on desktop Chrome, Mobile Safari (WebKit), and Mobile Chrome. Branch-protection settings are listed in `docs/development-workflow.md`.

### Tests

Automated regression tests are configured with Jest + React Native Testing Library:

```bash
npm test -- --runInBand
```

E2E tests (Playwright, `e2e/`): build the web bundle first, then run all form factors (or `test:e2e:mobile` for mobile only). Set `E2E_BASE_URL` to run against a deployed build:

```bash
npm run build:web && npm run test:e2e
```

Convention checks (no ESLint in this repo — this is the mechanical layer): `npm run test:conventions` enforces accessibilityRole on touchables, no `Alert.alert` outside the dialog helpers, no hard-coded hex colors, and no emoji glyphs in UI source (use `@expo/vector-icons` tinted by role tokens). Intentional exceptions carry an inline `conventions-ok` comment.

E2e gotchas, all handled in `e2e/fixtures.ts` / `e2e/helpers.ts`: (1) test contexts must drop `navigator.locks` — supabase-js Web Locks are browser-process-wide per origin and a document destroyed mid-lock orphans it, hanging every later `getSession()` on the boot spinner; any context created outside the fixture must use `newExtraContext()`. (2) `signIn()` clears cookies/localStorage first because a shared test account's stored session may have been revoked by a later sign-in. (3) Covered nav screens stay mounted (`display:none`) so locators can double-match — use `visibleText()`; modals overlay WITHOUT hiding the base screen — scope modal interactions to `getByRole('dialog')` and wait for the dialog to unmount before touching what's underneath. (4) List-row selection taps can be eaten by re-renders — selection helpers retry until the row's ✓ shows.

The agent click-through review runs at ship time, not per push (see Branching → ship-it protocol). `agent-ux-review.yml` is the optional CI path (fires on release PRs and manual dispatch; inert until the `CURSOR_API_KEY` repo secret is set). See `docs/development-workflow.md` → Agentic UX review.

Manual regression suite for cloud agents:

```bash
npm run test:manual
```

Then follow:

- `manual-tests/cloud_manual_regression.md`
- `manual-tests/manual_test_report_template.md`

### Deploying migrations & edge functions (runbook)

Migrations `20260807000001`–`20260807000008` and the hardened edge functions were deployed to project `ijmwtjyuvdnvhblwwtpt` on 2026-08-07. For future migrations/functions the same flow applies: the client and backend must move together (e.g. the client expects the `share_event` RPC, and the calendar RPC assumes recipient copies exist).

Prerequisites: `SUPABASE_ACCESS_TOKEN` in the environment (Cursor Secrets inject into new cloud-agent VMs only — a running VM never picks up newly added secrets). If the CLI fails at "Initialising login role..." (upstream bug supabase/cli#5091 — a stale `cli_login_postgres` role), either delete the role via `DELETE /v1/projects/{ref}/cli/login-role`, or rotate the DB password via `PATCH /v1/projects/{ref}/database/password` and export `SUPABASE_DB_PASSWORD` (setting it skips the login-role path entirely).

```bash
npx supabase link --project-ref ijmwtjyuvdnvhblwwtpt
npx supabase db push                 # applies all pending migrations in order
npx supabase functions deploy send-notification cleanup-people cleanup-events og-metadata
npx supabase secrets set CRON_SECRET=$(openssl rand -hex 32)   # already set; pg_cron jobs send it as x-cron-secret
```

Function-only deploys (no DB access) work without linking — pass the ref directly: `npx supabase functions deploy send-notification --project-ref ijmwtjyuvdnvhblwwtpt`. Note `supabase link` can fail on newer CLI versions with a `LegacyLinkApiKeysNetworkError ... inserted_at SchemaError` (Management API response drift); function deploys/secrets don't need link.

Notification SMS carries no app/web links (decision 2026-08-09 — see `docs/distribution-strategy.md`): `send-notification` reads only the Twilio secrets, and `WEB_APP_URL` is currently set but unused by it (it returns as the store-link base at launch). The placeholder `IOS_APP_STORE_URL` secret was removed 2026-08-09. Build the static bundle with `npm run build:web` (→ `dist/`).

### Deploying the web app (Cloudflare Pages)

The web build is hosted on **Cloudflare Pages** as a **direct-upload** project managed via Wrangler (not Pages' built-in Git integration — Wrangler keeps the whole deploy path in the repo and runnable by any agent). Two standing sites: production `https://shared-events.pages.dev` (deploys from the `production` branch) and the staging preview `https://staging.shared-events.pages.dev` (`npm run deploy:staging`, or CI `staging.yml`).

- Config: `wrangler.toml` (project name `shared-events`, output dir `dist/`). `public/_redirects` carries the SPA fallback (`/* /index.html 200`) so deep links like `/event/<id>` load the app; it's copied into `dist/` at export time.
- Prerequisites: `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID` in the environment (Cursor Secrets inject into new cloud-agent VMs only — a running VM never picks up newly added secrets). `CLOUDFLARE_ACCOUNT_ID` must be the 32-char hex account id — not the API token.
- Live site: **https://shared-events.pages.dev** (`WEB_APP_URL` already points here). Project already exists — do not recreate.
- **Why not `events-app.pages.dev`:** Pages `*.pages.dev` names are globally unique. `events-app` was already claimed by another Cloudflare account, so the first deploy got a random suffix (`events-app-lzv`). The project was renamed to `shared-events` to get a clean URL. Leave the Wrangler `name` as `shared-events`; do not try to reclaim `events-app`.
- Deploy: `npm run deploy:web` (builds `dist/` then `wrangler pages deploy`). Production updates go to `https://shared-events.pages.dev` when deploying with `--branch=production` (or from the production branch); other `--branch` values create preview URLs. This requires the Pages project's production-branch setting to be `production` (one-time cutover step — see `docs/development-workflow.md` → Branch protection); while it still says `master`, `--branch=production` deploys land as previews.
- After a domain change, update `WEB_APP_URL` and the `PRIVACY_POLICY_URL` constant in `app/(auth)/sign-in.tsx`.
- CI alternative: `.github/workflows/deploy-web.yml` deploys on every push to `production` once the repo Variable `DEPLOY_WEB=true` and Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set. It runs the same `wrangler pages deploy` command, so CI and agents behave identically.
- When a custom domain is purchased: Pages dashboard → Custom domains → add it (free auto SSL; instant if DNS is on Cloudflare), then update `WEB_APP_URL`.

Verify afterwards:

```bash
bash supabase/tests/run_local.sh     # SQL semantics suite (local scratch postgres)
npm test -- --runInBand              # Jest suite
```

Then run the manual regression suite (`manual-tests/cloud_manual_regression.md`), especially E-108/E-109 (forwarding) and M-003.

### Native builds (agent-run)

Native binaries are built on EAS **by agents** — not by CI, not on the owner's machine. `STATUS.md` (repo root) tracks enrollment/secrets/build/tester state: read it before any release work and update it whenever you change any of that state. The ship-time sequence that uses these commands lives in `scripts/release-review-orchestrator.md` → Native rollout.

Prerequisites (Cursor secrets — injected into new cloud-agent VMs only; a running VM never picks up newly added secrets):

- `EXPO_TOKEN` — Expo access token (Expo dashboard → Account settings → Access Tokens). Authenticates every `eas` command.
- iOS (App Store Connect API key): `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`, and `EXPO_ASC_API_KEY_P8_BASE64` (base64 of the `.p8`). Decode the key and export the set the CLI reads:
  ```bash
  echo "$EXPO_ASC_API_KEY_P8_BASE64" | base64 -d > /tmp/AuthKey.p8
  export EXPO_ASC_API_KEY_PATH=/tmp/AuthKey.p8
  export EXPO_APPLE_TEAM_TYPE=INDIVIDUAL
  ```
- Android submit (Play service account): decode `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (base64) to the path `eas.json` expects — `echo "$GOOGLE_PLAY_SERVICE_ACCOUNT_JSON" | base64 -d > google-play-service-account.json`. The file is gitignored; never commit it.

Commands:

```bash
# Owner smoke build (sideloadable APK; preview profile = internal distribution)
eas build --platform android --profile preview --non-interactive --wait

# Tester build → Play internal track (submit profile carries track + key path)
eas build --platform android --profile production --non-interactive --wait
eas submit --platform android --profile production --non-interactive --latest

# iOS → TestFlight (ASC key env vars above authenticate both build and submit)
eas build --platform ios --profile production --non-interactive --wait
eas submit --platform ios --profile production --non-interactive --latest
```

- `--wait` blocks until the build finishes and prints the artifact page URL — hand that link to the owner. Builds are metered (free plan: 15 Android + 15 iOS per month); never build speculatively.
- Preview produces an APK (sideload); production produces an AAB (Play) / IPA (TestFlight). Same commit, same code — preview is the owner's smoke surface, production is what testers get.
- First iOS build fallback: if non-interactive credential bootstrap fails (bundle ID registration, APNs key), the owner runs `eas build --platform ios --profile production` once interactively on their machine; after that the env-var path works. Once the ASC key exists, its IDs may also be added to the `submit.production.ios` profile in `eas.json` (`ascApiKeyPath`/`ascApiKeyId`/`ascApiKeyIssuerId`) — optional; env vars suffice.
- If a required secret is missing, stop and tell the owner exactly which one to add (Cursor Dashboard → Cloud Agents → Secrets, and GitHub repo secrets if CI ever builds). Do not half-run a release.

### Key gotchas

- `react-native-web` must be installed for web mode to work (`npx expo install react-native-web`). It is already in `package.json` dependencies.
- The Expo dev server reads `.env` automatically — no `dotenv` setup needed.
- Supabase migrations in `supabase/migrations/` must be applied in filename order against the Supabase project before the app functions end-to-end.
- Edge Functions in `supabase/functions/` are Deno/TypeScript (excluded from the main `tsconfig.json`).
- Edge functions that browsers call must allow the headers supabase-js always sends: `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type` — otherwise the CORS preflight fails with `net::ERR_FAILED` and calls silently never reach the function.
- `cleanup-people`/`cleanup-events` are invoked weekly by pg_cron jobs that must send the `CRON_SECRET` edge-function secret as the `x-cron-secret` header. Check with `SELECT jobid, jobname, command FROM cron.job;` if they start 401ing.
- Phone auth requires a real SMS provider (Twilio) configured in the Supabase project. Fake/test phone numbers like `+15555550100` are rejected by Twilio with `sms_send_failed`. To test sign-in without real SMS, configure a "Test OTP" phone/code pair in the Supabase Dashboard under **Authentication > Settings**.
- When the `.env` file changes, the Expo dev server must be restarted to pick up new values (Metro does not hot-reload env vars).
- Sign-in surfaces SMS send failures to the user via a short `showAlert` (expected auth mistakes like `sms_send_failed`, rate limits, and expired OTP use `getAuthUserMessage` in `lib/authErrors.ts`). Unexpected failures still use `showError` (detailed alert with code/details). Check that dialog when auth testing fails.
- `Alert.alert` is a no-op on web. Use `showAlert`/`showConfirm` from `lib/dialogs.ts` (or `showError` for errors) for any user-facing dialog so it renders as `window.alert`/`window.confirm` in the browser.
- Known issues and by-design limitations that test agents must NOT flag (the web text-paint quirk, the native datetimepicker never opening on web, no browser notification-permission prompt) live in `manual-tests/known_issues.md` — the open-issues ledger the release review is briefed from and maintains.
- Desktop Chrome alone is not enough for UI work that users will hit on phones. For onboarding and other full-screen flows, also verify at a mobile viewport (Chrome device toolbar → ~390×844). M-003 in `manual-tests/cloud_manual_regression.md` requires this.
