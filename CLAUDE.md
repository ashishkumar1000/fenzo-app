# Fenzit — project guide for AI agents

This is **Fenzit**, a React Native (0.86, TypeScript) app. Read this before
writing any code.

## Package manager
- **Always use `bun`** — never npm or yarn. (e.g. `bun install`, `bun run android`.)

## Android builds
- **JDK 17 required.** Gradle reads `android/gradle/gradle-daemon-jvm.properties`
  and picks any installed JDK 17 automatically (ignore `JAVA_HOME`); if no JDK
  17 is installed, the foojay resolver in `android/settings.gradle` downloads
  one. JDK 26 breaks the build (AGP jlink transform failure).
- `debug` build type uses Metro; `metroDebug` is debug-signed with the JS bundle
  baked in — runs without a Metro server. Run it via `bun run android:standalone`
  (builds + installs the `metroDebug` APK, then verifies the baked bundle), or
  `./gradlew assembleMetroDebug`.
- **metroDebug limitations:** no Metro means no Reload, Fast Refresh, or remote
  debugging — rebuild to pick up JS changes. It has the same applicationId as
  `debug`, so installing one replaces the other. Prod and local share the
  same path shape (`…/api/v1`); the endpoint is hardcoded to
  `https://api.fenzit.com/api/v1` in `src/config/index.ts`.
- **Build scripts** (all run from the repo root via the RN CLI, no manual
  `cd android` — the CLI locates `android/` and invokes gradlew itself):
  - `bun run android:standalone` — build **and install** metroDebug on the
    connected device/emulator, then verify the baked bundle (`--no-packager`
    keeps Metro from starting). Use when a device is connected and you want
    to test now.
  - `bun run android:build:standalone` — build metroDebug **only**, no
    install/launch/verification. NOTE: ABI splits apply to ALL build types,
    so the output is per-ABI —
    `android/app/build/outputs/apk/metroDebug/app-<abi>-metroDebug.apk`
    (e.g. `app-arm64-v8a-metroDebug.apk`); there is no universal
    `app-metroDebug.apk`.
  - `bun run android:build:debug` — build the dev APK (needs Metro).
  - `bun run android:build:release` — build the release-signed APKs for
    sharing testers. ABI splits are enabled, so output is one APK per CPU
    architecture in `android/app/build/outputs/apk/release/` — share
    `app-arm64-v8a-release.apk` (≈40 MB, varies per build; arm64 covers all
    common phones, x86/x86_64 are for emulators, armeabi-v7a for very old
    32-bit devices). Signed with `fenzit-release.keystore` via credentials
    in `android/keystore.properties` (both tracked in the repo intentionally
    for now). The build then runs `scripts/verify-release-signing.js`,
    which fails if any APK is debug-signed (the Gradle config deliberately
    falls back to the debug keystore when `keystore.properties` is missing,
    with a loud Gradle warning). NOTE: a release APK has a different
    signature than debug builds — Android refuses to install it over a
    debug install; uninstall the debug app first.
  - `bun run android:build:aab` — release `.aab` bundle for Play Store
    (`android/app/build/outputs/bundle/release/app-release.aab`). Not for
    direct sharing.

- **versionCode for tester builds:** same versionCode (10000) reinstalls
  fine over the same signature, so ad-hoc tester builds need no bump.
  Bump versionCode (and versionName) before any Play Store upload —
  `bun run sync:version` then `bun run verify:version` keeps them in sync.
- **Sharing a release APK to testers** (no Play Store needed):
  1. Send the arm64 APK file itself (WhatsApp/Drive/email work).
  2. Tester allows "Install unknown apps" for that sender app; Play
     Protect may warn — "Install anyway".
  3. If they previously had a debug or metroDebug build, they must
     uninstall it first (signature conflict). Same-signature release
     updates install over each other cleanly.
- **Keystore rotation rules** (when you replace
  `fenzit-release.keystore`/`keystore.properties`):
  - Rotate **before the first Play Store upload**, not just "before
    launch" — after Play App Signing enrolment and a first upload, the
    upload key cannot be casually changed.
  - The current password lives in git history once committed — rotating
    the file alone does not un-leak it. Treat the committed password as
    burned: new keystore + new password, and either purge git history or
    accept it was private-repo-only.
  - Every tester must uninstall the app before installing a build signed
    with a different key (signature conflict).

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

> **Reality note (2026-09-09 code review):** no source file uses a project alias
> today (jest has no `moduleNameMapper` either) — the whole codebase, including
> all recent stories, imports relatively. Keep matching the surrounding code
> (relative imports) until the aliases are adopted wholesale, which would also
> mean adding the jest mapper. The mapping below stays for when that happens.

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

## Library research — New Architecture first (MANDATORY)

This app runs **React Native New Architecture (Fabric/TurboModules)** and uses
**Nitro Modules** for native code. Whenever you research or pick a new library:

1. **Search first for popular, well-maintained libraries that support the New
   Architecture** — check the library's README/docs for Fabric/TurboModule or
   "New Architecture ready" support, and prefer Nitro Modules (`nitro`-based,
   margelo-style) over legacy TurboModules where available.
2. Verify recent maintenance (last release, open issues) and React Native 0.86
   compatibility before recommending or adding anything.
3. **Avoid libraries that are legacy-architecture-only** (old NativeModule +
   interop-layer-dependent) unless there is no New Architecture alternative —
   and if one must be used, state the interop risk explicitly in the story.
4. Pure-JS libraries (no native module) are always safe with the New
   Architecture and need no rebuild — prefer them when the feature allows.
