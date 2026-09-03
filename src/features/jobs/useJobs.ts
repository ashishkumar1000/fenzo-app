/**
 * useJobs — the Jobs tab's source of truth, from `GET /jobs`.
 *
 * Same API-backed shared-store pattern as `useMyProfile`/`useCustomers`:
 * one module-level state object, any number of subscribers via
 * `useSyncExternalStore`, in-flight requests de-duplicated. Unlike those,
 * this store holds only one day's window per filter and pages, so the state
 * carries the cursor alongside the rows.
 *
 * Not MMKV-persisted: the list is server truth for the day, and a stale cache
 * would show jobs that were reassigned or cancelled elsewhere. `GET /users/me`'s
 * embedded `jobs` block is bootstrap-only — this store is the tab's authority.
 *
 * The first `useJobs()` to mount triggers the load; focus handlers call
 * `loadJobs()` again, which is throttled (skipped within 15s of a success) so
 * tab-hopping doesn't hammer the endpoint. Filter changes bypass the throttle.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { jobService } from '../../services';
import type { ApiError, ApiJob } from '../../services';
import type { JobFilter } from './types';

interface JobsState {
  jobs: ApiJob[];
  filter: JobFilter;
  /** True while the *first* load is in flight (i.e. there's nothing to show yet). */
  isLoading: boolean;
  /** True while a next page is being fetched (footer spinner). */
  isLoadingMore: boolean;
  /** Human-readable failure message from `ApiError`, safe to render. */
  error: string | null;
  /** False until a load has completed, so "empty" can't be confused with "not fetched". */
  hasLoaded: boolean;
  nextCursor: string | null;
  hasMore: boolean;
  /** Timestamp of the last successful load — drives the 15s refetch throttle. */
  lastLoadedAt: number | null;
}

const INITIAL: JobsState = {
  jobs: [],
  filter: 'all',
  isLoading: true,
  isLoadingMore: false,
  error: null,
  hasLoaded: false,
  nextCursor: null,
  hasMore: false,
  lastLoadedAt: null,
};

// --- Shared store: one window, any number of subscribers --------------------
const subscribers = new Set<() => void>();
let state: JobsState = INITIAL;

/**
 * Tracks the current request so concurrent callers share it rather than
 * firing duplicate GETs (e.g. focus firing while a filter load is running).
 * Only *same-query* page-1 callers share it — a different filter or a forced
 * refresh queues behind instead of being swallowed (see `loadJobs`).
 */
let inFlight: Promise<void> | null = null;
let inFlightKind: 'load' | 'more' = 'load';
let inFlightFilter: JobFilter = 'all';

/**
 * Bumped by `clearJobs`. Any response that lands after a bump is stale —
 * it must not commit rows (or an error) into the just-reset store, e.g. a
 * late GET arriving after logout.
 */
let resetGen = 0;

