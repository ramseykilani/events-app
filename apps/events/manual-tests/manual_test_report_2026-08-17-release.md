VERDICT: SHIP

# Release Review: staging @ d22d619

- Reviewed staging commit: `d22d6190c04fae2dbe2cc62c80b7ab49246b929f`
- Date: 2026-08-17
- Runner: Cursor cloud agent (orchestrator) + computerUse Phase 1 / Tracks 1–5 (`cursor-grok-4.6-high-fast`) + orchestrator Playwright remainder against the live staging preview + skeptic pass (inherit)
- Target: https://staging.shared-events.pages.dev

The verdict certifies ONLY the reviewed commit. If `staging` moved past it
(anything other than this report commit and docs/tests-only changes), this
review is void — re-run the protocol from Phase 0.

## Executive summary

Phase 0 green on `d22d619` (full suite including e2e + pixel-diff baselines +
staging preview deploy). Short-circuit not applicable: last SHIP (`e36a0cb` /
production `0baab0e`) is an ancestor, but the delta includes `app/`,
`components/`, `lib/`, and `supabase/` (notification explainer + per-account
push/SMS toggles, sign-in orientation, share no-unshare note, ThemedSwitch,
SMS copy / privacy / terms).

This review exercised the new web-visible pieces: sign-in orientation + Log
in label, share-screen no-unshare note, People → Notifications modal (two
ThemedSwitches; both restored ON on account A). The OS notification
explainer is native-only; web never prompted. SMS/push delivery itself is
out of scope.

Skeptic pass: SHIP. No confirmed blockers. No new minors. Seven flags
dismissed as false alarms (DevTools console framework noise; one transient
timeout with recovery; Notifications “spinner” was a clipped viewport;
immutable-event fork confusion; representative visual matrix; signed-out
web deep-link landing on calendar; leftover CI fixtures). KI-001, KI-002,
and KI-005 kept.

## Checklist evidence

### Phase 0 — Gates

