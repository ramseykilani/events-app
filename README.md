# Shared Events Family

A family of person-to-person apps sharing one design system, one infrastructure layer, and one development process. This repo is an npm-workspaces monorepo.

## Layout

- `apps/events/` — **Events**: a React Native (Expo SDK 54) app for sharing events with your people. No feeds, no social graph — just a calendar of events shared between people who know each other. Product docs live in `apps/events/docs/` (start with `events-technical-architecture.md`); its feature tracker is `apps/events/FEATURES.md`.
- `apps/i-love-you/` — **I Love You**: a private messaging and calling app for exactly two people — channels shaped by settings, notifications that say which kind of conversation they come from, a drop-in call room, a real desktop app. Start with `apps/i-love-you/README.md`; why it works the way it does is `docs/i-love-you-design.md`.
- `desktop/i-love-you/` — the Tauri v2 desktop shell around I Love You's web build (outside the npm workspaces; Rust).
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
npm run stack:up --workspace=apps/i-love-you         # I Love You's local backend (Docker), see its README
```

Branches: `staging` is the shared trunk (all finished work lands there, full suite runs on every push). Each app has a `production-<name>` pointer that moves only via the owner-gated release review. See `docs/development-workflow.md`.

Setup for a fresh machine (Supabase project, env vars, EAS): [SETUP.md](SETUP.md).
