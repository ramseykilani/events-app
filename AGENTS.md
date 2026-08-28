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

### Signing in (test accounts)

Six test accounts are configured on the Supabase project, all with test OTP `123456` (expires March 31, 2027) and all sharing one password:

- **Standing pair:** account A `+15555550100`, account B `+15555550103` — the e2e defaults.
- **Parallel runs self-serve:** `node scripts/create-test-accounts.mjs --fresh-pair` provisions two fresh numbers (random unregistered picks from the fictional 555-01xx block) and prints the `E2E_PHONE_A` / `E2E_PHONE_B` exports — export them and every e2e run in that session uses a private pair. Needs `SUPABASE_ACCESS_TOKEN` (cloud agents have it). Without it: pre-provisioned spares C–F `+15555550110`–`+15555550113`, or A/B when working alone — A/B are CI's defaults.

**Password sign-in (preferred):** the password lives in `E2E_ACCOUNT_PASSWORD` (`.env` locally, repo/Cursor secrets in CI/cloud). The e2e setup signs in via the token endpoint, which fires **no SMS**. Without the password it falls back to driving the OTP UI. Registered test numbers are in `sms_test_otp`, so that OTP request returns `message_id: test-otp` and **does not call Twilio** — only an unregistered 555 number still 21211s. The OTP UI itself stays covered by `auth.spec.ts`; that is the product surface. Provisioning goes through the Auth Admin API (no OTP, no Twilio) — to grow the pool, rotate the password, or create a throwaway account: `node scripts/create-test-accounts.mjs [+15555550114 ...]` (needs `SUPABASE_ACCESS_TOKEN`). `send-notification` also skips NANP area-code 555, so sharing to a test account does not hit Twilio either.

After sign-in the app goes straight to the calendar; the onboarding walkthrough auto-shows only when the user has no events at all, and can be reopened via the `?` button. For a truly fresh account (e.g. M-003 onboarding auto-show), provision a new number with the script (or temporarily add a test OTP via the Management API — `PATCH /v1/projects/{ref}/config/auth` with both `sms_test_otp` and `sms_test_otp_valid_until` — then remove it when done). Sign out lives at the bottom of the People screen (behind a confirm dialog); on web you can also sign out with `localStorage.clear(); location.reload();` in the browser console.

Never point test accounts at real-format numbers — account B was re-pointed off `+16462655565` (a real Manhattan number that would receive real texts) into the reserved fictional 555 range. `+15555550101` is **not** a configured test number — Twilio rejects it with `sms_send_failed`. Never delete accounts A or B: delete + re-signup with the same phone re-delivers still-pending shares (KI-007).

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

After an intentional design change, regenerate the pixel-diff baselines (`e2e/visual.spec.ts-snapshots/`) with the **Regenerate visual baselines** workflow (Actions tab → pick the screen) — it re-takes the pictures on CI's own runners, verifies, and commits them. Never commit a locally regenerated mobile-safari baseline: WebKit text rendering uses the machine's fonts, and VM fonts differ from CI's, so it passes locally and fails CI.

Convention checks (no ESLint in this repo — this is the mechanical layer): `npm run test:conventions` enforces accessibilityRole on touchables, no `Alert.alert` outside the dialog helpers, no hard-coded hex colors, no emoji glyphs in UI source (use `@expo/vector-icons` tinted by role tokens), no importing the raw `withTimeout`/`timeoutSignal` budget API outside `lib/timeoutSignal.ts` (reads: `withFetchTimeout`/`withRetries`; writes: `withWriteTimeout`), no `showError(` outside the auth/boot allowlist (`app/(auth)/`, `SessionContext.tsx`, `lib/`), and `onRequestClose` on every `<Modal>` (RN's Android Modal consumes hardware Back and only forwards it to that handler — a missing one leaves the sheet swallowing Back, KI-009/KI-012; wire it to the sheet's Close/Cancel). Intentional exceptions carry an inline `conventions-ok` comment.

