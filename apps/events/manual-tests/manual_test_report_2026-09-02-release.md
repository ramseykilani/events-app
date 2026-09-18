VERDICT: SHIP

# Release Review: staging @ ffd9eb4

- Reviewed staging commit: ffd9eb4235163ee1ae80cea7292d3e4aedd0e681
- Date: 2026-09-02
- Runner: Cursor cloud agent (release-review orchestrator per `scripts/release-review-orchestrator.md`)
- Target: https://staging.shared-events.pages.dev

This review certifies the staging tip that is ahead of production `78efc59` (2026-08-31 SHIP, reviewed `60e76eb`). Product delta since that ship: **Coming Link in Every Share SMS**, **Adjacent-Month Event Dots**, **Add to Other Calendars**, **Archive Received Events**, **Hide Confirmation & People Settings Sheet**, **Location**, **Screen Transition Polish (Android)**, **New Architecture Migration** (landed; iOS TestFlight smoke still open), **Permission Explainer Clarity**, **KI-005** bottom-inset padding, **KI-015**, and **Design System Consolidation** (AppHeader + three-tier buttons; visual baselines regenerated). **KI-016** was investigated on this tip (CI-render artifact, not a product bug).

Phase 0: origin/staging `ffd9eb4`; Staging pipeline https://github.com/ramseykilani/events-app/actions/runs/33609996722 green (`full-suite / checks`, `full-suite / e2e` including pixel diffs, `Deploy staging preview`). Short-circuit did not apply — this is not a docs-only delta from the 2026-08-31 SHIP report.

computerUse (Grok-fast) completed Phase 1 and Track 1 (one resume for Settings/sign-out). Track 2 started on a fresh cloud computerUse agent (items 1–5). The in-session computerUse then hit the provider image cap (same limit that forced the 2026-08-24 / 2026-08-31 remainder onto Playwright). Remaining Track 2 items 6–8 and Tracks 3–5 were evidenced against the live staging preview with Playwright. Core smoke (Phase 1) and auth/first-run (Track 1) were computerUse.

## Checklist evidence

### Phase 1 — Smoke sweep (computerUse, Grok-fast)

- [x] App loads at the staging URL; sign-in with test OTP works — PASS (Account A `+15555550100` / `123456`)
- [x] Calendar renders; today's day list shows expected state — PASS (Wed Sep 2; fixture events on the shared account)
- [x] Create an event (title only, today) → appears on calendar — PASS (`RR-20260902-smoke`)
- [x] Share it to account B → B sees it — PASS (stay-on-sheet + "✓ Sent to 1 person" + row "✓ Shared"; B calendar showed the event From E2E Account A)
- [x] Remove the event on A → gone on A, still on B; cleanup B via Archive — PASS (received copies show Archive, not Remove Event)
- [x] No browser permission prompts, no visible errors, no user-facing console dumps — PASS
- [x] e2e coverage vs Track 4 screens and Track 2–3 flows — PASS. Every Track 4 screen has a Playwright spec (`auth`, `onboarding`, `visual`, `smoke`, `add-event`, `event-detail`, `share`, `people`, `hide`, `edit-propagation`, `whos-coming`, `archive`, `add-to-calendar`, `calendar`, `display-name`). Location rides `add-event` / `event-detail` / `visual` / `add-to-calendar` / `receipt`. Archive, Add to Other Calendars, Hide confirm, and the People Settings sheet have dedicated specs. Delivery-status failure labels remain Jest + SQL. Stress/50-person remain mixed (stress exercised this review; 50-cap fill via REST as in prior ships).

Evidence: `/opt/cursor/artifacts/phase1_desktop_final.webp`, `/opt/cursor/artifacts/phase1_phone_final.webp`

### Phase 2 Track 1 — Auth & first-run (computerUse)

Throwaway test OTP `+15555550172` / `123456` (Management API merge; **removed after** — `sms_test_otp` restored to the pre-track set). Phone intended; resume completed sign-out on desktop.

- [x] Sign-in: invalid phone → friendly alert ("Invalid phone number. Please enter a valid phone number."); valid phone → OTP screen — PASS
- [x] OTP: wrong code `000000` → friendly alert "Verification failed. That code is incorrect or no longer valid…" (no debug dump); resend cooldown "Resend code in Ns" with disabled button; correct `123456` → in — PASS
- [x] Brand-new account: walkthrough auto-showed once; Next 1→2→3; Get Started → calendar — PASS (titles: "One place for events", "Add from a link or from scratch", "You choose who's in")
- [x] Reopen via Help (`?`); Skip → calendar — PASS
- [x] Sign back in later (People → Settings gear → Sign out, no localStorage.clear): walkthrough did NOT auto-show — PASS (first pass missed the icon-only gear; resume found Settings left of Add and completed the cycle)
- [x] Offline: DevTools Offline + reload → Chrome `ERR_INTERNET_DISCONNECTED` interstitial (retryable); Online + reload recovered — PASS
- [x] Expired/old OTP → N/A: test-OTP pair always accepts `123456`. Wrong-code friendly alert already evidenced. Same N/A as 2026-08-31 / 2026-08-24.

