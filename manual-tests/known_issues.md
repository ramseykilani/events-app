# Known Issues Ledger

The live list of known, accepted issues and by-design limitations present on
`staging`. This file is the open list; the dated release-review reports
(`manual_test_report_<YYYY-MM-DD>-release.md`) are the history.

Who reads this:

- **Release-review track agents** are briefed with the open entries at launch
  (the orchestrator pastes them into every track prompt). Do NOT flag, halt
  on, or screenshot anything listed here — these are known and accepted. If
  one appears materially WORSE than its entry describes, flag that as a new
  finding. If unsure whether what you see matches an entry, flag it as new and
  let the skeptic pass dismiss it.
- **Fixer agents** pick entries up as independent tasks, one at a time, via
  the normal staging flow.

Who writes this: the release-review orchestrator updates it in the same
docs-only commit as each release report — confirmed minor issues are added,
entries verified fixed by the review's re-check are removed. Blockers are
never added: a blocker must be fixed, not accepted.

## Open issues

### KI-001 — Text occasionally fails to paint on first mount of a pushed screen (web only)

- Severity: minor
- Status: open
- Found: 2026-08-07, `manual-tests/manual_test_report_2026-08-07-ui-polish.md`
- Expected: all text on a newly pushed screen renders immediately.
- Actual: on web, text inside a newly pushed screen can occasionally fail to
  paint on first mount (observed once: share-sheet people names, event-detail
  Back label). Interactions still work and the text self-heals on revisit or
  any repaint.
- Repro: not reliably reproducible — suspected
  react-native-screens/react-native-web transition raster quirk. Cosmetic,
  web-only. Do not chase unless it becomes reproducible.

### KI-005 — Android 3-button navigation bar covers the bottom of the screen

- Severity: minor
- Status: open — 2026-09-01 padding pass did **not** clear it on My People.
  Owner re-confirmed 2026-09-02 on preview APK `209792d2` (promoted
  `23ca55f`): people's names sit under the 3-button nav bar on the My
  People list. Still not a tester blocker (gesture nav is the expected
  tester setup).
- Found: 2026-08-15 owner device smoke on Samsung with 3-button navigation
  (not gesture nav), `manual-tests/manual_test_report_2026-08-15-device.md`
  N-009 (People / Delete account). Still present 2026-08-17 on the Events
  calendar. Re-surfaced on the My People list 2026-09-01 (the padded
  footer had moved into the Settings sheet). Owner 2026-09-02 smoke:
  still names-under-the-bar on My People
  (`manual-tests/manual_test_report_2026-09-02-device.md`).
- Expected: in-app content sits fully on screen, clear of the system
  navigation bar. On My People, every visible name is above the 3-button
  bar, including while browsing the list (not only at end-of-scroll).
- Actual: with the Samsung / 3-button navigation bar on, the bar covers a
  strip along the bottom of the app. On My People the covered strip is
  people's names — owner: "just kind of gross."
- Root cause (pinned 2026-09-01, still the class): Expo SDK 54 targets
  Android 15+ (API 35), where the OS enforces edge-to-edge —
  `android.edgeToEdgeEnabled: false` in `app.config.js` is inert there, so
  the window draws behind the 3-button nav bar and only a shrunk viewport
  (padding/margin on the list itself) lifts content clear of it.
- Why the 2026-09-01 pass missed My People: `app/(app)/people.tsx` pads
  `contentContainerStyle={{ paddingBottom: insets.bottom }}` on the people
  `FlatList`. That only inserts space *after the last row*, so the last
  item is clear at end-of-scroll. Rows that sit at the **viewport** bottom
  while browsing still paint behind the bar. Next fixer: put the inset on
  the list/`peopleSection` (`style` / `marginBottom`), not only on
  `contentContainerStyle`. Same trap exists anywhere else that used
  content-padding instead of viewport-padding
  (`components/Calendar.tsx` selected-day list is the other likely hit).
  `test:conventions` still requires any file that spends `insets.top` to
  also spend `insets.bottom` — that rule did not catch this shape.
