# Fenzit — project guide for AI agents

This is **Fenzit**, a React Native (0.86, TypeScript) app. Read this before
writing any code.

## Package manager
- **Always use `bun`** — never npm or yarn. (e.g. `bun install`, `bun run android`.)

## Project layout (all RN code lives in `src/`)
```
src/
  ├── App.tsx                      app root (index.js at root registers it)
  ├── theme/                       design tokens — THE source of truth for UI
  ├── components/
  │   ├── ui/                      Fenzit Design System components (Button, Badge, etc.)
  │   └── *.tsx                    app-specific components (AnimatedBootSplash, etc.)
  ├── screens/                     app screens (one per route)
  ├── navigation/                  React Navigation setup & types
  ├── hooks/                       custom React hooks
  ├── utils/                       formatting, validation, transformation helpers
  ├── constants/                   fixed values, API endpoints, error messages
  ├── services/                    API clients, business logic, integrations
  ├── types/                       TypeScript interfaces & domain models
  ├── store/                       state management (Redux/Zustand/Context/MobX)
  ├── config/                      app configuration & environment setup
  └── assets/
      ├── fonts/                   Inter .ttf files
      └── images/                  PNG, SVG, app icons
```

## What to use when — folder guide

| **Use folder** | **For** | **Example** |
|---|---|---|
| `components/ui/` | Reusable Design System components | Button, Badge, Card, Input |
| `components/` | App-specific, reusable UI | AnimatedBootSplash, JobCard |
| `screens/` | Full-screen views (one per route) | HomeScreen.tsx, DetailsScreen.tsx |
| `navigation/` | Route definitions, nav stacks | RootNavigator, types.ts |
| `hooks/` | Custom React hooks | useJobData, useFetch, useForm |
| `utils/` | Pure functions | formatDate(), validateEmail() |
| `constants/` | Fixed values | API_BASE_URL, JOB_STATES, ERROR_MSGS |
| `services/` | API calls, external APIs, SDKs | jobService.ts, authService.ts |
| `types/` | Interfaces & enums | User, Job, ApiResponse types |
| `store/` | Global state | Redux slices, Zustand stores, Context |
| `config/` | Environment-based settings | API URLs per env, feature flags |
| `theme/` | Design tokens (colors, spacing, fonts) | NEVER hard-code design values |

## UI / design discipline — MANDATORY
**All UI must use the Fenzit Design System.** Full rules:
**[`src/theme/DESIGN_SYSTEM.md`](src/theme/DESIGN_SYSTEM.md)** — read it before
building or changing any screen or component.

### Absolute imports — use them everywhere
Enable with tsconfig.json `paths` (already set up). Import from aliases:
```ts
// ✅ DO THIS — clean, easy to refactor
import { Button } from '@components/ui';
import { useJobData } from '@hooks';
import { formatDate } from '@utils';
import { JOB_STATES } from '@constants';

// ❌ DON'T DO THIS — relative paths create clutter
import Button from '../../../components/ui/Button';
```

Available aliases: `@components`, `@screens`, `@navigation`, `@hooks`, `@utils`,
`@constants`, `@services`, `@types`, `@store`, `@config`, `@theme`, `@assets`.

### Design non-negotiables:
- Never hard-code colors, font sizes, spacing, radii, or shadows in screens.
  Import tokens from `@theme` and compose components from `@components/ui`.
  ```ts
  import { colors, spacing, typography } from '@theme';
  import { Button, Badge, Card, Input } from '@components/ui';
  ```
- Job/task state always uses `<Badge>` with fixed vocabulary:
  **Done / In Progress / Scheduled / Cancelled** (+ neutral). No synonyms.
- Sentence case copy, no emoji in UI, flat backgrounds (no gradients/photos),
  soft cool-gray shadows, rounded corners, ≥44px touch targets, 48px inputs.
- If something isn't in the system, extend the **tokens** first, then the
  components — never hard-code around it.

## Folder-specific rules

### `/hooks`
- One file per hook: `useMyHook.ts`
- Only custom hooks that encapsulate reusable logic
- Re-export from `index.ts` for clean imports
- Example: data fetching, form handling, lifecycle management

### `/utils`
- Pure functions only (no side effects)
- Organize by domain: `dateUtils.ts`, `validationUtils.ts`
- Re-export from `index.ts`
- Example: `formatDate()`, `debounce()`, `validateEmail()`

### `/constants`
- App-wide fixed values
- Capitalize constant names: `API_BASE_URL`, `JOB_STATES`
- Example: `export const JOB_STATES = ['Done', 'In Progress', ...] as const`

### `/services`
- API clients and integrations
- One file per service: `jobService.ts`, `authService.ts`
- Handle API calls, error handling, data transformation
- Re-export from `index.ts`
- Example: `getJobs()`, `createJob()`, `updateUser()`

### `/types`
- TypeScript interfaces and enums (NOT theme tokens)
- One file per domain: `Job.ts`, `User.ts`, `Api.ts`
- Re-export from `index.ts` as a barrel export
- Example: `interface Job { id: string; title: string; }`

### `/store`
- State management setup (whichever library: Redux, Zustand, Context, MobX)
- Structure depends on chosen library
- Example Redux: `slices/`, `middleware/`, `store.ts`

### `/config`
- Environment-based config (dev, staging, prod)
- Feature flags, API endpoints
- Example: `export const API_URL = process.env.API_URL || 'http://localhost:8000'`

## Workflow rules
- Use the **BMAD Method** for planning development tasks.
- Don't create summary/`.md` files unless explicitly asked.
- Don't commit or push unless explicitly asked.
- When unsure about version-specific behavior or library APIs, search the web —
  don't guess from memory.
