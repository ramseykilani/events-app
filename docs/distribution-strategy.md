# Distribution Strategy

Decided 2026-08-09. This doc captures how the app reaches people, why the web build is no longer a user surface, and what the notification SMS does and doesn't do. `docs/events-technical-architecture.md` remains the source of truth for how the app behaves; this doc is the source of truth for how people *get* it.

## The strategy

**The native app is the product. The web app is infrastructure.**

- The web build (`https://shared-events.pages.dev` / staging preview) stays deployed as the dev, staging, and CI surface — the entire automated test harness runs against it. It is not promoted to users and no flow directs anyone to it.
- Beta distribution happens through the stores' testing tracks: **TestFlight internal testing** on iOS and **Play internal testing** on Android, each supporting ~100 testers with no review (verified 2026-08-09).
- Success gate: roughly 100 testers per platform, or ~50 people using it regularly, is the signal to get serious about external TestFlight, a Play closed track, and eventually production listings.

## Why the web app was demoted

The recipient side of web always worked (SMS → sign in → event on your calendar). The sharer side didn't: there is no contacts API in any iOS browser context (tab or installed PWA), so a new web user — and anyone landing on web is almost by definition a new user — hits the worst version of the add-people flow at the exact moment of highest intent. First impressions are one-shot: a user who opens the app and hits a dead end is lost, and losing early users is how the app never gets to "forced to come back." The cost of that bad impression exceeds the acquisition convenience of "no install."

Considered and rejected as fixes (details in FEATURES.md → Web Support): Contact Picker API (web-only), PWA install prompts (installing unlocks no contacts capability on any platform — can't be honestly pitched as fixing add-people), shareable event invite links (duplicates the group-chat behavior the app replaces, with extra steps), bulk contact paste (target users don't maintain lists).

## The SMS is the artifact

Notification SMS carries **no app or web links at all** — only the event details and the event's own original URL when one exists (that's event content, not app promo):

- Non-app recipients: `"{sharer} added you to {title} on {date} · {time}\n{event URL}\n\nReply STOP to unsubscribe."` — a pure notification. They are deliberately *not* pulled into the web app.
- App users: push notification (tappable, deep-links to the event) plus the same link-free SMS as backup.

Rationale: the message's job is to notify, not to acquire. Links from unfamiliar senders also read as spam to carrier filters. When the app is listed on the stores, store links may return as the non-app CTA — that's a one-function change in `send-notification` and should happen as part of launch, not before.

Consequence to remember: with no links, there is nothing for universal links / App Links to upgrade, so AASA/assetlinks work is off the table until launch.

## Platform facts (verified 2026-08-09)

**TestFlight (iOS):**
- Internal testing: up to 100 App Store Connect users, no review, builds available minutes after upload. Internal testers must hold a role on the App Store Connect team.
- External testing: up to 10,000 via email or public link; the first build of each version requires a Beta App Review (typically ~24–48h).
- Builds expire 90 days after upload — long betas need periodic rebuilds.
- Requires an Apple Developer Program membership ($99/yr); activation can take 1–2+ days.

**Google Play (Android):**
- Internal testing track: up to ~100 testers, no review, available within seconds of upload.
- Personal developer accounts created after 2023-11-13 must run a *closed* test with ≥12 testers opted in for 14 continuous days before production access unlocks. Internal testing does not count toward this; it gates production only, not beta distribution.
- Play Console app setup (privacy policy URL at `/privacy.html`, data-safety form, content-rating questionnaire, App access) is required for a **closed test or production listing**, not for internal testing. Current enrollment is in `STATUS.md`.
- Requires a Play Console account ($25 one-time); identity verification completed 2026-08-15.

## Owner critical path (updated 2026-08-15)

1. ~~Enroll in the Apple Developer Program and create the Play Console account~~ — Apple active 2026-08-12; Play identity verification complete 2026-08-15. App records, service account, ASC API key, and submit secrets are in (`STATUS.md`).
2. Android preview APK — first build `3c0f99e5` crashed at launch; replacement `5f477380` launches (2026-08-15). Full `manual-tests/native_device_smoke.md` checklist is still outstanding.
3. **After that checklist:** production Android AAB → Play internal track, then invite ~3 friends (talk first; owner shares the opt-in link — Play does not email). First iPhone testers via **internal** TestFlight (Marketing role on the ASC team → group **Team (Expo)**; no Beta App Review). Closed-test / store-listing forms (data safety, content rating, reviewer sign-in) wait until then.
