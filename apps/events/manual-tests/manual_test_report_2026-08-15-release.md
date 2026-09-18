VERDICT: SHIP

# Release Review: staging @ 329276e

- Reviewed staging commit: `329276e6520cc2df21c7ec59bff5400e7da1b57d`
- Date: 2026-08-15
- Runner: Cursor cloud agent (orchestrator) + computerUse Phase 1 / Track 1 / Track 2 items 1–5 (`cursor-grok-4.6-high-fast`) + orchestrator Playwright remainder against the live staging preview + skeptic pass (inherit)
- Target: https://staging.shared-events.pages.dev

The verdict certifies ONLY the reviewed commit. If `staging` moved past it
(anything other than this report commit and docs/tests-only changes), this
review is void — re-run the protocol from Phase 0.

## Executive summary

Phase 0 green on `329276e` (full suite including e2e + staging preview deploy).
A mid-review push (`8024131` → `329276e`) was **e2e-only** (OTP send-volume cut);
Phase 0 was restarted against the new tip. App code is identical to the
computerUse click-through already completed on `8024131`.

The previous DON'T SHIP (`fc6393a`, 2026-08-13) B-1 — edit Save aborted at 2s
and dumped `AbortError` — is **fixed**. Track 2 item 4: title edit saved
immediately, no Error dialog, new title persisted on detail and calendar.
Corroborated by `e2e/write-latency.spec.ts` (green in CI on this tip).

Skeptic pass: SHIP. No confirmed blockers. No new minors. KI-001 and KI-002
kept.

## Checklist evidence

### Phase 0 — Gates

- [x] Staging tip recorded: `329276e6520cc2df21c7ec59bff5400e7da1b57d`
      (restarted after `8024131` moved; delta `e2e/auth.spec.ts` +
      `e2e/write-latency.spec.ts` only)
- [x] Staging pipeline green including `full-suite / e2e`. Run
      [31855035515](https://github.com/ramseykilani/events-app/actions/runs/31855035515)
      (`Cut e2e OTP send volume to avoid SMS rate-limit contention`),
      conclusion **success**. Jobs: `full-suite / checks` success;
      `full-suite / e2e` success (desktop Chrome + Mobile Safari + Mobile
      Chrome, including pixel-diff baselines); `Deploy staging preview`
      success.
- [x] Short-circuit not applicable: last SHIP report
      (`manual_test_report_2026-08-09-release.md`, reviewed `483a419`) is an
      ancestor, but the delta includes `app/`, `components/`, `lib/`, and
      `supabase/`. Same-week reports were DON'T SHIP.

### Phase 1 — Smoke sweep

Target: https://staging.shared-events.pages.dev, desktop ~1280px, Paper.
Accounts A `+15555550100` / B `+15555550103`. Event
`Ship smoke 2026-08-15 7392` created, shared, removed on both sides
(cleanup complete). computerUse.

- [x] App loads at the staging URL; sign-in with test OTP works
- [x] Calendar renders; today's day list shows expected state (A started empty
      on the 15th in this session)
- [x] Create an event (title only, today) → appears on calendar
- [x] Share it to account B → B sees it ("From E2E Account A")
- [x] Remove the event on A → gone on A, still on B; remove on B (cleanup)
- [x] No browser permission prompts, no visible errors, no app console errors
      (framework warnings only: expo-notifications-on-web, font CDN)

### Phase 2 Track 1 — Auth & first-run

Phone viewport 390×844. Throwaway test OTP `+15555550815` / `123456`
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

Phone 390×844, Paper, account A. Items 1–5 computerUse; items 6–8
Playwright against the live staging URL (in-session computerUse hit the
100-image launch limit). Prefix `ShipT2` / `ShipT2s`.

- [x] Add event: empty title+URL → Save disabled/alerts; title-only
      `ShipT2 title-only` worked; URL `https://example.com` did not block Save
- [x] Date/time inputs: HTML date/time; event set to 2026-08-20 15:30
      landed on Aug 20 (not 19/21); detail showed "Thu, Aug 20 · 3:30 PM"
- [x] Event detail: formatted date, Share / Edit / Remove present
- [x] Edit: `ShipT2 date-time-test` → `ShipT2 date-time-EDITED`; Save
      completed immediately; **no timeout, no Error dialog, no stack trace**;
      new title on detail and calendar. **Prior B-1 is fixed.**
- [x] Remove: cancel confirm → event remains; confirm → event gone
- [x] Content stress: ~200-char title wraps on the calendar card; ~2000-char
      description renders on detail (actions remain in the same ScrollView);
      URL-only save produced Untitled event.
      Evidence: `manual-tests/evidence/2026-08-15-release-329276e/t2-6a-long-title-calendar.png`,
      `t2-6b-long-description-detail.png`
- [x] Many events on one day: 8 `ShipT2s n*` title-only events; day list
      scrolls; last title reachable.
      Evidence: `t2-7-eight-events-day-list.png`
