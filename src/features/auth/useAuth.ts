/**
 * Tracks whether the user has finished account setup, so the auth flow only
 * shows until they have an account. Backed by MMKV — the read is synchronous,
 * so there is no loading state and no first-frame flash.
 *
 * Multiple components call `useAuth()` (App.tsx's gate, the More screen's
 * Log out). Rather than each holding its own private `useState` — which
 * would go out of sync the moment one instance calls `reset()` — every call
 * shares a single module-level store via `useSyncExternalStore`. One source
 * of truth, all instances re-render together.
 *
 * NOTE: This is the client-side gate only. Real session/token handling belongs
 * in `src/services/authService.ts` (see TODOs in the screens); persist the
 * issued token here once the backend is wired up.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { storage } from '../../services/storage';

const KEY = 'fenzit.accountSetupComplete';

export type AuthStatus = 'pending' | 'done';

// --- Shared store: one value, any number of subscribers -------------------
const subscribers = new Set<() => void>();

let status: AuthStatus = storage.getBoolean(KEY) ? 'done' : 'pending';

function setStatus(next: AuthStatus) {
  status = next;
  subscribers.forEach(notify => notify());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  return status;
}

export function useAuth() {
  const currentStatus = useSyncExternalStore(subscribe, getSnapshot);

  const complete = useCallback(() => {
    storage.set(KEY, true);
    setStatus('done');
  }, []);

  /** Clears the gate — useful for a future "sign out". */
  const reset = useCallback(() => {
    storage.remove(KEY);
    setStatus('pending');
  }, []);

  return { status: currentStatus, complete, reset };
}
