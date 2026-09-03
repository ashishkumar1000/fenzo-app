# Story 4.3: Connectivity UX

Status: ready-for-dev

## Story

As a technician,
I want to always know whether I'm offline and whether my work has synced,
so that I trust the app in a basement as much as on WiFi.

## UI Design (ui-design-spec.md §12, §1, §9, §10 — pending is CALM, never alarm-colored)

OfflineBanner: pinned above the tab bar, height 36, amber family — bg status.scheduled.bg, hairlines .border, centered CloudOff 15 + label .fg "You're offline — changes will sync automatically"; syncing variant swaps to the blue progress family with RefreshCw + "Syncing…"; 150ms fade, no slide/bounce. Pending pill on the Today header: `<Badge status="scheduled" dot>` "N waiting to sync" (hidden at 0). Last-synced row under the greeting: RefreshCw 13 textMuted + caption "Last synced 5 min ago" (Pressable ≥32px; tiny spinner while manual pipeline runs; textDisabled look offline). Per-item pending visuals are already specced: JobCard third meta row "Waiting to sync" (§1), stepper amber pending circles (§9), photo tile amber strip (§10) — this story wires them to live queue/pendingSync data. Design research note: subtle indicator beats warning banner; Pending/Syncing/Failed are the only status words; red is reserved for real failure.

## Acceptance Criteria

1. **Given** NetInfo reports offline, **then** a slim persistent banner ("You're offline — changes will sync automatically") renders above the tab bar area on ALL technician screens (single instance at TechnicianRootNavigator level); it transitions to "Syncing…" on reconnect while `queue.size() > 0` or a sync is in flight, and hides only after drain + sync complete.
2. **Given** queued actions, **then** Today's header shows a pending-count pill ("2 waiting to sync") and each affected JobCard/TechJobDetail stepper shows the pending style (from `pendingSync` — 4.2 wired the data; this story wires the visuals: neutral/scheduled palette, small CloudOff or Clock lucide icon, NEVER danger red — pending is normal).
3. **Given** the Today screen, **then** a "Last synced <relative>" line renders under the header from `getMeta().lastSuccessAt` ("just now" < 60s, "N min ago" < 60m, "N hrs ago" < 24h, else "on <d MMM>"); tapping it while online runs `drainQueue()` then `runSync({ force: true })` with a brief spinner; while offline it is inert (banner already explains).
4. **Given** pull-to-refresh while offline, **then** cached data re-renders and the RefreshControl resolves within ~300ms (no infinite spinner): refresh handlers check `isOnline` first and short-circuit.
5. **Given** reconnect, **then** the pipeline runs automatically and strictly ordered: `drainQueue()` (replays with server timestamps landing) THEN `runSync({ force: true })` (pulls those timestamps) — banner/badges clear as state empties. One `onReconnect` firing per offline→online transition (no storms on flaky links: debounce 2s).
6. Owner screens untouched (owner is online-only in Phase 1); the connectivity hook itself lives in `src/hooks` for future reuse.

## Tasks / Subtasks

- [ ] **Task 0 — Install** `bun add @react-native-community/netinfo` + pod install; verify new-arch (v11+ supports it). Record version.
- [ ] **Task 1 — Connectivity store** (`src/hooks/useConnectivity.ts`, new; module store + hook like the others):
  ```ts
  import NetInfo from '@react-native-community/netinfo';
  let isOnline = true;                       // optimistic: isInternetReachable === null at cold start must NOT flash the banner
  let started = false; const subs = new Set<() => void>(); const reconnectSubs = new Set<() => void>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  export function startConnectivity(): () => void {
    if (started) return () => {};
    started = true;
    const unsub = NetInfo.addEventListener(s => {
      const next = s.isConnected !== false && s.isInternetReachable !== false;   // null counts as online
      if (next === isOnline) return;
      isOnline = next; subs.forEach(n => n());
      if (next) { if (debounceTimer) clearTimeout(debounceTimer); debounceTimer = setTimeout(() => reconnectSubs.forEach(n => n()), 2000); }
    });
    return () => { unsub(); started = false; };
  }
  export const getIsOnline = () => isOnline;
  export function onReconnect(cb: () => void): () => void { reconnectSubs.add(cb); return () => reconnectSubs.delete(cb); }
  export function useConnectivity() { const online = useSyncExternalStore(cb => (subs.add(cb), () => subs.delete(cb)), () => isOnline); return { isOnline: online }; }
  ```
  4.2's `isOnline()` import resolves to `getIsOnline`.
- [ ] **Task 2 — Wiring** (`features/technicianApp/syncBootstrap.ts`): `startConnectivity()` for technician sessions; `onReconnect(async () => { await drainQueue(); await runSync({ force: true }); })` (drainQueue already ends with a sync — make runSync idempotent-cheap via its throttle+force semantics; keep the explicit order comment).
- [ ] **Task 3 — OfflineBanner** (`features/technicianApp/components/OfflineBanner.tsx`, new): state machine `offline | syncing | hidden` derived from `useConnectivity()` + queue `subscribe` + a `isSyncing` flag exposed from syncStore (`runSync` sets/clears it, notify subscribers); rendered once in `TechnicianRootNavigator` as an absolute-positioned bar above the tab bar (safe-area aware); neutral palette (`colors.status.scheduled.bg` / text `colors.textStrong`), 13–14px, no emoji.
- [ ] **Task 4 — Pending visuals**: Today header pill (`queueSize` from a tiny `useQueueSize()` wrapper over queue subscribe); JobCard accepts `pending?: boolean` (technician screens pass `job.pendingSync`); WorkflowStepper pending style for optimistic 'done' rows (dashed tick + "Waiting to sync" caption on the affected step).
- [ ] **Task 5 — Last-synced + manual sync** (`src/utils/relativeTime.ts`, new + TodayScreen): formatter per AC 3 (pure, tested); Pressable row with a tiny RefreshCw icon; spinner while the manual pipeline runs.
- [ ] **Task 6 — Offline refresh short-circuit**: Today/History (and TechJobDetail) RefreshControl handlers: `if (!getIsOnline()) { rerenderFromStore(); return; }`.
- [ ] **Task 7 — Tests**: connectivity null-reachability = online; reconnect debounce fires once; banner state machine transitions; relativeTime boundaries (59s, 60s, 59m, 60m, 23h, 24h); refresh short-circuit resolves.

## Dev Notes

- Drain-before-sync ordering matters: replayed steps get server timestamps; the following sync pulls them, converging in one pass — never reverse it.
- `isInternetReachable` starts as `null` on both platforms — treating null as online avoids a cold-start banner flash (AC 1's optimistic default).
- The banner is technician-only by placement (TechnicianRootNavigator); no owner code paths change.
- Files: NEW `src/hooks/useConnectivity.ts`, `features/technicianApp/components/OfflineBanner.tsx`, `src/utils/relativeTime.ts`; MODIFY `navigation/TechnicianRootNavigator.tsx`, `syncBootstrap.ts`, `syncStore.ts` (isSyncing flag), `TodayScreen.tsx`, `HistoryScreen.tsx`, `TechJobDetailScreen.tsx`, `features/jobs/components/JobCard.tsx` (pending prop), `WorkflowStepper.tsx`; tests.
- [Source: 4-1 runSync/getMeta; 4-2 queue subscribe + drainQueue; web check 2026-09-01 NetInfo new-arch; DESIGN_SYSTEM.md palette rules].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
