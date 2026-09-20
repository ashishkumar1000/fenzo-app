/**
 * useReports — shared store for the owner's report history, from
 * `GET /reports` (story 12-6).
 *
 * Same `useSyncExternalStore` pattern as `useCustomers`: one module-level
 * state object, any number of subscribers, in-flight de-duplication, a
 * TTL-throttled focus refresh, and `registerReset` teardown on logout.
 *
 * On top of the standard shape this store owns two report-specific jobs:
 *
 * - `createReport` — POSTs the request with a FRESH idempotency key (a
 *   reused key would replay the first response for 24h and silently queue
 *   nothing new) and force-refetches the list on success, so the new
 *   "Queued" row appears immediately.
 * - polling: while any row is `queued`/`generating`, the hook re-fetches
 *   every `REPORTS_POLL_MS` (FR20's 5 s list-polling). Realtime
 *   (`report_ready` / `report_failed` broadcasts via the owner
 *   notifications channel) force-refetches alongside it as a faster hint —
 *   the poll is the designed fallback, so neither alone is load-bearing.
 *
 * The list is the first page (20 rows) only — a request's fate is decided
 * within minutes, so a report scrolled out of the first page never needs
 * live updates.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { reportService } from '../../services';
import type { ApiError, CreateReportRequest, ReportListItem } from '../../services';
import { registerReset } from '../../services/resetRegistry';
import { FOCUS_REFRESH_TTL_MS } from '../../constants';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { REPORTS_POLL_MS } from './reportModel';

export interface ReportsState {
  reports: ReportListItem[];
  /** True while the *first* load is in flight (nothing to show yet). */
  isLoading: boolean;
  /** Human-readable failure from the list GET, safe to render. */
  error: string | null;
  /** False until a list load has completed — "empty" ≠ "not fetched". */
  hasLoaded: boolean;
  /** Timestamp of the last SUCCESSFUL list load (focus-refresh throttle). */
  lastLoadedAt: number | null;
  /** True while a Generate submit is in flight (button spinner). */
  isSubmitting: boolean;
  /** Failure of the last Generate submit, safe to render. */
  submitError: string | null;
  /** The failed row currently being retried (its Retry button spins). */
  retryingId: string | null;
  /** Failure of the last retry, safe to render above the history list. */
  retryError: string | null;
}

const INITIAL: ReportsState = {
  reports: [],
  isLoading: true,
  error: null,
  hasLoaded: false,
  lastLoadedAt: null,
  isSubmitting: false,
  submitError: null,
  retryingId: null,
  retryError: null,
};

// --- Shared store: one list, any number of subscribers ----------------------
const subscribers = new Set<() => void>();
let state: ReportsState = INITIAL;
let inFlight: Promise<void> | null = null;
let requestSeq = 0;

function setState(next: Partial<ReportsState>) {
  state = { ...state, ...next };
  subscribers.forEach(notify => notify());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  return state;
}

async function fetchReports(): Promise<void> {
  const seq = ++requestSeq;
  setState({ isLoading: state.reports.length === 0, error: null });
  try {
    const page = await reportService.listReports();
    if (seq !== requestSeq) return;
    setState({
      reports: page.data,
      isLoading: false,
      error: null,
      hasLoaded: true,
      lastLoadedAt: Date.now(),
    });
  } catch (error) {
    console.warn('[useReports] GET /reports failed →', error);
    if (seq !== requestSeq) return;
    // Retain stale rows on a failed refresh (useCustomers rule) — the banner
    // explains why they may be out of date.
    setState({
      isLoading: false,
      error: (error as ApiError)?.message || 'Something went wrong',
      hasLoaded: true,
    });
  }
}

/**
 * Loads the history list, reusing any request already in flight. Throttled
 * to one request per `FOCUS_REFRESH_TTL_MS` unless `force` — polling,
 * realtime events and post-submit refreshes are all forced (they must land
 * immediately), focus refreshes are throttled.
 */
