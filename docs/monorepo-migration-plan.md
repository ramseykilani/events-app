# Monorepo Migration Plan (owner-approved 2026-09-18)

This repo is becoming a family monorepo: the Events app moves to `apps/events/`,
shared design/infra code is extracted to `packages/`, and the production branch
becomes `production-events` (a per-app pointer) so future sibling apps get
`production-<name>` of their own. The new app is NOT scaffolded by this
migration — Events migrates alone, and the second app moves in later.

## Locked decisions (owner, 2026-09-18)

- npm workspaces: `apps/*` + `packages/*`, single root lockfile. No pnpm.
- One trunk: `staging` (unchanged push-straight-to-staging policy). Per-app
  production pointers: `production-events` now, `production-<newapp>` when a
  sibling app launches. Dash naming, not slash (branch name is spelled
  identically in branch protection, CI triggers, and Cloudflare hostnames).
- Old `production` is deleted only after owner verification (see the gate
  below). Config flips are done by the agent where credentials allow;
  anything behind repo-admin settings is a listed owner click-path.
- Required check names are preserved: `full-suite / checks` and
  `full-suite / e2e` (job names in `.github/workflows/full-suite.yml` stay
  identical, so branch protection keeps binding).
- There is no "ship infrastructure" verb: `packages/` code rides app deploys;
  CI/scripts/docs are live on commit; Supabase and the static satellites keep
  their per-app runbooks.
- "Ship Events" = per-app release review (scoped to Events + `packages/`),
  fast-forward the staging tip to `production-events`, full repo suite runs on
  that push, path-scoped deploy builds only `apps/events/` + `packages/`.

## Why the production pointer can safely contain other apps' code

Every branch in a monorepo contains every app's code — that is what makes
atomic shared changes possible. `production-events` is a bookmark: the newest
trunk commit that passed the Events release review. What users run is
determined by the build inputs (`apps/events/` + `packages/`), not by what
else exists in the tree. The invariants that keep the pointer honest: the
pointer only moves via the owner-gated release review, the full repo suite
runs on every `production-*` push, and deploys are path-scoped by CI.

## Target layout

```
/  (family root)
├── package.json            workspace root: private, workspaces ["apps/*","packages/*"], delegate scripts
├── package-lock.json       the one lockfile (regenerated workspace-aware)
├── AGENTS.md               family workflow
├── README.md / SETUP.md    family docs
├── docs/                   family docs: development-workflow, distribution-strategy,
│                           events-design-language, events-philosophy, this plan
├── scripts/                family tooling: check-conventions.mjs, create-test-accounts.mjs,
│                           release-review-orchestrator.md, agent-ux-review-prompt.md, manual-test-suite.sh
├── .github/workflows/      updated in place, job names unchanged
├── apps/
│   └── events/             the Events app, moved as one unit:
│       ├── app/ components/ lib/ hooks/ constants/ assets/ __tests__/ e2e/ public/
│       ├── supabase/       its project: config.toml, migrations/, functions/, tests/
│       ├── receipt/ landing/ landing-v2/   static satellites
│       ├── manual-tests/ FEATURES.md STATUS.md docs/   product docs
│       ├── app.config.js eas.json google-services.json .env.example
│       ├── wrangler.toml wrangler.receipt.toml
│       └── package.json tsconfig.json jest.config.js jest.setup.ts playwright.config.ts
└── packages/               created in the extraction step
    ├── design/  (@family/design) Colors, themes, useTheme, ThemeContext, primitives
    └── infra/   (@family/infra)  supabase client, timeouts, dialogs, error helpers
```

## Execution steps

1. **Plan doc** (this file) — first commit on `staging`. Nothing moves before it.
2. **The pure move** — `git mv` the Events tree into `apps/events/`; workspace
   root `package.json`; regenerated lockfile; config updates (jest, tsconfig,
   playwright, wrangler, conventions checker scan roots, CI workflows). Pure
   moves only inside moved files — no content edits — so rename detection and
   `git log --follow` keep full history. AGENTS.md / `.cursor/rules/project.mdc`
   path references updated in the same push.
3. **Local green bar, then push** — clean `npm ci`, tsc, conventions, Jest,
   SQL semantics, web build, full desktop-Chrome e2e. Push; CI green; staging
   preview redeploys; pixel diffs pass **unchanged**.
