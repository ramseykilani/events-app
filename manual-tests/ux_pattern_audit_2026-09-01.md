# UX Pattern Audit — 2026-09-01

App-wide heuristic review of every screen in `app/` (including `(auth)`) and
every component in `components/`. Audit only — no product code was changed.

## Run metadata

- Runner: cloud agent (audit task)
- Date: 2026-09-01
- Branch: `staging`
- Commit: `91ff1e2` (tip at audit time)
- Method: static read of every screen/component against the review basis;
  contrast ratios computed exactly from the `constants/Colors.ts` values
  (WCAG relative-luminance formula).

## Review basis

Every finding cites at least one of:

- `docs/events-design-language.md` — §3 color roles, §4 type scale, §5
  shape/radius, §6 confirmation feedback (the source of truth)
- Nielsen's 10 heuristics (nngroup.com/articles/ten-usability-heuristics) —
  cited as H1–H10
- Fitts's Law (target size/distance), Hick's Law (choice count), Gestalt
  similarity (identical styling reads as equal importance)
- WCAG 2.2: 1.4.1 (color not the sole signal), 1.4.3 (contrast ≥ 4.5:1),
  2.5.8 (target size ≥ 24px), 4.1.2 (name/role/value)
- Apple HIG / Material 3 button hierarchy (one high-emphasis action per view;
  44pt touch targets)
- Shipped feature specs in `FEATURES.md` where the UI is contract-bound
  (Archive Received Events, Location)

Every finding is marked **DERIVED** (follows from the written design language
or a named standard) or **JUDGMENT** (a proposal requiring an owner decision).
The JUDGMENT list for owner review is at the end.

Severities: **High** = standard violation with user-facing consequence or a
systemic hierarchy break on a core screen. **Medium** = clear standard
violation, limited blast radius. **Low** = consistency/polish.

## Scope

In scope: `app/(app)/` (index, add-event, edit-event, event/[id], share,
people, archived, onboarding), `app/(auth)/` (sign-in, verify), `app/_layout`
and group layouts, all of `components/`. Out of scope: `receipt/` (a separate
static Pages project with its own deploy — one observation recorded as
UX-25), `public/privacy.html`, edge functions, and the design language itself
(themes, palette values, and the centered ceremonial title are owner
decisions per the task constraints).

---

## Part 1 — Background-claim verification

