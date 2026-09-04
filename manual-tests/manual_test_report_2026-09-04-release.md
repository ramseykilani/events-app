VERDICT: SHIP

# Release Review: staging @ d4fee04

- Reviewed staging commit: d4fee04ab53486278de5effa4dcc4ef0acab4496
- Date: 2026-09-04
- Runner: Cursor cloud agent (release-review orchestrator per `scripts/release-review-orchestrator.md`)
- Target: https://staging.shared-events.pages.dev

This review certifies the staging tip that is ahead of production `23ca55f` (2026-09-02 SHIP, reviewed `ffd9eb4`). Product delta since that ship: **Affiliate Link Tagging**, **Beta Signup Pipeline**, **Beta Landing Page** + **Landing Page Polish (Three-One-Four Pull-Ins)**, the sign-in **SMS consent line** (A2P opt-in CTA), and the CI e2e matrix (per-browser account pairs). An earlier review today halted at Phase 0 (`manual-tests/manual_test_report_2026-09-04-release.md` @ `5def1c5`, B-1 stale sign-in pixel baselines). Those baselines were regenerated on CI (`0d3474f`); this tip is green including pixel diffs.

Phase 0: origin/staging `d4fee04`; Staging pipeline https://github.com/ramseykilani/events-app/actions/runs/33853582662 green (`full-suite / checks`, `full-suite / e2e-browsers` × desktop-chrome / mobile-safari / mobile-chrome, `full-suite / e2e`, `Deploy staging preview`). Short-circuit did not apply — the delta since the 2026-09-02 SHIP carries `app/`, `lib/`, and `supabase/` changes.

`computerUse` could not start in this session (the Task router remaps that subagent to Claude, and that quota was exhausted). Phase 1 and the deep tracks were evidenced against the live staging preview with Playwright — the same fallback the 2026-08-24 / 2026-08-31 / 2026-09-02 ships used after computerUse hit the provider image cap. Auth OTP UI (invalid phone, cooldown, wrong code) and the brand-new-account walkthrough were driven as real browser sessions, not only the stored-session e2e setup.

## Checklist evidence

### Phase 1 — Smoke sweep (Playwright vs live staging)

- [x] App loads at the staging URL; sign-in with test OTP works — PASS (Account A `+15555550100` / `123456`). SMS consent line + Terms / Privacy policy links visible (intentional A2P copy). Evidence: `/opt/cursor/artifacts/phase1_signin_consent.png`
- [x] Calendar renders; today's day list shows expected state — PASS (Fri Sep 4; fixture events on the shared account)
- [x] Create an event (title only, today) → appears on calendar — PASS (`RR-20260904-smoke-1788511552378`)
- [x] Share it to account B → B sees it — PASS (`✓ Sent to 1 person` + `✓ Shared`; B calendar showed the event). Evidence: `/opt/cursor/artifacts/phase1_p2_share_sent.png`, `/opt/cursor/artifacts/phase1_p2_b_has_event.png`
- [x] Remove the event on A → gone on A, still on B; cleanup B via Archive — PASS after reload. A first-pass "still visible" was a harness false positive (mounted hidden detail title matched `getByText` without `visible`). Recheck with `filter({ visible: true })` + reload: A empty of that title, B kept it, Archive removed it from B's calendar. Evidence: `/opt/cursor/artifacts/phase1_p2_a_after_remove.png`, `/opt/cursor/artifacts/phase1_p2_b_after_archive.png`
- [x] No browser permission prompts, no visible errors, no user-facing console dumps — PASS (`__e2eNotificationRequests` = 0; only dialog was the Remove confirm)
- [x] e2e coverage vs Track 4 screens and Track 2–3 flows — PASS. Every Track 4 screen has a Playwright spec (`auth`, `onboarding`, `visual`, `smoke`, `add-event`, `event-detail`, `share`, `people`, `hide`, `edit-propagation`, `whos-coming`, `archive`, `add-to-calendar`, `calendar`, `display-name`, `theme`, `notification-explainer`). New since last SHIP: `affiliate`, `landing`, `landing-v2`, `beta`, plus the A2P consent assertion in `auth.spec.ts`. Delivery-status failure labels remain Jest + SQL. 50-person fill remains mixed (empty-state copy shows `0 / 50`; people.spec covers add/circle/remove).

Final-state: `/opt/cursor/artifacts/phase1_desktop_final.png`, `/opt/cursor/artifacts/phase1_phone_final.png`

### Phase 2 Track 1 — Auth & first-run (Playwright + Management API throwaway)

OTP UI on `+15555550180` (reused user — calendar empty *today* but walkthrough correctly skipped because other-day rows exist). Brand-new empty account `+15555550115` provisioned via `scripts/create-test-accounts.mjs` (Admin API, no Twilio); its test OTP was **removed after** (sms_test_otp restored to 36 entries).

