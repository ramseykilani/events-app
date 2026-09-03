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
3. If editable, tap **Edit**, change EVERY field — URL, title, description, date, time — and save. (KI-004: the URL field shipped read-only while every test layer only ever edited the title. Exercise them all.)

**Expected**
- Share action opens share screen.
- Edit save returns to the updated event detail, and every edited value persisted: new title and description, new date and time (formatted, never raw ISO), and the URL shown as an "Open link" button.

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

### E-103 Remove event (self-created only)
**Steps**
1. Open event detail for an event the current user CREATED (no "From X" attribution).
2. Tap **Remove Event** and confirm.

**Expected**
- The event disappears from the user's calendar and the user is navigated away from the detail page.
- Only the caller's own row is deleted: anyone it was shared with keeps their own row (verify with the second test account if the event was shared onward). Followers' rows keep their field values and simply stop following (their `from_event_id` clears).
- Received events never show Remove Event — they show **Archive** instead (see E-119). The one exception: a received event whose sender deleted their whole account (attribution gone) shows Remove Event — accepted corner, owner call 2026-09-01.

---

### E-104 Multi-user share lands on recipient's calendar immediately
**Steps**
1. Signed in as `+15555550100` (account A), add `+15555550103` to My People, create an event, and share it with them.
2. Sign out, then sign in as `+15555550103` (account B).

**Expected**
- Account B lands directly on the calendar (no forced setup) and the shared event is visible on the correct date — B's own row, delivered at share time.
- No walkthrough gate blocks the view (walkthrough only auto-shows when the calendar is completely empty).

---

### E-105 Hide suppresses calendar entries and notifications
**Steps**
1. As account B (with an event shared by A), open the shared event's detail and tap **Hide [name]** — a confirm dialog ("Hide [name]?") appears; Cancel keeps everything unchanged and stays on the event. Tap Hide to confirm.
2. Return to the calendar and confirm A's shared events are gone.
3. As account A, share another event with B.
4. As B, confirm no push notification (and no SMS, if Twilio is configured) arrives for the new share.
5. From B's People screen, open the Settings sheet (header gear) and unhide A from the **Hidden** section (always visible, with a count when non-empty). Confirm events reappear after refresh.

**Expected**
- The hide confirm names the consequence, the silence (they aren't told), and the undo path; its Hide button is not red. Unhide has no dialog.
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
1. Requires Twilio credentials configured on the `send-notification` edge function.
2. As account A, create an event **with a URL** and share it with a phone number that is not an app user.
3. Inspect the SMS delivered (or Twilio message logs).

**Expected**
- SMS body opens with `[Name] wants to go to "[title]" with you`, then the date/time line, then the event URL itself — the recipient can act without installing the app.
- No app/web links anywhere in the message. While `RESPONSE_LINK_BASE_URL` is set, both variants carry the Who's Coming receipt line (`Coming? https://events-reply.pages.dev/?t=…`) ahead of the footer. The non-app recipient also sees the signup invite before the STOP footer: `Want to invite your friends to things too? Get the beta: https://events-landing.pages.dev/signup` (internal-testing phase; the one owner-approved link — an onboarding pointer, not a share link). The message ends with `Reply STOP to unsubscribe.`
- SMS to *app* users (the E-111 path) carries the same `Coming?` line but no invite line.

---

### E-108 Sharing delivers the recipient their own row (forwarding)
**Steps**
1. As account A, create an event and share it with B (test OTP `+15555550103`).
2. As account B, sign in and check the calendar — the event is there.
3. In the Supabase dashboard, confirm B has their own `events` row whose `from_event_id` is A's row id and `from_user_id` is A's account.
4. As account A, open the event, tap **Remove Event**, and confirm.
5. As account B, refresh the calendar.

**Expected**
- The event stays on B's calendar after A removes it — B owns their row, A's removal is purely personal.
- B's calendar entry survives A re-sharing chains too: if B re-shares to a third account and B then removes the event, the third account keeps it.
- On A's side the event disappears; in the dashboard A's `events` row and its `sends` rows are gone, while B's `events` row remains with `from_event_id` SET NULL (B keeps the field values; `from_user_id` still points at A while A's account exists).

---

### E-109 Share sheet shows completed shares, no unshare
**Steps**
1. As account A, open an event already shared with B, tap **Share**.
2. Observe B's row in the people list.
3. Try tapping B's row.

