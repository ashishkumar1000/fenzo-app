/**
 * attendanceAccessStore.ts — the single source of the technician's
 * attendance access state (AD-17, Story 15-10).
 *
 * One module-level store, any number of subscribers via
 * `useSyncExternalStore` (AD-21: no new state library). The TechnicianTabs
 * tab bar reads it to decide whether the Attendance tab EXISTS, and the
 * attendance screens read the same snapshot — they can never disagree.
 *
 * Lifecycle (spec-15-10 "Tab visibility" decision):
 *   - `status: 'unknown'` → the tab is HIDDEN (no attendance UI can flash
 *     for a `none` user while the first read is in flight).
 *   - Seeded from the `/users/me` mirror by `seedAccessFromProfile` (the
 *     profile fetch seam — first load without a second round trip), then
 *     refreshed ONLY by `GET /attendance/me/access`: an initial fetch at
 *     lifecycle mount (the AppState listener alone never fires at boot),
 *     on foreground transitions, on any `attendance.*` notification (via
 *     the neutral `attendanceAccessEvents` seam), and on attendance-screen
 *     focus. All refetches share one min-gap so rapid switches stay cheap.
 *   - No flicker: a failed or unchanged refetch leaves the last state
 *     standing — the tab never toggles off while a refetch is in flight.
 *   - 401/epoch reset slams everything back to unknown and unregisters.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { useEffect, useSyncExternalStore } from 'react';
import { attendanceMeService } from '../../../services';
import type { AttendanceAccess } from '../../../services';
import {
  registerAttendanceAccessRefresh,
  setAttendanceReachable,
} from '../../../services/attendanceAccessEvents';
import { registerReset } from '../../../services/resetRegistry';

/** Min-gap shared by every refetch path (foreground, notification, focus). */
export const ACCESS_REFRESH_MIN_GAP_MS = 30_000;

export interface AttendanceAccessStateSnapshot {
  /** 'unknown' until the first me/access read lands (tab hidden until then). */
  status: 'unknown' | 'ready';
  access: AttendanceAccess | null;
}

const INITIAL: AttendanceAccessStateSnapshot = { status: 'unknown', access: null };

const subscribers = new Set<() => void>();
let state: AttendanceAccessStateSnapshot = INITIAL;
let inFlight: Promise<void> | null = null;
let lastLoadedAt = 0;
let initialised = false;
/**
 * Session generation — bumped by the 401/epoch reset. A fetch that was in
 * flight when a reset landed is DROPPED on arrival (its response belongs
 * to the previous session; local logout does not revoke the server
 * session, so a 200 can still land). Without this, technician A's access
 * state would repaint the store after logout and throttle technician B's
 * first fetch past the min-gap (BMAD review finding, 15-10).
 */
let generation = 0;
/** A forced refresh that arrived while another fetch was in flight. */
let queuedForced = false;
let unregisterReset: (() => void) | null = null;
let unregisterSeam: (() => void) | null = null;

