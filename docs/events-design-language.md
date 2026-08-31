# Events — Design Language

The canonical reference for how Events looks and feels. This document defines the two themes and the rules behind them, so the language is unambiguous today and extensible tomorrow. It is philosophy-forward; the implementation (theme tokens, the toggle) is built against this spec, not the other way around.

Companion reads: `docs/events-philosophy.md` (why the app behaves the way it does), `docs/events-product.md` (what it does), `docs/events-technical-architecture.md` (how it's built).

---

## 1. Principles

Events is a quiet tool, not a feed. The visual language exists to serve that posture, not to decorate it.

- **Ceremonial restraint.** Emphasis — color, weight, motion — is a resource you *spend*, not a default you apply. Nothing is on the screen to fill space.
- **Color as a treat, never a hook.** A little warmth appears at moments of meaning (the selected day, an event, who shared it). It is never used to manufacture urgency, badge a count, or pull you back. The app does not want your attention; another person might.
- **Warmth, not clinical minimalism.** The references are paper, candlelight, ink — texture and calm, not sterility or brutalism.
- **One structure, two moods.** Both themes are the same app at different times of day. They share layout, spacing, and tone; only the palette and typeface shift.

This language inherits its *philosophy* from a related design canon (anti-engagement as architecture, role-based tokens, ceremonial restraint) but deliberately **not its skins**. Paper and Evening are Events's own.

---

## 2. The two themes

Themes are **named moods chosen by the user**, not a light/dark toggle. There is no "system default that follows the OS" — the user picks the mood, and the choice persists.

### Paper

The daytime register. A picnic, a journal, a well-printed planner. Warm paper ground, ink text, a single warm ochre accent spent sparingly.

- **Mood:** calm, human, analog, unhurried.
- **Voice:** serif display type for titles; clean body type.
- **Accent:** warm ochre `#c8871e`.

### Evening

The night register. A candlelit dinner, a cozy bar, an evening out. Warm charcoal ground, soft off-white text, and one warm amber accent that reads as *candlelight or distant string lights* — not neon, not LED, no glow effects.

- **Mood:** intimate, warm, nocturnal, composed.
- **Voice:** clean sans-serif type, light weight.
- **Accent:** candlelight amber `#d9a05b`.

Evening's accent is the feeling of warm lights at night. It is deliberately *not* electric: there is no purple, no neon, no literal glow on text, no light show. A candlelit dinner should feel appropriate here.

---

## 3. Color

Color is assigned **by role, never by value**. Every visual decision traces to a named token; theming is a value-swap under fixed role names, not a rebuild. This is what makes a future third theme cheap.

### The semantic law

- **Accent** = a small moment of warmth: the selected day, the dots marking days that have events, the primary action, and the quiet "From X" attribution. The selected answer in the Who's Coming reply widget uses the same selected-state fill as the selected day (`calendarSelected`) — a chosen answer is a selection, and the two creams (`surfaceSecondary` vs `selectedBg`) proved too close to read as feedback (owner call, 2026-08-28). That is the entire job. The accent is never used for badges, unread counts, or anything that asks for attention.
- **Destructive** = red, and red alone signals consequence (remove, delete). The accent never does this job, and destructive never decorates.
- **Everything else** — surfaces, inks, boundaries — is structurally neutral.

A user should be able to read the state of the app from color alone, precisely because color is spent on so little.

### Tokens

| Role | Paper | Evening | Used for |
|------|-------|---------|----------|
| `background` | `#faf7f0` | `#17151a` | app background |
| `surface` | `#ffffff` | `#211d24` | cards, raised sections |
| `surfaceSecondary` | `#f1ece0` | `#2a2635` | chips, secondary buttons |
| `selectedBg` | `#f3ecda` | `#2e2a3a` | selected-row highlight |
| `textPrimary` | `#1a1815` | `#ece7df` | primary text |
| `textSecondary` | `#6b6357` | `#a49fb0` | secondary text |
| `textTertiary` | `#a39a8b` | `#6e6879` | hints, placeholders |
| `border` | `#e3dcc9` | `#37334a` | hairline boundaries |
| `borderLight` | `#efe9da` | `#282435` | lighter boundaries |
| `primaryButtonBg` | `#1a1815` | `#d9a05b` | primary action fill |
| `primaryButtonText` | `#faf7f0` | `#2a1d10` | primary action text |
| `destructiveBg` | `#f7e3dd` | `#38222a` | destructive surface |
| `destructiveText` | `#c2482f` | `#e08a7a` | destructive text |
| `destructiveLink` | `#c2482f` | `#e08a7a` | destructive inline action |
| `linkText` | `#a3691a` | `#d9a05b` | links, inline actions |
| `calendarSelected` | `#c8871e` | `#d9a05b` | selected day |
| `calendarSelectedText` | `#ffffff` | `#2a1d10` | selected-day number |
| `calendarTodayText` | `#c8871e` | `#d9a05b` | today's number |
| `accent` | `#c8871e` | `#d9a05b` | the treat (see law) |
| `accentSoft` | `#f0e2c4` | `#3a2f23` | gentle accent tint |
| `shadow` | `#1a1815` | `#000000` | shadow color |

All text-role pairs are expected to meet WCAG ≥ 4.5:1 against their surfaces for normal text. The accent is used for fills and large marks; where it carries small text, use it at a weight/size that stays legible.

---

## 4. Typography

The typeface is the clearest signal of each theme's register, but both share one scale.

- **Paper** sets titles in a **serif** face — the editorial, printed-planner voice.
- **Evening** sets titles in a **clean sans-serif**, light weight — the relaxed night voice.
- **Body and labels** share a single scale across both themes.

**Inverted weight logic:** larger type runs *lighter*, not heavier. Hierarchy is carried by presence and weight contrast, not by volume. Display sizes sit light; small labels may run slightly heavier.

| Role | Approx. size | Weight | Notes |
|------|-------------|--------|-------|
| Display title | 28–32 | light / regular | serif in Paper, sans in Evening |
| Section / header | 18 | medium | |
| Body | 15–16 | regular | |
| Label / meta | 13–14 | medium | secondary ink |
| Caption / hint | 12–13 | regular | tertiary ink |

Line-height aligns to the 4px spacing grid.

---

## 5. Shape & depth

Events is soft, not flat-brutalist and not floating-card-heavy.

- **Corners:** a small radius spectrum; cards and buttons sit around 10–12px, chips and pills fully rounded. Sharp corners are not part of this language.
- **Depth:** expressed with *subtle* shadows and background-depth shifts. No glassmorphism, no blur, no heavy elevation. Cards read as resting on the surface, not floating above it.

---

## 6. Motion

**Default: nothing moves.** Motion is earned — it happens on a state change, a summoned surface, or a genuine wait — and it is short and calm. There is no ambient animation, no shimmer, no breathing, no attention-seeking pulse. Motion communicates; it never decorates.

### Confirmation feedback

A write that matters announces itself once, then stays visible for the rest of the visit. The rules (owner, 2026-08-29):

- **Feedback never auto-dismisses.** The confirmation appears when the server confirms the write and remains until you leave the screen. A message that vanishes punishes the distracted — the person who looked away is exactly who needed it. A fresh visit shows state only, no prose.
- **The control shows the state; the line reports the event.** A selected button's fill is the answer; "✓ Saved." is the fact that the tap landed. Neither restates the other.
- **The working phase is visible.** The tapped control spins while the write is in flight, and the confirmation only ever follows a server confirmation — never a pixel change. That transition is what makes the feedback trustworthy.
- **Certainty is always re-derivable.** State renders from a server read on every load, and re-tapping the same control re-confirms against the server (a same-value write is a no-op and re-pings nobody) — the reassurance probe always gets a truthful answer.
- **Glyphs have fixed meanings.** Circle = selectable. ✓ = confirmed/done ("✓ Saved.", "✓ Shared"). ✕ = failed ("✕ Unsubscribed", "✕ Undelivered"). Accent fill = selection/state. Plain words = information that isn't a confirmation (a person's "No" is not a failure). Destructive = consequence.

