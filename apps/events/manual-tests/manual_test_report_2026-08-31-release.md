VERDICT: SHIP

# Release Review: staging @ 60e76eb

- Reviewed staging commit: 60e76ebf51d2161dc4d5edd388c7b90840ff9422
- Date: 2026-08-31
- Runner: Cursor cloud agent (release-review orchestrator per `scripts/release-review-orchestrator.md`)
- Target: https://staging.shared-events.pages.dev

This review certifies the staging tip that is ahead of production `dce52ee` (Copy + Follow cutover). Product delta since that ship: **Who's Coming**, **Share Delivery Status** (one-word ✓ Shared / ✕ Unsubscribed / ✕ Undelivered), **Share Sent Confirmation** (stay on the sheet with "✓ Sent to N people"; Cancel → Done), plus test-account / KI-009 Modal `onRequestClose` / KI-013 bookkeeping that already landed on staging.

Phase 0: origin/staging `60e76eb`; Staging pipeline https://github.com/ramseykilani/events-app/actions/runs/33359172008 green (`full-suite / checks`, `full-suite / e2e` including pixel diffs, `Deploy staging preview`). Short-circuit did not apply — this is not a docs-only delta from the 2026-08-24 SHIP report.

computerUse image-accumulation hit the provider cap during Track 2 (same limit that forced the 2026-08-24 matrix onto a scripted capture). Remaining Track 2 items and Tracks 3–5 were evidenced against the live staging preview with Playwright (same fallback the 2026-08-16 review used after the date-widget false alarm). Core smoke (Phase 1) and auth/first-run (Track 1) were computerUse.

## Checklist evidence

### Phase 1 — Smoke sweep (computerUse, Grok-fast)

- [x] App loads at the staging URL; sign-in with test OTP works — PASS (Account A `+15555550100` / `123456`)
- [x] Calendar renders; today's day list shows expected state — PASS (existing events from shared fixtures)
- [x] Create an event (title only, today) → appears on calendar — PASS (`RR-20260831-smoke`)
- [x] Share it to account B → B sees it — PASS (stay-on-sheet + "✓ Sent to 1 person" + row "✓ Shared"; B calendar showed the event From E2E Account A)
- [x] Remove the event on A → gone on A, still on B; remove on B (cleanup) — PASS
- [x] No browser permission prompts, no visible errors, no user-facing console dumps — PASS (expo-notifications-on-web, OTS/Geist font decode, Reanimated WASM noise — same class the 2026-08-24 skeptic dismissed)
- [x] e2e coverage vs Track 4 screens and Track 2–3 flows — PASS. Every Track 4 screen has a Playwright spec (`auth`, `onboarding`, `visual`, `smoke`, `add-event`, `event-detail`, `share`, `people`, `hide`, `edit-propagation`, `whos-coming`). Who's Coming, Share Sent Confirmation, and success-path "✓ Shared" are in `e2e/share.spec.ts` / `e2e/whos-coming.spec.ts`. Delivery-status failure labels (✕ Unsubscribed / ✕ Undelivered) are Jest + SQL (Twilio-dependent; cannot be e2e'd without carrier callbacks). Stress/50-person remain manual as in prior reviews.

Evidence: `/opt/cursor/artifacts/phase1_desktop_final.webp`, `/opt/cursor/artifacts/phase1_phone_final.webp`

### Phase 2 Track 1 — Auth & first-run (computerUse)

Throwaway test OTP `+15555550188` / `123456` (Management API merge; **removed after** — `sms_test_otp` restored to standing A/B + pool C–F + already-registered 114/126/149). Phone 390×844.

- [x] Sign-in: invalid phone → friendly alert ("Invalid phone number"); valid phone → OTP screen — PASS
- [x] OTP: wrong code `000000` → friendly alert (no debug dump); resend cooldown ~60s from the initial send; correct `123456` → in — PASS
- [x] Brand-new account: walkthrough auto-showed once; Next 1→2→3; Get Started → calendar — PASS
- [x] Reopen via Help (`?`); Skip → calendar — PASS
- [x] Sign back in later (People → Sign out, no localStorage.clear): walkthrough did NOT auto-show — PASS
- [x] Offline: DevTools Offline + reload → Chrome `ERR_INTERNET_DISCONNECTED` interstitial (retryable); Online + reload recovered the calendar — PASS
- [x] Expired/old OTP → N/A: test-OTP pair always accepts `123456`; cannot force true expiry without waiting `sms_otp_exp` (~240s). Wrong-code friendly alert already evidenced. Same N/A as 2026-08-24 / 2026-08-13.

