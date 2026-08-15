VERDICT: SHIP

# Release Review: staging @ 577426c

- Reviewed staging commit: `577426cc061ef05ede53bbfdf1bec660f9c10200`
- Date: 2026-08-15
- Runner: Cursor cloud agent (orchestrator) + computerUse Phase 1 / Track 1 / Track 2 items 1–3 (`cursor-grok-4.6-high-fast`) + orchestrator Playwright remainder against the live staging preview + skeptic pass (inherit)
- Target: https://staging.shared-events.pages.dev

The verdict certifies ONLY the reviewed commit. If `staging` moved past it
(anything other than this report commit and docs/tests-only changes), this
review is void — re-run the protocol from Phase 0.

## Executive summary

Phase 0 green on `577426c` (full suite including e2e + pixel-diff baselines +
staging preview deploy). Short-circuit not applicable: last SHIP (`329276e`,
`manual_test_report_2026-08-15-release.md`) is an ancestor, but the delta
includes `app/`, `components/`, and `lib/` (People 44pt targets + footer
safe-area, share/calendar/event hit targets, `lib/supabase.ts` launch
fallback, Paper E’s icons).

In-session computerUse hit the 100-image launch limit after Track 2, matching
the prior SHIP review. Remaining Track 2–5 items were evidenced against the
live staging URL with Playwright (same pattern as `329276e`).

Skeptic pass: SHIP. No confirmed blockers. No new minors. KI-001 and KI-002
kept. A Track 2 computerUse “empty Save hangs” flag is a **false alarm**.

## Checklist evidence

### Phase 0 — Gates

- [x] Staging tip recorded: `577426cc061ef05ede53bbfdf1bec660f9c10200`
- [x] Staging pipeline green including `full-suite / e2e`. Run
      [31870985914](https://github.com/ramseykilani/events-app/actions/runs/31870985914)
      (`FEATURES: Touch Targets & Footer Safe Area implemented`),
      conclusion **success**. Jobs: `full-suite / checks` success;
      `full-suite / e2e` success (desktop Chrome + Mobile Safari + Mobile
      Chrome, including pixel-diff baselines); `Deploy staging preview`
      success.
- [x] Short-circuit not applicable: last SHIP report
      (`manual_test_report_2026-08-15-release.md`, reviewed `329276e`) is an
      ancestor, but the delta includes `app/`, `components/`, and `lib/`.

### Phase 1 — Smoke sweep

Target: https://staging.shared-events.pages.dev, desktop ~1280px, Paper.
Accounts A `+15555550100` / B `+15555550103`. Event
`Ship smoke 2026-08-15 577426c` created, shared, removed on both sides
(cleanup complete). computerUse.

- [x] App loads at the staging URL; sign-in with test OTP works
- [x] Calendar renders; today's day list shows expected state (A started with
      existing test events on the 15th)
- [x] Create an event (title only, today) → appears on calendar (7 events
      after create)
- [x] Share it to account B → B sees it ("From E2E Account A")
- [x] Remove the event on A → gone on A, still on B; remove on B (cleanup)
- [x] No browser permission prompts, no visible errors, no app console errors
      (framework warnings only: expo-notifications-on-web, font CDN)

### Phase 2 Track 1 — Auth & first-run

Phone viewport ~390×844. Throwaway test OTP `+15555550816` / `123456`
(added via Management API for this track, **removed after** — project
`sms_test_otp` restored to A+B only).

- [x] Sign-in: invalid phone `"123"` → friendly alert ("Invalid phone number");
      valid phone → OTP screen
