VERDICT: DON'T SHIP

# Release Review: staging @ f4335ac

- Reviewed staging commit: f4335acbb44546b6e6d585ef22031015de47824b
- Date: 2026-08-13
- Runner: Cursor cloud agent (orchestrator) + computerUse tracks (cursor-grok-4.6-high-fast)
- Target: https://staging.shared-events.pages.dev

The verdict certifies ONLY the reviewed commit. If `staging` moved past it
(anything other than this report commit and docs/tests-only changes), this
review is void — re-run the protocol from Phase 0.

## Executive summary

Phase 0 green (full-suite + e2e on `f4335ac`). Phase 1 smoke sweep passed
the core create/share/remove loop. Track 1 (auth & first-run on a throwaway
account) was CLEAN. Track 2 halted on a **reproduced infinite spinner on
event detail** — tapping a calendar event never shows Share/Edit/Remove.
Remaining tracks were not run. Production was not promoted. No APK was built.

## Checklist evidence

### Phase 0 — Gates

- [x] Staging tip recorded: `f4335acbb44546b6e6d585ef22031015de47824b`
- [x] Staging pipeline green including `full-suite / e2e` (run 31650938187, completed success; pixel-diff baselines included)
- [x] Short-circuit not applicable: last SHIP report (`manual_test_report_2026-08-09-release.md`, commit `483a419`) is an ancestor, but the delta includes `app/`, `components/`, `lib/`, and `supabase/` (display names, delete account, contacts explainer, SMS copy, etc.)

### Phase 1 — Smoke sweep

- [x] App loads at the staging URL; sign-in with test OTP works — account A `+15555550100` / `123456`
- [x] Calendar renders; today's day list shows expected state (historical events present)
- [x] Create an event (title only, today) → appears on calendar — `SHIP-P1-1723503700`
- [x] Share it to account B → B sees it (signed in as `+15555550103`)
- [x] Remove the event on A → gone on A, still on B; remove on B (cleanup complete)
- [x] No browser permission prompts, no visible errors. Console had Expo-web noise (see notes); no user-visible error UI. Treated as non-blocking for Phase 1 because core flows passed; not promoted to a KI (review halted before skeptic).

### Track 1: Auth & first-run (throwaway `+15555550107` / `123456`, then removed from test-OTP config)

- [x] Sign-in: invalid phone (`abc`) → friendly "Invalid phone number" alert; valid phone → OTP screen
- [x] OTP: wrong code `000000` → friendly "incorrect or no longer valid" (no debug dump); resend shows 60s cooldown; correct code → in
- [x] Brand-new account: walkthrough auto-showed once; Next advanced pages; Skip visible on all pages; Get Started on last page; completed to calendar
- [x] Reopen walkthrough via `?`; returns to calendar
- [x] Sign back in later: walkthrough does NOT auto-show again
- [x] Offline/edge: DevTools Offline reload shows Chrome `ERR_INTERNET_DISCONNECTED` (retryable), not a blank app spinner-forever
- [x] Expired/old OTP: test OTPs do not expire until 2027; `000000` hits the same friendly message (covers invalid and expired)

### Track 2: Event lifecycle (account A) — HALTED

- [x] Add event: empty title+URL → Save disabled; title-only works; URL paste autofilled from `https://example.com` without blocking save
- [x] Date/time inputs: HTML inputs work; event dated 2026-08-20 appeared on Aug 20 (no off-by-one)
- [x] Event detail: first open in this track showed formatted date ("Thu, Aug 13"), Share/Edit/Remove, Open link → example.com
- [ ] Edit — **not completed**: subsequent detail/edit navigations hung on the spinner (B-1)
- [ ] Remove — **not completed**: cannot reach Remove once the spinner sticks (B-1). Cancel-then-confirm was never re-tested after the hang started
- [ ] Content stress — not run (halted)
- [ ] Many events on one day — not run (halted; `SHIP-T2-bulk-1` save also hung)
- [ ] Calendar month nav / pull-to-refresh — not run (halted)