E2e gotchas, all handled in `e2e/fixtures.ts` / `e2e/helpers.ts`: (1) test contexts must drop `navigator.locks` — supabase-js Web Locks are browser-process-wide per origin and a document destroyed mid-lock orphans it, hanging every later `getSession()` on the boot spinner; any context created outside the fixture must use `newExtraContext()`. (2) `signIn()` clears cookies/localStorage first because a shared test account's stored session may have been revoked by a later sign-in. Both accounts sign in once per run in `e2e/auth.setup.ts` (storageState in `e2e/.auth/`); a spec that needs account B uses `newExtraContext(browser, testInfo, AUTH_FILE_B)`, never per-test `signIn(ACCOUNT_B)`. Setup uses phone+password when `E2E_ACCOUNT_PASSWORD` is set (no SMS). The OTP UI in `auth.spec.ts` hits `sms_test_otp` (`message_id: test-otp`) and does not call Twilio; `send-notification` skips NANP 555. (3) Covered nav screens stay mounted (`display:none`) so locators can double-match — use `visibleText()`; modals overlay WITHOUT hiding the base screen — scope modal interactions to `getByRole('dialog')` and wait for the dialog to unmount before touching what's underneath. (4) List-row selection taps can be eaten by re-renders — selection helpers retry until the row's ✓ shows.

The agent click-through review runs at ship time, not per push (see Branching → ship-it protocol). `agent-ux-review.yml` is the optional CI path (fires on release PRs and manual dispatch; inert until the `CURSOR_API_KEY` repo secret is set). See `docs/development-workflow.md` → Agentic UX review.

Manual regression suite for cloud agents:

```bash
npm run test:manual
```

Then follow:

- `manual-tests/cloud_manual_regression.md`
- `manual-tests/manual_test_report_template.md`

### Feature tasks & parallel agents

A feature task = its `FEATURES.md` section (Problem / Solution / Technical Notes / Acceptance Criteria — that is the brief) + a **scope** + the **verify bar**.

- **Scope:** the agent owns the files its feature touches, derived from the FEATURES.md section; the dispatcher may narrow it ("you own `components/ShareSheet.tsx`"). One writer per scope — two agents never edit the same files at the same time, so the dispatcher sequences features that obviously share code instead of running them in parallel.
- **Status self-service:** the agent's first commit flips its feature to **In progress** in `FEATURES.md`; its last flips it to Implemented. Never start a feature already marked In progress — report back instead. The dispatcher's only coordination duty is checking the table before dispatching.
- **Verify bar:** the fast checks (`npx tsc --noEmit && npm run test:conventions && npm test -- --runInBand && npm run test:sql`) **plus a new or updated Playwright spec covering the feature's web actions**, run locally on desktop Chrome (`npm run build:web && npx playwright test e2e/<spec> --project=desktop-chrome`) before pushing. CI runs the full three-browser suite on push. The suite grows toward covering every web action: every screen's save/cancel/confirm/empty/validation paths — not every click permutation.
- **Specs describe intended behavior.** Making a test match what was built — weaker assertion, skip, rewritten expectation — is never an allowed fix. A red spec means the code is wrong, or the intent changed (which is the owner's call, not the agent's).
- **Second opinion (risky changes only):** for migrations, RLS, or share/hide/auth logic, have a second agent on `cursor-grok-4.6-high-fast` review the diff and run the tests before pushing. Scary changes only — not every commit.
- **Sign-in discipline:** sign in once per run and reuse stored sessions; never sign in per test. Before running e2e locally, provision your own pair — `node scripts/create-test-accounts.mjs --fresh-pair`, then export the printed `E2E_PHONE_A/B`. Password sign-in (see Signing in) fires no SMS. OTP on a registered test number uses `sms_test_otp` and does not call Twilio. `send-notification` skips NANP area-code 555, so sharing to a test account does not hit Twilio either.

### Deploying migrations & edge functions (runbook)

Migrations `20260807000001`–`20260807000008` and the hardened edge functions were deployed to project `ijmwtjyuvdnvhblwwtpt` on 2026-08-07. For future migrations/functions the same flow applies: the client and backend must move together (e.g. the client expects the `share_event` RPC, and the calendar RPC assumes recipient copies exist).

