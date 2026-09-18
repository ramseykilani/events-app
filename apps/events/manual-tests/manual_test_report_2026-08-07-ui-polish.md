# Manual Test Report — 2026-08-07 (UI/UX polish branch)

Filled after running `manual-tests/cloud_manual_regression.md` against the live Supabase project
(`ijmwtjyuvdnvhblwwtpt`) for the UI/UX polish branch.

## Run metadata
- Runner: Cursor cloud agent
- Date: 2026-08-07
- Branch: `cursor/ui-ux-polish-a3ae` (PR #7)
- Commit at test time: `5755bd7` (two temporary debug-instrumentation commits were added and removed
  during the run; the branch content at test time is identical to the final state)
- Environment:
  - `.env` present: yes (from injected `EXPO_PUBLIC_*` secrets)
  - Supabase reachable: yes
  - Expo web URL: http://localhost:8081
- Test account: A: `+15555550100` / `123456`

## Results

| Scenario | Status | Notes | Evidence |
|---|---|---|---|
| M-001 Sign-in validation | pass | Invalid phone `abc` → browser alert "Invalid phone number" | manual_regression_signin_to_calendar.mp4 |
| M-002 OTP verification and resend cooldown | pass | OTP 123456 signs in and routes to calendar. Resend cooldown not re-exercised this run (logic untouched by this branch; covered in the earlier 2026-08-07 report and jest) | manual_regression_signin_to_calendar.mp4 |
| M-003 Onboarding controls | skip | Needs a fresh zero-event account; onboarding logic untouched by this branch (fully covered in the earlier 2026-08-07 report). The `?` help button still opens the walkthrough (verified in jest) | — |
| M-004 Calendar shell and navigation | pass | People / + / Back navigation all work. Calendar empty day shows the new "Nothing on this day. / Add an event" state | manual_regression_signin_to_calendar.mp4, calendar_empty_state.webp |
| M-005 Add Event validation + share handoff | pass | Save disabled with empty fields; enabled after title; routes to share screen. Date picker still unsupported on web (pre-existing platform limitation) | manual_regression_add_event_share.mp4, add_event_disabled_save.webp |
| M-006 Share screen selection | pass (with note) | Selection enables Share; share succeeds; already-shared person renders "✓ Shared" non-togglable. NOTE: see Known issues — one flaky paint quirk observed | manual_regression_add_event_share.mp4, share_sheet_already_shared.webp |
| M-007 Event detail actions | pass | Detail shows date as "Fri, Aug 7" (new formatting), Back button returns to calendar, Edit → save shows updated title, Share reopens sheet | manual_regression_event_detail_people.mp4, event_detail_back_and_formatted_date.webp |
| E-101 People management | pass (partial) | People list and circle creation work ("Family" circle added; the "2 members" Family row in evidence is a pre-existing seeded circle, not a bug). Adding from device contacts unavailable on web (platform), same as prior run | manual_regression_event_detail_people.mp4, people_circle_created.webp |
| E-102 URL metadata autofill | skip | Not affected by this branch; covered in earlier report | — |
| E-103 Remove event | skip | Not affected by this branch; covered in earlier report | — |

## Branch-specific visual checks (new/changed states)

| Check | Status | Evidence |
|---|---|---|
| Calendar empty day state ("Nothing on this day." + "Add an event") | pass | calendar_empty_state.webp |
| Human date formatting ("Fri, Aug 7") on event card and event detail | pass | calendar_event_card_formatted_date.webp, event_detail_back_and_formatted_date.webp |
| Save disabled state on add-event | pass | add_event_disabled_save.webp |
| Share sheet "✓ Shared" completed state | pass | share_sheet_already_shared.webp |
| PeoplePicker disabled Add / name+phone rows / loading spinner | pass (jest) | __tests__/components/PeoplePicker.test.tsx |
| edit-event load-failure Retry/Back state, session-load spinner, verify safety reset | pass (jest + code) | not visually reproducible without induced network failure |

## Known issues

1. **Flaky first-mount text paint on web (observed once, not reproduced).** In one long-lived browser
   session, the share screen's people names and the event detail's "Back" label failed to paint on the
   screen's first mount (rows were tappable and functional; text appeared on revisit). A clean
   hard-reload reproduction attempt showed everything painting correctly, and DOM instrumentation
   confirmed data, theme, and computed styles are correct at mount. Assessed as a cosmetic,
   web-only rasterization quirk in the navigation transition layer (react-native-screens /
   react-native-web), not an app logic bug and not a regression from this branch (same components
   behave identically on master). Deliberately not root-caused further — not worth the cost for a
   self-healing cosmetic issue on a non-target platform. If it recurs, the instrumentation approach
   (post-paint DOM probes + artificial data-delay knobs) is documented in the PR conversation.
2. Web platform limitations unchanged from prior report: no contacts API (E-101 partial), no
   DateTimePicker (M-005 note), no push tokens, sign-out only via `localStorage.clear()`.

## Summary
- Overall result: **PASS** — all core scenarios pass; skips are platform limitations or areas this
  branch doesn't touch (covered by the earlier 2026-08-07 report).
- Known blockers: none new.
- Follow-up actions:
  - If the first-mount paint quirk recurs on web, root-cause it then (approach documented above).
  - Deferred from the review: spacing/typography design tokens, icon swap for text glyphs.