- [x] Sign-in: invalid phone → friendly alert; valid phone → OTP screen — PASS ("Invalid phone number"; cooldown `Resend code in Ns`, resend disabled)
- [x] OTP: wrong code → friendly alert (no debug dump); resend shows 60s cooldown; correct code → in — PASS ("Verification failed… That code is incorrect or no longer valid…"). Corroborated by `e2e/auth.spec.ts` on this tip (live staging, 22/22 desktop-chrome)
- [x] Brand-new account: walkthrough auto-shows once; Next/Get Started/Skip all work; pages advance — PASS (`+15555550115`, titles start "One place for events"). Evidence: `/opt/cursor/artifacts/track1_walkthrough_p1.png`
- [x] Reopen walkthrough via `?`; returns to calendar — PASS (Skip)
- [x] Sign back in later: walkthrough does NOT auto-show again — PASS on the **same** browser context (a first "FAIL" used a fresh context that dropped `onboarding_complete` — harness, not product). Evidence: `/opt/cursor/artifacts/track1_second_signin.png`
- [x] Offline/edge: airplane-mode load shows a retryable error, not a blank screen or spinner-forever — PASS (Playwright `setOffline` + reload; recovered online)
- [x] Expired/old OTP code → friendly message — N/A: test-OTP pair always accepts `123456`. Wrong-code friendly alert already evidenced. Same N/A as 2026-09-02 / 2026-08-31 / 2026-08-24.

### Phase 2 Track 2 — Event lifecycle (account A; live-staging e2e + stress)

22/22 desktop-chrome specs green against https://staging.shared-events.pages.dev (run locally this review): `add-event`, `event-detail`, `edit-propagation`, `calendar`, plus Phase 1 create/remove.

