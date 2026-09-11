/**
 * useSkills — shared store for the global skills catalog, from `GET /skills`.
 *
 * Same `useSyncExternalStore` shared-store pattern as `useCustomers`: one
 * module-level state object, any number of subscribers. The AddTechnicianSheet's
 * skill picker and the New job screen's skill picker all read the same fetch,
 * so there is exactly one path to the endpoint and the surfaces can never
 * disagree about the rows.
 *
 * Read-only — write paths were removed in Story 5.4 (skill management screens deleted).
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { skillService } from '../../services';
import { registerReset } from '../../services/resetRegistry';
import type { ApiError, Skill } from '../../services';
import { FOCUS_REFRESH_TTL_MS } from '../../constants';

export interface SkillsState {
  skills: Skill[];
  /** True while the *first* load is in flight (nothing to show yet). */
  isLoading: boolean;
  /** Human-readable failure message from `ApiError`, safe to render. */
  error: string | null;
  /** False until a load has completed, so "empty" can't be confused with "not fetched". */
  hasLoaded: boolean;
  /**
   * Timestamp of the last SUCCESSFUL load — drives the focus-refresh throttle.
   * A failed refresh never touches it, so a retry is never throttled away by
   * data that was already stale when the failure happened.
   */
  lastLoadedAt: number | null;
}

const INITIAL: SkillsState = {
  skills: [],
  // Starts true, so the very first render is a loader, never empty copy.
  isLoading: true,
  error: null,
  hasLoaded: false,
  lastLoadedAt: null,
};

// --- Shared store: one list, any number of subscribers ----------------------
const subscribers = new Set<() => void>();
let state: SkillsState = INITIAL;

/**
 * Tracks the current request so concurrent callers share it rather than
 * firing duplicate GETs (e.g. SkillsScreen and AddTechnicianSheet's
 * sheet-open load landing in the same frame).
 */
let inFlight: Promise<void> | null = null;

/**
 * Monotonic id per request. A forced refresh runs *alongside* an older
 * in-flight request, so an older response can settle after a newer one —
 * and must not overwrite the newer state.
 */
let requestSeq = 0;

function setState(next: Partial<SkillsState>) {
  state = { ...state, ...next };
  subscribers.forEach(notify => notify());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  // Same reference until something actually changes — required by
  // useSyncExternalStore to avoid an infinite re-render loop.
  return state;
}

async function fetchSkills(): Promise<void> {
  const seq = ++requestSeq;
  // Only show the loader when there's nothing on screen yet; a refresh over
  // existing rows shouldn't blank them out.
  setState({ isLoading: state.skills.length === 0, error: null });
  try {
    const skills = await skillService.list();
    // A forced request can supersede this one (both run in parallel); a late
    // settling response from the older request must not overwrite the newer
    // state or stamp an older success.
    if (seq !== requestSeq) return;
    // Seed order (the backend's `sort_order` asc) is the contract — stored
    // verbatim, never re-sorted.
    setState({
      skills,
      isLoading: false,
      error: null,
      hasLoaded: true,
      lastLoadedAt: Date.now(),
    });
  } catch (error) {
    console.warn('[useSkills] GET /skills failed →', error);
    if (seq !== requestSeq) return;
    // `skills` is deliberately retained: a failed refresh keeps the stale
    // rows on screen and surfaces `error` as the dismissible banner. The
    // rejection isn't always an `ApiError` (aborted request, network
    // TypeError) — fall back to generic copy when the rejection carries no
    // usable message, so the failure still renders a banner.
    setState({
      isLoading: false,
      error: (error as ApiError)?.message || 'Something went wrong',
      hasLoaded: true,
    });
  }
}

/**
 * Loads the list, reusing any request already in flight.
 *
 * Throttled: a load whose last SUCCESS was within `FOCUS_REFRESH_TTL_MS` is
 * skipped, so a sheet-open `loadSkills()` on every open costs at most one
 * request per window. `opts.force` bypasses the throttle AND any in-flight
 * request — pull-to-refresh and post-mutation refreshes are always
 * intentional and must land immediately.
 */
export function loadSkills(opts: { force?: boolean } = {}): Promise<void> {
  // Only unforced callers may join the request already running: a forced
  // caller (post-mutation) needs data the old request started fetching
  // *before* the mutation, so joining it would resolve with pre-mutation
  // rows. Force issues a fresh request and runs alongside the old one.
  if (inFlight && !opts.force) {
    return inFlight;
  }
  // Elapsed time relative to the last success. A clock moving backwards
  // (NTP correction, manual change) makes elapsed negative, which must not
  // read as "fresh" — treat it as stale so refreshes keep flowing.
  const elapsed = Date.now() - (state.lastLoadedAt ?? 0);
  const fresh = elapsed >= 0 && elapsed < FOCUS_REFRESH_TTL_MS;
  if (!opts.force && fresh) {
    return Promise.resolve();
  }
  // Only clear the slot if THIS request is still the current one — a forced
  // call started while this one was in flight replaces `inFlight`, and the
  // older request's finally must not free the slot for it.
  const request = fetchSkills().finally(() => {
    if (inFlight === request) {
      inFlight = null;
    }
  });
  inFlight = request;
  return request;
}

/**
 * Reset to the pre-login state. Call on logout.
 *
 * Invalidates any in-flight GET and marks every older response stale — a
 * response landing after logout would otherwise repopulate the next session's
 * store with the previous tenant's skills.
 */
export function clearSkills() {
  requestSeq += 1;
  inFlight = null;
  setState(INITIAL);
}

// Join the global 401 reset flow (story 5.3) — see services/resetRegistry.ts.
registerReset(clearSkills);

export function useSkills(opts: { autoLoad?: boolean } = {}) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const autoLoad = opts.autoLoad ?? true;

  // First mount kicks off the load. Nothing to abort on unmount: the store
  // outlives the component, so a late response updates the store rather than
  // a dead component's state.
  //
  // `autoLoad: false` is for subscribers that stay mounted while hidden
  // (AddTechnicianSheet): without it, merely rendering the TechniciansScreen
  // fires a GET the user never asked for — the sheet loads on its own open
  // effect instead.
  useEffect(() => {
    if (autoLoad && !snapshot.hasLoaded && !inFlight) {
      void loadSkills();
    }
  }, [autoLoad, snapshot.hasLoaded]);

  /** Re-fetch — for pull-to-refresh and retry after a failed load. Always
   *  intentional, so it forces past the focus-refresh throttle. */
  const refresh = useCallback(() => loadSkills({ force: true }), []);

  return {
    skills: snapshot.skills,
    count: snapshot.skills.length,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    hasLoaded: snapshot.hasLoaded,
    lastLoadedAt: snapshot.lastLoadedAt,
    refresh,
    clear: clearSkills,
  };
}
