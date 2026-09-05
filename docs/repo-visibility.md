# Repo visibility: public, all rights reserved

**Decision (owner, 2026-09-05):** this repository stays **public**, and it is **not open source**. `LICENSE` reserves all rights — the code may be viewed (and forked on GitHub, as GitHub's Terms of Service require for public repos), but no permission is granted to copy, modify, distribute, or reuse it.

## Why public

- **The code is not the moat**, so secrecy buys nothing (see below).
- **GitHub's free tier is better for public repos.** Branch protection/rulesets — the release gate that makes untested code physically unable to ship — plus the insights graphs and unmetered Actions minutes are all free only while the repo is public. Private on the free tier loses all three and caps CI at 2,000 Actions minutes/month (this repo's full suite runs ~200 workflow runs/month); private with those features restored is GitHub Pro at $4/month.
- **Transparency is worth something.** The architecture, the design language, and the reasoning behind product decisions are all here for anyone curious.

## Why not open source

This is a business the owner intends to keep owning. The code was largely written by agents, but "cheap to produce" is not "free to take". No license is granted, and none should be added without an explicit owner decision.

## Why copying this is a bad deal anyway

Honest arithmetic for anyone thinking about cloning the product:

- **The margins are deliberately thin.** There is no large prize here unless the network takes off — and if it does, the winner is whoever has the users, not whoever has the code.
- **The expensive parts are not in this repo.** Twilio costs real money every month. A2P 10DLC campaign registration takes days plus fees. App Store Connect and Play enrollment, SMS deliverability reputation, and the operational knowledge behind the runbooks — none of that arrives with `git clone`.
- **The part that does clone was the cheap part.** Engineering cost here was near zero. Copying the code saves you only the part that cost us nothing; you still pay everything above.

So: read it, learn from it, criticise it. If you want this product to exist differently, have your own agents build your own version — copyright covers this code, not the idea. Good luck, have fun.

## Operational consequences

- **No secrets in the tree, ever.** The Supabase anon key is public by design (it ships in the app binary); RLS is the security boundary, and the SQL semantics suite keeps it honest.
- **The e2e test OTP is a real credential.** It was documented in this repo until 2026-09-05, when it was rotated and moved into the `E2E_TEST_OTP` secret (GitHub repo secrets for CI, Cursor secrets for cloud agents, `.env` locally). Never write it into the tree again.
- **Revisit trigger:** real traction or revenue → reconsider going private (GitHub Pro, $4/month, restores branch protection and insights on private repos). Free-tier private is strictly worse than public for this repo.