4. **Branch cutover** (additive-first, owner gate):
   - Push `production-events` at the exact same SHA as `production`.
   - Flip settings (agent where possible, owner click-paths below otherwise).
   - Owner verifies (see checklist), then and only then the agent deletes old
     `production`.
5. **EAS preview build** — one Android preview build from `apps/events/`
   (metered, owner-approved) to prove native builds from the new layout.
6. **Packages extraction** — `packages/design` + `packages/infra`,
   conservative boundary (only obviously product-agnostic files), imports
   rewritten in a separate commit from the moves, same green bar.
7. **Docs sweep** — README/SETUP/development-workflow family rewrite; this
   plan marked complete with verification results.

## Owner click-paths (only if the agent's credentials are refused)

- GitHub → Settings → Branches → add rule for `production-events`: require
  status checks `full-suite / checks` and `full-suite / e2e` (mirror the
  current `production` rule).
- GitHub → Settings → General → Default branch → `staging`.
- Cloudflare → Pages → `shared-events` → Settings → Builds & deployments →
  production branch → `production-events`.

## Verification checklist

- [x] Fast checks green locally and in CI on the move push (run 35397975241: `full-suite / checks` + all three `e2e-browsers` legs + aggregator, all success)
- [x] Full local desktop-Chrome e2e green (60/60, fresh pair +15555550133/0134); CI three-browser matrix green
- [x] Pixel-diff baselines pass unchanged (visual.spec passed in all three CI legs with no baseline changes)
- [x] `git log --follow` shows pre-move history on moved files (output below)
- [ ] `production-events` branch page matches `production` SHA (owner) — both at `545ca23`
- [ ] Staging preview click-through (owner)
- [x] Production site untouched throughout (no production deploy happened)
- [x] EAS preview APK builds from the new layout: https://expo.dev/accounts/rkilani/projects/events-app/builds/55393a5a-ee93-4d2d-83bf-a93ce0a6f0be — owner sideload smoke test pending
- [ ] Old `production` deleted only after owner says verified

## Rollback

Every step is ordinary commits on `staging`; rollback is a revert commit — no
force-pushes. Nothing irreplaceable is deleted before the owner gate.

## Verification results

### Settings flips

- Cloudflare Pages `shared-events` production branch: **flipped to
  `production-events` by the agent via the API** (verified read-back).
- GitHub branch protection for `production-events` and the default-branch
  flip to `staging`: the agent's token has no admin rights (403), so these
  are owner clicks — see "Owner click-paths" above.

### `git log --follow` evidence (post-move)

```
=== apps/events/components/AppHeader.tsx
911ff25 Monorepo move: Events app to apps/events/, npm workspaces
1b60f35 Button tiers: compact inline size, Chip pill, AppHeader rightAccessory
73292b5 Add AppHeader + three-tier button set (Design System Consolidation)

=== apps/events/lib/timeoutSignal.ts
911ff25 Monorepo move: Events app to apps/events/, npm workspaces
23b23c7 Update stale find_or_create_event references in timeoutSignal comments
c9f5270 Fix KI-013: bound every Supabase call with a 20s backstop fetch
d194ddc Split timeout budgets by kind so a write can never take the 2s read budget
8e9c239 Give writes their own timeout so edit Save is not aborted at 2s
2265ab1 Paint event detail immediately and abort hung fetches

=== apps/events/app/(app)/index.tsx
911ff25 Monorepo move: Events app to apps/events/, npm workspaces
5aedadc Location: free-text events.location threaded through Copy + Follow (In progress)
af75539 Archive Received Events: Archive/Restore on event detail, say-No prompt, Archived drawer + calendar link
4d79e88 Copy + Follow: per-user events rows with silent edit cascade
7990cc1 Gate the OS notification prompt behind an in-app explainer
```

### Local e2e incident note (not a product bug)

The first local e2e run failed 8 specs with strict-mode violations (two
"E2E Account B" rows). Root cause: `create-test-accounts.mjs --fresh-pair`
checks `sms_test_otp` registration, not live `auth.users` rows, and handed
out a recycled number (0180, provisioned 2026-09-01) whose account still had
a person row for its original pair-mate. Re-running with a verified-empty
pair (0133/0134) passed 60/60. Tooling gap worth fixing separately: the
fresh-pair picker should also exclude numbers with existing auth users.