**Expected**
- B's row shows its delivery status ("✓ Shared" — see E-114), is muted, and does not toggle — sharing is a completed action and can't be unsent.
- The header action reads **Share** (not Done) and is disabled until at least one never-shared person is selected.
- Only newly selected people trigger notifications when sharing again.

---

### E-114 Share delivery status (success assumed; only failures surface)
**Steps**
1. As account A, create an event and share it with B (an app user). Reopen the event's share sheet.
2. Add a pending contact with an invalid real-format number (e.g. `+19999999999` — unassigned NANP, Twilio rejects it synchronously and no real phone is texted), share the event to them, and reopen the share sheet.
3. STOP path: do NOT reply STOP from a real device (it poisons the number account-wide). Instead, read the sends row's `sms_sid` (Management API query or the Supabase dashboard), then POST a signed callback to the twilio-status webhook — signature = base64 HMAC-SHA1(`TWILIO_AUTH_TOKEN`, the webhook URL (`$EXPO_PUBLIC_SUPABASE_URL` + `/functions/v1/twilio-status`) + sorted POST params concatenated key+value) sent as the `X-Twilio-Signature` header, form body `MessageSid=<sid>&MessageStatus=failed&ErrorCode=21610`. Reopen the share sheet.
4. Optionally, with a real mobile number that has NOT opted out: share to it and confirm the label stays "✓ Shared" even after the carrier's delivered callback lands (there is no delivered ladder — success is one word).

**Expected**
- Step 1: B shows "✓ Shared" — app users and SMS contacts are indistinguishable on success.
- Step 2: the invalid number shows "✕ Undelivered" in red (synchronous 21211 recorded at send time).
- Step 3: the row shows "✕ Unsubscribed" in red; an unsigned or wrongly-signed POST to the webhook is rejected (403).
- Step 4: the label never advances past "✓ Shared" on success (pull model — no realtime; failures surface on the next open).
- Pre-feature sends rows (NULL status) show "✓ Shared" like everything else that didn't fail.

---

### E-111 Notification on/off toggles gate push and SMS independently
**Steps**
1. As account B, open People → Settings gear → **Notifications** and turn **Text messages (SMS)** off; leave push on. Close the sheet, reopen it — the setting persists.
2. As account A, create an event and share it with B.
3. Confirm B's copy lands on B's calendar regardless, and B gets no SMS (push still allowed). The share's `send-notification` call reports `sms: 0` for B.
4. As B, turn SMS back on and turn **Push notifications** off.
5. As A, share another event with B.
6. Confirm B gets the SMS but no push.
7. Restore both toggles to on.

**Expected**
- Each channel is gated independently; both off means neither is sent.
- The event appears on B's calendar in every combination — the toggles only gate the pings.
- Toggling persists across reload/sign-in (stored on the `users` row), and a failed save reverts the switch with a short alert.

---

### E-112 Edits cascade to followers until a follower edits (Copy + Follow)
**Steps**
1. As account A, create an event and share it with B (`+15555550103`).
2. As A, edit the event's time and save.
3. As B, refocus/reload the calendar and open the event — B's row shows A's new time (no push/SMS fired by the edit).
4. As B, edit the event's title and save.
5. As A, edit the event again (another time change) and save.
6. As B, reload and reopen the event.

**Expected**
- Step 3: B's row silently carries A's correction (following).
- Step 4: B's save freezes B's row (any field-changing save ends following).
- Step 6: B's row still shows B's title and the step-2 time — A's second edit did not reach B.
- A's row is never affected by B's edit (cascades only walk downstream).

---

### E-113 Pending delivery stamps the sender's current values at sign-up
**Steps**
1. Temporarily add a third test OTP via the Management API (per AGENTS.md), e.g. `+15555550105`.
2. As account A, add that number to My People, create an event, and share it with them (no account exists yet).
3. As A, edit the event (change the title/time) and save.
4. Sign up as the new number (test OTP) and land on the calendar.
5. Remove the temporary test OTP via the Management API when done.

