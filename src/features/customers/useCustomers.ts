/**
 * useCustomers — source of truth for the customer list. Same shared-store
 * pattern as useTechnicians: MMKV-backed, synchronous, shared across callers.
 *
 * Starts empty for a new owner (the empty-state flow). Customers are normally
 * created as a side effect of creating a job, or added manually.
 *
 *   TODO(api): replace `load()` with `GET /customers` and have mutations call
 *   the backend, then reconcile into the store. Screens stay unchanged.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { storage } from '../../services/storage';
import type { Customer } from './types';

const KEY = 'fenzit.customers';

function load(): Customer[] {
  try {
    const raw = storage.getString(KEY);
    return raw ? (JSON.parse(raw) as Customer[]) : [];
  } catch {
    return [];
  }
}

const subscribers = new Set<() => void>();
let customers: Customer[] = load();

function commit(next: Customer[]) {
  customers = next;
  storage.set(KEY, JSON.stringify(next));
  subscribers.forEach(notify => notify());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  return customers;
}

export function useCustomers() {
  const list = useSyncExternalStore(subscribe, getSnapshot);

  const reset = useCallback(() => commit([]), []);

  return {
    customers: list,
    hasCustomers: list.length > 0,
    count: list.length,
    reset,
  };
}
