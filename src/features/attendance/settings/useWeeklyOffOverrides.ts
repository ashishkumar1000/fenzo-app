/**
 * useWeeklyOffOverrides — per-employee weekly-off override state + actions.
 *
 * Same focus-refetch + save-and-revalidate pattern as `useWeeklyOffs`.
 * Each `saveOverride`/`removeOverride` re-fetches the list so the row
 * state matches the BE — matches `OfficesScreen`'s save-then-refresh flow.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { weeklyOffsService } from '../../../services';
import type {
  ApiError,
  SetWeeklyOffRequest,
  WeeklyOffOverrideResponse,
} from '../../../services';

export interface UseWeeklyOffOverridesResult {
  overrides: WeeklyOffOverrideResponse[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
  saveOverride: (
    employeeId: string,
    input: SetWeeklyOffRequest,
  ) => Promise<WeeklyOffOverrideResponse>;
  removeOverride: (employeeId: string, effectiveFrom?: string) => Promise<void>;
  isSaving: boolean;
  saveError: ApiError | null;
  /**
   * Drops a held saveError (15-6 review P3). The sheet is conditionally
   * mounted, so its host clears this on every sheet open — a stale error
   * from a previous open must never render in (or re-key its 409 onto) a
   * freshly reopened sheet.
   */
  clearSaveError: () => void;
}

export function useWeeklyOffOverrides(): UseWeeklyOffOverridesResult {
  const [overrides, setOverrides] = useState<WeeklyOffOverrideResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);

  // Latest-wins: focus refetch + Save/Remove-triggered refetch can overlap,
  // and a slower earlier response must never overwrite a newer one.
  const fetchSeqRef = useRef(0);
  const fetchList = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const rows = await weeklyOffsService.listOverrides();
      if (seq !== fetchSeqRef.current) return;
      setOverrides(rows);
      setHasLoaded(true);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setError(err as ApiError);
    } finally {
      if (seq === fetchSeqRef.current) setIsLoading(false);
    }
  }, []);

  // Resolves when the refetch settles, so pull-to-refresh can clear its
  // spinner on completion (15-6 review iteration 1). Fire-and-forget
  // callers (`void refresh()`) are unaffected.
  const refresh = useCallback(() => fetchList(), [fetchList]);

  useFocusEffect(
    useCallback(() => {
      void fetchList();
    }, [fetchList]),
  );

  const saveOverride = useCallback(
    async (
      employeeId: string,
      input: SetWeeklyOffRequest,
    ): Promise<WeeklyOffOverrideResponse> => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const row = await weeklyOffsService.setOverride(employeeId, input);
        // Best-effort revalidate (15-6 review P2): the write succeeded, so
        // the sheet must close and report success even if the refresh fails
        // — a throw here would keep the sheet open and the retry would
        // re-PUT an already-persisted change.
        await fetchList().catch(() => {});
        return row;
      } catch (err) {
        setSaveError(err as ApiError);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [fetchList],
  );

  const removeOverride = useCallback(
    async (employeeId: string, effectiveFrom?: string): Promise<void> => {
      setIsSaving(true);
      setSaveError(null);
      try {
        await weeklyOffsService.removeOverride(employeeId, effectiveFrom);
        // Best-effort revalidate — see saveOverride. A DELETE retry after a
        // refresh failure would 404 on the already-removed row.
        await fetchList().catch(() => {});
      } catch (err) {
        setSaveError(err as ApiError);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [fetchList],
  );

  const clearSaveError = useCallback(() => setSaveError(null), []);

  return {
    overrides,
    isLoading,
    hasLoaded,
    error,
    refresh,
    saveOverride,
    removeOverride,
    isSaving,
    saveError,
    clearSaveError,
  };
}