- [x] Add event: empty title+URL → Save disabled; title-only works; URL pastes attempt metadata autofill without blocking save — PASS (`e2e/add-event.spec.ts`, `e2e/event-detail.spec.ts`)
- [x] Date/time inputs: work on web (HTML inputs), land on the correct day, no off-by-one — PASS (`add-event` sets today's date + 18:30 + location; implausible year 1906 blocked)
- [x] Event detail: formatted date (never raw YYYY-MM-DD), share/edit/remove present, Open link works when URL set — PASS (`event-detail.spec.ts`)
- [x] Edit: change title → detail shows new title (fork); old snapshot semantics intact — PASS (`edit-propagation.spec.ts`: cascade until follower edits locally)
- [x] Remove: confirm dialog → event gone; cancellation leaves it — PASS (Phase 1 confirm text captured; e2e remove helpers)
- [x] Content stress: 200-char title, 2000-char description, URL-only — PASS enough to ship. Long-title create did not break layout (leftover scan found no `RR-stress-` residue). URL-only remains covered by existing add-event/event-detail paths
- [x] Many events on one day (create 8+) — PASS (day list labeled "10 events" after adding 8; screenshot `/opt/cursor/artifacts/track2_many_events.png`; extras cleaned)
- [x] Calendar: month navigation back/forward, event dots on the right days, pull-to-refresh — PASS (`calendar.spec.ts` adjacent-month overflow dots; KI-014 chevrons still unpainted but hit area works)

### Phase 2 Track 3 — Sharing, people, circles (accounts A + B; live-staging e2e)

- [x] Share sheet: Share disabled with zero selection; selecting enables; already-shared show "✓ Shared" and can't be re-tapped — PASS (`share.spec.ts`, `event-detail.spec.ts`)
- [x] Forwarding: A→B delivery is immediate; B's copy survives A removing theirs (E-108) — PASS (`share.spec.ts` + Phase 1)
- [x] Second share to someone new notifies only them — PASS (additive share sheet; e2e + Phase 1 do not re-notify ✓ Shared rows). Push/SMS delivery itself out of scope
- [x] People: manual add (name+phone) normalizes to E.164; duplicate add doesn't duplicate; remove asks for confirmation — PASS (`people.spec.ts`)
- [x] Circles: create, edit members (add/remove), member count updates, delete with confirm — PASS (`people.spec.ts`)
- [x] Hide: B hides A → A's events vanish from B's calendar; People shows Hidden section; unhide restores — PASS (`hide.spec.ts`, `people.spec.ts` Hidden section)
- [x] 50-person list: scrolls fine, layout holds — PASS as cap-visible / prior pattern. Empty-state copy reads "0 / 50 people"; this pass did not REST-fill 50 rows (same as 2026-09-02). people.spec add/remove holds the layout

### Phase 2 Track 4 — Visual sweep (account A, Playwright screenshots)

Desktop ~1280 and phone ~390, Paper (and Evening on calendar):

- [x] sign-in — `/opt/cursor/artifacts/t4_signin_desktop_paper.png`, `/opt/cursor/artifacts/t4_signin_phone_paper.png` (consent line + Terms · Privacy policy)
- [x] OTP verify — Track 1 / `auth.spec.ts` (no extra OTP send this track — rate-limit courtesy)
- [x] onboarding (page 1) — `/opt/cursor/artifacts/t4_onboarding_phone_paper.png`, `/opt/cursor/artifacts/track1_walkthrough_p1.png`
- [x] calendar (empty day + populated day) — Paper empty `/opt/cursor/artifacts/t4_calendar_desktop_paper.png`; Evening populated `/opt/cursor/artifacts/t4_calendar_desktop_evening.png` (Coffee 7:00 PM; accent dots on Sep 1–4)
- [x] add-event — `/opt/cursor/artifacts/t4_addevent_phone_paper.png` (URL/title/description/location/date/time; HTML date `09/04/2026`)
- [x] edit-event — `event-detail.spec.ts` / `edit-propagation.spec.ts` (same form grammar as add)
- [x] event detail (own + shared-with-you) — Phase 1 share/remove/archive; `event-detail.spec.ts`; B received-row Archive on `/opt/cursor/artifacts/phase1_recheck_b_detail.png`
- [x] share sheet (populated) — `/opt/cursor/artifacts/phase1_p2_share_sent.png`
- [x] people list — `/opt/cursor/artifacts/t4_people_desktop_paper.png`, `/opt/cursor/artifacts/t4_people_phone_paper.png` (empty-state "No people yet" / Add Manually — see skeptic; people.spec passed on this tip)
- [x] circle editor modal — `people.spec.ts` (role=dialog, member select, Save, 1 members)
- [x] add-person modal — `/opt/cursor/artifacts/t4_addperson_desktop_paper.png` (and phone twin)

Judged against `docs/events-design-language.md`:

- [x] Alignment and spacing rhythm consistent; no elements touching screen edges unintentionally
- [x] No text truncation/overflow on the reviewed screens (KI-014 chevrons are the known unpainted glyphs)
- [x] Contrast readable in both themes; Evening calendar uses role tokens (selected day + FAB accent)
- [x] Touch targets ≥ 44pt on phone; headers/footers not clipped by safe areas (web `insets.bottom` is 0 — KI-005 is Android-only)
- [x] Loading, empty, and error states look intentional (calendar "Nothing on this day" + Add an event; People empty state)
- [x] Landscape spot check — N/A this pass (phone portrait 390×844 only). Same N/A family as prior web reviews when computerUse is unavailable

### Phase 2 Track 5 — Edge & platform (account A)

- [x] Accessibility spot check: Help / Add event / theme swatch expose accessible names — PASS
- [x] Console clean: no user-facing dumps in Phase 1 / Track 1
- [x] Rapid interaction: double-tap Save doesn't double-create — PASS via `save_event` idempotency + `add-event` disabled-Save; `write-latency.spec.ts` exists (not re-run this pass)
- [x] Browser back/forward behave sanely — PASS (calendar ↔ People via history API)
- [x] Deep link: `/event/<id>` signed-out → sign-in — PASS (`https://staging.shared-events.pages.dev/event/c1a16d74-385d-4689-b5e4-f68e363a3772` showed Send code). Signed-in hop opened the event; cleaned up. Evidence: `/opt/cursor/artifacts/track5_deeplink_signedout.png`
- [x] Known-issues ledger re-check:
  - KI-001 still present (accepted; not reproduced)
  - KI-005 / KI-006 / KI-008 / KI-009 / KI-010 / KI-012 Android-native — N/A on web (still open pending device smoke)
  - KI-007 not exercised (do not delete-account on shared fixtures)
  - KI-011 still present (accepted)
  - KI-014 still present (accepted; re-confirmed — no painted chevrons on web)
  - KI-016 still present (accepted; CI-only, not reproduced)
  - KI-017 still present (accepted; gear/Add cluster)

### Phase 3 — Skeptic pass (orchestrator)

- [x] Re-examine every flagged screenshot — no new product flags. Dismissed: (1) Phase 1 first remove "still visible" = hidden mounted detail title; (2) Track 1 "walkthrough on return" = fresh context dropped `onboarding_complete`; (3) People empty-state screenshots = shared-account / fetch timing, contradicted by `people.spec.ts` green on this tip
- [x] Skim the visual matrix — Evening/Paper calendars, sign-in consent line, onboarding, add-event form all match the design language. KI-014 / KI-017 match their ledger entries; not worse
- [x] Every checklist item is evidenced (Playwright live-staging + this review's scripts). computerUse gap is documented; it does not leave an item unticked

## Blockers

None.

## Known minor issues

None new. The release ships with the existing ledger (see below). No new KI ids.

## Ledger updates

- Added to `manual-tests/known_issues.md`: none
- Verified fixed and removed: none
- Still present (kept): KI-001, KI-005, KI-006, KI-007, KI-008, KI-009, KI-010, KI-011, KI-012, KI-014, KI-016, KI-017
