# Fenzit — project guide for AI agents

This is **Fenzit**, a React Native (0.86, TypeScript) app. Read this before
writing any code.

## Package manager
- **Always use `bun`** — never npm or yarn. (e.g. `bun install`, `bun run android`.)

## Project layout (all RN code lives in `src/`)
```
src/
  App.tsx                  app root (index.js at root registers it)
  theme/                   design tokens — THE source of truth for UI
  components/ui/           Fenzit Design System components
  components/              app-specific components (e.g. AnimatedBootSplash)
  navigation/              React Navigation setup
  screens/                 app screens
  assets/fonts/            Inter .ttf files
```

## UI / design discipline — MANDATORY
**All UI must use the Fenzit Design System.** Full rules:
**[`src/theme/DESIGN_SYSTEM.md`](src/theme/DESIGN_SYSTEM.md)** — read it before
building or changing any screen or component.

Non-negotiables:
- Never hard-code colors, font sizes, spacing, radii, or shadows in screens.
  Import tokens from `src/theme` and compose components from `src/components/ui`.
  ```ts
  import { colors, spacing, typography } from '../theme';
  import { Button, Badge, Card, Input } from '../components/ui';
  ```
- Job/task state always uses `<Badge>` with the fixed vocabulary:
  **Done / In Progress / Scheduled / Cancelled** (+ neutral). No synonyms.
- Sentence case copy, no emoji in UI, flat backgrounds (no gradients/photos),
  soft cool-gray shadows, rounded corners, ≥44px touch targets, 48px inputs.
- If something isn't in the system, extend the **tokens** first, then the
  components — never hard-code around it.

## Workflow rules
- Use the **BMAD Method** for planning development tasks.
- Don't create summary/`.md` files unless explicitly asked.
- Don't commit or push unless explicitly asked.
- When unsure about version-specific behavior or library APIs, search the web —
  don't guess from memory.
