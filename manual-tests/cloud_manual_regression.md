# Cloud Manual Regression Suite

This suite is for **agent-driven manual testing** (computer-use) in Cursor Cloud.

Use this when:
- A change touches UI/UX or navigation.
- A change modifies auth, event creation/editing, sharing, or people management flows.
- Automated tests pass but you still need end-to-end confidence.

---

## Preflight

1. Run:
   - `npm run test:manual`
2. Ensure:
   - `.env` exists with Supabase values.
   - Expo app starts in web mode on port 8081.
3. Start app:
   - `npx expo start --web --port 8081`

Use these test credentials (configured on the Supabase project, expire 2027-03-31):
- Phone: `+15555550100` (account A), OTP: `123456`
- Second account (multi-user scenarios): `+15555550103` (account B), OTP `123456`
- `+15555550101` is NOT a configured test number — Twilio rejects it with `sms_send_failed`.

When this suite runs as the pre-release gate (see `docs/development-workflow.md`),
run it against the staging preview `https://staging.shared-events.pages.dev` and
repeat the Core scenarios once in a mobile-emulated viewport (Chrome DevTools
device toolbar, e.g. iPhone 14) — the automated e2e suite covers mobile web, but
touch-feel and layout need eyes.

---

## Evidence Rules

For each executed scenario:
- Capture at least one screenshot of final state.
- Capture one short video per multi-step flow.
- Record pass/fail and artifact path in `manual-tests/manual_test_report_template.md`.

---

## Core Scenarios (run every UI-impacting change)

### M-001 Sign-in validation
**Steps**
1. Open `/(auth)/sign-in`.
2. Enter an invalid phone string (e.g. `abc`).
3. Tap **Send code**.

**Expected**
- Alert appears: `Invalid phone number`.

---

### M-002 OTP verification and resend cooldown
**Steps**
1. Sign in with valid phone.
2. On verify screen, confirm resend already shows `Resend code in 60s` (the initial send starts the cooldown so an accidental tap cannot fire a second SMS immediately).
3. Wait out the cooldown (or note it decrements), then tap resend text.
4. Observe countdown restart.
5. Enter an invalid/old OTP and submit — expect a short friendly alert (not a debug dump with stack/code/raw JSON).
6. Enter the valid OTP and submit.

**Expected**
- After step 1, resend is already cooling down from the initial send.
- After an intentional resend, cooldown text switches to `Resend code in 60s` and decrements.
- Invalid OTP shows a normal alert like "That code is incorrect or no longer valid…".
- Valid OTP signs user in and routes into app.

---

### M-003 Onboarding controls
**Steps**
1. Complete sign-in with a brand-new account (no events shared with it).
2. The walkthrough should appear automatically because the calendar is empty.
3. **Also re-check at a mobile viewport** (Chrome device toolbar → iPhone 12/14 Pro, ~390×844). Desktop-only passes are not enough for this scenario.
4. On onboarding, tap **Next** between pages. Confirm copy sits near the top (not vertically centered in a huge empty void) and footer controls stay clear of the home-indicator/safe area.
5. Swipe horizontally between pages (touch / mobile emulation). Confirm dots track the page and the final CTA becomes **Get Started**.
6. Re-open onboarding from calendar `?` button, then tap **Skip**.

**Expected**
- Walkthrough auto-shows at most once, and only when the user has no events at all (an invited guest with a shared event lands directly on the calendar instead).
- Page progression works via **Next** and via horizontal swipe on mobile web.
- Layout is top-anchored on a phone-sized viewport — no giant empty beige band above the copy.
- `Get Started` and `Skip` both route back to calendar.

---

### M-004 Calendar shell and navigation
**Steps**
1. From calendar, tap **People**.
2. Return to calendar.
3. Tap `+` to open add-event screen.
4. Return to calendar.
5. Pull-to-refresh on calendar list.

**Expected**
- Navigation works for People and Add Event.
- Refresh action completes without crash.

---

### M-005 Add Event validation + share handoff
**Steps**
1. Open add-event screen.
2. Confirm save is disabled with empty title/url.
3. Enter title and date (time optional), tap **Save**.
4. Observe share screen opens.

**Expected**
- Empty event cannot be saved.
- Valid event save routes to share flow.

---

### M-006 Share screen empty state or selection
**Steps**
1. In share screen, evaluate available state:
   - If no people exist, verify empty state and **Add People** CTA.
   - If people exist, select at least one person and tap **Share**.

**Expected**
- Empty state copy and CTA appear when list is empty.
- Share is enabled when selection exists and returns to previous screen.

---

### M-007 Event detail actions
**Steps**
1. Open an event detail page.
2. Tap **Share** and return.
3. If editable, tap **Edit**, change title/date, save.

**Expected**
- Share action opens share screen.
- Edit save returns to updated event detail.

---

## Extended Scenarios (run when relevant data exists)

