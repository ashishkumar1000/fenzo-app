/**
 * useNotifications — the owner's notification history and unread badge,
 * from `GET /notifications` + `GET /notifications/unread-count` (Story 3.4).
 *
 * Same API-backed shared-store pattern as `useJobs`: one module-level state
 * object, any number of subscribers via `useSyncExternalStore`, in-flight
 * requests de-duplicated, and the cursor carried alongside the rows. Two
 * independent loads share the store — the full LIST (only the Notifications
 * screen asks for it) and the unread COUNT (every owner surface with a bell:
 * Jobs header, Home header) — so their throttles are separate: opening the
 * app twice in a minute refreshes the badge without ever pulling the list.
 *
 * Not MMKV-persisted: server truth, same reasoning as `useJobs`.
 *
 * Read-state mutations are OPTIMISTIC — the read dot is cosmetic, the POSTs
 * are idempotent (Story 3.2), and navigation off a row tap must feel
 * instant. A definitive failure (a real 4xx/5xx) rolls the optimistic state
 * back; an unknown outcome (`ApiError.status === 0` — offline, timeout) does
 * NOT, because the POST may have landed: the server is re-asked instead.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { notificationService } from '../../services';
import { registerReset } from '../../services/resetRegistry';
import type { ApiError } from '../../services';
import { FOCUS_REFRESH_TTL_MS } from '../../constants';
import type { ApiNotification } from '../../services';

interface NotificationsState {
  /** Newest first — the server's sort; the client never re-sorts. */
  items: ApiNotification[];
  /** True while the *first* list load is in flight (nothing to show yet). */
  isLoading: boolean;
  /** True while a next page is being fetched (footer spinner). */
  isLoadingMore: boolean;
  /** Human-readable failure message from `ApiError`, safe to render. */
  error: string | null;
  /**
   * Failure of the last read-state mutation (mark-read / mark-all) — its own
   * channel, so a list error and a mutation error never overwrite each other.
   */
  mutationError: string | null;
  /** False until a list load has completed, so "empty" can't mean "not fetched". */
  hasLoaded: boolean;
  nextCursor: string | null;
  hasMore: boolean;
  /** Timestamp of the last successful list load — drives the focus throttle. */
  lastLoadedAt: number | null;

  /** Bell badge; `null` until the first count lands (never render "0" as a guess). */
  unreadCount: number | null;
  /** Separate TTL stamp — the badge refreshes on surfaces that never load the list. */
  lastCountedAt: number | null;
}

const INITIAL: NotificationsState = {
  items: [],
  isLoading: true,
  isLoadingMore: false,
  error: null,
  mutationError: null,
  hasLoaded: false,
  nextCursor: null,
  hasMore: false,
  lastLoadedAt: null,
  unreadCount: null,
  lastCountedAt: null,
};

// --- Shared store: one window, any number of subscribers --------------------
const subscribers = new Set<() => void>();
let state: NotificationsState = INITIAL;

/**
 * Bumped by `clearNotifications`. Any response that lands after a bump is
 * stale — it must not commit rows (or an error) into the just-reset store,
 * e.g. a late GET arriving after logout.
 */
let resetGen = 0;

function setState(next: Partial<NotificationsState>) {
  state = { ...state, ...next };
  subscribers.forEach(notify => notify());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  // Same reference until something actually changes — required by
  // useSyncExternalStore to avoid an infinite re-render loop.
  return state;
}

// --- List loads (Notifications screen only) ---------------------------------

/** True while a *list* request is in flight, whichever page it is. */
let listInFlight: Promise<void> | null = null;

/**
 * Monotonic id per list request. A forced refresh that starts while a
 * page-2 load is in flight SUPERSEDES it — the stale response must not
 * commit over the fresh page 1 (an append landing after a refresh would
 * resurrect rows the refresh just removed).
 */
let listSeq = 0;

/**
 * Loads page 1 of the list. Unforced concurrent callers share the request;
 * a call within `FOCUS_REFRESH_TTL_MS` of a success is skipped unless
 * `opts.force` (pull-to-refresh) — the same throttle discipline as
 * `loadJobs`, with the shared TTL constant instead of a copied literal.
 */