function setState(next: Partial<JobsState>) {
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

/**
 * Filter chip → API status values. `all` sends no status param, which the
 * server treats as every status in the day window.
 */
const filterToStatuses = (f: JobFilter) => (f === 'all' ? undefined : [f]);

/**
 * Loads page 1 for `filter` (default: the filter already on screen).
 *
 * Same-query callers share the request already running; a different filter
 * or a forced refresh queues behind it instead of being dropped — whichever
 * request happens to be running (even a page-2 fetch) must not swallow them.
 * Also skipped when a success for this same filter landed less than 15s ago,
 * unless `opts.force` (pull-to-refresh). A filter change always loads fresh:
 * it's a different query, not a refresh.
 */
export function loadJobs(filter = state.filter, opts: { force?: boolean } = {}): Promise<void> {
  if (inFlight) {
    if (inFlightKind === 'load' && filter === inFlightFilter && !opts.force) {
      return inFlight;
    }
    return inFlight.then(() => loadJobs(filter, opts));
  }
  const fresh = state.lastLoadedAt && Date.now() - state.lastLoadedAt < 15_000;
  if (!opts.force && fresh && filter === state.filter && state.hasLoaded) {
    return Promise.resolve();
  }
  const changedFilter = filter !== state.filter;
  const gen = resetGen;
  // Show the loader only when there's nothing on screen yet (or the filter
  // just changed) — a refresh over existing rows must not blank them out.
  // Clearing `error` here also makes every attempt transition the error
  // through null, so a repeat failure re-shows a dismissed banner.
  setState({ filter, isLoading: !state.hasLoaded || changedFilter, error: null });
  inFlightKind = 'load';
  inFlightFilter = filter;
  inFlight = jobService
    .list({ status: filterToStatuses(filter) })
    .then(page => {
      if (gen !== resetGen) return; // store was cleared while we were away
      setState({
        jobs: page.data,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        hasLoaded: true,
        isLoading: false,
        error: null,
        lastLoadedAt: Date.now(),
      });
    })
    .catch((error: ApiError) => {
      if (gen !== resetGen) return;
      console.warn('[useJobs] GET /jobs failed →', error);
      // Keep prior rows on screen: a failed refresh must not empty the list.
      // But a failed *filter change* must not show the old filter's rows
      // under the new chip — drop them and surface the full error view.
      setState({
        isLoading: false,
        error: error.message,
        ...(changedFilter ? { jobs: [], nextCursor: null, hasMore: false } : {}),
      });
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Fetches the next page with the stored cursor and appends it, guarding
 * against double-taps, missing cursors and rows that moved between pages.
 */
export function loadMoreJobs(): Promise<void> {
  if (inFlight || state.isLoadingMore || !state.hasMore || !state.nextCursor) {
    return Promise.resolve();
  }
  const gen = resetGen;
  setState({ isLoadingMore: true, error: null });
  inFlightKind = 'more';
  inFlightFilter = state.filter;
  inFlight = jobService
    .list({ status: filterToStatuses(state.filter), cursor: state.nextCursor })
    .then(page => {
      if (gen !== resetGen) return; // store was cleared while we were away
      const existingIds = new Set(state.jobs.map(j => j.id));
      const appended = page.data.filter(j => !existingIds.has(j.id));
      setState({
        jobs: [...state.jobs, ...appended],
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        isLoadingMore: false,
        error: null,
        lastLoadedAt: Date.now(),
      });
    })
    .catch((error: ApiError) => {
      if (gen !== resetGen) return;
      console.warn('[useJobs] GET /jobs (page 2+) failed →', error);
      setState({ isLoadingMore: false, error: error.message });
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Puts one row at the top of the list without a round trip — for a caller
 * that just created the job and already holds the full row. Skipped when the
 * active filter excludes the job's status: a freshly created (scheduled) job
 * must not appear under a Done chip.
 */
export function upsertJob(job: ApiJob): void {
  const statuses = filterToStatuses(state.filter);
  if (statuses && !statuses.includes(job.status)) return;
  const rest = state.jobs.filter(j => j.id !== job.id);
  setState({ jobs: [job, ...rest] });
}

/** Reset to the pre-login state. Call on logout. */
export function clearJobs(): void {
  resetGen += 1; // an in-flight response is now stale — it must not commit
  setState(INITIAL);
}

export function useJobs() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  // First mount kicks off the load. Nothing to abort on unmount: the store
  // outlives the component, so a late response updates the store rather than
  // a dead component's state. Later mounts (tab switches) reuse the store;
  // screens call `loadJobs()` on focus for the throttled refetch.
  useEffect(() => {
    if (!snapshot.hasLoaded && !inFlight) {
      void loadJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.hasLoaded]);

  /** Re-fetch page 1 — for pull-to-refresh and the error view's retry. */
  const refresh = useCallback(() => loadJobs(state.filter, { force: true }), []);

  /** Switches the active chip and loads that filter fresh. */
  const setFilter = useCallback((next: JobFilter) => {
    if (next === state.filter) return;
    void loadJobs(next);
  }, []);

  return {
    jobs: snapshot.jobs,
    filter: snapshot.filter,
    isLoading: snapshot.isLoading,
    isLoadingMore: snapshot.isLoadingMore,
    error: snapshot.error,
    hasLoaded: snapshot.hasLoaded,
    hasMore: snapshot.hasMore,
    loadJobs,
    loadMoreJobs,
    refresh,
    setFilter,
  };
}
