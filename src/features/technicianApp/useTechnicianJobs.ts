/**
 * useTechnicianJobs — the technician side's source of truth for their own
 * jobs, from `GET /jobs` (the server scopes technician-role calls to the
 * caller: the `technicianId` param is silently ignored, so never send it).
 *
 * Same API-backed shared-store pattern as `useJobs`: one module-level state
 * object, any number of subscribers via `useSyncExternalStore`. Two tabs, two
 * queries — Today (default window) and History (`scope=history`, statuses
 * pinned to `completed` + `cancelled`, cursor-paginated) — each with its own
 * loading/error/throttle state.
 *
 * Not MMKV-persisted: same reasoning as `useJobs`, the list is server truth.
 *
 * The screens own the fetch schedule (each tab's `useFocusEffect` calls
 * `loadToday`/`loadHistory`); this module only holds state and loaders.
 *
 * The Epic 4 seam lives in `setHydrators`. Both hydration paths return
 * `Promise<Paginated<ApiJob>>`; the offline sync store will fake the envelope
 * so screens never change. Screens import the hook only — never `jobService`.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { jobService } from '../../services';
import type { ApiError, ApiJob, JobDetail, Paginated } from '../../services';
import { FOCUS_REFRESH_TTL_MS } from '../../constants';

export interface TechnicianJobsState {
  today: ApiJob[];
  history: ApiJob[];
  historyCursor: string | null;
  historyHasMore: boolean;
  /** True while the first Today load is in flight (nothing to show yet). */
  isLoadingToday: boolean;
  /** True while the first History load is in flight. */
  isLoadingHistory: boolean;
  /** True while a next History page is being fetched (footer spinner). */
  isLoadingMore: boolean;
  errorToday: string | null;
  errorHistory: string | null;
  /** False until a load has completed, so "empty" can't be confused with "not fetched". */
  hasLoadedToday: boolean;
  hasLoadedHistory: boolean;
  /**
   * Last SUCCESSFUL load per tab. Two timestamps, not one: Today and History
   * are different queries — a Today load landing must not throttle away a
   * History tab focus (and vice versa).
   */
  lastLoadedAtToday: number | null;
  lastLoadedAtHistory: number | null;
}

const INITIAL: TechnicianJobsState = {
  today: [],
  history: [],
  historyCursor: null,
  historyHasMore: false,
  isLoadingToday: true,
  isLoadingHistory: true,
  isLoadingMore: false,
  errorToday: null,
  errorHistory: null,
  hasLoadedToday: false,
  hasLoadedHistory: false,
  lastLoadedAtToday: null,
  lastLoadedAtHistory: null,
};

// --- Shared store: two queries, any number of subscribers --------------------
const subscribers = new Set<() => void>();
let state: TechnicianJobsState = INITIAL;

