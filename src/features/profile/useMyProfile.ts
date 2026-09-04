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
 * screens mounting at once still make one request. Screen focus refetches go
 * through `loadMyProfile`, which is throttled to one request per
 * `FOCUS_REFRESH_TTL_MS` (unless forced), so rapid tab switches stay cheap.
 *
 * Nothing here falls back to placeholder copy — if the request fails,
 * `profile` stays `null` and `error` carries the `ApiError` message for the
 * screen to show.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { usersApi } from '../../services';
import type { ApiError, MyProfile } from '../../services';
import { FOCUS_REFRESH_TTL_MS } from '../../constants';

export interface MyProfileState {
  profile: MyProfile | null;
  /** True while the *first* load is in flight (i.e. there's nothing to show yet). */
  isLoading: boolean;
  /** Human-readable failure message from `ApiError`, safe to render. */
  error: string | null;
  /**
   * Timestamp of the last SUCCESSFUL load — drives the focus-refresh throttle.
   * A failed refresh never touches it, so a retry is never throttled away by
   * data that was already stale when the failure happened.
   */
  lastLoadedAt: number | null;
}

const INITIAL: MyProfileState = {
  profile: null,
  // Starts true, so the very first render is a loader, never empty copy.
  isLoading: true,
  error: null,
  lastLoadedAt: null,
};

// --- Shared store: one profile, any number of subscribers ------------------
const subscribers = new Set<() => void>();
let state: MyProfileState = INITIAL;

/**
 * Tracks the current request so concurrent callers share it rather than
 * firing duplicate GETs (e.g. Home and More mounting in the same frame).
 */
let inFlight: Promise<void> | null = null;

/**
 * Monotonic id per request. A forced refresh runs *alongside* an older
 * in-flight request (see `loadMyProfile`), so an older response can settle
 * after a newer one — and must not overwrite the newer state.
 */
let requestSeq = 0;

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
  const seq = ++requestSeq;
  // Only flip the loading flag when there's nothing on screen yet; a refresh
  // over existing data should not blank the screen out (no flicker on a
  // background focus refresh — only the FIRST load shows the spinner).
  setState({ isLoading: state.profile === null, error: null });
  try {
    const profile = await usersApi.getMe();
    // A forced request can supersede this one (both run in parallel); a late
    // settling response from the older request must not overwrite the newer
    // state or stamp an older success.
    if (seq !== requestSeq) return;
    // `lastLoadedAt` records SUCCESS only: a failed refresh must leave the
    // throttle window based on the data actually on screen, so the next
    // focus (or pull-to-refresh) can retry immediately if it wants to.
    setState({ profile, isLoading: false, error: null, lastLoadedAt: Date.now() });
  } catch (error) {
    console.warn('[useMyProfile] GET /users/me failed →', error);
    if (seq !== requestSeq) return;
    // `profile` is deliberately retained: a failed refresh keeps the stale
    // data on screen and surfaces `error` as the dismissible banner.
    // The rejection isn't always an `ApiError` (aborted request, network
    // TypeError, malformed response) — fall back to generic copy when the
    // rejection carries no usable message, so the failure still renders a
    // banner instead of silently looking like success.
    setState({
      isLoading: false,
      error: (error as ApiError)?.message || 'Something went wrong',
    });
  }
}

/**
 * Loads the profile, reusing any request already in flight.
 *
 * Throttled: a load whose last SUCCESS was within `FOCUS_REFRESH_TTL_MS` is
 * skipped, so a `useFocusEffect` calling this on every tab focus costs at
 * most one request per window. `opts.force` bypasses the throttle AND any
 * in-flight request — pull-to-refresh and successful job mutations are
 * always intentional and must land immediately.
 */
export function loadMyProfile(opts: { force?: boolean } = {}): Promise<void> {
  // Only unforced callers may join the request already running: a forced
  // caller (post-mutation) needs data the old request started fetching
  // *before* the mutation, so joining it would resolve with pre-mutation
  // counts and stamp a success from before the mutation. Force issues a
  // fresh request and runs alongside the old one.
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
  const request = fetchProfile().finally(() => {
    if (inFlight === request) {
      inFlight = null;
    }
  });
  inFlight = request;
  return request;
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

  /** Re-fetch — for pull-to-refresh and the error view's retry. Always
   *  intentional, so it forces past the focus-refresh throttle. */
  const refresh = useCallback(() => loadMyProfile({ force: true }), []);

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
