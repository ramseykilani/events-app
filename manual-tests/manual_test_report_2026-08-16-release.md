VERDICT: SHIP

# Release Review: staging @ e36a0cb

- Reviewed staging commit: `e36a0cb0577a4666dff591fbf8348bcf425894a4`
- Date: 2026-08-16
- Runner: Cursor cloud agent (orchestrator) + computerUse Phase 1 / Tracks 1–5 (`cursor-grok-4.6-high-fast`) + orchestrator Playwright remainder against the live staging preview + skeptic pass (inherit)
- Target: https://staging.shared-events.pages.dev

The verdict certifies ONLY the reviewed commit. If `staging` moved past it
(anything other than this report commit and docs/tests-only changes), this
review is void — re-run the protocol from Phase 0.

## Executive summary

Phase 0 green on `e36a0cb` (full suite including e2e + pixel-diff baselines +
staging preview deploy). Short-circuit not applicable: last SHIP (`577426c` /
production `8f3b660`) is an ancestor, but the delta includes `app/` and
`supabase/` (KI-003 notify-only-new-recipients; KI-004 editable edit-URL).

This review re-checked both claimed fixes. KI-004: Edit Event URL field
accepts typing (`https://test.example.com` caret in-field). KI-003: share
sheet locks already-shared rows as "✓ Shared" (Ramsey, E2E Account B); the
client passes new person ids into `send-notification`. SMS/push delivery
itself is out of scope.

Skeptic pass: SHIP. No confirmed blockers. No new minors. Nine flags
dismissed as false alarms (Chrome segmented date-widget mid-type display;
harness title-persist miss; Evening sans misread; row border; RN
aria-hidden on covered screens; Track 3 remainder via Playwright; leftover
test fixtures; signed-out web deep-link landing on calendar; KI-004 is the
passing re-check). KI-001 and KI-002 kept.

## Checklist evidence

### Phase 0 — Gates