First instance: the Who's Coming reply widget and SMS receipt page. The share screen's sent confirmation (FEATURES.md → Share Sent Confirmation) follows the same template.

---

## 7. The theme control

Theme selection lives in the calendar header as a small circular **swatch button** — a two-tone disc in the *other* mood's colors (its ground and accent), inviting a tap. With two themes the whole screen is already the preview of the current mood, so the control does not need the theme names printed on it; the names remain in the accessibility label ("Switch to Evening theme") and anywhere a chooser is summoned. It is not a sun/moon icon — the moods are not a light/dark toggle, and the swatch previews a destination rather than symbolizing a state. Not a settings page, and never a permanent banner of chrome.

Tapping switches moods; the choice persists across sessions. The control stays data-driven from the theme registry: it always previews the *next* theme in the registry and cycles through them. A future third theme changes nothing about its size or placement — the same button cycles, or summons a small named chooser, without a redesign.

On web, browser chrome (the iOS Safari status bar / Dynamic Island tint, Android address bar) must follow the same mood. That is not OS light/dark and not a separate skin — it is the active theme's `background` (plus `color-scheme` derived from the theme's status-bar content style) applied to the document so Safari and friends stop sampling a default white page shell.

*A note on how this section drifted.* The first implementation followed this section's original text literally: a labeled segmented control ("Paper | Evening") on its own row of the calendar header. It worked, and it was wrong — a permanent labeled row spends chrome that a set-once preference has not earned (§1), and in an app whose main screen is only a calendar, it read as a second headline. The swatch replaced it within a day; the names moved to the accessibility label and to any future chooser. This is recorded so that whoever adds the third theme does not "fix" the swatch back into a segmented row — that shape was tried and rejected. If three themes make blind cycling awkward, have the swatch summon a small named chooser rather than restoring permanent labels.

