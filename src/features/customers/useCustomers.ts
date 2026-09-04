/**
 * useCustomers — shared store for the tenant's customer list, from
 * `GET /customers`.
 *
 * Same `useSyncExternalStore` pattern as `useMyProfile`: one module-level
 * state object, any number of subscribers. The Customers list and NewJob's
 * picker both read the same fetch, so there is exactly one path to the
 * endpoint and the two screens can never disagree about the rows.
 *
 * Fetches *all* pages via `customerService.listAll` — see the reasoning there.
 * A picker needs the complete list, not the first page.
 *
 * The first `useCustomers()` to mount triggers the load; later mounts reuse
 * whatever is in the store. In-flight requests are de-duplicated, so two
 * screens mounting at once still make one request. Screen focus refetches go
 * through `loadCustomers`, which is throttled to one request per
 * `FOCUS_REFRESH_TTL_MS` (unless forced), so rapid tab switches stay cheap —
 * same shape as `useMyProfile`/`useJobs`.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { customerService } from '../../services';
import type { ApiError } from '../../services';
import { FOCUS_REFRESH_TTL_MS } from '../../constants';
import type { Customer } from './types';

export interface CustomersState {
  customers: Customer[];
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

const INITIAL: CustomersState = {
  customers: [],
  // Starts true, so the very first render is a loader, never empty copy.
  isLoading: true,
  error: null,
  hasLoaded: false,
  lastLoadedAt: null,
};

// --- Shared store: one list, any number of subscribers ----------------------
const subscribers = new Set<() => void>();
let state: CustomersState = INITIAL;

/**
 * Tracks the current request so concurrent callers share it rather than
 * firing duplicate GETs (e.g. Customers and NewJob's picker mounting in the
 * same frame).
 */
let inFlight: Promise<void> | null = null;

/**
 * Monotonic id per request. A forced refresh runs *alongside* an older
 * in-flight request (see `loadCustomers`), so an older response can settle
 * after a newer one — and must not overwrite the newer state.
 */
let requestSeq = 0;

function setState(next: Partial<CustomersState>) {
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

async function fetchCustomers(): Promise<void> {
  const seq = ++requestSeq;
  // Only show the loader when there's nothing on screen yet; a refresh over
  // existing rows shouldn't blank them out.
  setState({ isLoading: state.customers.length === 0, error: null });
  try {
    const customers = await customerService.listAll();
    // A forced request can supersede this one (both run in parallel); a late
    // settling response from the older request must not overwrite the newer
    // state or stamp an older success.
    if (seq !== requestSeq) return;
    // `lastLoadedAt` records SUCCESS only: a failed refresh must leave the
    // throttle window based on the data actually on screen, so the next
    // focus (or pull-to-refresh) can retry immediately if it wants to.
    setState({
      customers,
      isLoading: false,
      error: null,
      hasLoaded: true,
      lastLoadedAt: Date.now(),
    });
  } catch (error) {
    console.warn('[useCustomers] GET /customers failed →', error);
    if (seq !== requestSeq) return;
    // `customers` is deliberately retained: a failed refresh keeps the stale
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
 * skipped, so a `useFocusEffect` calling this on every tab focus costs at
 * most one request per window. `opts.force` bypasses the throttle AND any
 * in-flight request — pull-to-refresh and post-mutation refreshes are always
 * intentional and must land immediately.
 */
export function loadCustomers(opts: { force?: boolean } = {}): Promise<void> {
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
  const request = fetchCustomers().finally(() => {
    if (inFlight === request) {
      inFlight = null;
    }
  });
  inFlight = request;
  return request;
}

/**
 * Inserts (or replaces) one customer without a round trip.
 *
 * For the create-then-select flow: a caller that has just POSTed a customer
 * already holds the full row, and needs it selectable *immediately*. Relying on
 * a follow-up refresh instead leaves a window — and, if that refresh fails, a
 * permanent state — where the new customer is selected but missing from the
 * list, which renders as an empty picker over a non-empty selection.
 *
 * Newest first, matching what the endpoint returns.
 */
export function upsertCustomer(customer: Customer): void {
  const rest = state.customers.filter(c => c.id !== customer.id);
  setState({ customers: [customer, ...rest], hasLoaded: true });
}

export function useCustomers() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  // First mount kicks off the load. Nothing to abort on unmount: the store
  // outlives the component, so a late response updates the store rather than
  // a dead component's state.
  useEffect(() => {
    if (!snapshot.hasLoaded && !inFlight) {
      void loadCustomers();
    }
  }, [snapshot.hasLoaded]);

  /** Re-fetch — for pull-to-refresh and after a successful save. Always
   *  intentional, so it forces past the focus-refresh throttle. */
  const refresh = useCallback(() => loadCustomers({ force: true }), []);

  /** Reset to the pre-login state. Call on logout. */
  const clear = useCallback(() => {
    setState(INITIAL);
  }, []);

  return {
    customers: snapshot.customers,
    hasCustomers: snapshot.customers.length > 0,
    count: snapshot.customers.length,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    hasLoaded: snapshot.hasLoaded,
    refresh,
    clear,
  };
}