- Already safer surfaces (do not re-audit unless newly worse): event
  detail + Archived (`SafeAreaView`, all edges), sign-in / onboarding /
  the three permission explainers (explicit bottom padding), People
  Settings sheet (the 2026-08-15 footer pad, now in the gear sheet).
  Audited and deliberately unpadded: verify (centered short form) and
  manual add-person (top-pinned short form — `conventions-ok`). Web is
  unaffected (`insets.bottom` is 0 there and there is no 3-button nav —
  do not flag).
- Repro: Android device, 3-button (Samsung) navigation bar enabled. Open
  My People with enough people that names reach the bottom of the screen.
  Not reported under gesture navigation.
- Owner ruling 2026-08-15, restated 2026-09-02: not a tester blocker
  (testers expected to use gesture nav). Do not re-flag the same overlap.

### KI-006 — Android hangs on a spinner after installing an updated APK until force-quit

- Severity: minor
- Status: open — fix landed 2026-08-24 (same boot path as KI-013); the
  long-idle half was owner-confirmed on device 2026-08-28 (app opened
  normally after many hours unused — KI-013 closed). This entry remains
  until the APK-update trigger specifically is seen working on device.
- Found: 2026-08-18 owner smoke of preview APK `a7ce79c8` (promoted `78b9e5a`),
  Android. Owner ruling: not a tester blocker. May be specific to sideloading
  a new APK over a previous install.
- Expected: after an update, the first open reaches the calendar (or sign-in)
  without extra steps.
- Actual: the first open after installing the new APK shows a continuous
  spinner. Force-quitting from Android recents (swipe away) and opening
  again loads normally.
- Repro: install a newer APK over an existing Events install → open the app
  → spinner until swipe-away → reopen. Not observed on a subsequent cold
  start of the same binary. Web is unaffected (do not flag there).
- Root cause (shares the KI-013 boot path): the first cold start of the new
  binary holds a long-expired access token, so the boot gate in
  `app/_layout.tsx` awaits a refresh-token POST that had no timeout on any
  layer (auth-js attaches no AbortSignal; RN's Android OkHttp client builds
  with infinite timeouts). A black-holed connection hung the refresh, and
  with it the spinner, until force-quit.
- Fix (2026-08-24): `boundedFetch` (20s `NETWORK_BACKSTOP_TIMEOUT_MS`) wired
  as `global.fetch` in `lib/supabase.ts` bounds the refresh, and the
  `onAuthStateChange` subscriber no longer awaits `ensureUserRow`. A
  black-holed refresh now aborts at ~20s (worst ~40s through auth-js's
  retry window), keeps the stored session, and lands on sign-in; the
  auto-refresh ticker self-heals when the network recovers.
- Verify (next APK smoke): install a newer APK over an existing install →
  open → reaches the calendar, or worst case ~40s of spinner then sign-in —
  no force-quit. Remove this entry once seen on device.

### KI-007 — Delete account + re-signup puts friends' shared events back on the calendar

- Severity: minor
- Status: open
- Found: 2026-08-18 owner smoke of preview APK `a7ce79c8`. Owner deleted the
  account to reset for testing, signed back in with the same phone, and
  friends' previously shared events were on the calendar again. Events
  added by agents during testing were gone. Owner ruling: not a tester
  blocker; delete feels incomplete.
- Expected: after delete + re-signup, the calendar is empty of the old
  account's copies (a clean slate).
- Actual: `delete_my_account()` does delete the caller's `user_events`.
  Other people's `my_people` rows for this phone revert to pending
  (`user_id` SET NULL). Re-signup resolves those rows and
  `deliver_pending_shares` copies every still-recorded incoming share onto
  the new account — so friends' events return, and self-created / agent-
  created copies (no remaining incoming share) do not. Confirm copy says
  it deletes your calendar and does not mention this.
- Repro: have a friend share an event to you → Delete account → sign in
  again with the same number → the friend's event is back.