export function loadNotifications(opts: { force?: boolean } = {}): Promise<void> {
  const fresh = state.lastLoadedAt && Date.now() - state.lastLoadedAt < FOCUS_REFRESH_TTL_MS;
  if (!opts.force) {
    // A FORCED refresh never shares the in-flight slot: with a page-2 GET
    // in flight, returning that promise would resolve a pull-to-refresh
    // without ever refetching page 1 — the user asked for page 1 again.
    if (listInFlight) return listInFlight;
    if (fresh && state.hasLoaded) return Promise.resolve();
  }
  const gen = resetGen;
  const seq = ++listSeq;
  // Loader only over an empty screen; a refresh must not blank the rows.
  // Clearing `error` here makes every attempt re-show a repeat failure.
  setState({ isLoading: !state.hasLoaded, error: null });
  const request: Promise<void> = notificationService
    .list()
    .then(page => {
      if (gen !== resetGen || seq !== listSeq) return; // cleared, or superseded
      setState({
        items: page.data,
        nextCursor: page.nextCursor,
        // Derived from the cursor, never copied: if the server's `hasMore`
        // ever disagreed with its own cursor, paging would break silently.
        hasMore: page.nextCursor !== null,
        hasLoaded: true,
        isLoading: false,
        error: null,
        lastLoadedAt: Date.now(),
      });
    })
    .catch((error: ApiError) => {
      if (gen !== resetGen || seq !== listSeq) return;
      console.warn('[useNotifications] GET /notifications failed →', error);
      // Keep prior rows on screen: a failed refresh must not empty the list.
      setState({ isLoading: false, error: error.message });
    })
    .finally(() => {
      // Clear the slot only if it still holds THIS request — a forced
      // refresh that started meanwhile has already replaced it.
      if (listInFlight === request) listInFlight = null;
    });
  listInFlight = request;
  return request;
}

/**
 * Fetches the next page with the stored cursor and appends it, guarding
 * against double-taps, missing cursors and rows that moved between pages.
 */
export function loadMoreNotifications(): Promise<void> {
  if (listInFlight || state.isLoadingMore || !state.hasMore || !state.nextCursor) {
    return Promise.resolve();
  }
  const gen = resetGen;
  const seq = ++listSeq;
  setState({ isLoadingMore: true, error: null });
  const request: Promise<void> = notificationService
    .list({ cursor: state.nextCursor })
    .then(page => {
      if (gen !== resetGen || seq !== listSeq) return; // cleared, or superseded
      const existingIds = new Set(state.items.map(n => n.id));
      const appended = page.data.filter(n => !existingIds.has(n.id));
      setState({
        items: [...state.items, ...appended],
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== null, // derived — see loadNotifications
        isLoadingMore: false,
        error: null,
        lastLoadedAt: Date.now(),
      });
    })
    .catch((error: ApiError) => {
      if (gen !== resetGen || seq !== listSeq) return;
      console.warn('[useNotifications] GET /notifications (page 2+) failed →', error);
      setState({ isLoadingMore: false, error: error.message });
    })
    .finally(() => {
      if (listInFlight === request) listInFlight = null;
    });
  listInFlight = request;
  return request;
}

// --- Unread count (every bell surface) ---------------------------------------

let countInFlight: Promise<void> | null = null;

/**
 * Refreshes the badge count. Separate TTL from the list: the Jobs/Home bells
 * call this on focus and must stay cheap, while the screen's list has its
 * own window. `force` bypasses the throttle (post-mutation refreshes, the
 * live event hook).
 */
export function loadUnreadCount(opts: { force?: boolean } = {}): Promise<void> {
  if (countInFlight) return countInFlight;
  const fresh = state.lastCountedAt && Date.now() - state.lastCountedAt < FOCUS_REFRESH_TTL_MS;
  if (!opts.force && fresh) return Promise.resolve();
  const gen = resetGen;
  const request: Promise<void> = notificationService
    .unreadCount()
    .then(({ unreadCount }) => {
      if (gen !== resetGen) return;
      setState({ unreadCount, lastCountedAt: Date.now() });
    })
    .catch((error: ApiError) => {
      if (gen !== resetGen) return;
      // The badge is cosmetic — a failed count keeps the last value and
      // stays log-only; the next focus retries. Never an on-screen error.
      console.warn('[useNotifications] GET /notifications/unread-count failed →', error);
    })
    .finally(() => {
      // Clear the slot only if it still holds THIS request — see the list
      // loaders for why (a newer request may have replaced it).
      if (countInFlight === request) countInFlight = null;
    });
  countInFlight = request;
  return request;
}

// --- Optimistic read-state mutations -----------------------------------------

/**
 * Marks one row read, optimistically. Returns nothing; failures are handled
 * in-place (rollback or server re-ask — see the file doc).
 *
 * A row with `readAt` already set is a no-op — the tap still navigates, it
 * just doesn't spend a POST.
 */
