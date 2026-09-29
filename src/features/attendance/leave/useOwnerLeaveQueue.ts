/**
 * useOwnerLeaveQueue — the owner Leave surface's data orchestration
 * (Story 17-6, spec D1). Owns the per-tab pagination state (the reducer
 * in `ownerLeaveModel` — each tab's `{items, cursor, endReached, loading}`
 * never crosses), the entry/deep-link tab, the stale marks (writes mark
 * BOTH tabs; foregrounding marks both + silently refreshes the visible
 * one), the focus refetch (the attendance screens' focus-refetch
 * contract), pull-to-refresh of the ACTIVE tab only (announced), and the
 * cursor-scoped load-more. The screen renders; this decides.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { attendanceLeaveService } from '../../../services';
import {
  initialOwnerLeaveState,
  ownerLeaveReducer,
  type LeaveTab,
} from './ownerLeaveModel';

const PAGE_SIZE = 20;

/** The hook only subscribes to focus — the structural slice it needs. */
type FocusNavigation = {
  addListener: (event: 'focus', cb: () => void) => () => void;
};

export function useOwnerLeaveQueue(
  navigation: FocusNavigation,
  initialTab: LeaveTab,
) {
  const [state, dispatch] = useReducer(
    ownerLeaveReducer,
    initialOwnerLeaveState(),
  );
  const [activeTab, setActiveTab] = useState<LeaveTab>(initialTab);
  const [refreshing, setRefreshing] = useState(false);
  // WHICH tab's refresh failed — the notice must not bleed onto the other
  // tab's freshly loaded list (17-6 review P3).
  const [refreshFailedTab, setRefreshFailedTab] = useState<LeaveTab | null>(
    null,
  );
  const mounted = useRef(true);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** First page — an entering tab (empty cache) or a stale re-entry. */
  const fetchFirst = useCallback((tab: LeaveTab) => {
    dispatch({ type: 'refreshStart', tab });
    attendanceLeaveService
      .listOwnerLeave({
        ...(tab === 'pending' ? { status: 'pending' } : {}),
        limit: PAGE_SIZE,
      })
      .then(res => {
        if (!mounted.current) return;
        dispatch({
          type: 'refreshSuccess',
          tab,
          items: res.data,
          nextCursor: res.nextCursor,
          hasMore: res.hasMore,
        });
        setRefreshFailedTab(null);
      })
      .catch(() => {
        if (!mounted.current) return;
        dispatch({ type: 'refreshError', tab });
        setRefreshFailedTab(tab);
      });
  }, []);

  // First load of the entering tab.
  useEffect(() => {
    fetchFirst(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link / on-behalf landing: `navigate('OwnerLeave', { tab })` merges
  // the params — consume read-once-then-clear (the house channel idiom).
  useEffect(() => {
    return navigation.addListener('focus', () => {
      const tab = activeTabRef.current;
      // A load-more in flight must not interleave with a first-page
      // refetch (its success would append the pre-refresh page onto the
      // replaced list and replay a stale cursor) — defer via the stale
      // mark; the next entry refetches (17-6 review P2).
      if (stateRef.current[tab].loading) {
        dispatch({ type: 'markStale', tabs: [tab] });
        return;
      }
      if (stateRef.current[tab].loaded) fetchFirst(tab);
    });
  }, [navigation, fetchFirst]);

  // Foregrounding: the cache may be hours old — mark BOTH tabs stale and
  // silently refresh the visible one; the other refetches on its re-entry.
  useEffect(() => {
    const sub = AppState.addEventListener('change', appState => {
      if (appState !== 'active') return;
      dispatch({ type: 'markStale', tabs: ['pending', 'all'] });
      const tab = activeTabRef.current;
      // Same load-more interleave guard as focus: the both-tab stale mark
      // above already schedules the recovery.
      if (!stateRef.current[tab].loading && stateRef.current[tab].loaded) {
        fetchFirst(tab);
      }
    });
    return () => sub.remove();
  }, [fetchFirst]);

  /** Consume a merged `{ tab }` param (read-once-then-clear). */
  const consumeTabParam = useCallback(
    (navTab: LeaveTab, clear: () => void) => {
      clear();
      if (navTab === activeTabRef.current) {
        // Same tab: a loaded, quiet cache still needs the refresh — the
        // param means "something changed out there" (the on-behalf 201).
        // Skip only while the mount effect's own first fetch is in flight.
        const page = stateRef.current[navTab];
        if (page.loaded && !page.loading) fetchFirst(navTab);
        return;
      }
      // A param-driven switch is always an intent to see fresh data (the
      // born-approved request must be visible on landing) — fetch the
      // target unconditionally, loaded or not (17-6 review P1).
      setActiveTab(navTab);
      fetchFirst(navTab);
    },
    [fetchFirst],
  );

  const switchTab = useCallback(
    (tab: LeaveTab) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
      const target = stateRef.current[tab];
      if (!target.loaded || stateRef.current.stale[tab]) fetchFirst(tab);
    },
    [activeTab, fetchFirst],
  );

  // Pull-to-refresh resets the ACTIVE tab only; announced to screen readers.
  const onRefresh = useCallback(() => {
    if (refreshing) return;
    // Same interleave guard: a load-more in flight must not race a reset.
    if (stateRef.current[activeTab].loading) return;
    const tab = activeTab;
    setRefreshing(true);
    setRefreshFailedTab(null);
    dispatch({ type: 'refreshStart', tab });
    attendanceLeaveService
      .listOwnerLeave({
        ...(tab === 'pending' ? { status: 'pending' } : {}),
        limit: PAGE_SIZE,
      })
      .then(res => {
        dispatch({
          type: 'refreshSuccess',
          tab,
          items: res.data,
          nextCursor: res.nextCursor,
          hasMore: res.hasMore,
        });
        AccessibilityInfo.announceForAccessibility('Leave requests updated');
      })
      .catch(() => {
        dispatch({ type: 'refreshError', tab });
        setRefreshFailedTab(tab);
      })
      .finally(() => setRefreshing(false));
  }, [activeTab, refreshing]);

  // Load-more: ONLY the active tab's own cursor feeds this (D1 invariant).
  const loadMore = useCallback(() => {
    const tab = activeTab;
    const tabPage = stateRef.current[tab];
    if (tabPage.loading || tabPage.endReached || tabPage.cursor == null) return;
    dispatch({ type: 'loadMoreStart', tab });
    attendanceLeaveService
      .listOwnerLeave({
        ...(tab === 'pending' ? { status: 'pending' } : {}),
        cursor: tabPage.cursor,
        limit: PAGE_SIZE,
      })
      .then(res =>
        dispatch({
          type: 'loadMoreSuccess',
          tab,
          items: res.data,
          nextCursor: res.nextCursor,
          hasMore: res.hasMore,
        }),
      )
      .catch(() => dispatch({ type: 'loadMoreError', tab }));
  }, [activeTab]);

  return {
    state,
    activeTab,
    refreshing,
    refreshFailedTab,
    dispatch,
    fetchFirst,
    consumeTabParam,
    switchTab,
    onRefresh,
    loadMore,
  };
}
