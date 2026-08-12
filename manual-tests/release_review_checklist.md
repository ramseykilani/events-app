# Release Review Checklist

The enforceable definition of "complete" for a ship-time review. The reviewing
agent(s) must complete EVERY item, in order, recording evidence (screenshot
paths) for flags and a one-line note per item. An item may only be marked N/A
with a reason. Anything less than a fully ticked list is an incomplete review.

Report result: `VERDICT: SHIP` or `VERDICT: DON'T SHIP` (first line), then
this checklist filled in, then per-blocker briefs, then a Known minor issues
section (same brief format). Written from
`manual-tests/release_review_report_template.md`.

## Phase 1 — Smoke sweep (cheap, halts the review on any failure)

- [ ] App loads at the staging URL; sign-in with test OTP works
- [ ] Calendar renders; today's day list shows expected state
- [ ] Create an event (title only, today) → appears on calendar
- [ ] Share it to account B → B sees it (sign in as B)
- [ ] Remove the event on A → gone on A, still on B; remove on B (cleanup)
- [ ] No browser permission prompts, no visible errors, no console errors

## Phase 2 — Deep tracks (halt everything on a blocker; minors never halt)

Severity rules for every track: a **blocker** makes the release wrong (broken
core flow, data loss, crash, debug output shown to users) — note it and stop
your track. A **minor** is cosmetic or an edge-case papercut — screenshot it,
note it, keep testing. Unsure whether it's a blocker? It's a blocker. The
open entries in `manual-tests/known_issues.md` are known and accepted: never
flag, halt on, or screenshot them (flag only if one looks materially worse
than its entry).

### Track 1: Auth & first-run (fresh throwaway account via Management API test OTP — remove it after)

- [ ] Sign-in: invalid phone → friendly alert; valid phone → OTP screen
- [ ] OTP: wrong code → friendly alert (no debug dump); resend shows 60s cooldown; correct code → in
- [ ] Brand-new account: walkthrough auto-shows once; Next/Get Started/Skip all work; pages advance
- [ ] Reopen walkthrough via `?`; returns to calendar
- [ ] Sign back in later: walkthrough does NOT auto-show again
- [ ] Offline/edge: airplane-mode load shows a retryable error, not a blank screen or spinner-forever
- [ ] Expired/old OTP code → friendly message

### Track 2: Event lifecycle (account A)

- [ ] Add event: empty title+URL → Save disabled; title-only works; URL pastes attempt metadata autofill without blocking save
- [ ] Date/time inputs: work on web (HTML inputs), land on the correct day, no off-by-one
- [ ] Event detail: formatted date (never raw YYYY-MM-DD), share/edit/remove present, Open link works when URL set
- [ ] Edit: change title → detail shows new title (fork); old snapshot semantics intact
- [ ] Remove: confirm dialog → event gone; cancellation leaves it
- [ ] Content stress: 200-char title, 2000-char description, an event with no title (URL only) — all render without breaking layout
- [ ] Many events on one day (create 8+) — day list scrolls, no overlap/overflow
- [ ] Calendar: month navigation back/forward, event dots on the right days, pull-to-refresh

### Track 3: Sharing, people, circles (accounts A + B)

- [ ] Share sheet: Share disabled with zero selection; selecting enables; already-shared show "✓ Shared" and can't be re-tapped
- [ ] Forwarding: A→B delivery is immediate; B's copy survives A removing theirs (E-108)
- [ ] Second share to someone new notifies only them (check report notes; skip push/SMS delivery itself)
- [ ] People: manual add (name+phone) normalizes to E.164; duplicate add doesn't duplicate; remove asks for confirmation
- [ ] Circles: create, edit members (add/remove), member count updates, delete with confirm
- [ ] Hide: B hides A → A's events vanish from B's calendar; People shows Hidden section; unhide restores
- [ ] 50-person list: scrolls fine, layout holds (create temp people; remove after)

### Track 4: Visual sweep — the matrix (account A, read-only interactions)

Every screen below, screenshotted and judged, at desktop (~1280px) AND phone (~390px) widths, in BOTH themes (Paper and Evening):

- [ ] sign-in  · [ ] OTP verify  · [ ] onboarding (each page)  · [ ] calendar (empty day + populated day)  · [ ] add-event  · [ ] edit-event  · [ ] event detail (own + shared-with-you)  · [ ] share sheet (populated)  · [ ] people list  · [ ] circle editor modal  · [ ] add-person modal

Judged against `docs/events-design-language.md`:

- [ ] Alignment and spacing rhythm consistent; no elements touching screen edges unintentionally
- [ ] No text truncation/overflow (incl. the stress content from Track 2)
- [ ] Contrast readable in both themes; nothing hard-coded looking off-theme
- [ ] Touch targets ≥ 44pt on phone; headers/footers not clipped by safe areas
- [ ] Loading, empty, and error states look intentional, not broken
- [ ] Landscape spot check on phone: nothing catastrophically broken

### Track 5: Edge & platform checks (account A)

- [ ] Accessibility spot check: tab through calendar + one form (focus order sane, visible focus); screen-reader labels on icon buttons (theme swatch, help, +)
- [ ] Console clean: no errors/warnings introduced by the flows
- [ ] Rapid interaction: double-tap Save/Share doesn't double-create (guards work)
- [ ] Browser back/forward buttons behave sanely on web
- [ ] Deep link: open an /event/<id> URL signed-out → sign-in → lands correctly
- [ ] Known-issues ledger: re-check each open entry in `manual-tests/known_issues.md` — fixed / still present (note which per entry)

## Phase 3 — Skeptic pass (stronger model)

- [ ] Re-examine every flagged screenshot: false alarm (dismiss with a reason — including "matches KI-xxx"), confirmed minor (→ report's Known minor issues), or confirmed blocker (→ upgrades the verdict to DON'T SHIP)
- [ ] Skim the visual matrix screenshots: any flag the tracks missed?
- [ ] Confirm every checklist item is genuinely evidenced, not hand-waved

## Explicitly out of scope (stay manual)

- Real SMS content/delivery (needs Twilio), push tokens (native), App Store builds