export function markNotificationRead(id: string): Promise<void> {
  const row = state.items.find(n => n.id === id);
  if (!row || row.readAt) return Promise.resolve();

  const gen = resetGen;
  // Optimistic write first, snapshotting the row so the rollback can
  // re-pair it (by id) against whatever rows are live when the POST lands.
  const previous = { ...row };
  setState({
    items: state.items.map(n => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
    unreadCount: state.unreadCount === null ? null : Math.max(0, state.unreadCount - 1),
    mutationError: null,
  });

  return notificationService
    .markRead([id])
    .then(() => {
      // The badge is re-asked on the server even on success: the spec has
      // the badge refreshed after ANY mark-read mutation — not trusted
      // through, since rows read on another device (or a missed live event)
      // can make the optimistic decrement drift.
      void loadUnreadCount({ force: true });
    })
    .catch((error: ApiError) => {
      if (gen !== resetGen) return; // store was cleared mid-flight
      // Surface the failure — an optimistic rollback with no signal would
      // read as "the tap did nothing".
      setState({ mutationError: error.message });
      if (error.status > 0) {
        // Definitive failure (real 4xx/5xx): the POST never landed — undo
        // the ROWS. The badge is deliberately NOT restored from a snapshot:
        // a live refetch may have landed a fresher count meanwhile, and a
        // stale snapshot would clobber it — the forced refetch below
        // reconciles the badge with the server instead.
        rollbackMarkRead(previous);
        void loadUnreadCount({ force: true });
      } else {
        // Unknown outcome (offline/timeout): the POST may have succeeded
        // server-side — guessing "unread" would strand a wrong badge, so
        // re-ask the server for both the count and the visible page.
        void loadUnreadCount({ force: true });
        void loadNotifications({ force: true });
      }
    });
}

/**
 * Marks every row read, optimistically. ALWAYS posts — even when the local
 * count reads 0 (a missed live event could still have unread rows on
 * screen, and the endpoint is idempotent, so a redundant POST is free while
 * a skipped one strands rows).
 */
export function markAllNotificationsRead(): Promise<void> {
  if (state.items.length === 0 && state.unreadCount === 0) return Promise.resolve();

  const gen = resetGen;
  // Snapshot the rows (the badge needs no snapshot — see the rollbacks).
  const previous = state.items.map(n => ({ ...n }));
  const readStamp = new Date().toISOString();
  setState({
    items: state.items.map(n => ({ ...n, readAt: n.readAt ?? readStamp })),
    unreadCount: 0,
    mutationError: null,
  });

  return notificationService
    .markAllRead()
    .then(() => {
      // Same post-success badge re-ask as the single-row mutation above.
      void loadUnreadCount({ force: true });
    })
    .catch((error: ApiError) => {
      if (gen !== resetGen) return; // store was cleared mid-flight
      setState({ mutationError: error.message });
      if (error.status > 0) {
        rollbackMarkAll(previous);
        void loadUnreadCount({ force: true });
      } else {
        void loadUnreadCount({ force: true });
        void loadNotifications({ force: true });
      }
    });
}

/**
 * Restores the pre-mutation rows. Reconciles by id against the CURRENT
 * list — a live refetch may have added rows while the POST was in flight;
 * those must not be wiped by the rollback's snapshot. The unread COUNT is
 * deliberately left alone here: a live count refetch may have landed a
 * fresher value than any snapshot, so the caller force-refetches the badge
 * from the server instead of restoring a possibly stale number.
 */
function rollbackMarkRead(previous: ApiNotification): void {
  setState({
    items: state.items.map(n => (n.id === previous.id ? previous : n)),
  });
}

function rollbackMarkAll(previous: ApiNotification[]): void {
  // Re-pair the snapshot's read-state onto whatever rows are live now —
  // rows the snapshot never saw (new since) simply stay as they are.
  // NOTE: `readAt: null` (unread) is a real value here, so the lookup must
  // branch on presence — `?? readAt` would treat the snapshot's nulls as
  // missing and keep the optimistic read stamp.
  const readStateById = new Map(previous.map(n => [n.id, n.readAt]));
  setState({
    items: state.items.map(n => {
      if (!readStateById.has(n.id)) return n;
      return { ...n, readAt: readStateById.get(n.id) ?? null };
    }),
  });
}

/** Reset to the pre-login state. Call on logout. */
export function clearNotifications(): void {
  resetGen += 1; // an in-flight response is now stale — it must not commit
  // Drop the in-flight slots too: a load requested right after the reset
  // must fire a fresh GET, not join the gen-discarded request still sitting
  // in the slot. (The old requests' guarded finallys won't clear the slot
  // again — it no longer holds them.)
  listInFlight = null;
  countInFlight = null;
  setState(INITIAL);
}

// Join the global 401 reset flow — see services/resetRegistry.ts.
registerReset(clearNotifications);

export function useNotifications() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  // First mount kicks off the BADGE load only — every bell surface needs the
  // count, none of them the list. The Notifications screen calls
  // `loadNotifications()` from its own focus effect.
  useEffect(() => {
    void loadUnreadCount();
  }, []);

  /** Re-fetch page 1 — for pull-to-refresh and the error view's retry. */
  const refresh = useCallback(() => loadNotifications({ force: true }), []);

  return {
    items: snapshot.items,
    isLoading: snapshot.isLoading,
    isLoadingMore: snapshot.isLoadingMore,
    error: snapshot.error,
    mutationError: snapshot.mutationError,
    hasLoaded: snapshot.hasLoaded,
    hasMore: snapshot.hasMore,
    unreadCount: snapshot.unreadCount,
    loadNotifications,
    loadMoreNotifications,
    loadUnreadCount,
    refresh,
    markNotificationRead,
    markAllNotificationsRead,
  };
}
