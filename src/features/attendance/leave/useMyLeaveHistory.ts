/**
 * useMyLeaveHistory — the technician Attendance tab's leave history list
 * (Story 17-6, spec D3): cursor pages of the OWN history (`GET
 * /attendance/me/leave`, first page 10), appended by the embedded
 * "Load more" button (a footer spinner idiom doesn't apply inside the
 * tab's ScrollView). Focus refetches the first page silently (the
 * attendance screens' focus-refetch contract) so a leave submitted on the
 * apply screen is visible on return; a load-more failure keeps the rows
 * AND the cursor so the button simply retries.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { attendanceLeaveService } from '../../../services';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';

const PAGE_SIZE = 10;

export function useMyLeaveHistory() {
  const [items, setItems] = useState<LeaveRequestRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [endReached, setEndReached] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingFirst, setLoadingFirst] = useState(true);
  const [error, setError] = useState(false);
  const mounted = useRef(true);
  const loadedRef = useRef(false);
  const busyRef = useRef(false);
  // The appended count for the Load more announcement needs the seen ids.
  const loadedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchFirst = useCallback(() => {
    if (busyRef.current) return; // a load-more may not interleave a reset
    busyRef.current = true; // and a reset may not interleave a load-more
    setLoadingFirst(true);
    setError(false);
    attendanceLeaveService
      .listMyLeave({ limit: PAGE_SIZE })
      .then(res => {
        if (!mounted.current) return;
        loadedRef.current = true;
        loadedIdsRef.current = new Set(res.data.map(row => row.id));
        setItems(res.data);
        setCursor(res.nextCursor);
        setEndReached(!res.hasMore);
        setLoadingFirst(false);
      })
      .catch(() => {
        if (!mounted.current) return;
        if (!loadedRef.current) setError(true);
        // With rows already shown, a silent refetch failure keeps them —
        // the same posture as the owner queue's refresh-with-data.
        setLoadingFirst(false);
      })
      .finally(() => {
        busyRef.current = false;
      });
  }, []);

  useEffect(() => {
    fetchFirst();
  }, [fetchFirst]);

  // Silent first-page refetch on tab focus (only once loaded — the mount
  // fetch owns the first load).
  useFocusEffect(
    useCallback(() => {
      if (loadedRef.current) fetchFirst();
      return undefined;
    }, [fetchFirst]),
  );

  /** Appends the next page; resolves with the appended count (0 on a
   *  failure — rows + cursor stay, so the button simply retries). */
  const loadMore = useCallback((): Promise<number> => {
    if (busyRef.current || endReached || cursor == null) {
      return Promise.resolve(0);
    }
    busyRef.current = true;
    setLoadingMore(true);
    return attendanceLeaveService
      .listMyLeave({ cursor, limit: PAGE_SIZE })
      .then(res => {
        if (!mounted.current) return 0;
        const appended = res.data.filter(
          row => !loadedIdsRef.current.has(row.id),
        );
        loadedIdsRef.current = new Set([
          ...loadedIdsRef.current,
          ...appended.map(row => row.id),
        ]);
        setItems(prev => [
          ...prev.filter(item => !res.data.some(r => r.id === item.id)),
          ...res.data,
        ]);
        setCursor(res.nextCursor);
        setEndReached(!res.hasMore);
        setLoadingMore(false);
        return appended.length;
      })
      .catch(() => {
        if (mounted.current) setLoadingMore(false);
        return 0;
      })
      .finally(() => {
        busyRef.current = false;
      });
  }, [cursor, endReached]);

  /** Swaps a WRITE response's refreshed view into the visible rows in
   *  place (17-7's cancel) — the write view carries no `employeeName`, so
   *  the row's own value is kept (the 17-6 replaceRow discipline). */
  const applyWriteView = useCallback((view: LeaveRequestRow) => {
    setItems(prev =>
      prev.map(item =>
        item.id === view.id
          ? { ...view, employeeName: view.employeeName ?? item.employeeName }
          : item,
      ),
    );
  }, []);

  return {
    items,
    hasCursor: cursor != null && !endReached,
    loadingMore,
    loadingFirst,
    error,
    loaded: loadedRef.current,
    reload: fetchFirst,
    loadMore,
    applyWriteView,
  };
}