### E-101 People management
**Steps**
1. Open My People.
2. Add a person. On web, tap **Add** to open the manual "Add person" form (there is no contacts API in the browser) and enter a name + phone number. On native, first Share or People with an empty list shows the contacts explainer, then the OS prompt; deny lands on recovery (Open Settings, with a quiet add-a-number hatch).
3. Create a circle and edit circle members.
4. Remove one person.

**Expected**
- Manual add normalizes the phone to E.164 and the person appears in the list.
- Count updates and circle membership edits persist.

---

### E-110 Web date/time inputs
**Steps**
1. On web, open Add Event (`+`).
2. Confirm the **Date** and **Time (optional)** fields are HTML date/time inputs (not buttons that open nothing).
3. Pick a date via the calendar picker and set a time; enter a title and **Save**.
4. Navigate the calendar to that month.

**Expected**
- Date/time are selectable on web (the native `@react-native-community/datetimepicker` doesn't open in the browser).
- The event lands on the correct day (no off-by-one / year shift).

---

### E-102 URL metadata autofill
**Steps**
1. On add-event, paste a URL and blur input.
2. Wait for metadata fetch.

**Expected**
- Best effort: title/description/image may autofill.
- Failures do not block manual entry or save.

---

### E-103 Remove event
**Steps**
1. Open event detail for an event on the current user's calendar.
2. Tap **Remove Event** and confirm.

**Expected**
- The event disappears from the user's calendar and the user is navigated away from the detail page.
- The underlying `events` row is untouched: anyone who re-shared the event still sees it (verify with the second test account if the event was shared onward).

---

### E-104 Multi-user share lands on recipient's calendar immediately
**Steps**
1. Signed in as `+15555550100` (account A), add `+15555550101` to My People, create an event, and share it with them.
2. Sign out, then sign in as `+15555550101` (account B) — an account that has never opened the app.

**Expected**
- Account B lands directly on the calendar (no forced setup) and the shared event is visible on the correct date.
- No walkthrough gate blocks the view (walkthrough only auto-shows when the calendar is completely empty).

---

### E-105 Hide suppresses calendar entries and notifications
**Steps**
1. As account B (with an event shared by A), open the shared event's detail and tap **Hide [name]**.
2. Return to the calendar and confirm A's shared events are gone.
3. As account A, share another event with B.
4. As B, confirm no push notification (and no SMS, if Twilio is configured) arrives for the new share.
5. From B's People screen, unhide A and confirm events reappear after refresh.

**Expected**
- Hidden person's events disappear from the calendar immediately.
- New shares from a hidden person produce no push and no SMS.
- Unhide restores visibility.

---

### E-106 Push token persists after sign-in
**Steps**
1. Sign in on a native build (or web, where supported) and accept notification permissions.
2. In the Supabase dashboard, check the `users` row for the signed-in account.

**Expected**
- `expo_push_token` is set shortly after authenticated launch (requires the `users_update_own` RLS policy).
- Signing out and back in keeps/refreshes the token without error.

---

### E-107 SMS contains the event URL
**Steps**
1. Requires Twilio credentials configured on the `send-notification` edge function and at least one store URL secret.
2. As account A, create an event **with a URL** and share it with a phone number that is not an app user.
3. Inspect the SMS delivered (or Twilio message logs).

**Expected**
- SMS body includes the event title, date/time, and the event URL itself — the recipient can act without installing the app.
- Store links follow the event URL; message ends with `Reply STOP to unsubscribe.`

---

### E-108 Sharing delivers the recipient their own copy (forwarding)
**Steps**
1. As account A, create an event and share it with B (test OTP `+15555550101`).
2. As account B, sign in and check the calendar — the event is there.
3. In the Supabase dashboard, confirm B has their own `user_events` row for the same `event_id`.
4. As account A, open the event, tap **Remove Event**, and confirm.
5. As account B, refresh the calendar.

**Expected**
- The event stays on B's calendar after A removes it — B owns a copy, A's removal is purely personal.
- B's calendar entry survives A re-sharing chains too: if B re-shares to a third account and B then removes the event, the third account keeps it.
- On A's side the event disappears; in the dashboard A's `event_shares` rows are gone but B's `user_events` row remains.

---

### E-109 Share sheet shows completed shares, no unshare
**Steps**
1. As account A, open an event already shared with B, tap **Share**.
2. Observe B's row in the people list.
3. Try tapping B's row.

**Expected**
- B's row shows "✓ Shared", is muted, and does not toggle — sharing is a completed action and can't be unsent.
- The header action reads **Share** (not Done) and is disabled until at least one never-shared person is selected.
- Only newly selected people trigger notifications when sharing again.

---

## Pass Criteria

Manual suite passes when:
- All **Core** scenarios pass.
- Relevant **Extended** scenarios pass for impacted areas.
- Artifacts and report are attached to the run.