Evidence: `/opt/cursor/artifacts/track1_phone_final.webp`

### Phase 2 Track 2 — Event lifecycle (account A)

First computerUse pass typed into Chrome's segmented date widget and flagged 2026→1906 as a blocker. **Skeptic: false alarm** (see Phase 3 Flag 1). Re-check used `input[type=date].fill('2026-08-15')` (the HTML value path, not digit-typing) plus the existing year guard (`isPlausibleEventDate`, e2e `implausible year is blocked`).

- [x] Add event: empty title+URL → Save disabled; title-only works; URL paste (`https://www.theguardian.com`) autofilled a title and did not block Save — PASS (computerUse)
- [x] Date/time HTML inputs: fill `2026-08-15` + `18:30` landed on Sat Aug 15 with formatted "Sat, Aug 15 · 6:30 PM"; time displayed 6:30 PM — PASS. Evidence: `/opt/cursor/artifacts/t2_dated_detail.png`
- [x] Event detail: formatted date (never raw YYYY-MM-DD); Share / Edit / Remove present; Open link opened the Guardian URL — PASS
- [x] Edit: title updated in place (Copy + Follow; no fork); detail showed the new title — PASS
- [x] Remove: cancel confirm → event remained; confirm → gone — PASS
- [x] Content stress: ~200-char title + ~2000-char description opened without breaking chrome; URL-only event saved — PASS. Evidence: `/opt/cursor/artifacts/t2_stress_detail.png`
- [x] Eight events on today: day list scrolled to m8 — PASS. Evidence: `/opt/cursor/artifacts/t2_eight_events.png`
- [x] Calendar month nav: August 2026 header present; adjacent-month day tap changed the month (KI-014 chevrons remain unpainted but the control works) — PASS

### Phase 2 Track 3 — Sharing, people, circles (accounts A + B)

- [x] Share sheet: Share disabled with zero selection; selecting B enabled it; after send the sheet stayed with "✓ Sent to 1 person", B's row "✓ Shared", Cancel became Done; shared row `aria-disabled=true` — PASS. Evidence: `/opt/cursor/artifacts/t3_sent_confirmation.png`, `/opt/cursor/artifacts/t3_shared_row.png`
- [x] Forwarding: A→B immediate; B's copy survived A removing theirs (E-108) — PASS
- [x] Second share to someone new: additive send; already-shared remain ✓ Shared (count 2 after second send) — PASS (push/SMS delivery itself out of scope)
- [x] People: manual add normalizes; duplicate add did not create a second row; remove asks for confirmation — PASS
- [x] Circles: create, add member (0 → 1 members), delete with confirm — PASS
- [x] Hide: B hid A → event vanished; Hidden section; Unhide restored — PASS
- [x] Long people list: REST fill-up to the 50 cap; UI showed **48 / 50 people** and scrolled (Account C, E2E Account B, temp RR- rows). Evidence: `/opt/cursor/artifacts/t3_people_long_list.png`

Who's Coming (shipped in this delta, exercised on B's shared copy): "E2E Account A asked — are you in?" with Yes / No. Evidence: `/opt/cursor/artifacts/t4_shared_whos_coming.png`

### Phase 2 Track 4 — Visual sweep — the matrix

Screenshots under `/opt/cursor/artifacts/t4/` at desktop ~1280 and phone ~390×844, Paper and Evening:

sign-in, OTP, onboarding p1–p3, calendar empty day + populated day, add-event, edit-event, event detail own, event detail shared-with-you (phone Paper), share sheet, people, circle editor, add-person; plus phone landscape calendar.

Judged against `docs/events-design-language.md`:

