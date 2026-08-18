# Native Device Smoke Suite

Run this on a real phone (iOS via TestFlight, Android via internal track or
sideloaded APK) after every new EAS build, before inviting testers. Every
automated harness in this repo exercises the **web** build — the native-only
paths below have no other coverage. The push/share steps need a second
device, a friend with the app, or an agent playing the sharer (see N-005).

Record results in a report file like the cloud suite
(`manual-tests/manual_test_report_<date>-device.md`), one line per check:
pass / fail + note.

## N-001: Sign-in with a real phone number

1. Fresh install → enter your real phone number → OTP SMS arrives → enter code.
2. Lands on the calendar (onboarding walkthrough may auto-show if the account
   has no events — dismiss it for now).
3. Kill and relaunch the app: session persists (no sign-in loop).

## N-002: Contacts permission and import

1. Fresh account, empty people list: create an event → Share. The contacts
   explainer appears before the OS prompt (no extra tap on People). Same if
   you open People with nobody added.
2. Continue → grant permission → the picker lists device contacts → select
   2–3 → they appear (on Share, ready to send; on People, in My People) with
   names from your contacts.
3. Fresh install (or second device/account) → Share or People → Continue →
   **deny** the OS prompt → the denial recovery screen appears with Open
   Settings as the primary action and a quiet “Add a number instead” hatch
   (not a bare dialog). Not now on the explainer must not show the OS prompt.

## N-003: Manual add fallback

1. After denying contacts, tap “Add a number instead” (or on web, Add): name +
   phone → Save → person appears.
2. Invalid number → alert, nothing saved.

## N-004: Event creation with native pickers

1. Calendar → + → the native date/time pickers open and set values (this is
   the native path — web uses HTML inputs and does not exercise it).
2. Save → event appears on the calendar.

## N-005: Share → push between two devices (the core loop)

1. Device A: share the event to Device B's owner (they must be in A's people).
2. Device B: push notification arrives, showing the sharer's name/number, the
   event title, and date/time.
3. Device B: **tap the notification** → the app opens directly to the event
   detail screen, with "From X" attribution.
4. Device B: the event is on the calendar and survives a relaunch.

**One-device variant (agent-assisted):** an agent plays Device A. Ask it to
sign in on the staging web preview with a test-OTP account, add your real
phone number to its people (manual name + phone form), and share an event to
you. Your phone — this build installed, signed in, push token registered —
should get the push; tap it and check the event detail and calendar as above.
The push title should show the test account's display name (the share gate
requires one).

## N-006: SMS content (share to a non-user)

1. Device A: share an event (with a URL set) to your own real second number,
   or a friend's non-app number.
2. The SMS reads: who wants to go with you, the event title, date/time, the
   event URL — and **no app/web links**, with a Reply STOP footer.
3. Eyeball check: it does not read like spam.

## N-007: Edit and remove

1. Edit the event's time on Device A → your calendar shows the new time
   (edit = fork; B's copy is unchanged).
2. Remove the event from A's calendar → B keeps their copy.

## N-008: Sign out

1. People → scroll to the bottom → Sign out → confirm dialog shows your
   formatted phone number → confirm.
2. Lands on the sign-in screen; protected screens are unreachable via back.
3. Sign back in → the calendar is exactly as before (no duplicates).

## N-009: Theme + safe areas

1. Calendar header → theme swatch → colors change and persist across relaunch.
2. Header/footer content clears the notch/Dynamic Island and home indicator in
   both themes.

## N-010: Notification permission explainer

Needs a fresh install (or OS Settings → Notifications reset) per variant —
the ask is one-shot and persisted (`notification_explainer_answered`).

1. Fresh install → sign in. The in-app explainer ("Events notifies you when
   someone shares an event with you.") appears before any OS prompt. On a
   brand-new account the walkthrough auto-shows first and the explainer
   appears after it's dismissed — never stacked on top of it.
2. Not now → no OS prompt fires. Kill and relaunch → the explainer does not
   reappear.
3. (Fresh install again) Continue → the OS prompt fires → Allow → the N-005
   push path still works end-to-end (share to this device, push arrives, tap
   opens the event).
4. (Fresh install again) Continue → Don't Allow → no recovery screen and no
   re-ask on relaunch; a share to this device still arrives by SMS.

## Known acceptable rough edges (don't report)

- Notification SMS leads with the sharer's display name. A raw phone number
  appears only for accounts that last shared before display names shipped
  (2026-08-12) — the share gate prevents any new nameless share.
- The web app is not a supported user surface; anything web-specific goes
  through `manual-tests/cloud_manual_regression.md` instead.
- **KI-005** — with the Samsung / 3-button navigation bar on, the system bar
  covers a strip at the bottom of the screen (People Delete account; the
  bottom of an event on Events). Do not re-flag unless it is materially
  worse than that (e.g. covering a whole control that was previously only
  clipped). Gesture nav is the expected tester setup.
- **KI-006** — first open after installing an updated APK can hang on a
  spinner until you swipe the app away and reopen. Subsequent opens of the
  same binary are fine.
- **KI-007** — delete account then sign in again with the same number
  re-delivers friends' previously shared events (pending-share path).
  Self-created copies stay gone.
- **KI-008 / KI-009 / KI-010** — Notifications modal: switches feel small,
  Android Back does not dismiss it (Close does), Push can be on without OS
  permission.