- Fix (separate task): either also drop incoming `event_shares` (and the
  friends' `my_people` row, or a tombstone) so a returning phone is not
  treated as a first-time invite, or keep the re-delivery and tell the
  user in the confirm dialog. Acceptance in FEATURES.md currently lists
  "receives any pending shares" as intended — this finding is that the
  owner does not want a deleted account to come back with the old
  incoming calendar.

### KI-008 — Notifications modal switches are too small to tap comfortably

- Severity: minor
- Status: open — fix landed 2026-09-02 (Design System Consolidation Phase
  3); pending owner on-device confirmation (no Android device in a cloud
  VM).
- Found: 2026-08-18 owner smoke of preview APK `a7ce79c8`. Owner ruling:
  not a tester blocker.
- Expected: Push and SMS switches are easy to hit (≥44pt).
- Actual: the `ThemedSwitch` controls in the People → Notifications modal
  (`app/(app)/people.tsx`) feel too small on a phone. Broader button
  size/clickability is also a Planned feature in `FEATURES.md`.
- Fix: the whole row is now the switch — one accessible control
  (role=switch with checked state) wrapping a full-width 44pt+ target; the
  visual `ThemedSwitch` is aria-hidden inside it.
- Repro: People footer → Notifications → tap either switch. Native
  Android; not a web-review item.

### KI-009 — Android system Back does not close the Notifications modal

- Severity: minor
- Status: open — fix landed 2026-08-28 (see below); pending owner
  on-device confirmation (no Android device in a cloud VM).
- Found: 2026-08-18 owner smoke of preview APK `a7ce79c8`. Owner ruling:
  not a tester blocker.
- Expected: the system Back button dismisses the Notifications sheet, same
  as Close.
- Actual: Back does nothing; only the in-sheet Close control dismisses it.
  The Notifications (and Your name) modals omit `onRequestClose`, which
  other sheets (`NotificationExplainer`, `ManualAddPersonModal`, contacts
  explainers) already wire.
- Repro: People → Notifications → Android Back. Close still works.
- Same pattern, not previously listed here: the circle-editor Modal in
  `people.tsx` and `components/PeoplePicker.tsx` also omit `onRequestClose`.
  The broader system-Back / gesture-Back picture is [KI-012](#ki-012--android-system-back-3-button-and-gesture-sometimes-does-not-navigate).
- Fix (2026-08-28): all four sheets now wire `onRequestClose` to their own
  Close/Cancel — Notifications / Your name / circle editor in
  `app/(app)/people.tsx`, contacts picker in `components/PeoplePicker.tsx` —
  and `test:conventions` requires the handler on every `<Modal>` so the
  class cannot regress. The same wiring covers the iOS pageSheet
  swipe-down attempt. Remove this entry once a device smoke confirms Back
  dismisses each sheet.

### KI-010 — Push toggle ignores OS notification permission

- Severity: minor
- Status: open
- Found: 2026-08-18 owner smoke of preview APK `a7ce79c8`. Owner ruling:
  not a tester blocker.
- Expected: without OS notification permission, Push notifications is off.
  Turning it on shows the notification explainer, then the OS prompt.
- Actual: `users.notify_push` is independent of OS permission. You can
  flip Push on after Not now / Don't Allow; `send-notification` will still
  skip push when there is no token, so the toggle is a preference that
  does not match what the OS will deliver. The explainer is one-shot
  (`notification_explainer_answered`) and is not re-entered from this
  switch.
- Repro: deny (or Not now) the OS prompt → People → Notifications → Push
  still shows on (default true) and can be flipped.
- Fix (separate task): when permission is not granted, render Push as off;
  an on-flip reopens the explainer (Turn on notifications → OS ask; Not now
  leaves it off). SMS stays independent.

### KI-011 — Each person row on the People screen is too tall

- Severity: minor
- Status: open
- Found: 2026-08-18, owner report (not a tester blocker). Owner notes this
  was not true previously — treat as a regression, but do not investigate
  the origin in the logging pass; leave git-history / layout for a later
  agent.
- Expected: person rows on My People (`app/(app)/people.tsx`) are dense —
  one compact line per person (name + actions), not a large vertical slot.
- Actual: each person line is too tall. The list shows fewer people per
  screen than it used to.
- Repro: open People with more than a couple of people. Compare row height
  to an older build / memory of the earlier denser list. Native is the
  product; web can show the same layout.
- Related (do not conflate): [People List Scrolling](../FEATURES.md#people-list-scrolling)
  is the split-scroll feel (circles pinned, people in an inner pane).
  [Touch Targets & Footer Safe Area](../FEATURES.md#touch-targets--footer-safe-area-people-screen)
  (2026-08-15) grew text-action hit areas to 44pt and claimed person rows
  were already ≥44. Either of those, or a later `minHeight` on the list,
  may have inflated row height — unconfirmed.
- Fix (separate task): find when the person-row height grew and restore a
  denser row without dropping the 44pt Remove target.

### KI-012 — Android system Back (3-button and gesture) sometimes does not navigate

- Severity: minor
- Status: open — the confirmed Modal class is fixed (2026-08-28, pending
  owner on-device confirmation); the unconfirmed stack-root layer below
  is what remains open.
- Found: 2026-08-20 owner report on Samsung 3-button navigation. Investigation
  only — no implementation or design this pass. Not a tester blocker (same
  ruling family as [KI-009](#ki-009--android-system-back-does-not-close-the-notifications-modal)).
- Expected: the system Back control (Samsung 3-button navbar Back, and the
  equivalent Android gesture-nav back swipe) leaves the current screen or
  sheet the same way the in-app Back/Close/Cancel control does.
- Actual: Back sometimes does nothing. This is not [KI-005](#ki-005--android-3-button-navigation-bar-covers-the-bottom-of-the-screen)
  (the bar overlapping in-app content) and not [Screen Transition Polish](../FEATURES.md#screen-transition-polish-android)
  (a white flash during stack swipes). Those are separate. There is no
  FEATURES.md item for system Back; [KI-009](#ki-009--android-system-back-does-not-close-the-notifications-modal)
  is the one already-logged instance (Notifications sheet).

#### What the code is doing

The app never registers a `BackHandler`. In-app header Back/Cancel labels
(`router.back()` on People, event detail, add/edit, share) are unrelated
top-of-screen controls. System Back is left to React Native and
`react-native-screens`.

Android 3-button Back and Android gesture-nav back are the same event
(`OnBackPressedDispatcher` / `KEYCODE_BACK`). If Back no-ops on 3-button
nav, gesture-nav back hits the same handlers. iOS has no Back key; its
gestures are a separate follow-up (sheet swipe-down vs stack edge-swipe)
in the iOS section below.

`app.config.js` sets `android.predictiveBackGestureEnabled: false` (Expo's
default). That writes `android:enableOnBackInvokedCallback="false"` and
turns off the Android 13+ predictive-back *animation*. It does not disable
the back action.

#### Confirmed: RN Modal swallows Back unless JS handles `onRequestClose`

React Native's Android `Modal` (`ReactModalHostView.kt`) always consumes
Back and fires `onRequestClose` into JS. It does not close itself. If the
JS `Modal` has no `onRequestClose`, the sheet stays up and the screen
under it does not pop — Back looks dead. This is required Android Modal
behavior, not a Samsung quirk.

Inventory of every `Modal` in the app:

| Sheet | File | `onRequestClose` |
|---|---|---|
| Notifications | `app/(app)/people.tsx` | fixed 2026-08-28 (was KI-009) |
| Your name | `app/(app)/people.tsx` | fixed 2026-08-28 |
| Circle editor | `app/(app)/people.tsx` | fixed 2026-08-28 |
| Add people (contacts picker) | `components/PeoplePicker.tsx` | fixed 2026-08-28 |
| Notification explainer | `components/NotificationExplainer.tsx` | present (`onNotNow`) |
| Contacts explainer | `components/ContactsExplainer.tsx` | present (`onNotNow`) |
| Contacts denied recovery | `components/ContactsDeniedRecovery.tsx` | present |
| Manual add person | `components/ManualAddPersonModal.tsx` | present |

While one of the four previously missing-handler sheets was open, 3-button
Back and gesture-nav back no-oped. Close/Cancel/the in-app control still
worked. This was the best explanation of "sometimes."

#### Unconfirmed on device: stack screens and the calendar root

Pushed screens (People, event detail, add/edit, share, onboarding) live on
the `(app)` Expo Router native `Stack` (`headerShown: false`). Nothing in
app code intercepts Back there; `react-native-screens` should pop. Not
reproduced on a phone this pass (cloud agents have no Android). If Back
fails on those screens with no Modal open, it is a different layer than
the table above.

The calendar (`app/(app)/index.tsx`) is the `(app)` stack root. After
sign-in, `app/_layout.tsx` `replace`s into `(app)`, so Back on the
calendar has no in-app screen to pop to. If the root Stack still pops
`(app)` onto `(auth)` while a session exists, `RootLayoutNav` immediately
`replace`s back to `(app)` — Back appears to do nothing. Depending on the
OS, Back at root may instead background the app. Either way it will not
"go back" inside Events.

Other first-press consumers that are not a failed navigation: the
keyboard dismissing, the Android date/time picker dialog, and a native
`Alert` confirm.

- Repro (confirmed in code, previously seen on device as KI-009): Samsung
  Android, 3-button nav. Open People → Notifications (or Your name, a
  circle editor, or the contacts picker) → press the navbar Back button.
  The sheet stays. Close/Cancel dismisses it. Repeat with gesture nav to
  confirm the same handlers (not done this pass).
- Repro (unconfirmed): same Back on a pushed screen with no Modal up
  (event detail, People, add-event), or on the calendar itself.
- Web: no 3-button / gesture nav. Browser back/forward is a different
  stack (covered by the release-review edge/platform track). Do not flag
  there.
- Fix (2026-08-28): the bounded class is done — all four sheets wire
  `onRequestClose` to their own Close/Cancel, and `test:conventions`
  requires the handler on every `<Modal>` so the class cannot regress.
  What remains is the unconfirmed layer: on the next device smoke, check
  Back on a pushed screen (event detail, People, add-event) and on the
  calendar with every Modal closed; only if it still fails there, chase
  the stack-root / native-stack behavior above. Remove this entry once
  that check passes.

#### iOS gestures (follow-up 2026-08-20 — code only, no device)

iOS has no 3-button navbar and no Back key. The two gestures people mean
by "go back" are not one Android-style event:

1. **Left-edge swipe to pop a pushed screen** — not the same issue as
   Android Back. `react-native-screens` 4.16 defaults `gestureEnabled` to
   true (`_gestureEnabled = YES` in `RNSScreen.mm`). The app never sets
   `gestureEnabled: false`. `headerShown: false` does not turn this off:
   `RNSScreenStack` is the pop-gesture delegate and only requires a stack
   depth ≥ 2, `gestureEnabled`, and a non-modal screen. `fullScreenSwipeEnabled`
   is off, so this is the standard ~20pt left-edge swipe, not a swipe from
   anywhere. Unconfirmed on a TestFlight device this pass.

   Same as Android, the calendar is the `(app)` stack root: there is no
   in-app screen to pop to. Onboarding is a horizontal paging `ScrollView`
   (`app/(app)/onboarding.tsx`); screens gives the *edge* pan priority over
   that pager, so a swipe that does not start at the left edge pages
   instead of leaving. That is paging, not a dead back handler.

2. **Swipe-down to dismiss a `pageSheet` Modal** — the same class as
   Android Back on those sheets. Every Modal in the inventory uses
   `presentationStyle="pageSheet"` and none set `allowSwipeDismissal`
   (defaults `false` → `modalInPresentation = YES`). iOS will not
   interactively dismiss the sheet. A drag that UIKit treats as an
   attempted dismiss calls `presentationControllerDidAttemptToDismiss`;
   Paper RN (`RCTModalHostView.m`)
   then fires `onRequestClose` only if JS provided it. **Dated
   analysis:** the app moved to the New Architecture on 2026-09-01
   (FEATURES.md → New Architecture Migration); Fabric replaces
   `RCTModalHostView`, so re-observe sheet/back behavior on a new-arch
   build before leaning on this layer of the analysis.

   - The four sheets missing `onRequestClose` (Notifications, Your name,
     circle editor, contacts picker): swipe-down rubber-bands and the
     sheet stays. Same "gesture does nothing" as Android Back.
   - The four sheets that already wire `onRequestClose`: a swipe-down
     *attempt* should close via JS (Not now / Close) even without
     `allowSwipeDismissal`. Not verified on a phone this pass.

The iOS home-indicator swipe-up is the app switcher, not back. Do not
flag that.

- Repro (iOS, confirmed in code, not run on device this pass): Notifications
  / Your name / a circle editor / the contacts picker → swipe down on the
  sheet. It should stay. Close/Cancel still works.
- Repro (iOS, unconfirmed): left-edge swipe on event detail / People /
  add-event with no Modal up — code says this should pop. Left-edge swipe
  on the calendar should not navigate inside Events.

### KI-014 — Month-navigation chevrons don't paint on web (functional but invisible)

- Severity: minor
- Status: open
- Found: 2026-08-24 release review (skeptic pass on the visual matrix,
  `manual-tests/manual_test_report_2026-08-24-release.md`).
- Expected: the calendar's month header shows visible ‹ › chevrons.
- Actual: on web (react-native-web), the arrow touchables are present and
  clickable — month navigation WORKS — but the arrow glyphs collapse to 0×0
  and never paint (react-native-web's tintColor SVG-filter path). Native
  renders the library's PNG arrows normally (never reported on any device
  smoke). Web-only; the web build is the dev/staging/CI surface, never
  promoted to users.
- Repro: open the calendar on the web build (any theme/width) — no painted
  chevrons flank the month title; clicking where they should be still
  navigates. Adjacent-month day taps also switch months.
- Re-confirmed 2026-08-31 release review (`60e76eb`, web staging preview).
- Re-confirmed 2026-09-02 release review (`ffd9eb4`, web staging preview).
- Note for CI: the e2e pixel baselines mask the grid header
  (`mask: [page.getByRole('slider')]` in `e2e/visual.spec.ts`), so pixel
  diffs can't catch this.
- Fix (separate task): render the chevrons as vector icons
  (`@expo/vector-icons`, tinted by `theme.textPrimary`) instead of the
  library's tinted-PNG arrows, or pass custom `renderArrow`.

### KI-016 — CI visual-spec renders a "Hide this person" action on a self-created event

- Severity: minor (test-harness anomaly; **no user impact — confirmed
  2026-09-02** the app render is correct).
- Status: accepted (owner-reviewed 2026-09-02) — investigated (see below) and
  confirmed a benign CI-runner rendering artifact, not app code; not
  reproducible off CI. Cosmetic and non-failing. Do not flag in release
  review and do not re-investigate unless it starts failing tests or
  reproduces outside CI.
- Found: 2026-09-02, Design System Consolidation baseline regeneration
  (run 33575687270). Also present in the Location-era baseline
  (`1ea009a`, generated 2026-09-01) — predates the consolidation. The
  pre-Location baseline (`e8dbd24`) does NOT have it.
- Expected: the event detail screen for a self-created event shows
  Share / Edit / Remove Event — the Hide action is gated on the
  `sharedByPersonId` nav param, which only received events carry.
- Actual: in CI renders of `e2e/visual.spec.ts` "event detail matches
  baseline" (all three projects, both attempts, deterministic), the action
  stack includes a quiet "Hide this person" line (the `sharerName ?? 'this
  person'` fallback). It is under the 2% pixel-diff threshold, so the suite
  stays green whether or not it renders — it only ever got *baked into the
  baseline* during regeneration runs.
- **Investigation (2026-09-02) — it is NOT a product bug.** From the run
  33575687270 trace: the DOM snapshots never contain "Hide" (0 occurrences
  anywhere in the trace) while "Baseline event"/"Remove Event" are captured
  normally; the error-context aria snapshot lists exactly Share / Edit /
  Remove Event; the network log shows no `my_people`-by-id or
  `hidden_people` fetch (the `sharedByPersonId` branch in `load()` never
  runs); the frameUrl has no query param. So the live component renders
  correctly and the phantom exists **only as pixels**. It appears on every
  event-detail screen from the first painted frame, is pixel-identical
  across attempts, and shows in both Chromium and WebKit. No spec in the
  suite ever renders the "Hide this person" fallback (a received event's
  `sharer_contact_name` always resolves via the mandatory display_name), so
  there is no in-run content source either — pointing to a
  software-rendering/compositor artifact specific to the CI runners, not a
  reproducible app or test-logic state.
- Ruled out: the frozen clock. Replacing `page.clock.install({ time })`
  with a Date-only freeze (native rAF/timers) left CI's event-detail render
  **byte-identical** to the phantom baseline (a threshold-0 probe run went
  green), so rAF/timer faking is not the cause. `freezeOnBlur` is a no-op
  on web (web `ScreenStack` is a plain `View`), and there is no web stack
  transition animation to leave a stale layer.
- Repro: none outside CI. Locally not reproduced (default, forced software
  GL, frozen clock, full preceding suite in one worker, CPU load).
- Guard added: `e2e/event-detail.spec.ts` now asserts a self-created event
  has **no** Hide/Unhide action at the DOM level, so the correct behavior
  is verified independently of the haunted pixels.
- Handling: cosmetic and non-failing, so it is safe to leave. If a
  pixel-clean baseline is wanted, the path is a CI-render fix (e.g. forcing
  a full re-raster before the screenshot) followed by regenerating the
  event-detail baselines via the **Regenerate visual baselines** workflow —
  note the regen re-takes whatever CI renders, so it only helps once the
  render itself is clean.

### KI-017 — My People gear sits too close to Add

- Severity: minor
- Status: open
- Found: 2026-09-02 owner device smoke of preview APK `209792d2`
  (promoted `23ca55f`),
  `manual-tests/manual_test_report_2026-09-02-device.md`. Owner ruling:
  not a tester blocker.
- Expected: the Settings gear and Add in the My People header
  (`app/(app)/people.tsx` via `AppHeader` `rightAccessory` + `right`)
  have comfortable space between them — two distinct 44pt targets, not
  one clustered pair.
- Actual: the gear is too close to Add.
- Why: `components/AppHeader.tsx` `rightCluster` is a row with no `gap`
  (and `settingsButton` / `action` have no horizontal margin). The gear
  is 44×44 and Add is a 44pt text action, so the two hit areas abut.
- Repro: open My People (native). Look at the header, right of the
  title: gear then Add. Web can show the same layout; native is the
  product.
- Fix (separate task): add a gap in `rightCluster` (or padding on the
  accessory) so the two controls read as separate. Do not shrink either
  target below 44pt. Visual baselines include the People header — a
  pixel change there needs the **Regenerate visual baselines** workflow
  (People screen), not a locally regenerated mobile-safari shot.

## Deleted bug classes (do not re-flag, do not reintroduce)

- **KI-002 (global dedup drops description/image) — deleted 2026-08-24 by the
  Copy + Follow cutover** (`docs/per-user-events-copy-follow-spec.md`). The
  global `(url, title, date, time)` dedup index and `find_or_create_event`
  are gone; two people adding the same listing are two independent rows, and
  an edit writes exactly the fields the user typed.
- **The B-1 class (multi-call client-side save) — deleted 2026-08-24 by the
  same cutover.** The five-call fork (`find_or_create_event` → re-point
  `user_events` → 23505 merge → delete old row) is gone; create and edit are
  one idempotent `save_event` call each. The interim B-1 layers (split
  read/write budgets, friendly write failures, reconcile-read on timeout,
  latency e2e, conventions rules) all survive — keep them.

## Known limitations (by design — do not flag)

- **The native date/time picker never opens on web.**
  `@react-native-community/datetimepicker` is unsupported in the browser; the
  add/edit event forms deliberately use HTML `date`/`time` inputs on web
  instead. A native-style picker not appearing is correct behavior.
- **No browser notification-permission prompt.** Web never requests
  notification permission — web users get SMS instead. Its absence is a pass
  condition, not a bug.
