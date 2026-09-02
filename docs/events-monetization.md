# Events — Monetization

Decided 2026-09-02. This doc is the source of truth for how the app makes money — and how it refuses to. `docs/events-philosophy.md` is still the values; this is the business shape those values now allow. **Do not implement a paywall, IAP, or SMS billing from this document.** Timing is an open owner question. Internal testers should meet the product, not a charge.

## The business

Events is a **cash-cow / owner-distribution** business, not a startup.

- Cover the real cost of the product (SMS, infra) plus a small markup.
- Surplus leaves the company (owner distributions) to fund other ventures. It is not reinvested here to grow users, invent new monetization, or build an empire.
- The app does not need to grow to work (`docs/events-product.md`). A sustainable tool that serves the people who already use it is the whole ambition.

This replaces the 2026 philosophy line “We are not trying to make money,” which protected the product from extraction but left the carrier bill unnamed. Sharing still costs Twilio (or whoever sends the A2P texts). Someone pays that. The model is *who*, and *how we do not become a platform in the process*.

## What people pay for

**Annual subscription to share in the app. Receive stays free.**

- Calendar, incoming events, Who's Coming answers (in-app and the SMS receipt page) stay free forever.
- Without a subscription you cannot share. You can still use the app.
- The people who get the real value-add — sharing is easier than texting 15 people individually — are the people who pay.
- **Flat rate, not per-send and not per-SMS.** People already have unlimited texting; itemizing postage trains them back to Messages. SMS is included in the share subscription.
- Light users subsidizing heavy users is accepted. The 50-person cap already bounds the tail; nobody can run a venue through a personal list.
- **Annual, not month-to-month.** A monthly charge is a relationship (“was this worth it this month?”). An annual charge is a utility. Monthly, if it exists at all, is a worse-value option, not the default.

Price, store cut (Apple/Google IAP), and the exact gate UX are not designed. When it ships, the gate is “can you send,” not “can you be here,” so the one-friend bootstrap still works for recipients.

## What we refuse

Even if lucrative. These rewrite the product:

- Per-use / postage billing (a meter on each share or each SMS).
- Ads, sponsored events, or anything on the calendar that isn’t from a person you chose.
- Paying to raise the 50-person cap (that cap is how influencer dynamics stay dead).
- Paywalling receive, Who's Coming, or the notification SMS itself.
- Affiliate-wrapping listing URLs, especially inside SMS, or a ticket take-rate as the plan.
- A venue / promoter blast product inside this app (that would be a different app with a different philosophy).
- Visible “texts remaining” scarcity UI.
- Reinvesting surplus into growth features or new monetization surfaces.

## SMS is the unit cost (not a product to sell)

Every in-app share can fire A2P SMS. That is the P&L. Approximate US long-code all-in (2026): Twilio about `$0.012–0.013` per *segment* (published `$0.0083` plus carrier pass-through ~`$0.0035–0.0045`). Telnyx/Bandwidth list about `$0.004` plus the same carrier fees — on the order of **30% off the CPaaS markup**, not an order of magnitude. Carrier fees are the floor; grey routes that “beat” them get filtered. RCS is not cheaper. Volume contracts do not matter at this app’s 50-person cap.

A share SMS with title, date, venue, listing URL, Coming link, and STOP is often **2–4 segments**. The 50-person cap and “one share = one notice” (no reminders, no text blasts) keep a typical share much cheaper than a Partiful-style funnel.

**Now:** ignore this. Internal-tester volume is a hobby bill.

**Later, as maintenance on the cash-cow — not a growth roadmap:**

1. Send fewer: don’t SMS people whose push already landed; default SMS to non-app recipients. The existing `notify_sms` toggle is the recipient-side hatch.
2. Send shorter: URLs are what turn a notice into several segments.
3. Switch CPaaS (Telnyx/Bandwidth or equivalent) when the bill is large enough that ~30% off is worth the ops.

Do not add Partiful-style reminder texts or blasts. That is how their SMS bill became “insane.”

## Partiful (why it isn’t the template)

Partiful’s core loop still feels free to guests and hosts. That is not proof A2P can be free. They send **from a Partiful number** — invite, reminder, text blasts — on Android and iOS alike. Hosts do not send those from their own unlimited plan; “copy the event link and text it yourself” is an overflow path in their docs, not how hosting feels. Third-party apps cannot send as you in iMessage.

They could burn that money because venture covered it for years, they cap some of the worst of it (phone-invite and blast limits), people already on the app can get a push, and as of June 2026 they take a fee on **paid tickets** plus optional premium invite designs. That is a host/ticketing business. Events is a 50-person personal calendar. Copying their funnel (invite + reminder + blasts) would copy their bill. Copying their ticketing take-rate would copy a different product.

## Open (owner)

- **When** to introduce the subscription. Not during internal testing; not until the owner says.
- Price (sticker vs. money after store cut).
- Annual-only vs. a worse-value monthly option.
- Whether creating an event for yourself without sharing stays free (the decided gate is share, not presence).
- Exact gate UX (when in the share flow the ask appears).

Until those are decided, sharing stays free and this file is a constraint on future work, not a spec to build from.
