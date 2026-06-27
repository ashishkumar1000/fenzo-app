# Fenzit Design System

The single source of truth for all UI in this React Native app. **Every screen
and component must compose the tokens and components defined here.** This system
was ported from a web design system into native React Native primitives.

> **Rule of thumb for any agent or developer:** never hard-code a color, font
> size, spacing value, radius, or shadow in a screen. Always import from
> `src/theme` and build from `src/components/ui`. If something you need isn't in
> the system, add it to the tokens first, then use it.

---

## Where things live

```
src/theme/                 design tokens (the source of truth)
  colors.ts                raw palette + semantic aliases + status colors
  typography.ts            sizes, weights, semantic text roles
  spacing.ts               4px grid, touch targets, layout constants
  radius.ts                radii, shadows (RN shadow+elevation), motion
  fonts.ts                 Inter wiring (system-font fallback until linked)
  index.ts                 barrel — import { colors, spacing, typography, theme }
src/components/ui/         the component library (compose these in screens)
  Button, IconButton       core actions
  Badge, Card, Avatar      feedback / surfaces / identity
  Input, Select, Switch    forms
  index.ts                 barrel — import { Button, Badge, ... }
src/assets/fonts/          Inter .ttf files (see README there)
```

Import patterns:
```ts
import { colors, spacing, typography, radius, shadow } from '../theme';
import { Button, Badge, Card, Input } from '../components/ui';
```

---

## Visual foundations (the discipline)

**Color.** A focused palette anchored on four brand colors. Blue `#1A56DB`
(`colors.primary`) is the primary action *and* the "in progress" status — color
is deliberately overloaded with meaning. Green `#06956F` = done/success, amber
`#D97706` = scheduled/pending/warning, red `#C92A2A` = cancelled/danger.
Backgrounds are near-white (`colors.surfacePage` `#F9FAFB`, cards `#FFFFFF`);
text is near-black `#111827`. **Always reference semantic aliases**
(`colors.primary`, `colors.surfaceCard`, `colors.status.done.bg`, …), never the
raw `palette.*` scales, except inside the token files themselves.

**Status vocabulary (fixed — do not invent synonyms).** Job state maps 1:1 to a
badge color: **Done / In Progress / Scheduled / Cancelled** (+ neutral = Draft).
Use `<Badge status="done|progress|scheduled|cancelled|neutral">`.

**Type.** A single typeface — **Inter** (weights 400–800). No serif, no second
family. Mobile-first scale: body 16px (never smaller on inputs, to avoid iOS
zoom), screen titles 28px, hero 48px. Use the semantic roles, not raw sizes:
`typography.display | title | heading | body | bodySm | label | caption`.
Money and counts should use tabular figures where possible.

**Spacing & layout.** 4px base grid via `spacing.s1 … spacing.s20`. Phone-first:
`layout.contentMax` 480px, 16px screen gutters (`layout.gutterMobile`), 56px app
bar, 64px bottom nav. Lists are single-column stacks of cards with ~10px gaps.

**Shape.** Soft, friendly rounding — inputs/buttons `radius.md` (10), cards
`radius.lg` (14), sheets/modals `radius.xl` (20), badges & avatars `radius.pill`.
Nothing is sharp-cornered.

**Elevation.** Light, cool-gray shadows (`shadow.xs|sm|md|lg`), never harsh
black. Cards sit on `shadow.sm`. The primary button carries a blue-tinted lift
(`shadow.primary`). Bottom sheets use `shadow.sheet` (upward). Cards use a 1px
`colors.borderSubtle` hairline *and* a soft shadow together.

**Backgrounds.** Flat color only. **No gradients, no photographic hero imagery,
no textures or repeating patterns.**

**Motion.** Quick and functional, never showy. Durations 120–320ms
(`motion.durationFast|Base|Slow`) with `motion.easeStandard` / `motion.easeOut`
(cubic-bezier points usable via RN `Easing.bezier(...)`). Press states scale
down (buttons 0.97, icon buttons 0.92). No bounces, no decorative loops.

**Touch targets.** Never below 44px on mobile (`touch.min`). Inputs are 48px
(`touch.comfort`).

---

## Content & voice

- Speak **to** the user as "you". Warm, direct, plain English. No jargon.
- **Sentence case** everywhere (headings, buttons, labels). Caps only for tiny
  letter-spaced eyebrow labels.
- Buttons are 1–2 words ("New Job", "Mark as Done"). Labels are nouns.
- Money: ₹ with Indian grouping ("₹28,600"); 12-hour times ("10:30 AM").
- **No emoji in product UI.** Meaning is carried by color + icon + word.

---

## Iconography

- Outline (stroke) icons, ~18–24px in lists/actions. Stroke inherits the text/
  brand color of its context.
- No emoji as icons. No one-off hand-drawn SVGs — keep weight/style consistent.

---

## How to build a new screen (checklist for any agent)

1. Background: `colors.surfacePage`. Content padding: `spacing.s4`.
2. Compose from `src/components/ui` — don't rebuild buttons, inputs, etc.
3. Text uses `typography.*` roles + `colors.text*`. No raw font sizes/colors.
4. Spacing/radii/shadows come from tokens. No magic numbers.
5. Job/task state → `<Badge>` with the fixed status vocabulary.
6. Tap targets ≥ 44px. Inputs 48px.
7. Flat backgrounds, soft shadows, sentence-case copy, no emoji.

If a need isn't covered, extend the **tokens** first, then the components — never
hard-code around the system.