export function loadReports(opts: { force?: boolean } = {}): Promise<void> {
  if (inFlight && !opts.force) {
    return inFlight;
  }
  const elapsed = Date.now() - (state.lastLoadedAt ?? 0);
  const fresh = elapsed >= 0 && elapsed < FOCUS_REFRESH_TTL_MS;
  if (!opts.force && fresh) {
    return Promise.resolve();
  }
  const request = fetchReports().finally(() => {
    if (inFlight === request) {
      inFlight = null;
    }
  });
  inFlight = request;
  return request;
}

/**
 * Queues a report request. Mints a FRESH idempotency key per call — a retry
 * of a failed submit is a NEW intent and must be allowed to create a row;
 * only a timeout-retry of the SAME submit reusing the key would replay the
 * stored response (and the backend's create is only replay-protected per
 * key). On success the list is force-refetched so the new row shows at once.
 *
 * Rejects with `ApiError` — the screen maps the report-specific codes to
 * friendly copy.
 */
export async function createReportRequest(body: CreateReportRequest): Promise<void> {
  setState({ isSubmitting: true, submitError: null });
  try {
    await reportService.createReport(body, generateIdempotencyKey());
    setState({ isSubmitting: false });
    await loadReports({ force: true });
  } catch (error) {
    console.warn('[useReports] POST /reports failed →', error);
    const apiError = error as ApiError;
    const submitError =
      apiError?.code === 'REPORT_IN_FLIGHT_LIMIT'
        ? 'You have a report generating. Wait for it to finish before creating another.'
        : apiError?.message || 'Something went wrong. Try again.';
    setState({
      isSubmitting: false,
      submitError,
    });
    throw error;
  }
}

/**
 * Story 12-7: re-queues a FAILED request in place — the same history row
 * flips back to "Queued" and regenerates (no duplicate row). Fresh
 * idempotency key per call, same rule as create. On success the list is
 * force-refetched so the row shows "Queued" at once, which also arms the
 * 5 s polling via `hasPending`. Rejects with `ApiError` — the screen maps
 * the report-specific codes to friendly copy.
 */
export async function retryReportRequest(id: string): Promise<void> {
  setState({ retryingId: id, retryError: null });
  try {
    await reportService.retryReport(id, generateIdempotencyKey());
    setState({ retryingId: null });
    await loadReports({ force: true });
  } catch (error) {
    console.warn('[useReports] POST /reports/:id/retry failed →', error);
    setState({
      retryingId: null,
      retryError:
        (error as ApiError)?.message || 'Could not retry. Try again.',
    });
    throw error;
  }
}

/** Reset to the pre-login state (reset registry on logout / 401). */
export function clearReports(): void {
  requestSeq += 1;
  inFlight = null;
  setState(INITIAL);
}

registerReset(clearReports);

export function useReports() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  // First mount kicks off the load (store outlives the component — a late
  // response updates the store, not a dead component).
  useEffect(() => {
    if (!snapshot.hasLoaded && !inFlight) {
      void loadReports();
    }
  }, [snapshot.hasLoaded]);

  // FR20's 5 s list-polling: only while a row is queued/generating, and only
  // while a Reports surface is mounted (this hook runs there). Polls are
  // forced — the throttle exists for focus refreshes, and a 5 s poll IS the
  // intended cadence.
  const hasPending = snapshot.reports.some(
    r => r.status === 'queued' || r.status === 'generating',
  );
  useEffect(() => {
    if (!hasPending) return undefined;
    const id = setInterval(() => {
      void loadReports({ force: true });
    }, REPORTS_POLL_MS);
    return () => clearInterval(id);
  }, [hasPending]);

  /** Re-fetch — pull-to-refresh and screen focus. Always intentional. */
  const refresh = useCallback(() => loadReports({ force: true }), []);

  const clear = useCallback(() => {
    clearReports();
  }, []);

  return {
    reports: snapshot.reports,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    hasLoaded: snapshot.hasLoaded,
    isSubmitting: snapshot.isSubmitting,
    submitError: snapshot.submitError,
    retryingId: snapshot.retryingId,
    retryError: snapshot.retryError,
    hasPending,
    refresh,
    clear,
  };
}