- [x] Staging tip recorded: `e36a0cb0577a4666dff591fbf8348bcf425894a4`
- [x] Staging pipeline green including `full-suite / e2e`. Run
      [31972117035](https://github.com/ramseykilani/events-app/actions/runs/31972117035)
      (`Mark KI-003 and KI-004 fixed pending release-review re-check`),
      conclusion **success**. Jobs: `full-suite / checks` success;
      `full-suite / e2e` success (desktop Chrome + Mobile Safari + Mobile
      Chrome, including pixel-diff baselines); `Deploy staging preview`
      success.
- [x] Short-circuit not applicable: last SHIP report
      (`manual_test_report_2026-08-15-release-577426c.md`, reviewed
      `577426c`) is an ancestor, but the delta includes `app/` and
      `supabase/`.

### Phase 1 — Smoke sweep

Target: https://staging.shared-events.pages.dev, desktop ~1280px, Paper.
Accounts A `+15555550100` / B `+15555550103`. Event
`Ship smoke 2026-08-16 r1` created, shared, removed on both sides
(cleanup complete). computerUse.

- [x] App loads at the staging URL; sign-in with test OTP works
- [x] Calendar renders; today's day list shows expected state
- [x] Create an event (title only, today) → appears on calendar
- [x] Share it to account B → B sees it ("From E2E Account A")
- [x] Remove the event on A → gone on A, still on B; remove on B (cleanup)
- [x] No browser permission prompts, no visible errors, no app console errors
      (framework warnings only: expo-notifications-on-web, font CDN / Ionicons)

Evidence: `manual-tests/evidence/2026-08-16-release-e36a0cb/phase1-final-calendar-a.webp`

### Phase 2 Track 1 — Auth & first-run

Phone viewport 390×844. Throwaway test OTP `+15555550816` / `123456`
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
      ERR_INTERNET_DISCONNECTED / dinosaur page, not a blank screen or
      spinner-forever; returning online recovered the calendar
- [x] Expired/old OTP → N/A: test-OTP pair always accepts `123456`;
      cannot force true expiry without waiting `sms_otp_exp` (240s).
      Wrong-code friendly alert already evidenced on item 2.

Evidence: `t1-invalid-phone.webp`, `t1-wrong-otp.webp`,
`t1-walkthrough-p1.webp`, `t1-relogin-no-walkthrough.webp`,
`t1-offline.webp`

### Phase 2 Track 2 — Event lifecycle

Phone 390×844, Paper, account A. Items 1, 3–5 computerUse; date/off-by-one
re-checked with the HTML date picker's calendar icon (do not type into
Chrome's segmented year widget); items 6–8 Playwright against the live
staging URL. Prefix `ShipT2-0816` / `ShipT2r-0816`.

- [x] Add event: empty title+URL → Save disabled; title-only worked; URL
      `https://example.com` did not block Save
- [x] Date/time inputs: HTML date/time; calendar-icon pick of 2026-08-20
      15:30 landed on Aug 20 (not 16/19/21); detail showed
      "Thu, Aug 20 · 3:30 PM". First-pass "typing ISO mangles year" is the
      documented segmented-widget quirk; implausible years are blocked
      (`isPlausibleEventDate` + e2e). Skeptic: false alarm.
- [x] Event detail: formatted date, Share / Edit / Remove present; Open
      link when URL set
- [x] Edit: `ShipT2-0816 datepick` → `ShipT2-0816 datepick-EDITED`; URL
      field accepted `https://example.com` / `https://example.com/edited`.
      Save completed immediately; new title on detail and Aug 20 calendar.
      **KI-004 is fixed.**
- [x] Remove: cancel confirm → event remains; confirm → event gone
- [x] Content stress: ~200-char title wraps on the calendar card; ~2000-char
      description renders on detail (actions remain in the same ScrollView);
      URL-only save produced Untitled event.
      Evidence: `t2-long-description.png`, `t2-eight-events.png`
- [x] Many events on one day: 8 `ShipT2r-0816 n*` title-only events; day
      list scrolls; last title reachable
- [x] Calendar: event dots on days with events; month change via the
      react-native-calendars header slider. Dedicated arrow a11y labels are
      not exposed on web (known harness miss, not a product blocker).

Evidence: `t2-aug20-datepick.webp`, `t2-edit-url-editable.webp`

### Phase 2 Track 3 — Sharing, people, circles

computerUse items 1–2 (share sheet + E-108 forwarding). Remainder:
live-staging Playwright `hide.spec.ts` and `people.spec.ts` (both PASS on
this session against the preview) plus Track 5 KI-003 re-check.

- [x] Share sheet: Share disabled with zero selection; selecting B enables;
      already-shared shows "✓ Shared" and cannot be deselected
- [x] Forwarding: A→B delivery immediate; B's copy survived A removing
      theirs (Phase 1 + Track 3). Evidence: `t3-b-calendar-forward.webp`
- [x] Second share to someone new: sheet records the new person as
      ✓ Shared; already-shared stay locked. SMS delivery itself out of
      scope. Track 5: Ramsey "✓ Shared" after share.
      Evidence: `t5-ki003-shared-locked.webp`
- [x] People: manual add (E.164); duplicate add of the same phone updated
      the existing row (upsert, name became "… renamed") rather than a
      second row; remove uses confirm. CI/session `people.spec.ts` green.
- [x] Circles: create/edit members/delete with confirm exercised in
      `people.spec.ts` (green this session against staging)
- [x] Hide: `hide.spec.ts` green this session (B hides A → event vanishes;
      Hidden section; unhide restores)
- [x] 50-person list: sampled at 5–9 temp people (9/50 on People); list
      scrolled and layout held. Cap is 50; this review did not materialize
      50 rows (same sampling as last SHIP).

### Phase 2 Track 4 — Visual sweep

Phone (~390×844) and desktop (~1280) × Paper and Evening, plus phone
landscape. Representative shots in
`manual-tests/evidence/2026-08-16-release-e36a0cb/` and
`/opt/cursor/artifacts/`.

- [x] sign-in · [x] OTP verify · [x] onboarding · [x] calendar (empty day
      + populated day) · [x] add-event · [x] edit-event · [x] event detail
      · [x] share sheet · [x] people list · [x] circle editor · [x]
      add-person modal
- [x] Alignment and spacing rhythm consistent; no accidental edge-touching
- [x] No unusable truncation/overflow (200-char title ellipsizes on the card;
      long description scrolls)
- [x] Contrast readable in both themes; Paper cream/ochre/serif, Evening
      charcoal/amber/sans (`titleFontFamily` system-ui). Track 4 "Evening
      still serif" flag dismissed by skeptic on the Evening shots.
- [x] Touch targets ≥ 44pt on phone; headers not clipped in the captured
      viewports
- [x] Loading/empty/error: "Nothing on this day." + "Add an event" looks
      intentional
- [x] Landscape spot check: calendar usable, not catastrophically broken

Evidence: `paper-phone-signin.webp`, `paper-phone-calendar.webp`,
`evening-phone-calendar.webp`, `t4-paper-desktop-calendar.webp`

### Phase 2 Track 5 — Edge & platform

- [x] Accessibility: Help / Add event / theme swatch / People reachable via
      Tab with visible focus; labels present
- [x] Console: no notification-permission requests. Known framework
      warnings only (expo-notifications-on-web, Ionicons OTS decode,
      Chrome aria-hidden on React Navigation's covered screens). Skeptic:
      false alarm, not user-facing
- [x] Rapid Save: double-tap landed on a single share sheet (one
      `ShipT5-0816 double`, then removed)
- [x] Browser back from event detail returned to the calendar; forward
      re-opened detail; no white screen
- [x] Deep link: signed-out `/event/:id` shows sign-in; after OTP, lands
      on calendar. Skeptic: **false alarm** for this product — web is not
      a user surface; SMS has no app/web links; native notification tap is
      an authenticated `router.push` to the event
- [x] Known-issues ledger: KI-001 not observed worse; KI-002 not re-created.
      **KI-003 verified fixed** (✓ Shared lock). **KI-004 verified fixed**
      (URL field editable).

Evidence: `t5-ki003-shared-locked.webp`, `t5-ki004-url-editable.webp`

### Phase 3 — Skeptic pass

- [x] Re-examined every flagged screenshot/claim: all nine flags dismissed
      (segmented date widget, harness miss, Evening sans, row border, RN
      aria-hidden, Playwright remainder, leftover fixtures, web deep-link
      boot path, KI-004 passing re-check)
- [x] Visual matrix skim: Paper/Evening tokens and type match
      `docs/events-design-language.md`; no missed blocker
- [x] Checklist items evidenced (computerUse + live staging Playwright +
      CI e2e on this tip). None hand-waved as skipped.

## Blockers

None.

## Known minor issues

None new this review.

KI-001 and KI-002 remain accepted (unchanged).

## Ledger updates

- Added to `manual-tests/known_issues.md`: none
- Verified fixed and removed: KI-003, KI-004
- Still present (kept): KI-001, KI-002

## Notes for promotion

Reviewed commit is `e36a0cb`. This report commit must be docs-only on top of
it. Production last shipped `8f3b660` (2026-08-15). After git promotion, run
the Android preview APK from the promoted commit and wait for the owner's
smoke pass before any tester build — the 2026-08-15 native binaries still
contain KI-003/KI-004.