function setState(next: AttendanceAccessStateSnapshot) {
  state = next;
  subscribers.forEach(notify => notify());
  // The seam's reachability mirrors the tab's existence for the
  // notifications screen's card-tap guard.
  setAttendanceReachable(
    next.status === 'ready' && next.access !== null && next.access.attendanceAccess !== 'none',
  );
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

function getSnapshot(): AttendanceAccessStateSnapshot {
  return state;
}

async function fetchAccess(): Promise<void> {
  const gen = generation;
  const access = await attendanceMeService.getAccess();
  // A reset landed mid-flight — the response is the previous session's
  // truth. Drop it entirely: no repaint, no min-gap stamp.
  if (gen !== generation) return;
  setState({ status: 'ready', access });
}

/**
 * One `me/access` fetch, shared by every caller. `force` bypasses the
 * min-gap (notification seam; the initial fetch). A failure is stored as
 * silence at THIS level — the last state stays standing (no-flicker rule);
 * the screens surface their own errors.
 *
 * A forced caller during an in-flight fetch does NOT join it (the old GET
 * hit the wire before the triggering event committed — pre-event truth
 * would both repaint the store and stamp the min-gap). It queues a
 * follow-up forced fetch instead, mirroring `loadMyProfile`'s
 * never-join-a-stale-request rule.
 */
function refreshAccess(force = false): Promise<void> {
  if (inFlight) {
    if (force) queuedForced = true;
    return inFlight;
  }
  if (!force && Date.now() - lastLoadedAt < ACCESS_REFRESH_MIN_GAP_MS) {
    return Promise.resolve();
  }
  const gen = generation;
  const request: Promise<void> = fetchAccess()
    .then(() => {
      if (gen === generation) lastLoadedAt = Date.now();
    })
    .catch(() => {
      // Keep the last state (no-flicker). 'unknown' stays unknown; the
      // lifecycle's next trigger retries.
    })
    .finally(() => {
      if (inFlight === request) inFlight = null;
      if (queuedForced) {
        queuedForced = false;
        void refreshAccess(true);
      }
    });
  inFlight = request;
  return request;
}

/**
 * Seeds the store from the `/users/me` mirror (AD-17: first load only) —
 * called from the profile store's success path, so the tab exists on the
 * first render without waiting for a second request. A mirror without a
 * usable access state (owners; absent field) is ignored — 'unknown' keeps
 * the tab hidden and the initial fetch resolves it. NEVER overrides a
 * resolved state: `me/access` is the only refresher after the seed.
 */
export function seedAccessFromProfile(profile: {
  attendanceEnabled?: boolean;
  attendanceAccess?: string;
  attendanceStartDate?: string | null;
  onboardedAt?: string | null;
} | null | undefined): void {
  if (state.status === 'ready' || !profile) return;
  const valid = ['none', 'upcoming', 'active', 'history_only'];
  if (!valid.includes(profile.attendanceAccess ?? '')) return;
  setState({
    status: 'ready',
    access: {
      attendanceEnabled: profile.attendanceEnabled === true,
      attendanceAccess: profile.attendanceAccess as AttendanceAccess['attendanceAccess'],
      attendanceStartDate: profile.attendanceStartDate ?? null,
      enabledAt: null,
      onboardedAt: profile.onboardedAt ?? null,
      officeId: null,
      officeName: null,
    },
  });
}

/** The intro recorded onboarding — update locally (no refetch round trip). */
export function applyOnboardedAt(onboardedAt: string | null): void {
  if (state.status !== 'ready' || !state.access) return;
  setState({ status: 'ready', access: { ...state.access, onboardedAt } });
}

/** Idempotent boot: registers the 401 reset + the notification seam, then
 *  fires the initial `me/access` fetch (bypassing the min-gap). */
export function ensureAttendanceAccessInitialised(): void {
  if (initialised) {
    void refreshAccess();
    return;
  }
  initialised = true;
  unregisterReset = registerReset(() => {
    // Invalidate any in-flight fetch (its response is the previous
    // session's truth) and let the next caller start fresh immediately —
    // never throttled by the previous session's success stamp.
    generation += 1;
    inFlight = null;
    lastLoadedAt = 0;
    setState(INITIAL);
  });
  unregisterSeam = registerAttendanceAccessRefresh(() => {
    void refreshAccess(true);
  });
  void refreshAccess(true);
}

/** Teardown for tests. */
export function resetAttendanceAccessStoreForTests(): void {
  unregisterReset?.();
  unregisterSeam?.();
  unregisterReset = null;
  unregisterSeam = null;
  initialised = false;
  inFlight = null;
  lastLoadedAt = 0;
  setState(INITIAL);
}

/** The store snapshot for components (tab bar + screens). */
export function useAttendanceAccess(): AttendanceAccessStateSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * The technician-tree lifecycle: idempotent boot (initial fetch + seam)
 * and the foreground refetch (AppState 'active' — the useNow pattern).
 * Mounted ONCE from the technician root navigator; owners never run it.
 */
export function useAttendanceAccessLifecycle(): void {
  useEffect(() => {
    ensureAttendanceAccessInitialised();
    const onAppStateChange = (next: AppStateStatus) => {
      if (next === 'active') void refreshAccess();
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);
}

/** Focus-refresh helper for the attendance screens (same min-gap). */
export function refreshAttendanceAccessOnFocus(): void {
  void refreshAccess();
}

/**
 * Forced, gap-bypassing access refresh (16-4): a 403 NOT_TRACKED from a
 * check-in means the owner disabled the employee mid-session — the tab
 * must catch the flip NOW, not after the min-gap expires.
 */
export function refreshAttendanceAccessNow(): void {
  void refreshAccess(true);
}