function setState(next: Partial<TechnicianJobsState>) {
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
 * Bumped by `clearTechnicianJobs`. Any response that lands after a bump is
 * stale — it must not commit rows into the just-reset store (e.g. a late GET
 * arriving after logout).
 */
let resetGen = 0;

/**
 * Bumped by every optimistic row write (`upsertTechnicianJob`). A load that
 * started before a mutation must not commit over it — its response carries
 * the pre-mutation server page and would silently revert the optimistic row
 * until the next refetch.
 */
let dataGen = 0;

// --- Epic 4 hydration seam ----------------------------------------------------
/**
 * One hydrator per tab; both return the same envelope so Epic 4 can re-point
 * them at the sync store (faking `Paginated`) without touching screens.
 * Today deliberately sends no params; History pins the scope + statuses
 * itself — without `scope: 'history'` the server's default `today` scope
 * day-filters `scheduled_start` and past jobs can never render.
 */
type Hydrator = (cursor?: string) => Promise<Paginated<ApiJob>>;

let hydrateToday: Hydrator = () => jobService.list({});
let hydrateHistory: Hydrator = cursor =>
  jobService.list({ scope: 'history', status: ['completed', 'cancelled'], cursor });

/** Swaps both hydration paths. Epic 4 only — nothing else should call this. */
export function setHydrators(today: Hydrator, history: Hydrator): void {
  hydrateToday = today;
  hydrateHistory = history;
}

/**
 * Throttle check per tab. The `elapsed >= 0` guard keeps a device clock
 * stepped backwards (NTP/DST/manual correction) from reading as "fresh" and
 * silently blocking refetches — same guard `useCustomers` keeps.
 */
function isThrottled(lastLoadedAt: number | null): boolean {
  if (!lastLoadedAt) return false;
  const elapsed = Date.now() - lastLoadedAt;
  return elapsed >= 0 && elapsed < FOCUS_REFRESH_TTL_MS;
}

// --- Today -------------------------------------------------------------------
let todayInFlight: Promise<void> | null = null;

/**
 * Loads Today's window. Throttled: skipped within `FOCUS_REFRESH_TTL_MS` of a
 * success unless `opts.force` (pull-to-refresh / retry). A forced refresh
 * queues behind the request already running rather than joining it — joining
 * would resolve with pre-refresh rows and stamp a fresh throttle window over
 * stale data. A failed load keeps prior rows on screen.
 */
export function loadToday(opts: { force?: boolean } = {}): Promise<void> {
  if (todayInFlight) {
    return todayInFlight.then(() => loadToday(opts));
  }
  if (!opts.force && isThrottled(state.lastLoadedAtToday) && state.hasLoadedToday) {
    return Promise.resolve();
  }
  // Clearing `errorToday` here makes every attempt transition the error
  // through null, so a repeat failure re-shows a dismissed banner.
  setState({ isLoadingToday: !state.hasLoadedToday, errorToday: null });
  const gen = resetGen;
  const dataGenAtStart = dataGen;
  todayInFlight = hydrateToday()
    .then(page => {
      // Store cleared (resetGen) or a local mutation landed while we were
      // away (dataGen): the response predates the store's current truth.
      if (gen !== resetGen || dataGen !== dataGenAtStart) return;
      setState({
        today: page.data,
        hasLoadedToday: true,
        isLoadingToday: false,
        errorToday: null,
        lastLoadedAtToday: Date.now(),
      });
    })
    .catch((error: ApiError) => {
      if (gen !== resetGen) return;
      console.warn('[useTechnicianJobs] GET /jobs (today) failed →', error);
      setState({ isLoadingToday: false, errorToday: error.message });
    })
    .finally(() => {
      todayInFlight = null;
    });
  return todayInFlight;
}

// --- History -------------------------------------------------------------------
let historyInFlight: Promise<void> | null = null;
let historyInFlightKind: 'load' | 'more' = 'load';

/**
 * Loads History page 1. Same throttle/queue/keep-rows semantics as
 * `loadToday`; same-query page-1 callers share the request already running.
 * Pages through `loadMoreHistory` — a plain `loadHistory()` call always
 * restarts at page 1.
 */
export function loadHistory(opts: { force?: boolean } = {}): Promise<void> {
  if (historyInFlight) {
    // Share only a same-kind page-1 request; queue behind anything else
    // (a page-2 fetch, or a forced refresh) so it is never swallowed.
    if (historyInFlightKind === 'load' && !opts.force) {
      return historyInFlight;
    }
    return historyInFlight.then(() => loadHistory(opts));
  }
  if (!opts.force && isThrottled(state.lastLoadedAtHistory) && state.hasLoadedHistory) {
    return Promise.resolve();
  }
  setState({ isLoadingHistory: !state.hasLoadedHistory, errorHistory: null });
  historyInFlightKind = 'load';
  const gen = resetGen;
  const dataGenAtStart = dataGen;
  historyInFlight = hydrateHistory()
    .then(page => {
      if (gen !== resetGen || dataGen !== dataGenAtStart) return;
      setState({
        history: page.data,
        historyCursor: page.nextCursor,
        historyHasMore: page.hasMore,
        hasLoadedHistory: true,
        isLoadingHistory: false,
        errorHistory: null,
        lastLoadedAtHistory: Date.now(),
      });
    })
    .catch((error: ApiError) => {
      if (gen !== resetGen) return;
      console.warn('[useTechnicianJobs] GET /jobs (history) failed →', error);
      setState({ isLoadingHistory: false, errorHistory: error.message });
    })
    .finally(() => {
      historyInFlight = null;
    });
  return historyInFlight;
}

/**
 * Fetches the next History page with the stored cursor and appends it,
 * guarding against double-taps, missing cursors and rows that moved between
 * pages (no duplicate ids in `history`).
 */
export function loadMoreHistory(): Promise<void> {
  if (historyInFlight || state.isLoadingMore || !state.historyHasMore || !state.historyCursor) {
    return Promise.resolve();
  }
  const cursor = state.historyCursor;
  setState({ isLoadingMore: true });
  historyInFlightKind = 'more';
  const gen = resetGen;
  const dataGenAtStart = dataGen;
  historyInFlight = hydrateHistory(cursor)
    .then(page => {
      if (gen !== resetGen || dataGen !== dataGenAtStart) return;
      const existingIds = new Set(state.history.map(j => j.id));
      const appended = page.data.filter(j => !existingIds.has(j.id));
      setState({
        history: [...state.history, ...appended],
        historyCursor: page.nextCursor,
        historyHasMore: page.hasMore,
        isLoadingMore: false,
        errorHistory: null,
        lastLoadedAtHistory: Date.now(),
      });
    })
    .catch((error: ApiError) => {
      if (gen !== resetGen) return;
      console.warn('[useTechnicianJobs] GET /jobs (history page 2+) failed →', error);
      setState({ isLoadingMore: false, errorHistory: error.message });
    })
    .finally(() => {
      historyInFlight = null;
    });
  return historyInFlight;
}

// --- Row updates -----------------------------------------------------------------
/**
 * The list-store row for a freshly fetched job detail — the ApiJob fields
 * ONLY. The detail's embedded technician/customer profiles, activity log and
 * attachments (whose presigned URLs are 1-hour and must never be persisted)
 * are stripped before anything lands in the shared store. Lives here because
 * every store writer needs the exact same strip — a missed field would leak
 * a 1-hour URL into whatever screen persists the row.
 */
export function apiJobOf(detail: JobDetail): ApiJob {
  const {
    technician: _technician,
    customer: _customer,
    activityLog: _activityLog,
    attachments: _attachments,
    ...row
  } = detail;
  return row;
}

/**
 * Replaces one row in whichever array currently holds its id — for a caller
 * that just mutated the job and already holds the full row (Epic 3's
 * workflow actions). Deliberately does NOT move a row between arrays: a job
 * that just completed stays in `today` until the next History load picks it
 * up server-side — hand-rebalancing would guess at server sort order.
 *
 * Named `…TechnicianJob` (not `upsertJob`, like the owner store exports) so
 * a barrel-style import can never silently grab the owner-side prepend
 * semantics instead of this replace-in-place one.
 *
 * Also bumps `dataGen`: any load still in flight started before this
 * mutation, so its response is pre-mutation and must not commit over the
 * optimistic row.
 */
export function upsertTechnicianJob(job: ApiJob): void {
  const inToday = state.today.some(j => j.id === job.id);
  const inHistory = state.history.some(j => j.id === job.id);
  if (!inToday && !inHistory) return;
  dataGen += 1;
  setState({
    ...(inToday ? { today: state.today.map(j => (j.id === job.id ? job : j)) } : {}),
    ...(inHistory ? { history: state.history.map(j => (j.id === job.id ? job : j)) } : {}),
  });
}

/** Reset to the pre-login state. Call on technician logout. */
export function clearTechnicianJobs(): void {
  resetGen += 1; // an in-flight response is now stale — it must not commit
  setState(INITIAL);
}

export function useTechnicianJobs() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  /** Re-fetch page 1 — for pull-to-refresh and the error view's retry. */
  const refreshToday = useCallback(() => loadToday({ force: true }), []);
  const refreshHistory = useCallback(() => loadHistory({ force: true }), []);

  return {
    ...snapshot,
    loadToday,
    loadHistory,
    loadMoreHistory,
    refreshToday,
    refreshHistory,
  };
}