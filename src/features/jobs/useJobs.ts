/**
 * useJobs — source of truth for the job list. Same shared-store pattern as
 * useTechnicians: MMKV-backed, synchronous, shared across callers.
 *
 * Starts empty for a new owner (the empty-state flow).
 *
 *   TODO(api): replace `load()` with `GET /jobs` and have mutations call the
 *   backend, then reconcile into the store. Screens stay unchanged.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { storage } from '../../services/storage';
import type { Job } from './types';

const KEY = 'fenzit.jobs';

function load(): Job[] {
  try {
    const raw = storage.getString(KEY);
    return raw ? (JSON.parse(raw) as Job[]) : [];
  } catch {
    return [];
  }
}

const subscribers = new Set<() => void>();
let jobs: Job[] = load();

function commit(next: Job[]) {
  jobs = next;
  storage.set(KEY, JSON.stringify(next));
  subscribers.forEach(notify => notify());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  return jobs;
}

export function useJobs() {
  const list = useSyncExternalStore(subscribe, getSnapshot);

  const reset = useCallback(() => commit([]), []);

  return {
    jobs: list,
    hasJobs: list.length > 0,
    count: list.length,
    reset,
  };
}
