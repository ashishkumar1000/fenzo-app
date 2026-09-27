/**
 * useWeeklyOffs — tenant-default weekly-off state + save action.
 *
 * State (default/next/history) refetches on every focus, mirroring
 * `useOffices`'s pattern. The save action commits through the service,
 * then re-fetches the GET so the canonical response wins (matches
 * `OfficesScreen`'s form pattern).
 *
 * Navigation is owned by the screen, not the hook.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { weeklyOffsService } from '../../../services';
import type {
  ApiError,
  SetWeeklyOffRequest,
  WeeklyOffDefaultResponse,
} from '../../../services';

export interface UseWeeklyOffsResult {
  defaultView: WeeklyOffDefaultResponse['default'];
  nextView: WeeklyOffDefaultResponse['next'];
  history: WeeklyOffDefaultResponse['history'];
  /**
   * Skeleton contract (15-6 review docblock pass): `isLoading && !hasLoaded`
   * is the FIRST load only — the screen renders its full-screen spinner for
   * exactly that pair. Every later refetch (focus, save, pull-to-refresh)
   * keeps `hasLoaded` true, so the screen shows the previous rows with
   * `isLoading` true instead of flashing the skeleton.
   */
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
  /**
   * Persists the tenant default + re-fetches the canonical response.
   * Resolves with the re-fetched GET, falling back to the PUT echo when the
   * re-fetch fails (a refresh-only failure must not mask a successful save
   * — see `fetchDefault`'s fallback path).
   */
  saveDefault: (input: SetWeeklyOffRequest) => Promise<WeeklyOffDefaultResponse>;
  saveError: ApiError | null;
  isSaving: boolean;
}

export function useWeeklyOffs(): UseWeeklyOffsResult {
  const [data, setData] = useState<WeeklyOffDefaultResponse>({
    default: null,
    next: null,
    history: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);

  // Latest-wins: focus refetch + Save-triggered refetch can overlap, and a
  // slower earlier response must never overwrite a newer one (the 15-4
  // review added this to `useOffices`; 15-6 needs it for the same reason).
  const fetchSeqRef = useRef(0);
  // Returns the fetched rows, or null when superseded (a newer fetch won
  // the race). `fallback` (15-6 review P9): the post-save refetch's failure
  // path seeds the write's echo under the seq guard INSTEAD of surfacing as
  // a load error — the write succeeded, so the shown rows must move to the
  // echo and the screen must not flash "couldn't refresh" about data that
  // is not stale. Without a fallback (focus/pull-to-refresh refetches) a
  // failure keeps the previous rows and lands in `error` as before.
  const fetchDefault = useCallback(
    async (
      fallback?: WeeklyOffDefaultResponse,
    ): Promise<WeeklyOffDefaultResponse | null> => {
      const seq = ++fetchSeqRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const rows = await weeklyOffsService.getDefault();
        if (seq !== fetchSeqRef.current) return null;
        setData(rows);
        setHasLoaded(true);
        return rows;
      } catch (err) {
        if (seq !== fetchSeqRef.current) return null;
        if (fallback) {
          setData(fallback);
          setHasLoaded(true);
          return fallback;
        }
        setError(err as ApiError);
        return null;
      } finally {
        if (seq === fetchSeqRef.current) setIsLoading(false);
      }
    },
    [],
  );

  // Resolves when the refetch settles, so pull-to-refresh can clear its
  // spinner on completion (15-6 review iteration 1). Fire-and-forget
  // callers (`void refresh()`) are unaffected.
  const refresh = useCallback(
    async () => {
      await fetchDefault();
    },
    [fetchDefault],
  );

  useFocusEffect(
    useCallback(() => {
      void fetchDefault();
    }, [fetchDefault]),
  );

  const saveDefault = useCallback(
    async (input: SetWeeklyOffRequest): Promise<WeeklyOffDefaultResponse> => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const rows = await weeklyOffsService.setDefault(input);
        // 15-6 review (P5): re-fetch the GET through the same seq-guarded
        // path as the focus refetch instead of trusting the PUT echo — a
        // stale in-flight focus GET must never overwrite what we just
        // saved, and the canonical server state wins (matches
        // `useHolidays`). P9: on a re-fetch failure the ECHO is seeded (so
        // the screen re-seeds from the just-saved state) and no load error
        // is surfaced — the save itself succeeded.
        const fresh = await fetchDefault(rows);
        return fresh ?? rows;
      } catch (err) {
        setSaveError(err as ApiError);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [fetchDefault],
  );

  return {
    defaultView: data.default,
    nextView: data.next,
    history: data.history,
    isLoading,
    hasLoaded,
    error,
    refresh,
    saveDefault,
    saveError,
    isSaving,
  };
}
