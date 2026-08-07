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

- **Accent** = a small moment of warmth: the selected day, the dots marking days that have events, the primary action, and the quiet "From X" attribution. That is the entire job. The accent is never used for badges, unread counts, or anything that asks for attention.
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

---

## 7. The themes toggle

Theme selection lives in the calendar header as a compact **segmented control labeled with the theme names** ("Paper | Evening"), not an icon and not a settings page. Tapping selects a mood; the choice persists across sessions. The control is designed to accept additional themes later without changing its shape — the registry of themes is the contract.

---

## 8. Adding a future theme

The role-token structure is the whole contract. To add a theme:

1. Define a full palette that fills every role in §3.
2. Give it a name and a display label; add it to the theme registry.
3. Choose its typeface voice (serif / sans) for titles.

No component changes should be required. A natural third candidate is a warm **ledger** theme — salmon-cream paper, teal as a working accent — which occupies the space between Paper's daylight and Evening's dark.

---

## 9. What this is not

The escape routes are closed, deliberately:

- **No neon, no glow, no LED effects.** Evening's warmth is candlelight, not electronics.
- **No engagement color.** No badges, unread counts, streaks, or urgency hues. The accent never asks for attention.
- **No dark patterns.** Nothing that manufactures a reason to return.
- **No borrowed decoration.** No skeuomorphism, no occult or themed ornament. The warmth comes from coherence, not from props.
- **No one-off values.** A visual decision without a token is a defect; name the role first.

---

*The philosophy will not change; the implementation will evolve. When in doubt, return to §1 — color is a treat, never a hook.*
