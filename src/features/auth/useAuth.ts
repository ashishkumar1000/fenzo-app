/**
 * Tracks whether the user has finished account setup, so the auth flow only
 * shows until they have an account — and, once signed in, WHO they are
 * (`session.role`), so `App.tsx` can route owners and technicians to their
 * own side of the app. Backed by MMKV — the read is synchronous, so there
 * is no loading state and no first-frame flash.
 *
 * Multiple components call `useAuth()` (App.tsx's gate, the More/Profile
 * screens' Log out). Rather than each holding its own private `useState` —
 * which would go out of sync the moment one instance calls `reset()` —
 * every call shares a single module-level store via `useSyncExternalStore`.
 * One source of truth, all instances re-render together.
 *
 * NOTE: This is the client-side gate only. Real token/session handling
 * belongs in `services/authToken.ts` (already wired) — this hook only
 * tracks the lightweight identity bits the UI needs to render the right
 * screens, not the token itself.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { storage } from '../../services/storage';
import type { UserRole } from '../../services';

const KEY = 'fenzit.session';

export type AuthStatus = 'pending' | 'done';

/** The identity bits every screen needs once signed in — set once, by `AuthFlow`, on `complete()`. */
export interface Session {
  role: UserRole;
  /** `null` for owners (no name field yet); set for technicians at invite time. */
  name: string | null;
  phone: string;
  tenantId: string;
}

function load(): Session | null {
  const raw = storage.getString(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

// --- Shared store: one value, any number of subscribers -------------------
const subscribers = new Set<() => void>();

let session: Session | null = load();

function setSession(next: Session | null) {
  session = next;
  if (next) {
    storage.set(KEY, JSON.stringify(next));
  } else {
    storage.remove(KEY);
  }
  subscribers.forEach(notify => notify());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  return session;
}

export function useAuth() {
  const currentSession = useSyncExternalStore(subscribe, getSnapshot);
  const status: AuthStatus = currentSession ? 'done' : 'pending';

  const complete = useCallback((next: Session) => {
    setSession(next);
  }, []);

  /** Clears the gate — useful for a future "sign out". */
  const reset = useCallback(() => {
    setSession(null);
  }, []);

  return { status, session: currentSession, complete, reset };
}