**Expected**
- The new account's calendar shows the event immediately, with the sender's CURRENT (post-edit) values — the pending copy is stamped from the sender's row as it is at sign-up.
- The row follows the sender (`from_event_id` = the sender's row): a later edit by A reaches it until the new account edits their own copy.

---

### E-115 Who's Coming — in-app yes/no and the asker's list
**Steps**
1. As account A, create an event and share it with B.
2. As B, open the event from the calendar — a reply block ("<name> asked — are you in?") shows above "Shared with". Tap **Yes**.
3. As A, open (or reopen) the event — "Shared with" shows B with "Yes".
4. As B, reopen the event and tap **No** (a flip), then tap **No** again (a same-answer re-tap).
5. As A, reload and reopen the event.
6. As A (self-created event check): create a second event and do not share it — open it.

**Expected**
- Step 2: the widget appears only because the row was received; answering records the answer and (on native, with push granted) A gets a "B said yes"-style push. Web fires the `send-response-notification` invoke but delivers no push. The tapped button spins while saving, then a "✓ Saved." line appears and stays until you leave the screen.
- Step 3: the answer is visible to the asker only — B never sees A's list; if B forwards to C, C's answer lands on B's "Shared with", not A's.
- Step 4: the flip updates the answer and pings A once; the re-tap round-trips but changes nothing and pings nobody (the RPC reports unchanged) — it re-asserts "✓ Saved.". Reopening the event shows the answer as the selected button with no "✓ Saved." line — a fresh visit shows state only.
- Step 5: A sees "No" (pull model — the list updates on open, not live).
- Step 6: a self-created event has no Yes/No block — there is nobody to reply to.
- Removing the event copy does not change the answer; deleting A's event removes the send (and the answer) entirely.

---

### E-116 Who's Coming — SMS receipt link
Both share-SMS variants (app-user and non-app) carry the `Coming? <link>` line while the secret is set (2026-08-31 — FEATURES.md → Coming Link in Every Share SMS). Reserved 555 numbers never reach Twilio, so the SMS body is not observable in this suite — its shape is pinned by `__tests__/edge-functions/smsBody.test.ts`. This scenario covers the receipt page the link opens, using a pending (non-app) contact.

**Steps**
1. Prereq: the `RESPONSE_LINK_BASE_URL` function secret is set (currently `https://events-reply.pages.dev`); without it the SMS carries no link and this test is limited to the API checks below.
2. As account A, add a pending contact with a reserved 555 number (no real SMS fires), create an event, and share it to them.
3. Read the send's `response_token` as A (dashboard SQL or REST: `sends?event_id=eq.<id>&select=response_token`), then open `https://events-reply.pages.dev/?t=<token>` in a browser.
4. The page loads ("<A's name> asked", title, date) — confirm the answer is still empty afterwards (GET is inert; this is the prefetch-safety check).
5. Tap **Yes**; reload the link; tap **No**.
6. As A, reopen the event's detail.
7. Open the page with a garbage token (`?t=<random uuid>`).

**Expected**
- Step 3/4: the page renders the question and records nothing on load.
- Step 5: the tapped button spins while saving, then the hint reads "Saved. You can change your answer anytime with this link." and stays; after a reload the answer is pressed with the plain hint (no "Saved." — nothing was saved this visit); re-tapping the selected button re-confirms against the server and re-asserts "Saved.". The same link shows and changes the answer later (last write wins).
- Step 6: "Shared with" shows the pending contact's "No".
- Step 7: a clear "this link doesn't work" state; the API answers 404.
- The page has no install CTA, no other people, and no link to the web app.
- Under the event details, the page shows two Add to Other Calendars links (2026-09-01 — FEATURES.md → Add to Other Calendars): "Add to Google Calendar" opens Google's pre-filled template (new tab), and "Apple / Outlook / Other (.ics)" downloads a valid iCalendar file (floating local time; timed → 1-hour block, no time → all-day; full description + listing URL in the body). Both are built client-side from the GET's fields — loading the page still writes nothing.
- Unsetting `RESPONSE_LINK_BASE_URL` removes the `Coming?` line from future share SMSes (both variants); the page and in-app answers keep working.

---

### E-117 Adjacent-month event dots
**Steps**
1. On the calendar, find a greyed overflow day from the previous or next month in the current grid (any month whose 1st isn't a Sunday shows previous-month days; any whose last day isn't a Saturday shows next-month days).
2. Create an event dated on that overflow day (`+` → set the date → Save → Cancel the share screen).
3. Back on the calendar (still showing the original month), inspect the overflow day cell.
4. Tap the overflow day.

**Expected**
- Step 3: the overflow day carries the same accent dot as in-month days with events — no navigation to that month needed. Overflow days without events stay unmarked.
- Step 4: the month flips to the tapped day and its events list immediately (no "Nothing on this day." flash).

---

### E-118 Add to Other Calendars (snapshot export)
The event detail screen has an "Add to calendar" row (label left, two icon buttons right — Google; paired Apple/Outlook) between the listing link and the reply/"Shared with" sections. The export is a one-shot snapshot: later in-app edits do not propagate to the external calendar (accepted behavior, FEATURES.md → Add to Other Calendars). Covered on web by `e2e/add-to-calendar.spec.ts`; this scenario is the human pass, including the native hand-offs e2e cannot reach.

**Steps**
1. Create an event with a title, a time, a description, and a listing URL. Open its detail.
2. Tap the Google button (web: new tab; native: the link opens in the browser/calendar app).
3. Tap the Apple/Outlook button. On web: an `.ics` downloads — open it. On iOS: Apple's pre-filled New Event sheet appears. On Android: the calendar app's new-event screen appears.
4. Repeat for an event with no time set.

**Expected**
- Step 2: Google's template opens pre-filled — title, the date, a 1-hour block at the event's time, and the full description + listing URL in the details. No sign-in or permission interstitial beyond Google's own.
- Step 3 web: the downloaded file imports cleanly into Apple Calendar/Outlook as one event with the same fields (timed → 1-hour block; floating local time — no timezone conversion). Re-importing the same file updates rather than duplicates in apps that dedupe by UID.
- Step 3 native: the pre-filled compose UI appears with title/date/time/notes — and **no permission prompt** on either platform (iOS EventKit UI and Android ACTION_INSERT are both user-in-the-loop). Dismissing the sheet saves nothing.
- Step 4: an all-day event in both formats (Google `dates=YYYYMMDD/next-day`; `.ics` `DTSTART;VALUE=DATE`).
- An untitled event exports as "Untitled event"; an event with no description/URL exports with no details body.
- The row uses secondary styling (never the accent), both targets are at least 44pt, and both carry accessibility labels ("Add to Google Calendar" / "Add to Apple, Outlook, or another calendar").

---

### E-119 Archive received events (reversible removal)
**Steps**
1. As account A, share an event dated today to account B. As B, open the received event's detail.
2. Confirm the destructive slot shows **Archive** (neutral styling, not red) and there is no Remove Event.
3. Tap **Archive** — no confirm dialog. The event is upcoming and unanswered, so the say-No prompt appears ("Taken off your calendar. Let A know you're not in?"). Tap **Not now**.
4. Back on B's calendar: the event is gone from its day, and an **Archived** link sits at the foot of the screen (below the day's list). Tap it.
5. On the Archived screen: the event is listed with its "From A" attribution. Tap **Restore**.
6. Back on the calendar, the event is back on its date; the Archived link is gone (assuming nothing else is archived).
7. Archive the event again, and this time tap **Tell A no** in the prompt.
8. As A, open the event and check "Shared with".
9. As B, navigate directly to the archived event's URL (`/event/<B's row id>`).
10. Share a second event to B dated in the PAST; as B, open it and tap **Archive**.

**Expected**
- Step 3: no confirm dialog; the prompt appears only because the event is upcoming and the answer is NULL (it would also appear for a Yes answer, with the copy "A still has you down as coming — change it to No?").
- Step 4-6: archive is confirm-less and fully reversible; the drawer orders upcoming nearest-first, then past most-recent-first; the link renders only while the archive is non-empty.
- Step 7-8: the asker's "Shared with" shows B's No (and A gets a push when the answer changed, per Who's Coming rules). The archive stands regardless of the answer write.
- Step 9: the archived event loads by id and its action slot shows **Restore** (push/deep links keep working).
- Step 10: no say-No prompt for a past event — it archives silently.
- Throughout: no notifications fire on archive or restore themselves, and A sees no change other than the answer.

---

## Pass Criteria

Manual suite passes when:
- All **Core** scenarios pass.
- Relevant **Extended** scenarios pass for impacted areas.
- Artifacts and report are attached to the run.
