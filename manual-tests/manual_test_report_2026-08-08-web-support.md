# Manual Test Report — Web Support (manual add person, web date/time)

## Run metadata
- Runner: Cursor cloud agent (computer-use)
- Date: 2026-08-08
- Branch: cursor/web-support-start-fcd0
- Commit: 6a3134b
- Environment:
  - `.env` present: yes
  - Supabase reachable: yes
  - Expo web URL: http://localhost:8081

## Scope

Targeted web regression for the Web Support feature (FEATURES.md items 1–2), plus core sanity. Run in the browser (Chrome on Linux) against the Expo web dev server.

## Results

| Scenario | Status (pass/fail/skip) | Notes | Evidence |
|---|---|---|---|
| M-004 Calendar shell and navigation | pass | People / + / Back all work, no crashes | web_support_manual_regression.mp4 |
| M-005 Add Event validation + share handoff | pass | Save disabled when title+URL empty; valid save routes to share | web_add_event_save_disabled.png |
| Web: manual add person (new) | pass | Add opens manual form directly on web (no contacts dialog); name+phone normalized to E.164 and appears in list | web_manual_add_person.png |
| Web: HTML date/time inputs (new) | pass | Date + time are real HTML inputs; date picked via calendar picker commits correctly (08/20/2026, no year bug) | web_add_event_datetime.png, web_date_picker_commit.png |
| Web: created event lands on calendar | pass | Event created via web date input appears on the correct day (Aug 20, 2026) | web_calendar_aug2026.png |
| M-001–M-003, M-006–M-007, E-101–E-103 | skip | Not impacted by this change; covered by Jest + prior regressions | — |

## Summary
- Overall result: PASS
- Known blockers: none for this change. Production web deploy (hosting provider + domain) and one real-SMS verification remain open per FEATURES.md.
- Follow-up actions: deploy updated `send-notification` edge function; set `WEB_APP_URL` when the web build is hosted.
- Note: the first pass surfaced an apparent "date shows 1906" reading — verified to be mid-typing partial input in the agent's screenshot, not a bug; a picker-based commit lands the correct date.