## Blockers

### B-1 — Event detail hangs on an infinite spinner (Share/Edit/Remove unreachable)

- Expected: Tapping an event on the calendar opens the detail screen within a couple of seconds, with a formatted date and Share / Edit / Remove Event actions. A load failure should show the existing "Could not load this event" + Retry UI, not spin forever.
- Actual: After creating events in Track 2, tapping `SHIP-T2-title-only` navigates to `/event/0ba04ca1-42a3-4422-bf92-fb17c7b02283` and stays on a centered spinner for 20+ seconds with no Back, no actions, no error. Reproduced on a second clean click from the calendar (orchestrator re-check). The same Track 2 agent had loaded detail successfully once earlier in the track (item 3), then it stopped loading. Phase 1 earlier in this review did open and remove a different event, so this is at least intermittent — but the hung state is sticky once it starts.
- Repro:
  1. Sign in as account A (`+15555550100` / `123456`) at https://staging.shared-events.pages.dev (desktop ~1280px, Paper theme).
  2. Create a title-only event for today (Save → Back on the share screen). Track 2 leftovers still on A: `SHIP-T2-title-only` and `Untitled event` on 2026-08-13, `SHIP-T2-aug20` on 2026-08-20.
  3. From the calendar day list, tap `SHIP-T2-title-only`.
  4. Observe `/event/0ba04ca1-42a3-4422-bf92-fb17c7b02283` spinning with no chrome.
- Evidence:
  - `manual-tests/evidence/2026-08-13-release/b1-event-detail-spinner.webp`
  - `manual-tests/evidence/2026-08-13-release/b1-event-detail-spinner-recheck.webp`
  - `manual-tests/evidence/2026-08-13-release/b1-calendar-before-hang.webp` (calendar still lists the events; dots on the 13th and 20th)
- Reviewed commit: `f4335acbb44546b6e6d585ef22031015de47824b`
- Likely code (for the fixer — do not treat as the only cause): `app/(app)/event/[id].tsx` `load()`. Two ways `loading` can stick true: (1) early `if (!id || !session?.user?.id) return` never calls `setLoading(false)`; (2) no `try/finally` around the awaits, so a thrown `NetworkError` (Phase 1 saw `Uncaught (in promise) NetworkError` from the app bundle on page load) never reaches `setLoading(false)` and never reaches the Retry UI. Calendar fetch still works, so this is specific to the detail/edit path (or to a hung client after Open-link / extra tabs).
- Cleanup for the fixer: remove leftover `SHIP-T2-*` / Untitled events from account A if they are still there. Detail is currently the only UI remove path, so if the spinner still blocks it, delete the caller's `user_events` rows for those snapshots via a signed-in session or SQL as part of the fix verification — do not delete `events` rows.

## Known minor issues

None confirmed this run (review halted before Track 4/5 and the skeptic pass). KI-001 was not re-checked.

Phase 1 console (not a KI, not a blocker): Expo-web warnings for `expo-notifications` on web, `@expo/vector-icons` font decode / OTS `sfntVersion` errors, and an uncaught `NetworkError` from the app bundle on page load — none user-visible. Worth checking while fixing B-1 in case the NetworkError is the same thrown promise that leaves detail spinning.

## Ledger updates

- Added to `manual-tests/known_issues.md`: none
- Verified fixed and removed: none
- Still present (kept): KI-001 (not re-checked this run)

## Tracks not run

- Track 2 items 4–8 (halted on B-1)
- Track 3: Sharing, people, circles
- Track 4: Visual sweep matrix
- Track 5: Edge & platform checks
- Phase 3: Skeptic pass

## Notes for the next ship-it

Fix B-1 on staging through the normal flow (fast checks, then push). Do not promote. The next "ship it" re-runs this protocol from Phase 0 against the new tip. Throwaway test OTP `+15555550107` was removed from the Supabase auth config after Track 1; A/B remain `15555550100=123456,15555550103=123456`.
