/**
 * useOffices — offices list state for the Offices screen (Story 15-4).
 *
 * No pagination (locked scope decision): the endpoint is unbounded and this
 * hook fetches the FULL list including archived rows in one call, splitting
 * them into the active and archived groups the screen renders. Offices are
 * physical branches — tens per tenant, not thousands; the recorded
 * threshold for revisiting server-side pagination is ~100 offices.
 *
 * Every focus refetches — no throttle: returning from the form must show a
 * create/edit/archive immediately, and this screen has no pull-to-refresh
 * to recover from a skipped refresh (a 15-4 review decision). A latest-wins
 * sequence guard keeps a slow earlier refetch from overwriting a newer
 * one's rows/error.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { officesService } from '../../../services';
import type { ApiError } from '../../../services';
import type { Office } from '../../../types/office';

export interface UseOfficesResult {
  /** All fetched rows, active + archived. */
  offices: Office[];
  activeOffices: Office[];
  archivedOffices: Office[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
}

export function useOffices(): UseOfficesResult {
  const [offices, setOffices] = useState<Office[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  // Latest-wins guard: only the highest-issued fetch may commit its result.
  const fetchSeqRef = useRef(0);

  const fetchList = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const rows = await officesService.list(true);
      if (seq !== fetchSeqRef.current) return;
      setOffices(rows);
      setHasLoaded(true);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setError(err as ApiError);
    } finally {
      if (seq === fetchSeqRef.current) setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(() => fetchList(), [fetchList]);

  // Focus always refetches — returning from the form re-fetches so a
  // create/edit/archive is visible without a manual pull.
  useFocusEffect(
    useCallback(() => {
      void fetchList();
    }, [fetchList]),
  );

  const activeOffices = useMemo(
    () => offices.filter((office) => office.archivedAt === null),
    [offices],
  );
  const archivedOffices = useMemo(
    () => offices.filter((office) => office.archivedAt !== null),
    [offices],
  );

  return { offices, activeOffices, archivedOffices, isLoading, hasLoaded, error, refresh };
}