---

## 8. Adding a future theme

The role-token structure is the whole contract. To add a theme:

1. Define a full palette that fills every role in §3.
2. Give it a name and a display label; add it to the theme registry.
3. Choose its typeface voice (serif / sans) for titles.

No component changes should be required — the header swatch picks the new theme up automatically, since it cycles the registry. With three or more themes, consider having the swatch summon a small named chooser instead of cycling blindly (see §7's drift note for why a permanent labeled row is not the answer). A natural third candidate is a warm **ledger** theme — salmon-cream paper, teal as a working accent — which occupies the space between Paper's daylight and Evening's dark.

---

## 9. What this is not

The escape routes are closed, deliberately:

- **No neon, no glow, no LED effects.** Evening's warmth is candlelight, not electronics.
- **No engagement color.** No badges, unread counts, streaks, or urgency hues. The accent never asks for attention.
- **No dark patterns.** Nothing that manufactures a reason to return.
- **No borrowed decoration.** No skeuomorphism, no occult or themed ornament. The warmth comes from coherence, not from props.
- **No one-off values.** A visual decision without a token is a defect; name the role first.

---

## 10. App icon

The launcher mark is a Paper monogram: serif **E’s** (typographic apostrophe) in `textPrimary` on `background`. One icon everywhere — iOS, Android, splash, favicon — because Paper is the default mood and the home-screen icon cannot follow the in-app theme. Android has no light/dark pair, and iOS appearance is the OS, not the named mood.

Android notifications use a white-on-transparent cut of the same lockup (`assets/notification-icon.png`). Regenerate the set with `python3 scripts/generate-app-icons.py`.

---

*The philosophy will not change; the implementation will evolve. When in doubt, return to §1 — color is a treat, never a hook.*
