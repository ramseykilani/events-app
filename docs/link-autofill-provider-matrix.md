# Link Autofill Provider Matrix

Which event providers a pasted link can actually be autofilled from, and how. This is the evidence base for [Richer Link Autofill](../FEATURES.md#richer-link-autofill) — the feature spec lives in FEATURES.md; this doc is the provider-by-provider record plus the runbook for keeping it current.

**Snapshot:** 2026-09-01 — every row verified by fetching a live event page from a datacenter IP (this repo's cloud-agent VM) with the same request shape `og-metadata` uses. See [How to re-verify](#how-to-re-verify).

**Why staleness is benign:** the fetch is fail-open. If a provider changes its markup or bot wall after the snapshot, autofill for that provider degrades to (or upgrades from) "URL stored, type the rest" — no event breaks. The Jest fixtures pin *our parser*; this matrix pins *reality*; the ~6-month sweep reconciles them.

## Buckets

- **Layer 1 (JSON-LD)** — a plain GET returns HTML containing an `application/ld+json` block with an Event-family `@type` and a `startDate`. Title, date/time, location, and image autofill.
- **API-covered (Layer 2)** — HTML is blocked, but an API path fills the same fields. Ticketmaster Discovery is official and documented; Resident Advisor's GraphQL is the single owner-approved unofficial exception.
- **Partial (OG only)** — the page serves `og:title`/`og:image` but no Event JSON-LD, so title/image autofill today; date/time/location stay manual.
- **Aggregator** — a listings site whose value is outbound links to ticketing providers; users paste the provider's link, which this matrix covers.
- **URL-only** — blocked (403/406/429/challenge/login wall/JS shell). The URL is stored; everything else is typed.

## Summary (82 providers, 2026-09-01)

| Bucket | Count |
|---|---|
| Layer 1 (JSON-LD) | 26 |
| API-covered (Layer 2) | 3 |
| Partial (OG only) | 13 |
| Aggregator | 3 |
| URL-only | 37 |

## Layer 1 — JSON-LD works (26)

startDate flavor legend: **offset** = local time with UTC offset (`-04:00`); **offset-nc** = offset without colon (`-0400`); **floating** = local time, no offset; **utc** = UTC (`Z` / `+00:00`); **date-only** = date with no time.

| Provider | Verified event URL | JSON-LD @type | startDate flavor | Location in markup |
|---|---|---|---|---|
| Eventbrite | eventbrite.com/e/brooklyn-tech-expo-fall4ai-edition-oct-6-2026-tickets-1989878874279 | BusinessEvent | offset | Place + PostalAddress |
| Meetup | meetup.com/a11ynyc/events/315708657 | Event | offset | Place + PostalAddress |
| Luma | luma.com/agkeb9m8 | Event | offset | Place + PostalAddress + geo |
| Partiful | partiful.com/e/00lCNE0K8F7YmUBXG00R | Event | utc (IANA tz in `__NEXT_DATA__`) | Place |
| Dice | dice.fm/event/923w2n-higher-…-signal-new-york-city-tickets | MusicEvent | offset | Place + address + geo |
| Ticketweb | ticketweb.ca/event/afrojack-dprtmnt-tickets/14265004 | Event | floating | location block |
| The Ticket Fairy | ticketfairy.com/event/ceremonia-jungle-5sep2026 | Event | offset | Place + PostalAddress |
| ShowClix | showclix.com/event/under-the-big-sky-festival-2026 | Event | offset-nc | Place + PostalAddress |
| Prekindle | prekindle.com/event/81959-temples-…-austin | MusicEvent | date-only | Place + address |
| TickPick | tickpick.com/buy-…-tickets-…/7730073/ | SportsEvent | floating | EventVenue + PostalAddress |
| Gametime | gametime.co/concert/odesza-tickets/…/events/6a8de99838713f24583617a6 | MusicEvent | **unmarked UTC** (og:title carries local) — quirk table entry | MusicVenue + geo |
| AllEvents | allevents.in/chattanooga/5k10k-run4love-2026-tickets/80006343460126 | Event | offset | Place + geo |
| TicketLeap | events.ticketleap.com/tickets/la-creme-modeling-acting/nyfw-september-2026 | Event | offset-nc | image; venue on page |
| Purplepass | purplepass.com/events/349440-an-r-rated-magic-show-sep-30th-2026 | Event | offset | Place + PostalAddress |
| SimpleTix | simpletix.com/e/bulls-on-the-beach-2026-tickets-278006 | Event (array, one per night) | utc (`+00:00`) | Place + geo |
| Eventbee | eventbee.com/v/…/event?eid=227321231 | Event | offset | Place + PostalAddress |
| Events.com | events.com/r/en_US/tickets/an-evening-with-joy-behar--judy-gold-…-1044464 | Event | utc (`…000Z`) | Place — emits literal `"streetAddress": "undefined"`; sanitize |
| Eventcreate | eventcreate.com/e/forum-2026 | Event | offset | Place + PostalAddress |
| Discotech | app.discotech.me/events/38114136-deorro-labor-day-weekend-at-hakkasan | MusicEvent | offset | venue (LocalBusiness) |
| Happening Next | happeningnext.com/event/molly-tuttle-eid13twlbxqu00 | Event | offset | Place + PostalAddress |
| Tixel | tixel.com/us/music-tickets/2026/09/12/robyn-the-sexistential-tour | MusicEvent | offset | Place |
| TodayTix | todaytix.com/nyc/shows/127-the-book-of-mormon | TheaterEvent | **opening-date trap** — `startDate` is the 2011 opening; performances live in `eventSchedule`. Multi-date rule applies | venue |
| SeatEngine | www-emeraldcitycomedy-com.seatengine.com/shows/369623 | Event | utc (`Z`) | venue |
| Mobilizon | mobilizon.fr/events/d2feec38-… (any instance) | Event | utc (`Z`) | venue |
| Airbnb Experiences | airbnb.com/experiences/6108575 | Event (2nd ld+json block) | utc (`…000Z`); startDate is one bookable slot — multi-date rule applies | location |
| Live Nation | livenation.com/event/vvG1IZbM940tJ0/guns-n-roses-world-tour-2026 | MusicEvent | offset | venue + PostalAddress. Event ids are Ticketmaster Discovery ids — also API-covered |

## API-covered — Layer 2 (3)

| Provider | HTML fetch | API path | Notes |
|---|---|---|---|
| Ticketmaster | 403 (listing and event page) | **Discovery API** (official, documented, free key) — parse `/event/{id}` from the URL → name, localDate, localTime, venue, image | Also covers livenation.com and admission.com (same inventory and ids) |
| SeatGeek | 403 | **Platform API** (official; portal registration, approval-based) | Candidate, not committed — resale links rarely matter for invites |
| Resident Advisor | 403 (captcha) on all HTML | **ra.co/graphql** — no-auth, introspectable public GraphQL (their own web/app backend); verified 200 from a datacenter IP with real listing data | **Unofficial — the single owner-approved exception** (2026-09-01). Parse id from `ra.co/events/{id}`, single-event query, browser-like UA + Origin/Referer headers. Isolated module, fail-open; re-verified on the sweep cadence |

## Partial — OG title/image only (13)

| Provider | Verified URL / result | Notes |
|---|---|---|
| Showpass | showpass.com/emo-night-hudsons-calgary/ — 200 | No Event schema; `starts_on` UTC in embedded JS state (venue-local tz trap); OG title carries date text |
| Fever | feverup.com/en/new-york/back-in-action — 200 | OG title/image only; dates are client-rendered (user picks a slot in their selector) — fails safe |
| Front Gate Tickets | frontgatetickets.com/events/arc-music-festival — 200 | og:title/description only; no JSON-LD, no embedded date fields |
| TicketGateway | ticketgateway.com/event/view/90s--00s-rb-summer-bbq — 200 | Organization schema only; OG present |
| RegFox | roscon.regfox.com/roscon-2026 — 200 | Webconnex stack; OG title + image, no ld+json |
| TicketSpice | thmf.ticketspice.com/2026-trail-hero-amplified — 200 | Webconnex stack; same as RegFox |
| Brown Paper Tickets | brownpapertickets.com/event/3210601 — 200 | og:image only; platform retiring — do not build for |
| Do512 (DoStuff) | do512.com/events/2026/9/16/pond-tickets — 200 | OG title + image; embeds an Etix buy link |
| Tablelist | buy.tablelist.com/e/c0aaf94574efb94f — 200 | OG title + image; address in app JSON blob, not schema.org |
| Laylo | laylo.com/griz/m/rrx26@b0t — 200 | Thin SSR head with OG; drop UI client-rendered |
| The Point of Sale | thepointofsale.com/tickets/jqy260925001 — 200 | schema.org **microdata** Event (itemscope/itemprop), not JSON-LD — optional parser extension, skip in v1 |
| Evite | evite.com/event/03D7APH4CM7W6E5DSEPIOKBF2O6EY4 — 200 | OG title; date/venue only in a `window.evite_event` JS blob |
| Punchbowl | punchbowl.com/parties/548fb01301bc861f8c27 — 200 | OG title; date text in og:description |

## Aggregators (3)

| Provider | Result | Notes |
|---|---|---|
| EDM Train | edmtrain.com — 200 | City pages link out to Dice/RA/Eventbrite/etc. — the pasted target is what matters |
| 19hz | 19hz.info/eventlisting_Toronto.php — 200 | Rave listing tables; rows link out to ticketing providers |
| Playbill | playbill.com/production/hamilton-… — 200 | OG present; buy button is an outbound affiliate hop |

## URL-only (37)

Blocked from a datacenter IP as of the snapshot (challenge page, captcha, login wall, JS shell, or hostile response). Retry with `Accept-Language` + homepage `Referer` was attempted before classifying. Grouped by failure mode:

- **Cloudflare / generic challenge:** AXS, Posh, Tixr, See Tickets US, Eventim US, Concertful, Oh My Rockness, Sway, Festscanner, Ticketbud, ThunderTix, HomeTown Ticketing, Ludus, Ticketpro, Atlas Obscura, GetYourGuide
- **Other WAFs:** Ticketmaster + Admission (TM identity wall), StubHub (interior pages 403), Viagogo (interior pages 403), Songkick (concert pages 406), Vivid Seats (proof-of-work challenge), Splash + Viator (DataDome), Skiddle (AWS WAF 202), Broadway.com (FingerprintJS), Telecharge (Akamai), Paperless Post (406, empty body)
- **Rate-limited:** Shotgun (429 on repeated attempts)
- **JS shell / no metadata:** Universe, Accelevents, Veeps (event pages; livestream-focused anyway), GoFan (200 with a NUL-byte body), BookTix (SSR text but zero OG/JSON-LD)
- **Login wall:** Facebook Events
- **Etix:** 202 JS-challenge on both homepage and event pages

APIs noted for the record (none committed): JamBase has a paid data API (data.jambase.com); Skiddle has a non-commercial API; SeatGeek is the Layer-2 candidate above. The rest have partner-only or no public APIs.

## What the parser must handle (snapshot findings)

1. **Event-family subtypes**, not just `Event`: MusicEvent, SportsEvent, BusinessEvent, TheaterEvent, Festival, etc. — including blocks inside arrays and `@graph`.
2. **startDate flavors:** offset with colon (`-04:00`), offset without colon (`-0400` — ShowClix, TicketLeap), floating local (Ticketweb, TickPick — take the wall clock as-is), UTC `Z`/`+00:00` (SeatEngine, Mobilizon, Airbnb, Events.com, SimpleTix — convert via the device timezone; same-city assumption), UTC with the IANA tz in a separate field (Partiful `__NEXT_DATA__`), date-only (Prekindle — fill the date, leave time).
3. **Per-provider quirk table**, isolated per provider — e.g. Gametime's `startDate` is unmarked UTC while `og:title` carries the local time.
4. **Multi-date rule:** never invent a single night. `startDate` in the past or a long span (TodayTix's opening date, Airbnb's bookable slots, artist/tour pages) → skip date/time.
5. **Sanitize extracted strings** — Events.com emitted the literal `"streetAddress": "undefined"`.
6. JSON-LD lives in `<head>`, so the 1MB read cap in `og-metadata` is safe even on multi-MB pages (Gametime's event page is 3.2MB) — fixtures prove this per provider.

## How to re-verify

Any agent can re-run this matrix. Everything needed is right here.

1. For each provider, find a live, upcoming event page (web search for a quoted domain pattern like `"showclix.com/event/"`, or fetch the provider's listing page and extract an event link). Tested URLs rot as events pass — any current event page is fine.
2. Fetch it exactly the way `og-metadata` does:
   ```bash
   curl -sS -L -m 20 -o /tmp/<name>.html -w "HTTP %{http_code}, %{size_download}b\n" \
     -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36" \
     -H "Accept: text/html,application/xhtml+xml" "<event-url>"
   ```
3. On HTTP 200 with a non-trivial body, inspect:
   ```bash
   rg -o 'application/ld\+json' /tmp/<name>.html | head -2
   rg -o '"@type"\s*:\s*"[^"]+"' /tmp/<name>.html | sort | uniq -c | sort -rn | head -8
   rg -o '"startDate"\s*:\s*"[^"]*"' /tmp/<name>.html | head -2
   rg -o '"location"\s*:\s*\{[^}]{0,140}' /tmp/<name>.html | head -1
   rg -o 'og:title" content="[^"]{0,70}' /tmp/<name>.html | head -1
   ```
4. On a block code or shell page, retry **once** with `-H "Accept-Language: en-US,en;q=0.9" -H "Referer: <provider homepage>"` (Ticketweb 506s once, then serves) before classifying URL-only.
5. Classify per [Buckets](#buckets). Only claim Layer 1 when the Event JSON-LD block is present in the fetched HTML — never from search snippets.
6. Update the row, bump the snapshot date, and add a changelog entry below.

## Cadence

Re-verify roughly every 6 months (parallel agents on a cheap fast model — the 2026-09-01 sweep of 82 providers was one message of four agents). Also re-check a single provider any time a user reports autofill misbehaving on it. Drift is expected and benign (fail-open); the sweep exists to catch *upgrades* (providers adding JSON-LD) and to keep the fixtures honest.

**Automation: deferred by the owner (2026-09-01).** A scheduled CI job could re-classify providers and flag drift — CI runners are datacenter IPs too, so results are representative. If it is ever built ([Considering](../FEATURES.md#provider-matrix-drift-check)): it must flag drift, never fail a build (provider changes are external reality, not code regressions), never auto-edit this doc, and it needs the retry rule or flaky providers (Ticketweb) will cry wolf.

## Changelog

- **2026-09-01** — Initial snapshot. 82 providers verified (26 Layer 1, 3 API-covered, 13 partial, 3 aggregators, 37 URL-only) by the owning agent + four parallel research agents.
