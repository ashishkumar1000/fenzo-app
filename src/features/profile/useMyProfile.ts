/**
 * useMyProfile — the single source of truth for the signed-in user's profile
 * (`GET /users/me`): their name, and their tenant's company name.
 *
 * Same shared-store pattern as `useAuth` and `useTechnicians`: one
 * module-level state object, any number of subscribers via
 * `useSyncExternalStore`. Home and More both read the same fetch, so
 * switching tabs doesn't re-hit the endpoint and the two screens can never
 * disagree about the owner's name.
 *
 * The first `useMyProfile()` to mount triggers the load; later mounts reuse
 * whatever is already in the store. In-flight calls are de-duplicated, so two
 * screens mounting at once still make one request.
 *
 * Nothing here falls back to placeholder copy — if the request fails,
 * `profile` stays `null` and `error` carries the `ApiError` message for the
 * screen to show.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { usersApi } from '../../services';
import type { ApiError, MyProfile } from '../../services';

export interface MyProfileState {
  profile: MyProfile | null;
  /** True while the *first* load is in flight (i.e. there's nothing to show yet). */
  isLoading: boolean;
  /** Human-readable failure message from `ApiError`, safe to render. */
  error: string | null;
}

const INITIAL: MyProfileState = {
  profile: null,
  // Starts xtrue, so the very first render is a loader, never empty copy.
  isLoading: true,
  error: null,
};

// --- Shared store: one profile, any number of subscribers ------------------
const subscribers = new Set<() => void>();
let state: MyProfileState = INITIAL;

/**
 * Tracks the current request so concurrent callers share it rather than
 * firing duplicate GETs (e.g. Home and More mounting in the same frame).
 */
let inFlight: Promise<void> | null = null;

function setState(next: Partial<MyProfileState>) {
  state = { ...state, ...next };
  subscribers.forEach(notify => notify());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  // Returns the same object reference until something actually changes —
  // required by useSyncExternalStore to avoid an infinite re-render loop.
  return state;
}

async function fetchProfile(): Promise<void> {
  // Only flip the loading flag when there's nothing on screen yet; a refresh
  // over existing data should not blank the screen out.
  setState({ isLoading: state.profile === null, error: null });
  try {
    const profile = await usersApi.getMe();
    setState({ profile, isLoading: false, error: null });
  } catch (error) {
    console.warn('[useMyProfile] GET /users/me failed →', error);
    setState({ isLoading: false, error: (error as ApiError).message });
  }
}

/** Loads the profile, reusing any request already in flight. */
export function loadMyProfile(): Promise<void> {
  if (inFlight) {
    return inFlight;
  }
  inFlight = fetchProfile().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function useMyProfile() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  // First mount kicks off the load. Nothing to abort on unmount: the store
  // outlives the component, so a late response updates the store rather than
  // a dead component's state.
  useEffect(() => {
    if (!snapshot.profile && !snapshot.error && !inFlight) {
      void loadMyProfile();
    }
  }, [snapshot.profile, snapshot.error]);

  /** Re-fetch — for pull-to-refresh and the error view's retry. */
  const refresh = useCallback(() => loadMyProfile(), []);

  /**
   * Clears `error` without touching `profile`. For dismissing the
   * refresh-failed banner: the stale-but-valid profile stays on screen.
   */
  const dismissError = useCallback(() => {
    setState({ error: null });
  }, []);

  /** Reset to the pre-login state. Call on logout. */
  const clear = useCallback(() => {
    setState(INITIAL);
  }, []);

  return {
    profile: snapshot.profile,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    refresh,
    dismissError,
    clear,
  };
}
