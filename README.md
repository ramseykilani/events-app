# Shared Events Family

A family of person-to-person apps sharing one design system, one infrastructure layer, and one development process. This repo is an npm-workspaces monorepo.

## Layout

- `apps/events/` — **Events**: a React Native (Expo SDK 54) app for sharing events with your people. No feeds, no social graph — just a calendar of events shared between people who know each other. Product docs live in `apps/events/docs/` (start with `events-technical-architecture.md`); its feature tracker is `apps/events/FEATURES.md`.
- `packages/design/` — `@family/design`: the design system. Role-token palettes (Paper/Evening), theme selection, and the primitive components (AppHeader, the three button tiers, IconButton, ThemedSwitch, Chip).
- `packages/infra/` — `@family/infra`: product-agnostic client infrastructure — the Supabase client, timeout budgets, dialog helpers, auth error mapping.
- `scripts/` — family tooling: conventions checker, test-account provisioning, release-review orchestrator.
- `docs/` — family docs: development workflow, distribution strategy, design language, philosophy.

## Developing

`AGENTS.md` is the operating manual — workflow, testing, branching, deploys. The short version:

```bash
npm install                                    # installs all workspaces
npm run typecheck && npm run test:conventions  # static checks
npm test -- --runInBand && npm run test:sql    # unit + SQL semantics
cd apps/events && npx expo start --web --port 8081   # run the Events web build
```

Branches: `staging` is the shared trunk (all finished work lands there, full suite runs on every push). Each app has a `production-<name>` pointer that moves only via the owner-gated release review. See `docs/development-workflow.md`.

Setup for a fresh machine (Supabase project, env vars, EAS): [SETUP.md](SETUP.md).
