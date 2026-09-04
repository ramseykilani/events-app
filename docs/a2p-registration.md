# A2P 10DLC Registration (Twilio)

Operational playbook for the US messaging registration. Live state table:
`STATUS.md` → A2P 10DLC registration. Product context: `FEATURES.md` → US
Phone Numbers.

## Why this exists

US carriers require every application-to-person sender to be registered
(brand + campaign, via The Campaign Registry). Unregistered traffic from a US
long code is hard-blocked at the carrier edge (error `30034`). Canadian
carriers run no equivalent filter — which is why the 2026-08-17 diagnosis
showed **0 of 5 US-bound real SMS delivered (all `30034`) vs 39 of 39
Canadian-bound delivered**. Both SMS legs (Supabase Auth OTP and
`send-notification` share texts) go out from the same sender, so both fail
for US recipients until a campaign is approved.

## The pieces

- **Sender:** `+15709385240` (US 10DLC long code), the sole number in
  Messaging Service **"Events"** (`MG977e4096e94f84bee689c40c8537d554`).
- **Brand:** `BN31e431b9c89ca30bb4ed785cadc2e1bd` (TCR ID `B40R7D7`) — Sole
  Proprietor, registered on the owner's personal details (no business/EIN).
  APPROVED 2026-08-17, identity VERIFIED the same day (see OTP section).
- **Campaign:** `QE2c6890da8086d771620e9b13fadeba0b` — attached to the
  "Events" service. Submitted 2026-08-19, **rejected** (see Resubmission).
- **Trust Hub profiles (the console shows several — only one matters):** the
  brand rides on the bundle the A2P wizard created on 2026-08-17
  (`BUb8fd26b3e0e4f45002db0d601d348273`, linked customer profile
  `BUf377678ac949818cb71c78f10bc939c5` "My first Twilio account"). The profile
  named **"My Starter Profile" (`BU5ad001ea04af4d02c801a66202421520`) is a
  stale 2026-02-16 submission that sat `in-review` for six months** despite a
  fully compliant automated evaluation — nothing uses it. Ignore it, or
  delete it in the console if it keeps confusing.

## Operations

All via the Twilio REST API with the account credentials (cloud agents have
`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` injected as secrets).

### Check brand / campaign status

```bash
curl -s -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  https://messaging.twilio.com/v1/a2p/BrandRegistrations/BN31e431b9c89ca30bb4ed785cadc2e1bd
# → .status (APPROVED) and .identity_status (VERIFIED)

curl -s -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  "https://messaging.twilio.com/v1/Services/MG977e4096e94f84bee689c40c8537d554/Compliance/Usa2p"
# → .compliance[0].campaign_status, and .compliance[0].errors on rejection
```

### Delivery / error scan (what is actually happening to our texts)

`GET https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json?DateSent%3E=YYYY-MM-DD&PageSize=1000`
and tally `status` / `error_code`. Codes we've met: `21211` invalid To
(fictional 555 test numbers — expected; see AGENTS.md → Signing in), `30034`
unregistered 10DLC (the US block), `30006` landline. The console's
messaging-health score is advisory only — Twilio does not suspend accounts
over it; enforcement is carrier filtering (what registration fixes) and
Trust & Safety action on spam complaints (our traffic pattern has none).

### Brand OTP verification — the Canadian-number problem

Sole-prop brand verification texts ("Please confirm your registration for US
A2P Messaging by replying YES") come from **`+1-915-278-2000`** and never
reached the owner's Canadian mobile across three sends (2026-08-17) — likely
carrier filtering of that sender. **What worked: texting `YES` to
`+1-915-278-2000` proactively.** Verification matches the inbound reply, not
receipt of the outbound message; `identity_status` flipped to VERIFIED within
a minute.

- Resend endpoint (same as the console's resend button):
  `POST https://messaging.twilio.com/v1/a2p/BrandRegistrations/{brandSid}/SmsOtp`
- Each OTP is valid 24h and re-triggerable. TCR may mark a brand EXPIRED if
  verification is incomplete after 30 days — then the brand must be deleted
  and resubmitted.

## The sync rule

Registered content must match what we actually send. Before any material SMS
template change ships (`supabase/functions/send-notification/index.ts`, the
Supabase Auth SMS template), update the campaign description/samples in the
console. Recorded instances: `FEATURES.md` → Web Support rejected list (app
links in SMS) and → SMS Links at Launch (store/event links at launch change
message content — update the campaign then). **Known drift right now:** the
2026-09-03 invite-line change (share SMS now points at the beta signup form)
postdates the submitted sample 2 — refresh the sample at resubmission.

## Registered content (2026-08-19 submission, as advised — the owner may have adjusted in the form)

- **Description:** "Ramsey Kilani operates the Shared Events app, which sends
  transactional SMS only: (1) sign-in verification codes to users who enter
  their own phone number to log in, and (2) a one-time event notification
  when a signed-in user shares an event to a specific phone number they
  choose. No marketing messages." (Must name the registered brand — the
  checker string-matches it.)
- **Consent / message flow:** in-app opt-in for sign-in codes (the recipient
  enters their own number at the sign-in screen — evidence link
  `https://shared-events.pages.dev/`); person-to-person initiation for share
  notifications (one-time, STOP honored). Opt-in checkboxes: **Other** only —
  never "Via Text" (we have no text-to-join flow; checking it triggers a
  keyword-evidence demand).
- **Sample 1:** `Your Events code: 123456`
- **Sample 2:** the production share text with the brand name in the sharer
  slot ("Ramsey Kilani wants to go to \"Rooftop Cinema night\" with you …"
  + date + event URL + invite line + "Reply STOP to unsubscribe.")
- **Opt-out:** "You have been unsubscribed from Shared Events messages and
  will receive no further messages. Reply START to resubscribe."
  **Help:** "Shared Events notifications. Reply STOP to unsubscribe.
  Support: kilani.ramsey@gmail.com"
- Embedded links: **Yes** (the event's own listing URL — user-supplied; we
  never link our own site/app). Embedded phone numbers: No. Age-gated /
  direct lending: No.
- Links: privacy `https://shared-events.pages.dev/privacy`, terms
  `https://shared-events.pages.dev/terms` (both carry the required SMS
  disclosures since 2026-08-19).

## Resubmission (pending)

The 2026-08-19 rejection — TCR `30909`, field `MESSAGE_FLOW`: "issues
verifying the Call to Action (CTA) provided for the campaign" — means the
reviewer opened the opt-in evidence (the app sign-in screen at
https://shared-events.pages.dev/) and found no explicit statement that
entering your number agrees to receiving texts. Options discussed with the
owner 2026-08-19: (1) a consent line on the sign-in screen — strongest, and
exactly what the reviewer asked for; (2) sharper consent-field wording only;
(3) resubmit unchanged. The owner chose (3); the rejection settled the
question — resubmission needs (1) or equivalent public CTA language. Note
that option (1) covers only the sign-in leg; share-notification recipients
never pass any screen (person-to-person initiation is the registered story
for that leg). **Owner decision on the consent copy pending (2026-09-04).**

## History

- 2026-02-16: account, number, messaging service created; starter profile
  submitted and stuck `in-review` permanently (never used).
- 2026-08-17: diagnosis (0/5 US vs 39/39 CA; ~95% of all failures were e2e
  test-number sends, `21211` — fixed by once-per-run e2e sign-in, later
  eliminated by password-grant sign-in 2026-08-28). Brand registered and
  OTP-verified (YES-reply workaround).
- 2026-08-19: campaign submitted; rejected same day (`30909`, CTA evidence).
- 2026-09-04: rejection surfaced on an API re-check; this doc written.
