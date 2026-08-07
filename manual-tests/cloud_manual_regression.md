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

Use these test credentials (if configured on Supabase):
- Phone: `+15555550100`
- OTP: `123456`
- Second account (multi-user scenarios): `+15555550101`, OTP `123456`

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
2. On verify screen, tap resend text.
3. Observe countdown.
4. Enter OTP and submit.

**Expected**
- Cooldown text switches to `Resend code in 60s` and decrements.
- Valid OTP signs user in and routes into app.

---

### M-003 Onboarding controls
**Steps**
1. Complete sign-in with a brand-new account (no events shared with it).
2. The walkthrough should appear automatically because the calendar is empty.
3. On onboarding, tap **Next** between pages.
4. Verify final CTA changes to **Get Started**.
5. Re-open onboarding from calendar `?` button, then tap **Skip**.

**Expected**
- Walkthrough auto-shows at most once, and only when the user has no events at all (an invited guest with a shared event lands directly on the calendar instead).
- Page progression works.
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
   - If people exist, select at least one person and tap **Done**.

**Expected**
- Empty state copy and CTA appear when list is empty.
- Done is enabled when selection exists and returns to previous screen.

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
2. Add contacts (if contacts are available).
3. Create a circle and edit circle members.
4. Remove one person.

**Expected**
- Count updates and circle membership edits persist.

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

### E-108 Unshare revokes access
**Steps**
1. As account A, open an event already shared with B, tap **Share**.
2. Deselect B (leave at least one other person selected, or clear all) and tap **Done**.
3. As account B, refresh the calendar.

**Expected**
- Deselecting deletes B's `event_shares` row; the event disappears from B's calendar.
- Clearing the entire selection is allowed when editing existing shares and removes all shares.
- No notification is sent when only removing shares.

---

## Pass Criteria

Manual suite passes when:
- All **Core** scenarios pass.
- Relevant **Extended** scenarios pass for impacted areas.
- Artifacts and report are attached to the run.
