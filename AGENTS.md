# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a React Native (Expo SDK 54) events-sharing app. The frontend runs via the Expo dev server; the backend is a remote Supabase project (Postgres + Auth + Edge Functions). There is no local backend to start.

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

Note: account B was re-pointed from `+16462655565` (a real-format Manhattan number that would receive real texts) to the reserved fictional 555 range — never point test accounts at real-format numbers. `+15555550101` is **not** a configured test number — Twilio rejects it with `sms_send_failed`. For a truly fresh account (e.g. M-003 onboarding auto-show), temporarily add a third test OTP via the Management API (`PATCH /v1/projects/{ref}/config/auth` with both `sms_test_otp` and `sms_test_otp_valid_until`), then remove it when done. There is no sign-out button in the app UI; on web, sign out with `localStorage.clear(); location.reload();` in the browser console.

### Linting / type checking

There is no ESLint configuration. The only static check available is TypeScript:

```bash
npx tsc --noEmit
```

The tree is currently `tsc`-clean — keep it that way.

### Tests

Automated regression tests are configured with Jest + React Native Testing Library:

```bash
npm test -- --runInBand
```

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

For the web beta, `send-notification` accepts a `WEB_APP_URL` secret (see FEATURES.md → Web Support). Set it once the static build is hosted: `npx supabase secrets set WEB_APP_URL=https://<host>` — then non-app SMS links the website and app-user SMS uses `WEB_APP_URL/event/[id]` instead of the `events-app://` scheme. Build the static bundle with `npm run build:web` (→ `dist/`).

### Deploying the web app (Cloudflare Pages)

The web build is hosted on **Cloudflare Pages** as a **direct-upload** project managed via Wrangler (not Pages' built-in Git integration — Wrangler keeps the whole deploy path in the repo and runnable by any agent).

- Config: `wrangler.toml` (project name `shared-events`, output dir `dist/`). `public/_redirects` carries the SPA fallback (`/* /index.html 200`) so deep links like `/event/<id>` load the app; it's copied into `dist/` at export time.
- Prerequisites: `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID` (32-char hex account id — not a second copy of the token) in the environment (Cursor Secrets inject into new cloud-agent VMs only — a running VM never picks up newly added secrets).
- One-time project creation: `npx wrangler pages project create shared-events --production-branch=master`. The `*.pages.dev` subdomain is global: if `<name>.pages.dev` is taken by another account, Cloudflare silently assigns a suffixed host like `<name>-xyz.pages.dev` — pick another name if you want a clean one.
- Deploy: `npm run deploy:web` (builds `dist/` then `wrangler pages deploy`). Every deploy of the production branch updates `https://shared-events.pages.dev`; other `--branch` values create preview URLs. Wrangler infers the branch from the git checkout, so on a feature branch use `npx wrangler pages deploy --branch=master` to publish to production.
- After the first deploy, set `WEB_APP_URL` (see above) so SMS links point at the site, and remove the placeholder `IOS_APP_STORE_URL` secret.
- CI alternative: `.github/workflows/deploy-web.yml` deploys on every push to `master` once the repo Variable `DEPLOY_WEB=true` and Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set. It runs the same `wrangler pages deploy` command, so CI and agents behave identically.
- When a custom domain is purchased: Pages dashboard → Custom domains → add it (free auto SSL; instant if DNS is on Cloudflare), then update `WEB_APP_URL`.

Verify afterwards:

```bash
bash supabase/tests/run_local.sh     # SQL semantics suite (local scratch postgres)
npm test -- --runInBand              # Jest suite
```

Then run the manual regression suite (`manual-tests/cloud_manual_regression.md`), especially E-108/E-109 (forwarding) and M-003.

### Key gotchas

- `react-native-web` must be installed for web mode to work (`npx expo install react-native-web`). It is already in `package.json` dependencies.
- The Expo dev server reads `.env` automatically — no `dotenv` setup needed.
- Supabase migrations in `supabase/migrations/` must be applied in filename order against the Supabase project before the app functions end-to-end.
- Edge Functions in `supabase/functions/` are Deno/TypeScript (excluded from the main `tsconfig.json`).
- Edge functions that browsers call must allow the headers supabase-js always sends: `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type` — otherwise the CORS preflight fails with `net::ERR_FAILED` and calls silently never reach the function.
- `cleanup-people`/`cleanup-events` are invoked weekly by pg_cron jobs that must send the `CRON_SECRET` edge-function secret as the `x-cron-secret` header. Check with `SELECT jobid, jobname, command FROM cron.job;` if they start 401ing.
- Phone auth requires a real SMS provider (Twilio) configured in the Supabase project. Fake/test phone numbers like `+15555550100` are rejected by Twilio with `sms_send_failed`. To test sign-in without real SMS, configure a "Test OTP" phone/code pair in the Supabase Dashboard under **Authentication > Settings**.
- When the `.env` file changes, the Expo dev server must be restarted to pick up new values (Metro does not hot-reload env vars).
- Sign-in surfaces SMS send failures to the user via `showError` (detailed alert with code/details) — check that dialog when auth testing fails.
- `Alert.alert` is a no-op on web. Use `showAlert`/`showConfirm` from `lib/dialogs.ts` (or `showError` for errors) for any user-facing dialog so it renders as `window.alert`/`window.confirm` in the browser.
- `@react-native-community/datetimepicker` is not supported on web — the date/time pickers don't open in the browser, so web-created events use the default date. Test date-specific behavior with SQL seeding or on native.
- On web, text inside a newly pushed screen can occasionally fail to paint on first mount (observed once: share-sheet people names, event-detail Back label; interactions still work and text self-heals on revisit or any repaint). Suspected react-native-screens/react-native-web transition raster quirk — cosmetic, web-only. Don't chase it unless it becomes reproducible; see manual-tests/manual_test_report_2026-08-07-ui-polish.md for the investigation notes.
