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
1. Complete sign-in if needed.
2. On onboarding, tap **Next** between pages.
3. Verify final CTA changes to **Get Started**.
4. Re-open onboarding from calendar `?` button, then tap **Skip**.

**Expected**
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

### E-103 Delete event
**Steps**
1. Open event detail for event created by current user.
2. Tap **Delete Event** and confirm.

**Expected**
- Event is deleted and user is navigated away from detail page.

---

## Pass Criteria

Manual suite passes when:
- All **Core** scenarios pass.
- Relevant **Extended** scenarios pass for impacted areas.
- Artifacts and report are attached to the run.
