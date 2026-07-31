/**
 * useCustomers — shared store for the tenant's customer list, from
 * `GET /customers`.
 *
 * Same `useSyncExternalStore` pattern as `useMyProfile`: one module-level
 * state object, any number of subscribers, in-flight requests de-duplicated so
 * two screens mounting in the same frame make one request.
 *
 * Fetches *all* pages via `customerService.listAll` — see the reasoning there.
 * A picker needs the complete list, not the first page.
 *
 * This replaces the previous MMKV-backed version, which cached a local-only
 * list and was imported by nothing. Its own TODO asked for this swap.
 *
 * NOTE: `CustomersScreen` still fetches independently into component state,
 * so there are two paths to the same endpoint today. Migrating that screen
 * onto this store is the obvious follow-up; it also wants focus-refetch and
 * pull-to-refresh, which is why it wasn't folded in blind.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { customerService } from '../../services';
import type { ApiError } from '../../services';
import type { Customer } from './types';

export interface CustomersState {
  customers: Customer[];
  /** True while the *first* load is in flight (nothing to show yet). */
  isLoading: boolean;
  /** Human-readable failure message from `ApiError`, safe to render. */
  error: string | null;
  /** False until a load has completed, so "empty" can't be confused with "not fetched". */
  hasLoaded: boolean;
}

const INITIAL: CustomersState = {
  customers: [],
  isLoading: true,
  error: null,
  hasLoaded: false,
};

const subscribers = new Set<() => void>();
let state: CustomersState = INITIAL;
let inFlight: Promise<void> | null = null;

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
  // Only show the loader when there's nothing on screen yet; a refresh over
  // existing rows shouldn't blank them out.
  setState({ isLoading: state.customers.length === 0, error: null });
  try {
    const customers = await customerService.listAll();
    setState({ customers, isLoading: false, error: null, hasLoaded: true });
  } catch (error) {
    console.warn('[useCustomers] GET /customers failed →', error);
    setState({
      isLoading: false,
      error: (error as ApiError).message,
      hasLoaded: true,
    });
  }
}

/** Loads the list, reusing any request already in flight. */
export function loadCustomers(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = fetchCustomers().finally(() => {
    inFlight = null;
  });
  return inFlight;
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

  useEffect(() => {
    if (!snapshot.hasLoaded && !inFlight) {
      void loadCustomers();
    }
  }, [snapshot.hasLoaded]);

  /** Re-fetch — for retry, and after creating a customer. */
  const refresh = useCallback(() => loadCustomers(), []);

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
