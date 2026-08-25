VERDICT: SHIP

# Release Review: staging @ 4f85f76

- Reviewed staging commit: 4f85f76a (the commit this verdict certifies — see the fix-forward note below)
- Date: 2026-08-24
- Runner: Cursor cloud agent (release-review orchestrator per `scripts/release-review-orchestrator.md`)
- Target: https://staging.shared-events.pages.dev

This is the **Copy + Follow cutover** release (`docs/per-user-events-copy-follow-spec.md`,
owner-approved 2026-08-21): the snapshot/pointer/share-log model (`events` +
`user_events` + `event_shares`) is replaced by owner-scoped `events` rows +
`sends`, with silent edit cascades (follow-until-local-edit), per-recipient
push ids, and the rehearsed rollback plan. The cutover followed the spec's
10-step sequence: restore point tagged (`forwarding-model-final`), pre-cutover
pg_dump captured and verified restorable, the migration + revert rehearsed on
a restored copy (two revert bugs found and fixed there — see the drill notes
in `docs/archive/forwarding-model.md` and `revert-to-forwarding-model.sql`),
native builds submitted before the migration (Android versionCode 5 → Play
internal, iOS build 6 → TestFlight), migration applied, `send-notification
deployed, `cleanup-events` deleted, client pushed, go/no-go queries green on
the live DB, manual regression subset passed, then this review.

**Post-migration blocker policy (spec's named exception) was in force and was
invoked once:** the skeptic pass confirmed one client-side blocker (B-1 below).
Per the policy it was fixed forward (not a rollback — no data was wrong), the
failed checks re-ran green, and the fix is reviewed below like any other
finding. The reviewed commit is the tip including that fix.

## Checklist evidence

### Phase 1 — Smoke sweep (computerUse subagent, Grok-fast)

- [x] App loads at the staging URL; sign-in with test OTP works — PASS
- [x] Calendar renders; today's day list shows expected state — PASS
- [x] Create an event (title only, today) → appears on calendar — PASS
- [x] Share it to account B → B sees it — PASS (`/opt/cursor/artifacts/phase1_smoke_b_calendar.png`)
- [x] Remove the event on A → gone on A, still on B; remove on B (cleanup) — PASS
- [x] No browser permission prompts, no visible errors, no console errors — PASS after adjudication (the subagent flagged font/OTS/NetworkError console noise; verified false — the app bundles no web fonts and a direct capture showed a clean console; see Flag 1 in the skeptic section)

### Phase 2 — Deep tracks

**Track 1: Auth & first-run (fresh throwaway account +15555550106, added via Management API and removed after) — CLEAN**

- [x] Sign-in invalid phone → friendly alert — PASS
- [x] OTP wrong code → friendly alert; resend 60s cooldown from the initial send; correct code → in — PASS
- [x] Brand-new account: walkthrough auto-shows once; Next/Get Started/Skip work; pages advance — PASS
- [x] Reopen walkthrough via `?`; returns to calendar — PASS
- [x] Sign back in later: walkthrough does NOT auto-show again — PASS
- [x] Offline load shows a retryable error, not blank/spinner-forever — PASS (browser offline page + clean recovery)

**Track 2: Event lifecycle (account A) — CLEAN** (one subagent note adjudicated in Flag 2)

- [x] Add event validation (empty disabled; title-only works) — PASS
- [x] URL paste metadata autofill best-effort, never blocks save — PASS
- [x] Date/time HTML inputs work on web, correct day, no off-by-one — PASS
- [x] Event detail: formatted date, share/edit/remove present, Open link when URL set — PASS
- [x] Edit updates the caller's row in place (Copy + Follow; no fork) — PASS
- [x] Remove: confirm dialog → gone; cancel leaves it — PASS
- [x] Content stress (200-char title, long description, URL-only) renders — PASS
- [x] Many events on one day (8+) scroll, no overlap — PASS
- [x] Calendar month navigation, dots, refresh — PASS (the "no month controls" note was adjudicated — chevrons present but unpainted on web; see KI-014)

**Track 3: Sharing, people, circles (accounts A + B) — CLEAN** (one note adjudicated in Flag 3)

- [x] Share sheet: Share disabled with zero selection; selecting enables; ✓ Shared can't be re-tapped — PASS
- [x] Forwarding: A→B immediate; B's copy survives A removing theirs (E-108) — PASS (also step-9 evidence `/opt/cursor/artifacts/step9_e108_forwarding.png`)
- [x] Second share to someone new notifies only them — PASS (additive-share scoping; KI-003 path, e2e-covered)
- [x] People: manual add normalizes to E.164; duplicate add doesn't duplicate; remove asks confirmation — PASS
- [x] Circles: create, edit members, count updates, delete with confirm — PASS
- [x] Hide: B hides A → events vanish; Hidden section; unhide restores — PASS (step-9 evidence `/opt/cursor/artifacts/step9_e105_unhide.png`)
- [x] 50-person list scrolls, layout holds — PASS

**Track 4: Visual sweep — the matrix — CLEAN** (60 screenshots, scripted capture:
`/opt/cursor/artifacts/t4/{desktop,phone}-{paper,evening}-NN-*.png`; the
computerUse image-accumulation limit makes an agentic sweep unreliable at this
size, so the matrix was captured deterministically and judged by the skeptic)

- [x] All 15 screen types × desktop ~1280px + phone ~390px × Paper + Evening — captured and judged
- [x] Alignment/spacing rhythm; nothing touching edges unintentionally — PASS
- [x] No text truncation/overflow (incl. stress content) — PASS
- [x] Contrast readable in both themes; nothing off-theme — PASS except the one blocker below (B-1, fixed)
- [x] Touch targets ≥44pt on phone; headers/footers clear of safe areas — PASS
- [x] Loading, empty, error states look intentional — PASS
- [x] Landscape spot check on phone — N/A for this release (web dev surface; native landscape unchanged by this cutover) — covered by the phone-width matrix instead

**Track 5: Edge & platform checks (account A) — CLEAN**

- [x] Accessibility spot check: icon buttons labeled (theme swatch, help, +); tab focus lands sanely — PASS
- [x] Console clean across sign-in/create/detail/remove — PASS (zero errors, zero failed requests)
- [x] Rapid interaction: double-tap Save doesn't double-create — PASS (exactly one copy after dblclick; the in-flight guard holds)
- [x] Browser back/forward sane on web — PASS (calendar ↔ People)
- [x] Deep link: /event/<id> signed-out → sign-in → lands on the event — PASS (own-row resolution; the recipient fallback is e2e-covered in `edit-propagation.spec.ts`)
- [x] Known-issues ledger re-check — KI-011 (tall People rows) still present (kept); KI-001 transient, not reproduced; KI-005/006/008/009/010/012/013 native-only (not web-verifiable here; KI-013's fix ships in this release); KI-007 unchanged by design

### Phase 3 — Skeptic pass (inherit model)

- [x] Flag 1 (console errors) — FALSE ALARM (app bundles no web fonts; direct captures clean)
- [x] Flag 2 (month controls) — confirmed MINOR (invisible-but-functional arrows on web) → KI-014
- [x] Flag 3 (event "disappeared") — FALSE ALARM (event persisted; pull-on-focus transient)
- [x] Matrix skim — found B-1 (below); no other missed issues
- [x] Every checklist item genuinely evidenced — confirmed

## Blockers

### B-1 — Untokened library-default blue event dot under "today" (FIXED FORWARD per the post-migration blocker policy)

- Expected: event dots are always the theme accent (design doc §3/§9 — a visual decision without a token is a defect).
- Actual: when today had events and today was NOT the selected day, today's dot rendered react-native-calendars' default `todayDotColor` (#00BBF2 cyan-blue) in both themes, both widths, on web AND native (platform-independent library styling on the main screen).
- Repro: account A, any viewport/theme — create an event for today, then select a different day; today's dot renders blue.
- Evidence: `/opt/cursor/artifacts/t4/phone-paper-07-calendar-empty-day.png` (pre-fix, blue dot sampled ≈ rgb(0,168,240)); `/opt/cursor/artifacts/t4-fix-today-dot.png` (post-fix, accent); post-fix pixel sample rgb(200,135,30) = Paper accent.
- Root cause + fix: `components/Calendar.tsx` set `dotColor`/`selectedDotColor` but not `todayDotColor`; the library's `Dot` pushes `todayDot` after `visibleDot`, so blue won when `marked && today && !selected`. One-line fix (`todayDotColor: theme.accent`), committed as the reviewed tip. Fast checks + full CI suite green on the fix commit; staging preview redeployed.
- Reviewed commit: 4f85f76a
- Policy note: this was a client-side blocker found between cutover steps 7 and 10, so the spec's post-migration blocker policy applied (fix forward, not rollback — no data was wrong). The fix is recorded here like any other finding.

## Known minor issues

### KI-014 — Month-navigation chevrons don't paint on web (functional but invisible)

- Expected: the calendar's month header shows visible ‹ › chevrons.
- Actual: on web (react-native-web), the arrow touchables are present and clickable (month navigation works — verified by clicking), but the arrow glyphs collapse to 0×0 and never paint (RNW's tintColor SVG-filter path). Native renders the library's PNG arrows normally (never reported on any device smoke).
- Repro: open the calendar on the web build (any theme/width) — no visible chevrons flanking the month title; clicking where they should be still navigates.
- Evidence: `/opt/cursor/artifacts/t4/desktop-paper-06-calendar-populated.png` (no painted chevrons flanking "August 2026").
- Reviewed commit: 4f85f76a
- Why minor: web-only, the control still works, and the web build is the dev/staging/CI surface (never promoted to users). The e2e pixel baselines mask the grid header (`mask: [page.getByRole('slider')]`), so CI can't catch this — noted for the next baseline regeneration.

## Ledger updates

- Added to `manual-tests/known_issues.md`: KI-014
- Verified fixed and removed: none by re-check (KI-002 and the B-1 class were deleted by the cutover itself and are recorded in the ledger's "Deleted bug classes" section)
- Still present (kept): KI-001, KI-005, KI-006, KI-007, KI-008, KI-009, KI-010, KI-011, KI-012, KI-013 (native-only entries await the next device smoke)

## Cutover evidence appendix (spec step 8/9 artifacts)

- Go/no-go queries on the live DB: all PASS (163 events = 163 legacy_user_events; 24 sends = 24 legacy_event_shares; per-user counts match; no dangling follow links; legacy tables client-revoked; `cleanup-events-weekly` unscheduled; 5 followed rows spot-checked).
- Manual regression subset on the staging preview: E-104 (`step9_e104_share_lands.png`), E-108 (`step9_e108_forwarding.png`), E-105 (`step9_e105_unhide.png`), edit-propagation pass (`step9_cascade_followed.png` + `step9_cascade_frozen.png`), pending-signup delivery pass with a third test-OTP account, added via Management API and removed after (`step9_pending_signup.png`).
- Rollback rehearsal: restore → migrate → verify → revert (option B) → verify round-trip, all green on a restored copy of the pre-cutover dump.
