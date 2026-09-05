/**
 * useAddressAutosuggest — the address picker's data layer: session-token
 * management, debounced/gated autosuggest search, and the terminating
 * resolve call. `AddressPickerSheet` is a thin render layer over this.
 *
 * One session token is minted per screen mount and never regenerated —
 * every autosuggest call AND the resolve call that ends the session reuse
 * the exact same token (Google Places Autocomplete session-token billing
 * semantics; see `epic-1-context.md`).
 *
 * `phase` collapses every moving piece (query length, in-flight fetch, last
 * autosuggest error, in-flight resolve, last resolve error) into the epic's
 * 8 states, in strict precedence, so `AddressPickerSheet` only has to
 * switch on one value instead of re-deriving this logic itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from '../../hooks';
import { placesService } from '../../services';
import type { ApiError, PlaceSuggestion, ResolvedPlace } from '../../services';
import { generateIdempotencyKey } from '../../utils';

/** Trimmed input shorter than this never fires a network call. */
const MIN_QUERY_LENGTH = 3;
/** Debounce window between the last keystroke and firing autosuggest. */
const DEBOUNCE_MS = 300;

export type AddressPickerPhase =
  | 'idle'
  | 'below-threshold'
  | 'loading'
  | 'results'
  | 'no-results'
  | 'error'
  | 'resolving'
  | 'resolve-failed';

/**
 * True when a failure is this hook's own abort (a superseded/cancelled
 * request), not a real error — same detection shape as `JobDetailScreen`'s
 * `isAbort` helper (status/code, `AbortError` name, or the signal itself).
 */
function isAbort(error: unknown, signal: AbortSignal): boolean {
  const apiError = error as (ApiError & { name?: string }) | undefined;
  return (
    (apiError?.status === 0 && apiError?.code === 'CANCELLED') ||
    apiError?.name === 'AbortError' ||
    signal.aborted
  );
}