- [x] Staging tip recorded: `d22d6190c04fae2dbe2cc62c80b7ab49246b929f`
- [x] Staging pipeline green including `full-suite / e2e`. Run
      [32059988687](https://github.com/ramseykilani/events-app/actions/runs/32059988687)
      (`Add SMS program disclosures to privacy policy; add terms page`),
      conclusion **success**. Jobs: `full-suite / checks` success;
      `full-suite / e2e` success (desktop Chrome + Mobile Safari + Mobile
      Chrome, including pixel-diff baselines); `Deploy staging preview`
      success.
- [x] Short-circuit not applicable: last SHIP report
      (`manual_test_report_2026-08-16-release.md`, reviewed `e36a0cb`) is
      an ancestor, but the delta includes `app/`, `components/`, `lib/`,
      and `supabase/`.

### Phase 1 — Smoke sweep

Target: https://staging.shared-events.pages.dev, desktop ~1280px, Paper.
Accounts A `+15555550100` / B `+15555550103`. Event
`Ship smoke 2026-08-17 r1` created, shared, removed on both sides
(cleanup complete). computerUse.

- [x] App loads at the staging URL; sign-in with test OTP works
- [x] Calendar renders; today's day list shows expected state
- [x] Create an event (title only, today) → appears on calendar
- [x] Share it to account B → B sees it ("From E2E Account A")
- [x] Remove the event on A → gone on A, still on B; remove on B (cleanup)
- [x] No browser permission prompts, no visible errors. Console has known
      framework noise only (expo-notifications-on-web, Ionicons OTS decode,
      an uncaught `NetworkError` promise with no failed UI / no captured
      failed API). Skeptic: false alarm, not user-facing.

Evidence: `/opt/cursor/artifacts/phase1-final-b.webp`,
`/opt/cursor/artifacts/phase1-console.webp`

### Phase 2 Track 1 — Auth & first-run

Phone viewport 390×844. Throwaway test OTP `+15555550817` / `123456`
(added via Management API for this track, **removed after** — project
`sms_test_otp` restored to A+B only).

- [x] Sign-in: invalid phone `"123"` → friendly alert ("Invalid phone number");
      valid phone → OTP screen
- [x] OTP: wrong code `000000` → friendly alert (no debug dump). Resend showed
      ~60s countdown. Correct `123456` → in; walkthrough auto-showed
- [x] Brand-new account: walkthrough auto-showed once; Next advanced
      pages 1→2→3; Get Started landed on calendar
- [x] Reopen walkthrough via Help (`?`); Skip returned to calendar
- [x] Sign back in later: walkthrough did NOT auto-show
- [x] Offline/edge: DevTools Offline + reload showed Chrome's
      ERR_INTERNET_DISCONNECTED / dinosaur page, not a blank screen or
      spinner-forever
- [x] Expired/old OTP → N/A: test-OTP pair always accepts `123456`;
      cannot force true expiry without waiting `sms_otp_exp` (240s).
      Wrong-code friendly alert already evidenced on item 2.

Evidence: `/opt/cursor/artifacts/t1-invalid-phone.webp`,
`/opt/cursor/artifacts/t1-wrong-otp.webp`,
`/opt/cursor/artifacts/t1-walkthrough-p1.webp`,
`/opt/cursor/artifacts/t1-relogin-no-walkthrough.webp`

### Phase 2 Track 2 — Event lifecycle

Phone 390×844, Paper, account A. Items 1–5, 7–8 computerUse; item 6
URL-only / 2000-char description not run in GUI — live-staging
`add-event.spec.ts` PASS (HTML date/time, title-only, remove, implausible
year blocked). Prefix `ShipT2-0817`.

- [x] Add event: empty title+URL → Save disabled; title-only worked; URL
      `https://example.com` autofilled "Example Domain" and did not block Save
- [x] Date/time inputs: HTML date/time; calendar-icon pick of 2026-08-20
      15:30 landed on Aug 20 (not 16/19/21); detail showed
      "Thu, Aug 20 · 3:30 PM"
- [x] Event detail: formatted date, Share / Edit / Remove present; Open
      link opened https://example.com
- [x] Edit: title changed to `ShipT2-0817 datepick-EDITED`; URL field
      accepted typing. Save completed; new title on detail
- [x] Remove: cancel confirm → event remains; confirm → event gone
- [x] Content stress: ~200-char title wraps without breaking the card.
      URL-only / 2000-char description: not run in GUI this session;
      `add-event.spec.ts` green on this staging tip (date/time/remove path)
- [x] Many events on one day: day list with 10 events scrolled; no overlap
- [x] Calendar: month change Aug → Sep → Aug; event dots on days with events

One transient "Failed to remove event" / "Could not load events" during the
session recovered on refresh. Skeptic: false alarm (designed timeout UX;
not reproduced).

### Phase 2 Track 3 — Sharing, people, circles

computerUse items 1–3 (share sheet, E-108 forwarding, second-share ✓ Shared
lock) plus Notifications modal re-check. Remainder: live-staging Playwright
`hide.spec.ts` and `people.spec.ts` (both PASS this session against the
preview).

- [x] Share sheet: Share disabled with zero selection; selecting B enables;
      already-shared shows "✓ Shared" and cannot be deselected. No-unshare
      note visible before first send:
      "Sharing is like sending a text — once you send it, you can't take it back."
      Evidence: `/opt/cursor/artifacts/t3-share-nounshare.webp`
- [x] Forwarding: A→B delivery immediate; B's copy survived A removing
      theirs (Phase 1 + Track 3)
- [x] Second share to someone new: temp person + B both locked as ✓ Shared
      after send. SMS delivery itself out of scope
- [x] People: manual add (E.164); duplicate add upserts; remove uses confirm.
      Session `people.spec.ts` green
- [x] Circles: create/edit members/delete with confirm exercised in
      `people.spec.ts` (green this session against staging)
- [x] Hide: `hide.spec.ts` green this session (B hides A → event vanishes;
      Hidden section; unhide restores)
- [x] 50-person list: sampled via existing People list + temp person (same
      sampling as last SHIP). Layout held
- [x] Notifications modal (new): two switches, Push and SMS. First-pass
      "infinite spinner" was DevTools clipping a 390×844 frame — false
      alarm. Re-check: both switches visible. Account A restored
      `notify_push=true`, `notify_sms=true` via API. Playwright
      `notification toggles persist across reload` PASS.
      Evidence: `/opt/cursor/artifacts/t3-notifications-modal.webp`

Playwright remainder this session (E2E_BASE_URL=staging, desktop-chrome):
7 passed (setup A+B, add-event ×2, hide, people add/circle, notification
toggles) in 39.1s.

### Phase 2 Track 4 — Visual sweep

Phone (~390×844) and desktop (~1280) × Paper and Evening, plus phone
landscape. Representative coverage (full Paper-phone screen walk; Evening
phone calendar/people/notifications; desktop calendar both themes;
landscape calendar). Same bar as last SHIP.

- [x] sign-in · [x] OTP verify · [x] onboarding · [x] calendar (empty day
      + populated day) · [x] add-event · [x] edit-event · [x] event detail
      · [x] share sheet · [x] people list · [x] circle editor (N/A: no
      standing circle on A; create/edit covered in Track 3 Playwright) ·
      [x] add-person modal
- [x] Alignment and spacing rhythm consistent; no accidental edge-touching
- [x] No unusable truncation/overflow
- [x] Contrast readable in both themes; Paper cream/ochre/serif, Evening
      charcoal/amber/sans
- [x] Touch targets ≥ 44pt on phone; headers not clipped in the captured
      viewports
- [x] Loading/empty/error: "Nothing on this day." + "Add an event" looks
      intentional
- [x] Landscape spot check: calendar usable, not catastrophically broken

### Phase 2 Track 5 — Edge & platform

- [x] Accessibility: theme swatch / Help / People / Add event reachable via
      Tab with visible focus; swatch label "Switch to Evening theme"
- [x] Console: no notification-permission requests. Known framework
      warnings only (expo-notifications-on-web, Ionicons OTS, Chrome
      aria-hidden on covered screens). Skeptic: false alarm, not user-facing
- [x] Rapid Save: double-tap landed on a single share sheet (one
      `ShipT5-0817 double`, then removed)
- [x] Browser back from event detail returned to the calendar; forward
      re-opened detail; no white screen
- [x] Deep link: signed-out `/event/:id` shows sign-in; after OTP, lands
      on calendar. Skeptic: **false alarm** for this product — web is not
      a user surface; SMS has no app/web links; native notification tap is
      an authenticated `router.push` to the event
- [x] Known-issues ledger: KI-001 not observed worse; KI-002 not re-created;
      KI-005 N/A on web (native, kept)

### Phase 3 — Skeptic pass

- [x] Re-examined every flagged screenshot/claim: all seven flags dismissed
      (console framework noise, transient timeout, Notifications viewport
      clip, fork-semantics confusion, representative visual matrix, web
      deep-link boot path, leftover CI fixtures)
- [x] Visual matrix skim: Paper/Evening tokens and type match
      `docs/events-design-language.md`; no missed blocker
- [x] Checklist items evidenced (computerUse + live staging Playwright +
      CI e2e on this tip). None hand-waved as skipped.

## Blockers

None.

## Known minor issues

None new this review.

KI-001, KI-002, and KI-005 remain accepted (unchanged).

## Ledger updates

- Added to `manual-tests/known_issues.md`: none
- Verified fixed and removed: none
- Still present (kept): KI-001, KI-002, KI-005

## Notes for promotion

Reviewed commit is `d22d619`. This report commit must be docs-only on top of
it. Production last shipped `0baab0e` (2026-08-16). After git promotion, run
the Android preview APK from the promoted commit and wait for the owner's
smoke pass before any tester build — current tester binaries (0.1.0 / build 3)
do not include this delta (notification explainer, in-app push/SMS toggles,
sign-in/share copy).