The task brief carried claims from an earlier event-detail review. Each was
re-verified against the code at `91ff1e2`.

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| C1 | Event detail has four same-sized jumbo action buttons (20px text, radius 16 — both off the design-language scales), differentiated only by fill color | **Verified, one refinement.** Share / Edit / Remove-or-Archive-or-Restore / Hide all use `padding: 20`, `borderRadius: 16`, `fontSize: 20`, `fontWeight: 600`. Fills differ (`primaryButtonBg` / `surfaceSecondary` / `destructiveBg` / `surfaceSecondary`); Hide also dims its text to `textSecondary`, so fill is not the *only* differentiator. 20px sits in §4's empty 18→28 gap; 16px is outside §5's 10–12px button band. | `app/(app)/event/[id].tsx` styles `shareButton`/`editButton`/`deleteButton`/`hideButton` + `*Text` |
| C2 | Three button size grammars and three content widths on one screen | **Verified (arguably four grammars).** Size grammars: (a) jumbo actions (p20/r16/fs20), (b) 44×44 r10 icon buttons, (c) reply buttons (minHeight 44/r10/fs16), (d) bare text links (Back 16px, Open link 18px underlined, Retry). Widths: content column `maxWidth: 600` centered, action stack `maxWidth: 400`, refresh banner + nav row full-bleed; sections are 100%-of-600 while text blocks are centered. | `app/(app)/event/[id].tsx` styles `innerContent`, `actions`, `scrollContent` |
| C3 | Floating "Back" text button uses hitSlop instead of a real 44pt header target | **Verified.** 16px text, no padding, `hitSlop {14,14,12,12}`; effective touch ≈44px tall but the visible target is the ~16×35px word. The inline comment says hitSlop-not-padding protects the pixel-diff baseline. Same pattern on `archived.tsx`. | `app/(app)/event/[id].tsx` `navBack`; `app/(app)/archived.tsx` `navBack` |
| C4 | Up to 12 touch targets on the event detail screen | **Verified.** Max state (received event, all optional fields present, error banner showing): Back, refresh banner, location row, Open link, Google, Apple/Outlook, Yes, No, Share, Edit, Archive, Hide = 12. Received event without the banner: 11; self-created events run 6–8 depending on optional fields. | `app/(app)/event/[id].tsx` render tree |
| C5 | Location row spends `accent` on what is functionally a link while "Open link" uses `linkText`; the tokens differ in Paper but are identical in Evening | **Verified, with a doc-staleness addendum.** Location icon+text are `theme.accent`; "Open link" is `theme.linkText`. Paper: accent `#c8871e` vs linkText `#8f5a10` (differ). Evening: both `#d9a05b` (identical). Addendum: the §3 token *table* is stale — it still lists Paper linkText as `#a3691a` and both `textTertiary` values that code changed for contrast (see UX-19); the role question is unaffected. | `app/(app)/event/[id].tsx` location row vs link; `constants/Colors.ts` |
| C6 | The 20px tier also appears in `people.tsx` | **Verified.** `emptyTitle` ("No people yet") is 20px/600. Also found: `revokedTitle` ("Access removed") 20px on event detail, and a 24px tier on the verify OTP input. | `app/(app)/people.tsx` `emptyTitle`; `app/(app)/event/[id].tsx` `revokedTitle`; `app/(auth)/verify.tsx` `input` |
| C7 | At least three distinct back/header grammars across the 7 `router.back()` call sites | **Verified exactly.** Seven visible back/close call sites (the other `router.back()` calls are post-action navigation, not chrome): grammar A floating Back text (event detail, archived, edit-event error state), grammar B bordered bar with 44pt-min text actions (share, people — and people's own modals), grammar C bordered bar with hitSlop-only actions (add-event, edit-event). Plus a fourth variant in components: bordered bar with *no* target expansion at all (PeoplePicker, ManualAddPersonModal). Auth screens have no header grammar at all. | see dimension 1 inventory |

Nothing in the background brief was wrong or stale; C1 and C5 each needed a
small refinement, recorded above.

---

## Part 2 — Per-screen inventory

Button geometry shorthand: padding / radius / fontSize / weight. "Target" is
the *visible* touch target height (hitSlop noted separately).

### `app/(app)/index.tsx` + `components/Calendar.tsx` (calendar, root)

- Header: 28px display title "Events" (left); right cluster: theme swatch
  (44×44), `?` help (44×44, r22 pill), "People" text (minHeight 44), "+" FAB
  (48×48, r24 pill, 28px/300 glyph). No back (root screen).
- Buttons/targets: day cells (~32px library grid — see note under dimension
  3), EventCard rows (full-card target, ~80px), "Add an event" empty-state
  link (linkText, 16px/600, padding 8/16 + hitSlop 12 → ~56px), "Archived"
  footer link (minHeight 44).
- Color roles: dots/today/selected-day = accent family (§3-blessed); "From X"
  on cards = accent (§3-blessed); links = linkText. Clean.
- Consequential actions: none on this screen.
- Target count: 4 chrome + content. Fine.

### `app/(app)/event/[id].tsx` (event detail) — the audit's epicenter

- Header: grammar A — floating "Back" text row (16px, hitSlop-only), no
  title, no bar. Retry link on the not-found state is linkText with the same
  hitSlop pattern.
- Buttons: Share (p20/r16/fs20/600, primaryButtonBg), Edit (same geometry,
  surfaceSecondary), Remove Event (same geometry, destructiveBg/
  destructiveText) *or* Archive/Restore (same geometry, surfaceSecondary),
  Hide (same geometry, surfaceSecondary + textSecondary text). Reply Yes/No
  (minHeight 44/r10/fs16/600; selected = calendarSelected fill). Add-to-
  calendar icon buttons (44×44, r10). Text links: location row (18px accent,
  hitSlop 10/10), Open link (18px linkText underlined, no hitSlop).
- Widths: content column maxWidth 600 centered (`alignItems: 'center'`),
  sections 100%-of-600, action stack maxWidth 400, banner/nav full-bleed;
  `scrollContent` vertically centers (`justifyContent: 'center'`).
- Color roles: location row = accent (UX-13); SavedLine ✓ = accent
  (§6-blessed); reply selected fill = calendarSelected (§3-documented owner
  call); destructive = Remove only. 
- Consequential actions: Remove (confirm, destructive) ✓; Archive (no
  confirm, documented reversible — the model) ✓; Restore (restorative) ✓;
  Hide (confirm, deliberately not red — documented) ✓; reply (last-write-
  wins) ✓.
- Target count: up to 12 (C4). Over the ~8 flag line.

### `app/(app)/share.tsx`

- Header: grammar B — bordered bar, "Cancel"→"Done" left and "Share" right
  as 16px text actions with `minHeight: 44` (`headerAction`), centered
  18px/600 title "Share with".
- Buttons: name-gate Save (r10, minHeight 44, 15px/600, primaryButtonBg);
  ShareSheet chips (r22 pill, minHeight 44); person rows (~46px); "Manage"
  link (linkText 14px, hitSlop-only → ~42px); empty-state "Add People"
  (r10, 15px/600).
- Color roles: "✓ Sent to N people" line is whole-line accent (15px/600) —
  the §6 sibling (SavedLine) accents only the ✓ glyph; delivery failures =
  destructiveText ✓; selection circle = accent fill (§6 ✓).
- Consequential: Share is irreversible and unconfirmed by design —
  documented rationale (FEATURES.md → Explain Before Share; the footer note
  "once you send it, you can't take it back"). ✓ documented.
- Target count: 2 chrome + chips + rows; exceeds 8 with data (list-row
  caveat under dimension 7).

### `app/(app)/people.tsx`

- Header: grammar B — "Back" (textAction, minHeight 44), centered title
  "My People", gear (44×44) + "Add" (minHeight 44).
- Buttons: empty-state CTA (r10, padding 14/28, 16px/600, primaryButtonBg);
  circle row Edit (linkText) / Delete (destructiveLink) text actions
  (minHeight 44); new-circle Add (r8, primaryButtonBg, ~44px via row);
  person-row Remove (destructiveLink, minHeight 44). Settings sheet: Close /
  name row / 2 ThemedSwitches / Unhide (linkText) / Sign out (textTertiary) /
  Delete account (destructiveLink) — rows minHeight 44. Name-edit and
  circle-editor modals: grammar B (Cancel/Save, minHeight 44).
- Type: `emptyTitle` 20px/600 (off-scale, C6); circle-editor selection uses
  ✓ (UX-09).
- Color roles: load-error retry line uses `destructiveLink` — red spent on
  information, not consequence (UX-17). Everything else on-role.
- Consequential: Delete circle / Remove person / Delete account (confirm,
  destructive) ✓; Sign out (confirm) ✓; Unhide (restorative, no confirm) ✓;
  toggles (reversible) ✓.
- Target count: 3 chrome + per-circle ×2 + input/Add + per-person ×1 → 14
  with 2 circles + 5 people (list-row caveat applies).

### `app/(app)/add-event.tsx` / `app/(app)/edit-event.tsx`

- Header: grammar C — bordered bar, "Cancel" / "Save" 16px text actions,
  centered 18px/600 title, hitSlop-only targets (no minHeight); the bar is
  visibly shorter than grammar-B bars. edit-event's error state adds a
  grammar-A Retry (linkText) / Back (textSecondary) pair (these two *do*
  carry padding 8/16).
- Form: labels 14px/600 ✓; inputs r12/p16/fs16 ✓ (web date/time inputs r12
  fs16 ✓). edit-event adds "Remove Event" (p16/r12/fs16/600, destructiveBg)
  — a *second* destructive-button grammar, smaller than event detail's jumbo
  Remove.
- Consequential: edit-event renders Remove Event for **every** event,
  including received ones — see UX-20 (High).
- Target count: ~9–10 including inputs (sequential form; note only).

### `app/(app)/archived.tsx`

- Header: grammar A floating Back (hitSlop-only). Title "Archived" is a
  28px display title **left-aligned** inside the content (event detail
  centers its 28px title — alignment split, UX-12).
- Buttons: per-row Restore (minHeight 44/minWidth 44, r22 pill, 15px/600,
  surfaceSecondary) ✓.
- Consequential: Restore (restorative, no confirm) ✓; no remove-forever —
  matches the Archive spec.

### `app/(app)/onboarding.tsx`

- No header (pager). Footer: "Skip" (16px textSecondary, minWidth 64 /
  minHeight 44 + hitSlop ✓), "Next"/"Get Started" (r12, minHeight 48,
  16px/600, primaryButtonBg) ✓. Page dots are 8px (active 24px wide) and
  carry `accessibilityRole="adjustable"` without being interactive (UX-24).
- Type: 28px display titles ✓, 16px body ✓. Clean screen.

### `app/(auth)/sign-in.tsx`

- Centered 440 column (wide screens) — the only centered-measure screen
  besides event detail. 32px display title ✓. Input r12/p16 but **fs18**
  (every other form uses 16 — UX-26). "Send code" (p16/r12/fs18/600,
  primaryButtonBg). Privacy policy link: textTertiary, minHeight 44 ✓
  target, but not linkText (UX-18).
- Consequential: none.

### `app/(auth)/verify.tsx`

- 32px display title; OTP input fs24 letterSpacing 8 (off-scale tier, C6);
  Verify button same grammar as sign-in (fs18); resend text button padding
  12 → ~40px target (sub-44, UX-10). **No back/change-number control** —
  sign-in `router.replace`s here, so a mistyped number is unrecoverable
  in-app (UX-04). Subtitle renders the raw E.164 phone string, bypassing
  `formatPhoneDisplay` (UX-27).

### Components

- `EventCard`: r12 card, full-card target; title 16/600, meta 14, "From X"
  12px accent (contrast note UX-14). Clean.
- `ShareSheet`: chips r22/minHeight 44 ✓; selection circle (22px, accent
  border→fill — §6 vocabulary ✓); shared labels: muted ✓ Shared /
  destructive ✕ failures ✓; "Manage" link sub-44 (UX-10).
- `PeoplePicker`: grammar-D header — Cancel / "Add (n)" text actions with
  **no hitSlop and no minHeight** (~22px targets, UX-01); selection marked
  with ✓ (UX-09); Retry link no target expansion (UX-10).
- `ManualAddPersonModal`: grammar-D header (Cancel/Save ~22px, UX-01) — the
  header *bar* has minHeight 44 but the buttons don't inherit it; inputs
  r12/fs16 ✓. Web-reachable (it is the web add-person path).
- `ContactsExplainer` / `NotificationExplainer` / `ContactsDeniedRecovery`:
  one shared, clean grammar — 28px display message, primary (r12, minHeight
  48, 16px/600), secondary text (minHeight 44). The model the consolidation
  should generalize.
- `ThemedSwitch`: token-correct; smallness on native is already ledgered
  (KI-008) — not re-flagged.
- `WebDateTimeInputs`: r12/fs16, matches the native form grammar ✓.

---

## Part 3 — Findings by checklist dimension

### 1. Header/back treatment

Grammar inventory (basis for UX-02/UX-03):

| Grammar | Shape | Target mechanism | Where |
|---|---|---|---|
| A | Floating "Back" text row, no title/bar | hitSlop-only (~44 effective, ~16px visible) | event detail, archived, edit-event error state |
| B | Bordered bar, centered 18px title, text actions | `minHeight: 44` on the action | share, people, people's three modals |
| C | Bordered bar, centered 18px title, text actions | hitSlop-only; bar is shorter than B | add-event, edit-event |
| D | Bordered bar, centered 18px title, text actions | **none** (~22px target) | PeoplePicker, ManualAddPersonModal |
| — | No header at all | — | sign-in, verify, onboarding, calendar (root) |

Left-control vocabulary today: "Back" (A, people), "Cancel" (forms, modals,
picker), "Close" (Settings), "Done" (share, after send).

- **UX-01 — Modal header actions have no 44pt target. High. DERIVED**
  (WCAG 2.5.8; Apple HIG 44pt; the audit rule that hitSlop-only doesn't
  count as visible applies a fortiori to no-expansion-at-all).
  PeoplePicker's Cancel / "Add (n)" and ManualAddPersonModal's Cancel /
  Save are bare 16px text in the header — effective target ≈ the text
  bounds (~22px tall). ManualAddPersonModal is the *web* add-person path,
  so this is not native-only. Evidence: `components/PeoplePicker.tsx`
  header; `components/ManualAddPersonModal.tsx` header (the bar's own
  `minHeight: 44` does not grow the buttons).

- **UX-02 — hitSlop-only back/header actions on five call sites. Medium.
  DERIVED** (task dimension-1 rule; HIG 44pt visible affordance; Fitts —
  the acquire target is a 16px word). Grammar A (event detail, archived,
  edit-event error state) and grammar C (add-event, edit-event header)
  expand the *touchable* area to ≈44px via hitSlop but leave a ~16px
  visible target; the grammar-C bars are also visibly shorter than
  grammar-B bars, so the same header reads at two heights. The inline
  comments say hitSlop-not-padding protects pixel-diff baselines — a real
  constraint the fix must respect (regenerate baselines via the CI
  workflow, never locally).

- **UX-03 — Four header grammars plus split left-control vocabulary.
  Medium. DERIVED** (Nielsen H4 consistency and standards). Back /
  Cancel / Close / Done are used loosely: event detail and people say
  "Back" for the same navigation the forms call "Cancel"; Settings says
  "Close" for the same dismissal the name editor calls "Cancel". One
  grammar (chevron + destination label) with a fixed vocabulary is the
  consolidation proposal (FEATURES.md → Design System Consolidation).

- **UX-04 — Verify screen has no exit. Medium. DERIVED** (Nielsen H3 user
  control and freedom — "clearly marked emergency exit"; H9 error
  recovery). Sign-in `router.replace`s to verify, and verify renders no
  back control: a user who mistyped their number cannot correct it in-app
  (web users can browser-back; native users must kill the app). A
  quiet "Wrong number?" text action is the standard fix.

### 2. Button inventory

Distinct button styles found (geometry = padding/radius/fontSize/weight):

| Style | Geometry | Fill | Where |
|---|---|---|---|
| Jumbo action | p20 / r16 / 20 / 600 | primary / secondary / destructiveBg | event detail ×4 |
| Auth primary | p16 / r12 / 18 / 600 | primaryButtonBg | sign-in, verify |
| Explainer primary | pv14 / r12 / 16 / 600, minH 48 | primaryButtonBg | onboarding, 3 permission sheets |
| Empty-state CTA | pv12–14 / r10 / 15–16 / 600 | primaryButtonBg | people, ShareSheet |
| Small filled | ph16–20 / r8–10 / 15 / 600, minH 44 | primaryButtonBg | share name-gate, people add-circle |
| Destructive block | p16 / r12 / 16 / 600 | destructiveBg | edit-event Remove |
| Reply | pv10 / r10 / 16 / 600, minH 44 | surfaceSecondary → calendarSelected | event detail Who's Coming |
| Icon button | 44×44 / r10 | surfaceSecondary | event detail add-to-calendar |
| Pill | ph14–16 / r22 / 14–15 / 600, minH 44 | surfaceSecondary ↔ selectedBg | ShareSheet chips, archived Restore |
| Header text action | 16 / 400–600 | none | grammars A–D |
| Row text action | 14 / 400–600, minH 44 | none | people Edit/Delete/Remove/Unhide |
| Bare link | 14–18 | none | Open link, Manage, Archived, Retry |

Button-text sizes: **15, 16, 18, 20** — five tiers. Button radii: **8, 10,
12, 16** plus pills (22/24) — §5's band is 10–12.

- **UX-05 — Event detail's four same-geometry jumbo actions. High.
  DERIVED** (§4 — 20px is on no rung; §5 — r16 is outside the 10–12
  button band; Gestalt similarity — identical size/weight/radius reads as
  equal importance; Apple HIG / Material 3 — one high-emphasis action per
  view). Share (the view's primary) competes with Edit, Remove/Archive,
  and Hide at identical geometry; only fill separates consequence from
  navigation. This is the screen the consolidation must fix first.

- **UX-06 — Off-scale type tiers 20 and 24; §4 has no button-label rung.
  Medium. DERIVED** (§4). The scale jumps 18 → 28; the 20px styles (four
  event-detail buttons, `revokedTitle`, people `emptyTitle`) and the 24px
  OTP input sit in the gap. Root cause: §4 defines no button-label tier,
  so each screen invented one — the five-way 15/16/18/20 drift followed.
  The button-tier component set (which *assigns* button text to a scale
  rung) is the structural fix.

- **UX-07 — Radius drift below and above the §5 band. Medium. DERIVED**
  (§5: "cards and buttons sit around 10–12px, chips and pills fully
  rounded"). people's new-circle input + Add button use r8 (below the
  band; the same screen's other inputs are r12); event detail's actions
  use r16 (above). Inventory: 8 (people circle input/button), 10 (icon
  buttons, reply, name-gate, empty CTAs, search), 12 (cards, sections,
  most inputs, auth/explainer/onboarding primaries, edit-event Remove),
  16 (event detail actions), 22/24 (pills — compliant).

- **UX-08 — Same-rank actions wear different emphasis across screens.
  Low. DERIVED** (HIG hierarchy consistency; Nielsen H4). "Share" is a
  jumbo filled button on event detail but a 16px header text action on
  the share screen; "Save" is header text on the forms but a filled
  button in the share name-gate. Cross-screen, emphasis carries no
  consistent meaning.

- **UX-09 — Selection glyph split: circle vs ✓. Low. DERIVED** (§6 glyph
  law: "Circle = selectable. ✓ = confirmed/done"). ShareSheet selects with
  the circle (compliant); PeoplePicker and people's circle-editor mark
  selection with ✓ — the glyph §6 reserves for confirmed/done, one row
  away from ShareSheet rows where ✓ Shared literally means done.

### 3. Touch targets

- **UX-10 — Sub-44 effective targets cluster. Medium. DERIVED** (WCAG
  2.5.8's 24px floor; HIG 44pt). "Open link" on event detail is ~18px
  tall with **no hitSlop** — under even the 24px floor. Location row
  ~40px (hitSlop 10/10), ShareSheet "Manage" ~42px (hitSlop 14/14 on 14px
  text), verify "Resend" ~40px (padding 12). UX-01 (modal headers, ~22px)
  is the worst instance and separately High.
- Checked and **not** flagged: ThemedSwitch size is already ledgered
  (KI-008, owner-ruled not a tester blocker). Calendar day cells (~32px)
  are the react-native-calendars grid — a dense-data control where the
  44pt rule yields to the grid convention (WCAG 2.5.8's spacing exception
  covers the layout); changing libraries over this is not proposed.
- Everything else measured ≥44: calendar header cluster (44/44/44/48),
  people/share grammar-B actions, chips, person rows, Restore pills,
  empty-state CTAs, auth buttons, explainer buttons, Skip, Archived link,
  privacy link.

### 4. Content measure/alignment

- **UX-11 — Event detail mixes three widths and two alignments. Medium.
  JUDGMENT.** Content column maxWidth 600 with `alignItems: 'center'`;
  sections (reply, Shared with, Add-to-calendar row) are 100%-of-600 and
  left-structured; the action stack is maxWidth 400; banner and nav row
  are full-bleed; and `scrollContent` vertically centers the whole thing,
  so the floating Back sits far above content that drifts mid-screen
  (Fitts distance). Every other (app) screen is full-width left-aligned;
  auth is a centered 440 column; onboarding/explainers are 420-left.
  Proposal: one measure per screen family (forms full-width, ceremonial
  screens centered) — the event-detail measure is the owner's call.
- **UX-12 — Display-title alignment split. Low. JUDGMENT.** Event detail
  centers its 28px title; archived, calendar, onboarding, and auth
  left-align theirs. Recorded for awareness — the centered ceremonial
  title is an owner decision and explicitly out of this audit's proposal
  scope; the question is only whether *Archived* should match the
  left-aligned majority.

### 5. Color-role usage

Full inventory of `accent`, `linkText`, and `destructive*` uses was checked
against §3's semantic law. Contrast ratios below are exact (WCAG formula)
against `background` unless noted.

- **UX-13 — Location row: accent spent on a link. High. DERIVED** (§3
  semantic law + §3 contrast sentence + WCAG 1.4.3). §3's accent list is
  exhaustive ("the selected day, the dots…, the primary action, and the
  quiet 'From X' attribution. **That is the entire job.**") — a Maps link
  is not on it; `linkText` is the link role. Measured: Paper accent text
  on background = **2.83:1**, failing §3's own "all text-role pairs …
  ≥ 4.5:1" sentence and WCAG 1.4.3 (18px regular is not large text);
  Paper linkText = **5.40:1**. Evening is unaffected either way (accent
  and linkText are both `#d9a05b` there). Complication: the owner-approved
  Location spec says "pin icon, accent color per the design language" —
  the feature spec and §3 currently disagree, so one must move.
  **Recommendation (required by the task): restyle the row to `linkText`
  (icon included).** It satisfies the role law and the contrast promise
  in one move, costs nothing in Evening, and keeps §3's accent list
  short — the law's strength is its exhaustiveness. Amending §3 to bless
  accent here would enshrine a 2.83:1 text use against the doc's own
  contrast sentence; if the owner prefers the warmth, the amendment must
  arrive with a contrast fix, and palette changes are owner territory.

- **UX-14 — Accent-as-text measures 2.83:1 in Paper wherever it carries
  words. Medium. DERIVED** (WCAG 1.4.3; §3's contrast sentence: "where it
  carries small text, use it at a weight/size that stays legible").
  Affected: "From X" attribution (12px, EventCard — a §3-blessed use),
  "✓ Sent to N people" (15px/600, share), the calendar today-number
  (~16px), the SavedLine ✓ glyph. Evening passes (7.88:1). The *uses* are
  blessed; the *legibility* fails the doc's own qualifier. Remediation
  (weight/size/token/palette) is a JUDGMENT call for the owner — see the
  decision list.

- **UX-15 — Paper selected-day / selected-answer text: white on ochre,
  3.03:1. Medium. DERIVED** (WCAG 1.4.3). `calendarSelectedText #ffffff`
  on `calendarSelected #c8871e` covers the selected day number (~16px
  regular) and the Who's Coming selected answer (16px/700 — bold but
  under the 18.66px large-text line). Evening passes (7.12:1).
  Palette-level → owner territory; reported, not proposed.

- **UX-16 — Paper destructive button text: 3.99:1. Medium. DERIVED**
  (WCAG 1.4.3). `destructiveText #c2482f` on `destructiveBg #f7e3dd` —
  both Remove Event buttons (20px/600 and 16px/600). Passes 3:1 only if
  20px/600 is granted large-text status; fails 4.5:1 as normal text.
  Evening passes (5.65:1). Palette-level → owner territory.

- **UX-17 — Retry/error line spends red on information; three colors for
  one pattern. Low. DERIVED** (§3: "red alone signals consequence").
  people's "Could not refresh. Tap to retry." uses `destructiveLink` —
  an error line is not a remove/delete consequence. The same retry
  pattern is `linkText` on event detail, edit-event, and PeoplePicker,
  and `textSecondary` on share. One color should own it (recommendation:
  linkText — it is an action); which one is JUDGMENT.

- **UX-18 — Privacy-policy link is textTertiary, not linkText. Low.
  JUDGMENT.** Sign-in's footer link is deliberately quiet; §3 assigns
  links to `linkText`. Bless the quiet-footer exception in §3 or token it
  — owner call. (WCAG 1.4.1 is satisfied: the words are the signal, not
  the hue.)

- **UX-19 — §3's token table is stale against `constants/Colors.ts`. Low.
  DERIVED** (the doc's own contrast promise + the code's comments). Code
  changed three values to meet §3's ≥4.5:1 sentence — Paper textTertiary
  `#a39a8b → #756c5d`, Paper linkText `#a3691a → #8f5a10`, Evening
  textTertiary `#6e6879 → #8b85a0` — and the table never caught up. The
  law is intact; the table should be re-synced (docs-only, owner
  blessing). Not a palette change — the record catching up with shipped
  values.

### 6. Consequential actions

Full inventory — each action, its guard, and its rationale:

| Action | Guard | Basis |
|---|---|---|
| Remove Event (self-created) | Confirm, destructive | irreversible ✓ |
| Archive (received) | No confirm | documented reversible — the Archived link appearing is the structural confirmation (§6); the model |
| Restore / Unhide | No confirm | restorative ✓ |
| Hide person | Confirm, deliberately not red | documented (§3: red is remove/delete) ✓ |
| Delete circle / Remove person / Delete account | Confirm, destructive | irreversible ✓ |
| Sign out | Confirm | documented ✓ |
| Share / send | No confirm dialog | documented — the sheet is the confirmation surface; footer warns "can't take it back" (Explain Before Share) ✓ |
| Who's Coming answer | No confirm | last-write-wins reversible; §6 confirmation line ✓ |
| Notification toggles, theme switch | No confirm | reversible ✓ |
| **Remove Event on a *received* event (edit screen)** | Confirm, destructive | **contradicts the shipped Archive spec — UX-20** |

- **UX-20 — edit-event offers permanent Remove on received events,
  bypassing the Archive grammar. High. DERIVED** (FEATURES.md → Archive
  Received Events, owner-approved 2026-09-01: "There is no delete path
  for received events"; its coordination note claims "the UI never
  renders Remove Event on a received row"). Path: received event →
  detail → Edit → Remove Event → confirm → the row is hard-deleted
  (`edit-event.tsx` renders the destructive button unconditionally and
  `handleDelete` issues a real `delete()`). The detail screen's Archive
  split (neutral, reversible, no confirm) is pinned by tests; the edit
  screen's Remove is not gated on `from_user_id`. The confirm dialog
  prevents *accidental* loss, but the action's existence breaks the
  shipped invariant and its copy ("everyone you shared it with keeps
  their own copy") reads wrong for a received event. Fix direction
  (gate on `from_user_id === null`, or swap to the Archive verb) is a
  small product decision — flagged, not implemented.

### 7. Touch-target count per screen

| Screen | Simultaneous targets (typical / max) | Over ~8? |
|---|---|---|
| Calendar | 4 chrome + day grid + cards | No (grid is content) |
| Event detail | 6–11 / 12 | **Yes (UX-21)** |
| Share | 2 chrome + chips + rows + name-gate | With data (list caveat) |
| People | 3 chrome + 2/circle + 1/person + input/Add | With data (list caveat) |
| Add/Edit event | 2 + 5–6 fields + Remove | Borderline (sequential form) |
| Archived | 1 + 2/row | No |
| Onboarding | 2 | No |
| Sign-in / Verify | 3 | No |

- **UX-21 — Event detail presents up to 12 simultaneous targets. Medium.
  JUDGMENT** (Hick's Law — choice time grows with count; the *action
  block* alone is 4 same-geometry choices + 2 icon buttons). The list-
  heavy screens (people, share) exceed 8 only by counting list rows,
  which are scanned content, not a presented choice set — noted, not
  flagged. The event-detail fix rides UX-05's tiering (primary Share;
  secondary Edit; quiet Archive/Remove; Hide to a less ceremonial
  placement) rather than a count cap.

### 8. Open pass (proposals — JUDGMENT unless marked otherwise)

- **UX-22 — Destructive verb vocabulary. JUDGMENT.** Delete (circle,
  account) vs Remove (person, event) vs Archive (received event). A
  latent logic exists (Delete destroys data; Remove takes off a list;
  Archive is reversible), but it is nowhere written, so the next screen
  is free to guess. Proposal: document the verb rule in the design
  language or AGENTS.md.
- **UX-23 — Error/retry grammar. JUDGMENT.** Two layouts (full-width
  banner on calendar/event/archived; inline text on people/share/
  PeoplePicker/edit-error) × the three colors of UX-17. Proposal: one
  retry pattern (banner when content is present, centered block when the
  screen is empty) in one color.
- **UX-24 — Onboarding dots claim `adjustable` but aren't. Low. DERIVED**
  (WCAG 4.1.2 — role must match behavior; recorded here per the open
  pass, but the cite is a standard, not taste). The pager dots carry
  `accessibilityRole="adjustable"` with no interaction. Remove the role
  or make the dots tappable.
- **UX-25 — The receipt page is a third design dialect. JUDGMENT.**
  `receipt/index.html` (the Who's Coming SMS page, separate Pages
  project) runs its own scale (26px title, 17px buttons, r16 card, 52px
  buttons). Out of this audit's code scope; propose a follow-up sweep so
  the SMS surface doesn't drift from the app it speaks for.
- **UX-26 — Sign-in form text runs 18px; every other form runs 16px.
  JUDGMENT.** One input/button-text grammar for forms; the add/edit
  forms are the ones Richer Link Autofill (Planned) will touch, so the
  form grammar should settle first (see the FEATURES.md entry).
- **UX-27 — Verify subtitle renders raw E.164. Low. DERIVED** (project
  convention: phone numbers are formatted via `lib/format.ts`
  `formatPhoneDisplay` — "never render raw E.164 numbers to users").
  "Enter the 6-digit code sent to +15555550100" should read
  "(555) 555-0100".
- **Flow-level pass (no findings).** Core tasks are short: sign-in →
  calendar (2 screens); create → share (2 screens, share handoff
  automatic); answer a share (1 widget on the detail screen or the SMS
  receipt). Empty states exist everywhere (calendar day, people, share,
  archived, not-found); loading is a consistent spinner; errors keep
  last-good data with retry (the retry *styling* is UX-23, the behavior
  is right). Information architecture: one root (calendar), everything
  else one push away; Settings consolidation already shipped. No
  flow-level proposals.

---

## Part 4 — Severity-ranked summary

| ID | Finding | Severity | Type | Basis |
|---|---|---|---|---|
| UX-01 | Modal header actions ~22px (PeoplePicker, ManualAddPersonModal) | High | DERIVED | WCAG 2.5.8, HIG |
| UX-05 | Event detail: four same-geometry jumbo actions, off-scale 20px/r16 | High | DERIVED | §4, §5, Gestalt, HIG |
| UX-13 | Location row spends accent on a link; 2.83:1 in Paper | High | DERIVED | §3, WCAG 1.4.3 |
| UX-20 | Edit screen offers permanent Remove on received events | High | DERIVED | Archive spec (FEATURES.md) |
| UX-02 | hitSlop-only back/header targets (5 call sites) | Medium | DERIVED | HIG, Fitts, task rule |
| UX-03 | Four header grammars + split Back/Cancel/Close/Done | Medium | DERIVED | Nielsen H4 |
| UX-04 | Verify has no exit (mistyped number unrecoverable) | Medium | DERIVED | Nielsen H3/H9 |
| UX-06 | Off-scale 20px/24px tiers; no button-label rung in §4 | Medium | DERIVED | §4 |
| UX-07 | Radius drift: r8 and r16 outside the 10–12 band | Medium | DERIVED | §5 |
| UX-10 | Sub-44 cluster: Open link (~18px), location, Manage, Resend | Medium | DERIVED | WCAG 2.5.8, HIG |
| UX-11 | Event detail: three widths, mixed alignment, vertical centering | Medium | JUDGMENT | measure consistency |
| UX-14 | Accent-as-text 2.83:1 in Paper (From X, ✓ Sent, today) | Medium | DERIVED | WCAG 1.4.3, §3 contrast sentence |
| UX-15 | Paper selected-day/answer text 3.03:1 | Medium | DERIVED | WCAG 1.4.3 |
| UX-16 | Paper destructive button text 3.99:1 | Medium | DERIVED | WCAG 1.4.3 |
| UX-21 | Event detail: up to 12 simultaneous targets | Medium | JUDGMENT | Hick |
| UX-08 | Same action, different emphasis across screens | Low | DERIVED | HIG, Nielsen H4 |
| UX-09 | Selection glyph split (circle vs ✓) | Low | DERIVED | §6 |
| UX-12 | Display-title alignment split | Low | JUDGMENT | consistency |
| UX-17 | Retry line in destructiveLink; three retry colors | Low | DERIVED | §3 |
| UX-18 | Privacy link not linkText | Low | JUDGMENT | §3 |
| UX-19 | §3 token table stale vs code | Low | DERIVED | §3 contrast promise |
| UX-22 | Destructive verb vocabulary unwritten | Low | JUDGMENT | consistency |
| UX-23 | Two error/retry layouts | Low | JUDGMENT | consistency |
| UX-24 | Onboarding dots role="adjustable", non-interactive | Low | DERIVED | WCAG 4.1.2 |
| UX-25 | Receipt page is a third dialect | Low | JUDGMENT | consistency |
| UX-26 | Sign-in form text 18px vs 16px elsewhere | Low | JUDGMENT | §4 |
| UX-27 | Verify subtitle renders raw E.164 | Low | DERIVED | project convention |

## Part 5 — JUDGMENT list for owner review

1. **UX-13 location row** — the audit's required recommendation: restyle
   to `linkText` (fixes role law + contrast; invisible in Evening). The
   alternative is amending §3 to bless accent there — which then also
   owes a contrast fix. Owner rules; the Location spec currently says
   accent.
2. **UX-14/15/16 contrast cluster** — accent-as-text (2.83:1), selected
   text on ochre (3.03:1), destructive-on-destructiveBg (3.99:1), all
   Paper-only. Palette values are owner territory; options are palette
   tuning, weight/size bumps, or re-tokening specific uses.
3. **UX-11/12 event-detail measure** — collapse the 600/400/centered mix
   to the app-wide full-width grammar, or keep a centered ceremonial
   column? (The centered title itself is not in question.)
4. **UX-21 target ceiling** — endorse tiering the event-detail action
   block (primary/secondary/quiet) as the Hick fix.
5. **UX-17/23 retry grammar** — one layout + one color (recommend
   linkText).
6. **UX-22 destructive verbs** — write the Delete/Remove/Archive rule
   down.
7. **UX-18 privacy link** — bless the quiet-footer exception or token it.
8. **UX-25 receipt dialect** — schedule a follow-up sweep of
   `receipt/`.
9. **UX-26 form text size** — one input grammar (16px) before Richer
   Link Autofill touches the forms.
10. **FEATURES.md relationship** — the new Design System Consolidation
    entry vs the existing Planned "Button Size & Clickability": absorb
    (recommended — this entry is the structural superset) or keep both.