export function useAddressAutosuggest() {
  // Minted once per mount, never regenerated — shared by every autosuggest
  // call and the terminating resolve call for this screen's lifetime.
  // `generateIdempotencyKey` is the repo's existing hand-rolled UUID v4
  // generator (utils/idempotency.ts, ladder over crypto.randomUUID /
  // getRandomValues / Math.random) — reused rather than hand-rolling a
  // second generator for this one call site (no `uuid` package is added).
  //
  // `useState`'s lazy initializer, not `useMemo`: React's docs are explicit
  // that `useMemo` is a performance hint it's allowed to discard and
  // recompute, never a correctness guarantee — `useState`'s initializer is
  // guaranteed to run exactly once per component instance, which is what
  // "never regenerated" actually requires.
  const [sessionToken, setSessionToken] = useState(() => generateIdempotencyKey());
  // Mirrored into a ref so `fetchSuggestions`/`resolvePlace` can read the
  // latest token without depending on the state value itself: `reset()`
  // changes `sessionToken` and `query` in the same render, and if
  // `fetchSuggestions` depended on `sessionToken`, that alone would recreate
  // it and re-fire the debounced-search effect below — on whatever
  // `debouncedQuery` still stale-holds from before the reset, since its own
  // 300ms timer hasn't caught up yet. Reading via ref keeps that effect
  // gated purely on `debouncedQuery` actually changing.
  const sessionTokenRef = useRef(sessionToken);
  sessionTokenRef.current = sessionToken;

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, DEBOUNCE_MS);

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [autosuggestError, setAutosuggestError] = useState<string | null>(null);

  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Only the latest autosuggest request's response may land — an older,
  // superseded request's response (success or failure) must be discarded
  // even if it settles after a newer one already fired.
  const latestControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  // Retry re-fires the exact query that failed, not necessarily whatever
  // the input currently holds (the owner may have kept typing since).
  const lastFiredQueryRef = useRef<string | null>(null);
  // The resolve call's own controller — aborted separately from the
  // autosuggest one on unmount, so a resolve in flight when the screen
  // unmounts doesn't try to update state on a dead component.
  const resolveControllerRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback(
    async (trimmedQuery: string) => {
      const seq = ++requestSeqRef.current;
      // A newer request always wins — abort whatever the previous one left
      // in flight rather than letting two responses race.
      latestControllerRef.current?.abort();
      const controller = new AbortController();
      latestControllerRef.current = controller;
      lastFiredQueryRef.current = trimmedQuery;

      setIsLoading(true);
      setAutosuggestError(null);
      // A fresh search means a fresh attempt — a stale resolve failure from
      // a previous selection shouldn't linger over new results.
      setResolveError(null);

      try {
        const results = await placesService.autosuggest(
          trimmedQuery,
          sessionTokenRef.current,
          controller.signal,
        );
        if (seq !== requestSeqRef.current) return;
        setSuggestions(results);
        setIsLoading(false);
        setHasLoadedOnce(true);
      } catch (caught) {
        if (isAbort(caught, controller.signal)) return;
        if (seq !== requestSeqRef.current) return;
        setSuggestions([]);
        setIsLoading(false);
        setHasLoadedOnce(true);
        setAutosuggestError((caught as ApiError)?.message || 'Something went wrong');
      }
    },
    [],
  );

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      // Below the gate: cancel anything in flight and reset to a clean
      // slate — shrinking back below 3 chars must not leave a stale result
      // set, spinner, or resolve-failed banner showing.
      latestControllerRef.current?.abort();
      requestSeqRef.current += 1;
      setIsLoading(false);
      setSuggestions([]);
      setAutosuggestError(null);
      setResolveError(null);
      setHasLoadedOnce(false);
      return;
    }
    void fetchSuggestions(trimmed);
  }, [debouncedQuery, fetchSuggestions]);

  // Abort whatever's in flight — autosuggest AND resolve — when the screen
  // unmounts.
  useEffect(() => {
    return () => {
      latestControllerRef.current?.abort();
      resolveControllerRef.current?.abort();
    };
  }, []);

  const retry = useCallback(() => {
    const lastQuery = lastFiredQueryRef.current;
    if (!lastQuery) return;
    void fetchSuggestions(lastQuery);
  }, [fetchSuggestions]);

  /**
   * Starts a genuinely fresh search session: clears every field back to its
   * initial value AND mints a new session token. `AddressPickerSheet` (an
   * always-mounted modal, not a per-search screen mount) calls this each
   * time it opens — without it, a second search within the same "Add
   * customer" visit would reuse the first search's session token, breaking
   * the "one token per search session" cost-control invariant the mounted
   * screen used to get for free.
   */
  const reset = useCallback(() => {
    latestControllerRef.current?.abort();
    resolveControllerRef.current?.abort();
    requestSeqRef.current += 1;
    lastFiredQueryRef.current = null;
    setQuery('');
    setSuggestions([]);
    setIsLoading(false);
    setHasLoadedOnce(false);
    setAutosuggestError(null);
    setResolvingPlaceId(null);
    setResolveError(null);
    setSessionToken(generateIdempotencyKey());
  }, []);

  /**
   * Resolves a tapped suggestion. Returns the resolved place on success (the
   * caller navigates back with it) or `null` on failure (the caller keeps
   * the list on screen — `resolveError`/`phase` already reflect the
   * failure).
   *
   * Re-entrant-safe: a double-tap on the same (or another) row before the
   * `disabled` prop's re-render commits must not fire a second concurrent
   * resolve — while one is already in flight, this returns `null`
   * immediately instead of starting another.
   */
  const resolvePlace = useCallback(
    async (placeId: string): Promise<ResolvedPlace | null> => {
      if (resolvingPlaceId) return null;

      const controller = new AbortController();
      resolveControllerRef.current = controller;
      setResolvingPlaceId(placeId);
      setResolveError(null);
      try {
        const resolved = await placesService.resolve(
          placeId,
          sessionTokenRef.current,
          controller.signal,
        );
        // The screen may have unmounted (or this call may have been
        // superseded) while the request was in flight — don't touch state
        // that no longer has a live consumer.
        if (controller.signal.aborted) return null;
        setResolvingPlaceId(null);
        return resolved;
      } catch (caught) {
        if (isAbort(caught, controller.signal)) return null;
        setResolvingPlaceId(null);
        setResolveError((caught as ApiError)?.message || 'Something went wrong');
        return null;
      }
    },
    [resolvingPlaceId],
  );

  const trimmedLength = query.trim().length;

  const phase: AddressPickerPhase = useMemo(() => {
    if (resolvingPlaceId) return 'resolving';
    if (resolveError) return 'resolve-failed';
    if (trimmedLength === 0) return 'idle';
    if (trimmedLength < MIN_QUERY_LENGTH) return 'below-threshold';
    if (isLoading) return 'loading';
    if (autosuggestError) return 'error';
    if (hasLoadedOnce && suggestions.length === 0) return 'no-results';
    return 'results';
  }, [
    resolvingPlaceId,
    resolveError,
    trimmedLength,
    isLoading,
    autosuggestError,
    hasLoadedOnce,
    suggestions.length,
  ]);

  return {
    query,
    setQuery,
    phase,
    suggestions,
    errorMessage:
      phase === 'error' ? autosuggestError : phase === 'resolve-failed' ? resolveError : null,
    resolvingPlaceId,
    retry,
    resolvePlace,
    reset,
  };
}
