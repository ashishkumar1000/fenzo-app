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
 * SCOPE: gating only. This holds the two things routing decisions need —
 * role and tenantId — and nothing that gets rendered. Anything displayed
 * (name, phone, company name) belongs to `useMyProfile` (`GET /users/me`),
 * which is authoritative and refetchable. Duplicating display fields here
 * would let them go stale the moment the user edits their profile.
 *
 * NOTE: the token itself lives in `services/authToken.ts`, not here.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { storage } from '../../services/storage';
import type { UserRole } from '../../services';

const KEY = 'fenzit.session';

export type AuthStatus = 'pending' | 'done';

/** The gating bits — set once, by `AuthFlow`, on `complete()`. Nothing here is rendered. */
export interface Session {
  role: UserRole;
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

// --- Session expiry (story 5.3) --------------------------------------------
// True when the global 401 handler just force-logged the user out, so the
// login screen can explain WHY the person is back at step 1 ("Session
// expired — please log in again."). In-memory only, deliberately NOT
// persisted: restarting the app is a fresh page, not an expiry event.
//
// Shares `subscribers` with the session store — any auth change notifies
// both hooks, each reading only its own snapshot via useSyncExternalStore.
let sessionExpired = false;

/**
 * Forces the user back to the login screen, remembering that the logout was
 * an *expiry* — called by the global 401 handler in `App.tsx`.
 *
 * Order inside the 401 flow (App.tsx) is: data-store resets first, this
 * second — the gate flips into a clean world.
 */
export function expireSession(): void {
  sessionExpired = true;
  // `setSession` notifies every subscriber unconditionally — session readers
  // re-render on the gate flip, and any mounted `useSessionExpired()` picks
  // up the flag from the same notification. No extra notify needed.
  setSession(null);
}

/**
 * Clears the expiry notice: on the user dismissing the banner, or on the
 * next successful login (`complete` below) — either way the person has seen
 * it or is past it.
 */
export function clearSessionExpired(): void {
  if (!sessionExpired) return;
  sessionExpired = false;
  subscribers.forEach(notify => notify());
}

/** Reads the expiry flag — the login screen's banner is the only consumer. */
export function useSessionExpired(): boolean {
  return useSyncExternalStore(subscribe, () => sessionExpired);
}

export function useAuth() {
  const currentSession = useSyncExternalStore(subscribe, getSnapshot);
  const status: AuthStatus = currentSession ? 'done' : 'pending';

  const complete = useCallback((next: Session) => {
    // A fresh login also closes out any lingering expiry notice — even a
    // re-login triggered by an expiry is a new, explained-none session.
    clearSessionExpired();
    setSession(next);
  }, []);

  /** Clears the gate — useful for a future "sign out". */
  const reset = useCallback(() => {
    setSession(null);
  }, []);

  return { status, session: currentSession, complete, reset };
}
