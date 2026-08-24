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

### KI-002 — An edit can silently drop the typed description/image when the dedup key collides

- Severity: minor
- Status: open
- Found: 2026-08-13, while diagnosing the B-1 blocker in
  `manual-tests/manual_test_report_2026-08-13-release.md`
- Expected: editing an event's description or image always ends up on the
  snapshot you own.
- Actual: `find_or_create_event` dedupes on `(url, title, event_date,
  event_time)` only — `description` and `image_url` are not part of the key
  (`supabase/migrations/20240216000008_find_or_create_event.sql`). If an
  edit's four key fields match an existing snapshot (e.g. two people
  independently added the same listing, or the edited values happen to match
  an older snapshot), the caller is attached to that existing row, and a
  differing typed description/image_url is silently dropped in favor of the
  existing row's values. This is also the only path where a preview-cache
  seed can differ from the server row (the seeded detail briefly shows the
  typed description, then the fetch swaps in the row's).
- Repro: user A creates "Lunch" (url null, date D, time T, description
  "theirs"); user B creates "Lunch" (same url/date/time, description
  "mine") — B dedupes onto A's row and B's calendar shows "theirs".
- Fix (separate task, not yet scheduled): include description/image_url in
  the dedup key, or have the RPC return the full row so the client seeds and
  navigates from the actual database row rather than the form values.

### KI-005 — Android 3-button navigation bar covers the bottom of the screen

- Severity: minor
- Status: open
- Found: 2026-08-15 owner device smoke on Samsung with 3-button navigation
  (not gesture nav), `manual-tests/manual_test_report_2026-08-15-device.md`
  N-009 (People / Delete account). Still present 2026-08-17 on the Events
  calendar.
- Expected: in-app content sits fully on screen, clear of the system
  navigation bar.
- Actual: with the Samsung / 3-button navigation bar on, the bar covers a
  strip along the bottom of the app.
- Where it shows up (native Android, 3-button nav):
  - People (`app/(app)/people.tsx`) — first report: the bar covered the
    Delete account button in the account footer.
  - Events / calendar (`components/Calendar.tsx`, title "Events") — the bar
    covers the bottom of an event in the selected-day list.
  - Likely the bottom of the window in general, not those two screens only.
    Other screens have not been exhaustively re-checked on a 3-button-nav
    device.
- Repro: Android device, 3-button (Samsung) navigation bar enabled. Open
  People and look at the footer, or open Events with at least one event on
  the selected day. Not reported under gesture navigation. Web has no
  3-button nav (do not flag there).
- Owner ruling 2026-08-15: not a tester blocker (testers expected to use
  gesture nav). Recorded here so release review and device smoke do not
  re-flag the same overlap.

### KI-006 — Android hangs on a spinner after installing an updated APK until force-quit

- Severity: minor
- Status: open
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
- Fix (separate task): confirm whether this is Expo splash / session restore
  racing a fresh native binary, then either wait out the first session
  restore or recover without requiring a force-quit.

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
- Status: open
- Found: 2026-08-18 owner smoke of preview APK `a7ce79c8`. Owner ruling:
  not a tester blocker.
- Expected: Push and SMS switches are easy to hit (≥44pt).
- Actual: the `ThemedSwitch` controls in the People → Notifications modal
  (`app/(app)/people.tsx`) feel too small on a phone. Broader button
  size/clickability is also a Planned feature in `FEATURES.md`.
- Repro: People footer → Notifications → tap either switch. Native
  Android; not a web-review item.

### KI-009 — Android system Back does not close the Notifications modal

- Severity: minor
- Status: open
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
- Fix (separate task): `onRequestClose={() => setShowNotifPrefs(false)}`
  on that Modal (and the name-edit Modal for the same pattern).

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
  an on-flip reopens the explainer (Continue → OS ask; Not now leaves it
  off). SMS stays independent.

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
- Status: open
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
| Notifications | `app/(app)/people.tsx` | missing (KI-009) |
| Your name | `app/(app)/people.tsx` | missing (noted in KI-009) |
| Circle editor | `app/(app)/people.tsx` | missing |
| Add people (contacts picker) | `components/PeoplePicker.tsx` | missing |
| Notification explainer | `components/NotificationExplainer.tsx` | present (`onNotNow`) |
| Contacts explainer | `components/ContactsExplainer.tsx` | present (`onNotNow`) |
| Contacts denied recovery | `components/ContactsDeniedRecovery.tsx` | present |
| Manual add person | `components/ManualAddPersonModal.tsx` | present |

Any time one of the four missing-handler sheets is open, 3-button Back and
gesture-nav back will no-op. Close/Cancel/the in-app control still works.
This is the best explanation of "sometimes."

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
- Fix: not designed this pass. A later task should treat the missing
  `onRequestClose` sheets as the known, bounded class (KI-009 plus the
  two extra rows in the table) and only chase stack-root / native-stack
  behavior if Back still fails with every Modal closed.

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
   Paper RN (this app, `newArchEnabled: false`, `RCTModalHostView.m`)
   then fires `onRequestClose` only if JS provided it.

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

### KI-013 — Android hangs on a spinner when opening the app after a day unused

- Severity: minor
- Status: open — fix landed 2026-08-24 (see below); pending owner
  on-device confirmation (a day-long idle repro is not possible from a
  cloud VM).
- Found: 2026-08-24, owner report on Android. Logging only — no
  investigation or fix this pass.
- Expected: opening the app after leaving it unused reaches the calendar
  (or sign-in).
- Actual: after not opening the app for about a day, the next open shows a
  loading spinner that does not go away.
- Repro: Android. Leave the app unused for about a day. Open it. The
  spinner stays. Recovery (force-quit / wait / network) was not reported
  this pass.
- Distinct from [KI-006](#ki-006--android-hangs-on-a-spinner-after-installing-an-updated-apk-until-force-quit):
  that is the same symptom on the first open after sideloading a newer APK
  over an existing install, and was not observed on a later cold start of
  the same binary. This report is a later open of an already-installed app
  after a day of not using it. Web is unaffected (do not flag there).

#### Root cause (2026-08-24 investigation, verified against library sources)

The spinner is the boot gate in `app/_layout.tsx` (`isLoading ||
!themeLoaded`); `isLoading` clears only when `supabase.auth.getSession()`
settles. After >1h idle the stored access token is always expired
(auth-js treats it as expired 90s early via `EXPIRY_MARGIN_MS`), so
`getSession()` awaits a refresh-token POST. That fetch had no timeout at
any layer: auth-js's `_request` attaches no AbortSignal, RN's fetch sets
no JS-side timeout, and RN's Android `OkHttpClientProvider` builds with
connect/read/write timeouts of 0 ("No timeouts by default"). A
black-holed connection — a half-open socket after long idle (stale NAT
mapping, post-Doze radio) that never delivers bytes and never resets —
hangs the refresh forever, and with it the boot spinner. Force-quit
starts a fresh process with fresh sockets, which is why recovery worked.
Honest-offline (no route at all) never hung: the fetch rejects instantly
and the app lands on sign-in after auth-js's bounded retry window (~13s),
with the stored session preserved. A second unbounded wait shared the
path: auth-js awaits every `onAuthStateChange` subscriber before
resolving the refresh, and `SessionContext`'s callback awaited
`ensureUserRow` — a raw RPC with no timeout.

#### Fix (2026-08-24)

- `lib/timeoutSignal.ts`: `boundedFetch`, a fetch wrapper with a 20s
  backstop (`NETWORK_BACKSTOP_TIMEOUT_MS`, deliberately above the 15s
  write budget so wrapped calls still time out on their own signal
  first; a caller-provided signal is forwarded and wins when earlier).
- `lib/supabase.ts`: passed as `global.fetch`, which supabase-js forwards
  to auth, postgrest, storage, and functions — every Supabase call is now
  bounded.
- `app/_context/SessionContext.tsx`: the `onAuthStateChange` subscriber
  no longer awaits `ensureUserRow` (fire-and-forget, matching the
  getSession path).
- Result on a black-holed network: the refresh aborts at ~20s (worst
  ~40s including auth-js's internal retry window), the stored session is
  kept, and the app lands on sign-in instead of spinning forever; the
  auto-refresh ticker / next launch self-heals when the network recovers.
- [KI-006](#ki-006--android-hangs-on-a-spinner-after-installing-an-updated-apk-until-force-quit)
  shares this exact boot path (first cold start after an APK update,
  token long expired) — the same fix should cover it. Confirm both on
  the next device smoke; remove the entries only after on-device
  verification.

## Known limitations (by design — do not flag)

- **The native date/time picker never opens on web.**
  `@react-native-community/datetimepicker` is unsupported in the browser; the
  add/edit event forms deliberately use HTML `date`/`time` inputs on web
  instead. A native-style picker not appearing is correct behavior.
- **No browser notification-permission prompt.** Web never requests
  notification permission — web users get SMS instead. Its absence is a pass
  condition, not a bug.