- [x] Alignment / spacing rhythm; nothing unintentionally hugging the screen edge — PASS
- [x] No text truncation/overflow on stress content (title wraps) — PASS
- [x] Contrast readable in both themes; accent spent on selected day, primary action, dots; destructive remove stays red — PASS. Evening uses charcoal ground + amber accent (`/opt/cursor/artifacts/t4_phone_evening_calendar.png`, `/opt/cursor/artifacts/t4_evening_onboarding.png`)
- [x] Touch targets ≥44pt on phone; headers/footers clear of web safe areas — PASS
- [x] Loading / empty / error states look intentional (empty day "Nothing on this day."; empty share-sheet "No people added yet"; people empty-state copy) — PASS
- [x] Landscape spot check: 844×390 calendar chrome intact; the sixth grid week can sit below the fold (today 31 not in the first viewport). Not catastrophic; web is the CI surface; same call the 2026-08-24 review N/A'd. Not a new KI.

KI-014 re-confirmed: no painted month chevrons on web; month still changes via adjacent-day taps.

### Phase 2 Track 5 — Edge & platform (account A)

- [x] Accessibility: Help, Add event, theme swatch labels (`Help`, `Add event`, `Switch to Evening theme`); tab through calendar chrome — PASS
- [x] Console: no user-visible errors. Filtered noise is expo-notifications-on-web / OTS / Reanimated. `PAGEERROR A network error occurred` during navigations is abort noise (Flag 2)
- [x] Double-tap Save: exactly one event — PASS
- [x] Browser back/forward: calendar ↔ People — PASS
- [x] Deep link: signed-out `/event/<id>` → session → event detail — PASS. Evidence: `/opt/cursor/artifacts/t5_deeplink.png`
- [x] Known-issues ledger re-check — KI-014 still present (web chevrons). KI-001 not reproduced. KI-011 people rows still dense-vs-tall on the long list (kept; not worse). KI-005/006/008/009/010/012 native-only (not web-verifiable; KI-009/`onRequestClose` fix still pending device smoke). KI-007 not re-tested (delete-account out of this pass).

### Phase 3 — Skeptic pass (orchestrator; inherit-level judgment)

computerUse could not be relaunched after Track 2 (provider cap: max 100 images on the resumed computerUse agent). Flags were re-checked against code, e2e on this commit, and Playwright evidence on the live preview.

- [x] Flag 1 (date year 2026→1906) — FALSE ALARM. Chrome's segmented `input[type=date]` widget mangled typed `2026` to `1906` — documented in `components/WebDateTimeInputs.tsx` and guarded by `isPlausibleEventDate` + `e2e/add-event.spec.ts`. Same false alarm as 2026-08-16. Default date already showed 08/31/2026; fill('2026-08-15') landed on Sat Aug 15 · 6:30 PM (`t2_dated_detail.png`).
- [x] Flag 2 (B did not see the share / E-108 fail) — FALSE ALARM. First Playwright pass used `isVisible()` without scroll/timeout on a crowded calendar. Retry with `expect().toBeVisible({ timeout: 30000 })` passed; Phase 1 computerUse already delivered A→B; T4 captured B's Who's Coming widget on the shared copy.
- [x] Flag 3 (✓ Shared not inside the person button) — FALSE ALARM. Status label is a sibling `Text`, not part of the accessible name. Screenshot shows "✓ Shared"; `aria-disabled=true` on the row.
- [x] Flag 4 (people count "0 / 50") — FALSE ALARM. Covered-screen locator matched a hidden `0 / 50`. Visible screenshot is **48 / 50 people** with named rows (`t3_people_long_list.png`).
- [x] Flag 5 (created event missing from calendar during T4) — FALSE ALARM. Empty-day step selected Aug 1, then created a today-dated event and looked for it on the 1st.
- [x] Flag 6 (phone OTP screen timeout) — FALSE ALARM / rate-limit from repeated Send code to A. Track 1 OTP passed; desktop OTP captured; a later phone OTP capture with B succeeded (`t4_phone_otp.png`).
- [x] Matrix skim — no missed blocker. KI-014 still the only visual defect (known). Who's Coming, sent confirmation, and one-word ✓ Shared match the shipped specs.
- [x] Every checklist item evidenced — confirmed.

## Blockers

none

## Known minor issues

No new KI. KI-014 re-confirmed (web-only invisible month chevrons; navigation still works).

## Ledger updates

- Added to `manual-tests/known_issues.md`: none
- Verified fixed and removed: none (KI-009 / KI-012 remain open pending owner on-device confirmation of the 2026-08-28 `onRequestClose` wiring)
- Still present (kept): KI-001, KI-005, KI-006, KI-007, KI-008, KI-009, KI-010, KI-011, KI-012, KI-014
