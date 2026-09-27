/**
 * useHolidays — holiday list state + CRUD actions.
 *
 * Refetches on every focus; mutations re-validate the list so the row
 * state matches the BE. `impact(date)` is a one-shot — the form sheet
 * owns its own debounce + abort.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { holidaysService } from '../../../services';
import type {
  ApiError,
  CreateHolidayRequest,
  Holiday,
  HolidayImpactResponse,
  UpdateHolidayRequest,
} from '../../../services';

export interface UseHolidaysResult {
  holidays: Holiday[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
  create: (input: CreateHolidayRequest) => Promise<Holiday>;
  update: (id: string, patch: UpdateHolidayRequest) => Promise<Holiday>;
  remove: (id: string) => Promise<void>;
  impact: (date: string) => Promise<HolidayImpactResponse>;
  isSaving: boolean;
  saveError: ApiError | null;
  /**
   * Drops a held saveError (15-6 review P3). The form sheet is conditionally
   * mounted, so the screen clears this on every sheet open — a stale error
   * from a previous open must never render in (or re-key its 409 onto) a
   * freshly reopened sheet.
   */
  clearSaveError: () => void;
}

export function useHolidays(): UseHolidaysResult {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);

  // Latest-wins: focus refetch + create/update/remove-triggered refetch can
  // overlap, and a slower earlier response must never overwrite a newer one.
  const fetchSeqRef = useRef(0);
  const fetchList = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const rows = await holidaysService.list();
      if (seq !== fetchSeqRef.current) return;
      setHolidays(rows);
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

  const create = useCallback(
    async (input: CreateHolidayRequest): Promise<Holiday> => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const row = await holidaysService.create(input);
        // Best-effort revalidate (15-6 review P2): the write succeeded, so
        // the sheet must close and report success even if the refresh fails
        // — a throw here would keep the sheet open and a retry would POST
        // an already-created holiday (a guaranteed 409).
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

  const update = useCallback(
    async (id: string, patch: UpdateHolidayRequest): Promise<Holiday> => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const row = await holidaysService.update(id, patch);
        // Best-effort revalidate — see create.
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

  const remove = useCallback(
    async (id: string): Promise<void> => {
      setIsSaving(true);
      setSaveError(null);
      try {
        await holidaysService.remove(id);
        // Best-effort revalidate — see create. A DELETE retry after a
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

  const impact = useCallback(
    (date: string): Promise<HolidayImpactResponse> =>
      holidaysService.impact(date),
    [],
  );

  const clearSaveError = useCallback(() => setSaveError(null), []);

  return {
    holidays,
    isLoading,
    hasLoaded,
    error,
    refresh,
    create,
    update,
    remove,
    impact,
    isSaving,
    saveError,
    clearSaveError,
  };
}