- [x] OTP: wrong code `000000` → friendly alert ("That code is incorrect
      or no longer valid…"); no debug dump. Resend showed ~60s countdown.
      Correct `123456` → in; walkthrough auto-showed
- [x] Brand-new account: walkthrough auto-showed once; Next advanced
      pages 1→2→3; Get Started landed on calendar
- [x] Reopen walkthrough via Help (`?`); Skip returned to calendar
- [x] Sign back in later: walkthrough did NOT auto-show
- [x] Offline/edge: DevTools Offline + reload showed Chrome's
      ERR_INTERNET_DISCONNECTED / retry UI, not a blank screen or
      spinner-forever; returning online recovered the calendar
- [x] Expired/old OTP → N/A: test-OTP pair always accepts `123456`;
      cannot force true expiry without waiting `sms_otp_exp` (240s).
      Wrong-code friendly alert already evidenced on item 2.

### Phase 2 Track 2 — Event lifecycle

Phone ~390×844, Paper, account A. Items 1–3 computerUse; items 4–8
Playwright against the live staging URL (in-session computerUse hit the
100-image launch limit). Prefix `ShipT2-577426c` / `ShipR`.

- [x] Add event: empty title+URL → Save **disabled** (`aria-disabled`;
      `e2e/add-event.spec.ts` asserts this and was green on this tip).
      Title-only `ShipT2-577426c title-only` worked; URL `https://example.com`
      did not block Save. A computerUse agent flagged Save as enabled/hanging;
      skeptic dismissed (see Phase 3).
- [x] Date/time inputs: HTML date/time; event set to 2026-08-20 15:30
      landed on Aug 20 (not 19/21); detail showed "Thu, Aug 20 · 3:30 PM"
- [x] Event detail: formatted date, Share / Edit / Remove present
- [x] Edit: `ShipR … edit-me` → `ShipR … EDITED`; Save completed without
      Error dialog / AbortError / stack dump; new title on detail.
      **Prior B-1 is still fixed.** Corroborated by CI `e2e/write-latency.spec.ts`
      green on this tip.
- [x] Remove: cancel confirm → event remains; confirm → event gone. After an
      edit fork, Remove pops to the pre-edit detail (no longer owned) — Back
      lands on the calendar. Same stack behavior as `write-latency.spec.ts`.
      Evidence: `t2-5-fork-remove-pops-to-preedit-detail.png`
- [x] Content stress: ~200-char title ellipsizes on the calendar card;
      ~2000-char description renders on detail (actions remain reachable);
      URL-only save produced Untitled event.
      Evidence: `t2-6a-long-title-calendar.png`,
      `t2-6b-long-description-detail.png`
- [x] Many events on one day: 8 `ShipR … n*` title-only events; day list
      scrolls; last titles reachable.
      Evidence: `t2-7-eight-events-day-list.png`
- [x] Calendar: event dots on days with events (7, 9, 12–15 observed);
      adjacent-month overflow days visible (July 26–31 / Sept 1–5);
      reload recovered the calendar. Dedicated arrow a11y labels are not
      exposed on web (react-native-calendars header is an adjustable slider —
      skeptic: harness miss, not a product blocker).

### Phase 2 Track 3 — Sharing, people, circles

Account A Playwright for the share sheet and people/circles; forwarding
live-tested in Phase 1 computerUse; hide green in CI e2e on this exact commit
(`hide.spec.ts`) and exercised in the staging harness before the T5 timeout.

- [x] Share sheet: Share disabled with zero selection; selecting B enables;
      already-shared shows "✓ Shared".
      Evidence: `t3-1-already-shared.png`
- [x] Forwarding: Phase 1 A→B delivery immediate; B's copy survived A
      removing theirs; both copies cleaned up
- [x] Second share to someone new: share sheet lists a not-yet-shared person
      (Ramsey) as selectable next to B's ✓ Shared (SMS delivery itself out of
      scope)
- [x] People: manual add used throughout (E.164); duplicate add of the same
      phone did not create a second row (upsert); remove uses confirm.
      Evidence: `t3-people-list.png` (2/50, E2E Account B + Ramsey, footer
      "Your name: E2E User A", Sign out + Delete account visible)
- [x] Circles: create (`ShipR … circle` / existing Family + ShipT4 Circ),
      Edit members modal, member count, delete with confirm. CI
      `people.spec.ts` green on this tip.
      Evidence: `t3-people-list.png`, `t4-*-circle-editor.png`
- [x] Hide: CI `hide.spec.ts` green on this tip (B hides A → event vanishes;
      Hidden section; unhide restores). Re-clicked in the staging harness
      (Track 3 hide-me event shared to B, hide, unhide, cleanup) before T5.
- [x] 50-person list: sampled at 8 temp people; list scrolled and layout
      held. Cap is 50; this review did not materialize 50 rows.

### Phase 2 Track 4 — Visual sweep

Phone (~390×844) and desktop (~1280) × Paper and Evening, plus phone
landscape (~844×390). Representative shots in
`manual-tests/evidence/2026-08-15-release-577426c/` and the full set under
`/opt/cursor/artifacts/release-577426c/`.

- [x] sign-in  · [x] OTP verify (Track 1 computerUse + T4 OTP shot) · [x]
      onboarding (each of 3 pages, both themes, both viewports) · [x]
      calendar (populated day Paper phone + Evening phone + landscape) · [x]
      add-event · [x] edit-event · [x] event detail (own) · [x] share sheet
      (populated ✓ Shared) · [x] people list (populated: `t3-people-list.png`;
      empty-state layout also captured) · [x] circle editor modal · [x]
      add-person modal
