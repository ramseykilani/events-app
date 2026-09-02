# Affiliate Programs — Provider Record & Setup Runbook

Decided 2026-09-02 (second monetization discussion, same day as `docs/events-monetization.md`). This doc is the monetization-side record for event providers: which have affiliate programs, what they pay, what's been set up, and what's left. The parsing/autofill side of the same providers lives in `docs/link-autofill-provider-matrix.md` — hostname coverage here derives from that matrix. The business model this serves (and its refusal list) lives in `docs/events-monetization.md`; the build spec is `FEATURES.md` → Affiliate Link Tagging (**Implemented 2026-09-02, shipped dark** — the registry is empty and the global switch is off until programs are approved; see [The switch](#the-switch)).

**If the owner asks "what's next for affiliate setup?"** — read the [status table](#provider-status). The topmost row that is `research needed` or `not applied` in priority order is the answer. Agent-doable and owner-only steps are marked in the [setup process](#setup-process).

## The model in one paragraph

When a user taps an event's listing link — on the event detail screen in the app, or on the Who's Coming receipt page — the URL is rewritten to the provider's affiliate/deep-link form **for providers with a live program in the status table below**. Same provider, same destination page; the tag only adds attribution. Providers without a live program pass through byte-identical. The share SMS is never touched. The feature is passive: no surface changes, no ranking, nothing promoted — the calendar still shows only what your people chose.

## The boundaries (permanent)

These are the rules that keep the money from becoming a stake. They are part of the model, not negotiable packaging:

- **Same-provider only.** The tagged link opens the same page on the same provider the sharer pasted. Never substitute a different, higher-paying provider. Never prefer one provider over another anywhere in the product.
- **Never in SMS.** The share text is the one message that must arrive; links from unfamiliar senders read as spam to carrier filters, and the A2P campaign is documented fragility (`docs/distribution-strategy.md`). Taggable surfaces are the in-app tap and the receipt page only.
- **Aggregators pass through.** Playbill's buy button is already an affiliate hop (see the matrix) — never double-wrap someone else's link.
- **Disclosure at ship.** `public/privacy.html` gains one line: outbound ticket links may earn a commission.
- **No promoted events, no discovery surface, no take-rate.** We never sell tickets and never touch the money; the full refusal list is in `docs/events-monetization.md`.

## Setup process

| Step | Owner or agent | What happens |
|---|---|---|
| 0. Impact publisher account | **Owner only** | Sign up at impact.com as a publisher. Requires legal name, tax form (W-9), and payout details — an agent cannot do this. One account hosts most programs below. |
| 1. Program applications | Owner-submitted, agent-prepped | Apply to programs in priority order (table below). Applications ask about the app and audience; an agent can draft the answers (one honest paragraph: personal event-sharing app, beta, outbound listing taps) — the owner reviews and submits, because applications carry legal attestations. A pre-launch app may need to explain itself; the landing page plus that paragraph usually suffices. Approval takes days to weeks. |
| 2. Record + capture tag format | Agent | On approval, flip the status table row to `approved` and record the program's exact deep-link/tag URL format (Impact exposes per-program tracking-link builders; the format differs per program). |
| 3. Build the tagging feature | Agent | **Done 2026-09-02** — `FEATURES.md` → Affiliate Link Tagging. Shipped dark: everything passes through untouched until a program row is activated. |
| 4. Activate a program | Agent | One SQL insert + the global flip — see [The switch](#the-switch). Then flip the status table row to `live`. |
| 5. Measure | Agent | Coverage ratio = network-reported revenue ÷ Twilio spend, both from dashboards — no client-side analytics, ever. See [Measurement](#measurement). |

Optional later: FlexOffers or Skimlinks accounts for programs Impact doesn't carry (Skimlinks approves once for many merchants — useful for the long tail). Same owner-only account step applies.

## The switch

The tagging feature is live in the code but dark: two registry tables (migration `20260902000001_affiliate_programs`) decide what gets tagged, and both ship inert. They are world-readable (the app and the `send-response` function read them) and writable only via the service role.

- `affiliate_config` — the single-row global switch. `enabled = false` means every URL on every surface passes through byte-identical, no matter what the program rows say. This is the strip lever: one update turns the whole feature off everywhere.
- `affiliate_programs` — one row per program: `id` (a slug), `domains` (the registered domains the program covers — list regional TLDs explicitly, e.g. `ticketmaster.co.uk`; matching is host-equals-or-subdomain), `url_template` (the network's tracking-link format with `{url}` where the percent-encoded destination goes — covers both redirect-wrap and query-param formats), `enabled`.

**Activating a program is one SQL statement** (run against the project with the service role, e.g. via the SQL editor or `psql`):

```sql
INSERT INTO public.affiliate_programs (id, domains, url_template, enabled) VALUES
  ('ticketmaster', '{ticketmaster.com,ticketmaster.co.uk,livenation.com,admission.com}',
   'https://<network-tracking-host>/click?u={url}', true);
-- and on the first activation only, flip the global switch:
UPDATE public.affiliate_config SET enabled = true WHERE id = true;
```

No deploy, no app release: the `send-response` function reads the registry per request, and the app's registry cache is stale after five minutes. Turning a single program off is `UPDATE affiliate_programs SET enabled = false WHERE id = '...'`; turning everything off is the global flip. The `url_template` comes from the network's per-program link builder at approval time (setup step 2) — paste it with `{url}` in place of the destination. Whenever a row changes, update the [status table](#provider-status) to match: the tables are the machine-readable truth, the table below is the human record.

## Provider status

Rates verified by web research **2026-09-02**; they drift — re-verify before quoting them to the owner. Priority reflects likely paste volume (matrix evidence) × rate.

| Priority | Provider | Program | Rate (2026-09-02) | Cookie | Network | Status |
|---|---|---|---|---|---|---|
| 1 | Ticketmaster — also covers `livenation.com` + `admission.com` (same inventory/ids, per the matrix); program materials also list Ticketweb, Universe, Front Gate | Global Affiliate Program | ~1% of sale (varies by category/region, reports up to 5%) | 30 days | Impact | not applied |
| 2 | Eventbrite | Affiliate program | Impact: 1–5% of paid order. FlexOffers: flat ~$8/sale. (Either/or — compare EPC: $0.03 vs $0.08 reported) | 30 days | Impact or FlexOffers | not applied |
| 3 | StubHub | Affiliate program | 9–11% (Impact), 8% (FlexOffers), 9.9% (Skimlinks); avg basket $296–396 | 27–30 days | Impact / FlexOffers / Skimlinks | not applied |
| 4 | Vivid Seats | Affiliate program | ~6% | 30 days | network-listed | not applied |
| 5 | SeatGeek | Affiliate program | ~1% | 30 days | network-listed | not applied |
| 6 | TicketNetwork | Affiliate program | 12.5% headline (6% for ticket-comparison sites); ~$350 AOV | 30–45 days | preferred networks only | research needed |
| 7 | Ticket Liquidator / Event Tickets Center | Affiliate programs | 10% / 3% | 30 / 14 days | network-listed | research needed |
| 8 | The tail: TodayTix, Fever, Dice, AXS, See Tickets, Etix, Eventim, Skiddle, Tixel, TickPick, Gametime, Showpass, Telecharge, Broadway.com, Airbnb Experiences | unknown | unknown | — | — | research needed |

**No program / not applicable** (pass through untouched — this is the default, not a gap): Facebook Events, Meetup, Luma, Partiful, Mobilizon, Evite, Punchbowl, Paperless Post, Songkick (no program found), and the aggregators (EDM Train, 19hz, Playbill — see the boundaries). Most of the matrix's 82 providers will never have a program; that is expected.

## Research runbook (for "research needed" rows)

1. Search `"<provider>" affiliate program commission <current year>` and check the networks' marketplaces (Impact: Brands search; FlexOffers/Skimlinks advertiser directories).
2. Record: program exists?, network, rate, cookie, payout threshold, signup URL — and any terms that disqualify us (some programs reject apps or loyalty/redirect models).
3. Update the row and the changelog. If no program exists, mark `none found` so the next agent doesn't redo the search.

## Measurement

- **The metric is the ratio, not the dollars:** affiliate revenue ÷ Twilio SMS spend. The ratio is roughly scale-invariant, so the ~200-tester internal window answers the 1,000-user question — if you compute the ratio and don't just look at absolute dollars.
- **Noise warning:** at tester scale, monthly affiliate revenue is single-to-low-double digits and lumpy — one StubHub order (~$27 commission) can swing a month. Judge over months or a few hundred tagged taps, never one week.
- **Dashboards, not cash:** $50 payout minimums mean real money arrives late; the network dashboard's accrued revenue is the decision signal.
- **No client-side analytics.** Clicks and revenue come from the network; SMS volume is already countable server-side from `sends` rows. Nothing about this feature adds tracking to the app.
- When the experiment has a verdict, the decision tree in `docs/events-monetization.md` applies (free / gap-filling subscription / $20 share subscription).

## Changelog

- **2026-09-02** — Doc created from the second monetization discussion. Initial rates researched (Ticketmaster, Eventbrite, StubHub, Vivid Seats, SeatGeek verified; tail marked research needed). Nothing applied for yet; step zero (Impact account) is the owner's.