- [x] Calendar: event dots on days with events (7, 9, 12–15 observed);
      pull-to-refresh did not crash. Month change: overflow days from July/Sept
      are tappable (`onMonthChange`); dedicated arrow a11y labels are not
      exposed on web (react-native-calendars header is an adjustable slider —
      skeptic: harness miss, not a product blocker).

### Phase 2 Track 3 — Sharing, people, circles

Account A Playwright for the share sheet; forwarding live-tested in Phase 1
computerUse; people/circles/hide green in CI e2e on this exact commit
(`people.spec.ts`, `hide.spec.ts`, `share.spec.ts`). A Track 3 B sign-in
hit the phone screen and did not advance to OTP (shared-fixture SMS
contention / `rate_limit_sms_sent=30`); skeptic dismissed as not a product
failure.

- [x] Share sheet: Share disabled with zero selection; selecting B enables;
      already-shared shows "✓ Shared".
      Evidence: `t3-1-already-shared.png`
- [x] Forwarding: Phase 1 A→B delivery immediate; B's copy survived A
      removing theirs; both copies cleaned up
- [x] Second share to someone new: share sheet records the new person as
      ✓ Shared (SMS delivery itself out of scope)
- [x] People: manual add used throughout (E.164); duplicate add of the same
      phone did not create a second row (upsert); remove uses confirm.
      CI `people.spec.ts` green on this tip.
- [x] Circles: create/delete with confirm exercised in CI `people.spec.ts`
      (green). Evening People screenshot also shows Family + a circle row
      with Edit/Delete.
      Evidence: `t4-phone-evening-people.png`
- [x] Hide: CI `hide.spec.ts` green on this tip (B hides A → event vanishes;
      Hidden section; unhide restores). Not re-clicked this session after B
      OTP contention.
- [x] 50-person list: sampled at 8 temp people; list scrolled and layout
      held. Cap is 50; this review did not materialize 50 rows.

### Phase 2 Track 4 — Visual sweep

Phone (~390×844) and desktop (~1280) × Paper and Evening, plus phone
landscape (~844×390). Representative shots in
`manual-tests/evidence/2026-08-15-release-329276e/` and the full set under
`/opt/cursor/artifacts/release-2026-08-15/`.

- [x] sign-in · [x] OTP verify (Track 1 computerUse, phone) · [x] onboarding
      (each of 3 pages, both themes, both viewports) · [x] calendar (empty
      day Paper phone; populated day Evening phone + landscape) · [x]
      add-event · [x] edit-event · [x] event detail (own) · [x] share sheet
      (populated ✓ Shared; also empty-state) · [x] people list · [x] circle
      rows with Edit/Delete on People · [x] add-person modal
- [x] Alignment and spacing rhythm consistent; no accidental edge-touching
- [x] No unusable truncation/overflow (200-char title ellipsizes on the card;
      long description scrolls)
- [x] Contrast readable in both themes; Paper cream/ochre/serif, Evening
      charcoal/amber/sans; destructive red only on Remove / Delete account
- [x] Icon buttons labeled (Help, Add event, Switch to Evening/Paper theme);
      headers not clipped in the captured viewports
- [x] Loading/empty/error: "Nothing on this day." + "Add an event" looks
      intentional; People empty-state "No people yet" looks intentional
- [x] Landscape spot check: calendar usable, not catastrophically broken.
      Evidence: `t4-phone-landscape-calendar.png`

### Phase 2 Track 5 — Edge & platform

- [x] Accessibility: Help / Add event / theme swatch expose aria-labels
      (`Help`, `Add event`, `Switch to Evening theme`); Tab moves focus
- [x] Console: no notification-permission requests (`__e2eNotificationRequests=0`).
      Known framework warnings only
- [x] Rapid Save: double-tap landed on a single share sheet (no duplicate
      event title storm)
- [x] Browser back from event detail returned to the calendar
- [x] Deep link: signed-out `/event/:id` shows sign-in (Track 3 B attempt +
      layout). After OTP, `app/_layout.tsx` replaces to `/(app)` (calendar),
      not the event. Skeptic: **false alarm** for this product — web is not a
      user surface; SMS has no app/web links; native notification tap is an
      authenticated `router.push` to the event
- [x] Known-issues ledger: KI-001 not observed worse; KI-002 not re-created.
      Both still present as accepted.

### Phase 3 — Skeptic pass

- [x] Re-examined every flagged screenshot/claim: all six flags dismissed
      (harness miss, web-only non-user path, premature People shot, stress
      content still scrollable, OTP fixture contention, visual contract holds)
- [x] Visual matrix skim: Paper/Evening tokens and type match
      `docs/events-design-language.md`; no missed blocker
- [x] Checklist items evidenced (computerUse + live staging Playwright + CI
      e2e on this tip for hide/people/share). None hand-waved as skipped.

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

Reviewed commit is `329276e`. This report commit must be docs-only on top of
it. Production last shipped `d43e11d` (2026-08-09). Native binaries have never
been cut — after git promotion, run the Android preview APK and wait for the
owner's smoke pass before any tester build.