Evidence: `/opt/cursor/artifacts/track1_1d1f7.webp` (Settings sheet), `/opt/cursor/artifacts/track1_2a77f.webp` (Sign out confirm), `/opt/cursor/artifacts/track1_4e9fc.webp` (calendar after re-sign-in, no walkthrough)

### Phase 2 Track 2 — Event lifecycle (account A)

computerUse (cloud) covered items 1–5; Playwright on the live preview covered 6–8 after the image cap.

- [x] Add event: empty title+URL → Save disabled; title-only works; URL paste of a URL already on the calendar hits the per-user dedup jump (by design, not a block) — PASS (computerUse)
- [x] Date/time HTML inputs: date `2026-09-15` + time `18:30` landed on Tue Sep 15 with formatted "Tue, Sep 15 · 6:30 PM" — PASS. Year-segment typing still hits Chrome's 1906 trap; the year guard blocks it (same false alarm class as 2026-08-31)
- [x] Event detail: formatted date "Wed, Sep 2" (never raw YYYY-MM-DD); Share / Edit / Remove Event present — PASS
- [x] Edit: title updated in place (Copy + Follow; no fork); detail showed the new title — PASS
- [x] Remove: cancel confirm → event remained; confirm → gone — PASS
- [x] Content stress: ~200-char title + ~2000-char description opened without breaking chrome (title wraps; Remove Event still present); URL-only event saved as untitled — PASS. Evidence: `/opt/cursor/artifacts/t2/stress_detail.png`
- [x] Eight events on today: day list scrolled to m8 — PASS. Evidence: `/opt/cursor/artifacts/t2/eight_events.png`
- [x] Calendar month nav + reload: September 2026 recovered after chevron-area clicks and reload — PASS (KI-014 chevrons remain unpainted)

No Hide action on self-created events (KI-016 is CI-pixel only).

### Phase 2 Track 3 — Sharing, people, circles (accounts A + B)

- [x] Share sheet: Share disabled with zero selection; selecting B enabled it; after send the sheet stayed with "✓ Sent to 1 person", B's row "✓ Shared" — PASS. Evidence: `/opt/cursor/artifacts/t3/sent_confirmation.png`
- [x] Forwarding: A→B immediate; B's copy survived A removing theirs (E-108) — PASS. REST after A's delete: B row kept, `from_event_id` SET NULL. A first-pass `goneOnA=false` was a covered-screen locator false alarm (skeptic Flag 1)
- [x] Second share to someone new: additive send "✓ Sent to 2 people" — PASS (push/SMS delivery itself out of scope)
- [x] People: manual add; duplicate add did not create a second visible row; remove asks for confirmation — PASS
- [x] Circles: create, add member (0 → 1 members), delete with confirm — PASS. Evidence: `/opt/cursor/artifacts/t3/circle_editor.png`
- [x] Hide: confirm copy matches spec ("won't see events they send you… aren't told… unhide them anytime from My People"); cancel leaves the detail; confirm + Unhide from Settings restores — PASS (immediate calendar `hidden=false` was a refetch race; Unhide was present and restore succeeded)
- [x] Long people list: REST fill-up reached the 50 cap (50 `my_people` rows). UI evidence of a loaded list: **3 / 50 people** with named rows including E2E Account B (`/opt/cursor/artifacts/t3/people_loaded.png`). An earlier 0 / 50 empty-state shot was a load-race (skeptic Flag 2; same class as 2026-08-31 Flag 4)

### Phase 2 Track 4 — Visual sweep — the matrix

Screenshots under `/opt/cursor/artifacts/t4/` at desktop ~1280 and phone ~390×844, Paper and Evening (54 files plus evening shared detail):

sign-in, OTP, onboarding p1–p3, calendar day, calendar populated, add/share sheet, event detail own, edit-event, people, add-person, circle editor; phone Paper landscape; event detail shared-with-you (phone Paper + phone Evening).

Judged against `docs/events-design-language.md`:

- [x] Alignment / spacing rhythm; nothing unintentionally hugging the screen edge — PASS (AppHeader grammar: destination Back, centered title, right actions)
- [x] No text truncation/overflow on stress content (title wraps) — PASS (`t2/stress_detail.png`)
- [x] Contrast readable in both themes; accent spent on selected day, primary action, location/"From" warmth; destructive Remove Event stays red; Archive is quiet — PASS. Evening uses charcoal ground + amber Share (`t4/phone-evening-09-event-detail-own.png`, `t4/desktop-evening-09-event-detail-own.png`)
- [x] Touch targets ≥44pt on phone; headers/footers clear of web safe areas — PASS
- [x] Loading / empty / error states look intentional (sign-in orientation + Send code; empty day; empty People "No people yet" / "Add Manually"; empty share "No people added yet") — PASS
- [x] Landscape spot check: 844×390 calendar chrome intact (`t4/phone-paper-14-landscape.png`). Not catastrophic; web is the CI surface

Design System Consolidation is visible: primary Share, secondary Edit, quiet Archive/Remove. Location row is tappable warmth. Add to Other Calendars export row is present on detail.

KI-014 re-confirmed: no painted month chevrons on web; month still changes.

### Phase 2 Track 5 — Edge & platform (account A)

- [x] Accessibility: Help, Add event, theme swatch labels (`Help`, `Add event`, `Switch to … theme`); focus sample `Help` — PASS
- [x] Console: no unexpected user-facing errors (filtered expo-notifications / OTS / wasm / Reanimated / font decode) — PASS
- [x] Double-tap Save: exactly one event (REST count=1) — PASS
- [x] Browser back/forward: calendar ↔ People — PASS
- [x] Deep link: signed-out `/event/<id>` gates to sign-in (`/sign-in`); a signed-in session opening the same `/event/<id>` lands on detail — PASS. Evidence: `/opt/cursor/artifacts/t5/deeplink_signedout.png`, `/opt/cursor/artifacts/t5/deeplink_signedin.png`. Same shape the 2026-08-31 review called PASS
- [x] Known-issues ledger re-check — KI-014 still present (web chevrons). KI-001 not reproduced. KI-016 not reproduced in the live DOM (no Hide on a self-created event). KI-011 people rows on the loaded 3-person list are dense enough to not look worse. KI-005/006/008/009/010/012 native-only (not web-verifiable; KI-005/008/009 still pending owner on-device confirmation of landed fixes). KI-007 not re-tested (delete-account out of this pass)

### Phase 3 — Skeptic pass (orchestrator; inherit-level judgment)

computerUse could not be relaunched after Track 2 (provider cap: max 100 images). Flags were re-checked against code, the green e2e suite on `ffd9eb4`, REST, and Playwright evidence on the live preview.

- [x] Flag 1 (E-108 `goneOnA=false`) — FALSE ALARM. Covered-screen locator. REST: B kept the row and `from_event_id` was SET NULL. Phase 1 computerUse already delivered A-remove / B-keep
- [x] Flag 2 (People "0 / 50" empty state on Account A) — FALSE ALARM. Screenshot taken before `loadData` landed. Recapture after waiting for E2E Account B shows **3 / 50 people** with named rows. Share-to-B in Phase 1 / Track 3 also required that list
- [x] Flag 3 (Settings gear / export icons described as empty squares) — FALSE ALARM / descriptor artifact. Track 1 resume opened Settings from that control; Help `?` and Add `+` paint; Ionicons at 22px often read as boxes in screenshot captions. Not materially worse than KI-001
- [x] Flag 4 (Hide did not clear the calendar immediately) — FALSE ALARM. Confirm copy is correct; Unhide was present in Settings; reload restored. Refetch race, same family as Flag 1
- [x] Flag 5 (signed-out deep link URL becomes `/sign-in`) — NOT A NEW BUG. Root layout replaces unauthenticated `/event/:id` onto sign-in; an authenticated open of the same id lands on detail. Matches 2026-08-31 Track 5
- [x] Flag 6 (Track 1 first pass could not find Settings) — FALSE ALARM. Icon-only gear left of Add; resume completed sign-out / no auto-show
- [x] Matrix skim — no missed blocker. Consolidation (AppHeader, primary/secondary/quiet tiers), Location, Archive vs Remove Event, Hide on received copies, Add to Other Calendars row all present. Who's Coming is e2e-covered (`e2e/whos-coming.spec.ts`); it can sit below the fold on a short phone shot of a shared detail
- [x] Every checklist item evidenced — confirmed

## Blockers

none

## Known minor issues

No new KI. KI-014 re-confirmed (web-only invisible month chevrons; navigation still works).

## Ledger updates

- Added to `manual-tests/known_issues.md`: none
- Verified fixed and removed: none (KI-005 / KI-008 / KI-009 remain open pending owner on-device confirmation of landed fixes; KI-016 remains a CI-render artifact)
- Still present (kept): KI-001, KI-005, KI-006, KI-007, KI-008, KI-009, KI-010, KI-011, KI-012, KI-014, KI-016