Prerequisites: `SUPABASE_ACCESS_TOKEN` in the environment (Cursor Secrets inject into new cloud-agent VMs only — a running VM never picks up newly added secrets). If the CLI fails at "Initialising login role..." (upstream bug supabase/cli#5091 — a stale `cli_login_postgres` role), rotate the DB password via `PATCH /v1/projects/{ref}/database/password` and export `SUPABASE_DB_PASSWORD` (setting it skips the login-role path entirely). Deleting the role via `DELETE /v1/projects/{ref}/cli/login-role` was the earlier documented fix, but on 2026-08-28 the CLI still failed after the role was gone — password rotation is the reliable path.

```bash
npx supabase link --project-ref ijmwtjyuvdnvhblwwtpt
npx supabase db push                 # applies all pending migrations in order
npx supabase functions deploy send-notification cleanup-people og-metadata
npx supabase functions deploy twilio-status --no-verify-jwt   # Twilio can't present a JWT; the request signature is the auth
npx supabase secrets set CRON_SECRET=$(openssl rand -hex 32)   # already set; pg_cron jobs send it as x-cron-secret
```

Function-only deploys (no DB access) work without linking — pass the ref directly: `npx supabase functions deploy send-notification --project-ref ijmwtjyuvdnvhblwwtpt`. Note `supabase link` can fail on newer CLI versions with a `LegacyLinkApiKeysNetworkError ... inserted_at SchemaError` (Management API response drift); function deploys/secrets don't need link.

Notification SMS carries no app/web links (decision 2026-08-09 — see `docs/distribution-strategy.md`); the one exception is the internal-testing signup invite on the non-app variant (email CTA, added 2026-08-17). At launch, store links (non-users) and an event deep link (app users) return together — spec: `FEATURES.md` → SMS Links at Launch; do not implement one without the other, and not before listings exist. `send-notification` reads only the Twilio secrets today; `WEB_APP_URL` is set but unused (event-link base at launch). The placeholder `IOS_APP_STORE_URL` secret was removed 2026-08-09 (restored at launch for the non-app CTA). Build the static bundle with `npm run build:web` (→ `dist/`).

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
- EAS project environment variables `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (plaintext; development + preview + production) — created 2026-08-15. EAS builds do not read local `.env`; without these the bundle has no Supabase config. (Pre-hardening this was an instant launch crash — `createClient` threw at module scope; `lib/supabase.ts` now falls back to a placeholder, but the app is useless without real values.) Inspect with `eas env:list --environment preview`; recreate per SETUP.md → EAS Builds.
- iOS (App Store Connect API key): `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`, and `EXPO_ASC_API_KEY_P8_BASE64` (base64 of the `.p8`). Decode to the gitignored path `eas.json` submit uses, and export the env vars the CLI also reads:
  ```bash
  echo "$EXPO_ASC_API_KEY_P8_BASE64" | base64 -d > AuthKey.p8
  export EXPO_ASC_API_KEY_PATH="$PWD/AuthKey.p8"
  export EXPO_APPLE_TEAM_TYPE=INDIVIDUAL
  ```
  Distribution cert + provisioning profile for `com.rkilani.events` were created 2026-08-15; non-interactive `eas build --platform ios` works. `submit.production.ios.ascAppId` is `6801756936` (Shared Events). eas-cli 22 non-interactive submit ignores env-only ASC keys — temporarily add `ascApiKeyPath` / `ascApiKeyId` / `ascApiKeyIssuerId` / `appleTeamId` to local `eas.json`, then `git checkout -- eas.json` after (never commit). Strip whitespace from `EXPO_APPLE_TEAM_ID` (a leading newline makes EAS reject it). Pass `--groups "Team (Expo)"`. Do not pass `--what-to-test` (EAS changelog is Enterprise-only).
- Android submit (Play service account): decode `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (base64) to the path `eas.json` expects — `echo "$GOOGLE_PLAY_SERVICE_ACCOUNT_JSON" | base64 -d > google-play-service-account.json`. The file is gitignored; never commit it.

Commands:

```bash
# Owner smoke build (sideloadable APK; preview profile = internal distribution)
eas build --platform android --profile preview --non-interactive --wait

# Tester build → Play internal track (submit profile carries track + key path)
eas build --platform android --profile production --non-interactive --wait
eas submit --platform android --profile production --non-interactive --latest

# iOS → TestFlight (ASC key file + eas.json submit.production.ios)
eas build --platform ios --profile production --non-interactive --wait
eas submit --platform ios --profile production --non-interactive --latest --groups "Team (Expo)"
```

- `--wait` blocks until the build finishes and prints the artifact page URL — hand that link to the owner. Builds are metered (free plan: 15 Android + 15 iOS per month); never build speculatively.
- Preview produces an APK (sideload); production produces an AAB (Play) / IPA (TestFlight). Same commit, same code — preview is the owner's smoke surface, production is what testers get.
- iOS credentials (dist cert + profile) and `eas.json` `submit.production.ios.ascAppId` were set up 2026-08-15. Submit still needs the decoded `AuthKey.p8` (gitignored) plus the local `eas.json` ASC fields above. If a later non-interactive build still fails on certificates, the owner can run `eas build --platform ios --profile production` once interactively.
- If a required secret is missing, stop and tell the owner exactly which one to add (Cursor Dashboard → Cloud Agents → Secrets, and GitHub repo secrets if CI ever builds). Do not half-run a release.

### Key gotchas

- `react-native-web` must be installed for web mode to work (`npx expo install react-native-web`). It is already in `package.json` dependencies.
- The Expo dev server reads `.env` automatically — no `dotenv` setup needed.
- Supabase migrations in `supabase/migrations/` must be applied in filename order against the Supabase project before the app functions end-to-end.
- Edge Functions in `supabase/functions/` are Deno/TypeScript (excluded from the main `tsconfig.json`).
- Edge functions that browsers call must allow the headers supabase-js always sends: `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type` — otherwise the CORS preflight fails with `net::ERR_FAILED` and calls silently never reach the function.
- `cleanup-people` is invoked weekly by a pg_cron job that must send the `CRON_SECRET` edge-function secret as the `x-cron-secret` header. Check with `SELECT jobid, jobname, command FROM cron.job;` if it starts 401ing. (`cleanup-events` and its cron job were removed in the 2026-08-24 Copy + Follow cutover — every events row has exactly one owner, so there are no orphan snapshots to reclaim.)
- Phone auth requires a real SMS provider (Twilio) configured in the Supabase project. Unregistered numbers — including leftover fictional 555s not in `sms_test_otp` — still hit Twilio (`sms_send_failed` / 21211). Registered test accounts skip Twilio: Auth returns `message_id: test-otp`, and `send-notification` does not SMS NANP area-code 555. To add a number, use `scripts/create-test-accounts.mjs` (Admin API + `sms_test_otp` merge).
- When the `.env` file changes, the Expo dev server must be restarted to pick up new values (Metro does not hot-reload env vars).
- Sign-in surfaces SMS send failures to the user via a short `showAlert` (expected auth mistakes like `sms_send_failed`, rate limits, and expired OTP use `getAuthUserMessage` in `lib/authErrors.ts`). Unexpected failures still use `showError` (detailed alert with code/details). Check that dialog when auth testing fails.
- `Alert.alert` is a no-op on web. Use `showAlert`/`showConfirm` from `lib/dialogs.ts` (or `showError` for errors) for any user-facing dialog so it renders as `window.alert`/`window.confirm` in the browser.
- Known issues and by-design limitations that test agents must NOT flag (the web text-paint quirk, the native datetimepicker never opening on web, no browser notification-permission prompt, Android 3-button nav covering the bottom of the screen) live in `manual-tests/known_issues.md` — the open-issues ledger the release review is briefed from and maintains.
- Desktop Chrome alone is not enough for UI work that users will hit on phones. For onboarding and other full-screen flows, also verify at a mobile viewport (Chrome device toolbar → ~390×844). M-003 in `manual-tests/cloud_manual_regression.md` requires this.