- [x] Alignment and spacing rhythm consistent; no accidental edge-touching
- [x] No unusable truncation/overflow (200-char title ellipsizes on the card;
      long description scrolls)
- [x] Contrast readable in both themes; Paper cream/ochre/serif, Evening
      charcoal/amber/sans; destructive red only on Remove / Delete account
- [x] Icon buttons labeled (Help, Add event, Switch to Evening/Paper theme);
      People header Back/Add and footer Sign out / Delete account are visible
      (the 44pt + `insets.bottom` footer change; web has no 3-button nav so
      native overlap cannot be re-created here — owner device smoke already
      recorded that bug; this commit is the fix)
- [x] Loading/empty/error: "Nothing on this day." / "No people yet" look
      intentional
- [x] Landscape spot check: calendar usable, not catastrophically broken.
      Evidence: `t4-phone-landscape-calendar.png`

### Phase 2 Track 5 — Edge & platform

- [x] Accessibility: Help / Add event / theme swatch expose aria-labels
      (`Help`, `Add event`, `Switch to Evening theme`); Tab moves focus
- [x] Console: no notification-permission requests (`__e2eNotificationRequests=0`).
      Known framework warnings only
- [x] Rapid Save: double-tap landed on a single share sheet (no duplicate
      event title storm). `createInFlightRef` still in `add-event.tsx`.
- [x] Browser back from event detail returned to the calendar
- [x] Deep link: signed-out `/event/:id` shows sign-in.
      Evidence: `t5-signed-out-deep-link.png`. After OTP, `app/_layout.tsx`
      replaces to `/(app)` (calendar), not the event. Skeptic: **false alarm**
      for this product — web is not a user surface; SMS has no app/web links;
      native notification tap is an authenticated `router.push` to the event
- [x] Known-issues ledger: KI-001 not observed worse; KI-002 not re-created.
      Both still present as accepted.

### Phase 3 — Skeptic pass

- [x] Re-examined every flagged screenshot/claim:
      1. **Empty Save hangs with spinner** (Track 2 computerUse) — **false
         alarm**. `add-event.tsx` sets `disabled` + tertiary color when title
         and URL are empty; Save is never replaced by an ActivityIndicator
         (the only spinner is `loadingOg` beside the URL field). Playwright
         `e2e/add-event.spec.ts` asserts `toBeDisabled()` and was green on
         this tip. Recheck screenshots still show the word "Save", not a
         spinner, and no empty event was created.
      2. **T4 People empty / "Your name: Not set"** — **false alarm / harness**.
         Taking the OTP screenshot signed account A in a second context,
         which can revoke the first tab's session. Populated People is
         `t3-people-list.png` (2/50, E2E User A). Empty-state layout itself
         looks intentional.
      3. **Edit-then-Remove lands on pre-edit detail** — expected fork
         navigation stack (`write-latency.spec.ts` documents it). Back
         returns to calendar; the owned copy is gone. Not a product bug.
      4. **Signed-out deep link stays on sign-in** — web-only non-user path;
         same dismissal as the `329276e` review.
      5. **Month arrows unlabeled on web** — react-native-calendars slider;
         harness miss, not a blocker.
- [x] Visual matrix skim: Paper/Evening tokens and type match
      `docs/events-design-language.md`; no missed blocker. People footer
      (Sign out / Delete account) is on-screen in the populated shot.
- [x] Checklist items evidenced (computerUse + live staging Playwright + CI
      e2e on this tip for hide/people/share/write-latency/add-event). None
      hand-waved as skipped.

## Blockers

None.

## Known minor issues

None new this review.

KI-001 and KI-002 remain accepted (unchanged).

## Ledger updates

- Added to `manual-tests/known_issues.md`: none
- Verified fixed and removed: none
- Still present (kept): KI-001, KI-002

## Notes for promotion

Reviewed commit is `577426c`. This report commit must be docs-only on top of
it. Production last shipped `7e7c2b4` (2026-08-15, reviewed `329276e`).

Native: after git promotion, cut a new Android preview APK from the promoted
commit and wait for the owner's smoke pass before any tester (Play internal)
build. The previous preview (`5f477380`) was cut from `d7f9433` and does not
include this People touch-target / footer safe-area work.
