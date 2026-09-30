/**
 * ownerLeaveModel.ts — the owner Leave screen's pure state model
 * (Story 17-6, spec D1/D2). The screen renders; this decides.
 *
 * THE CURSOR-SAFETY INVARIANT (adversarial-review CRITICAL patch): cursors
 * are endpoint-scoped on the wire (`leave-owner-list`), so a cursor minted
 * by the Pending (`?status=pending`) list replayed against the unfiltered
 * All list answers garbage. Each tab therefore owns its ENTIRE pagination
 * state — `{items, cursor, endReached, loading}` — and a cursor only ever
 * feeds a load-more of the SAME tab. Crossing is unrepresentable here:
 * `loadMore` actions carry the tab and read `state[tab].cursor`.
 *
 * Write semantics (D2): a decision updates the visible lists in place —
 * the Pending tab REMOVES the row (it is a filtered list; an approved row
 * must not linger) while the All tab REPLACES it with the refreshed view —
 * and then BOTH tabs are marked stale, so the next re-entry of either
 * refetches its first page. Foregrounding marks both stale the same way.
 */
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import type { ApiError } from '../../../services/api/apiError';

export type LeaveTab = 'pending' | 'all';

/** One tab's whole pagination state — never shared, never merged. */
export interface LeaveTabPage {
  items: LeaveRequestRow[];
  /** The NEXT page's cursor; null once `hasMore` went false. */
  cursor: string | null;
  endReached: boolean;
  /** A fetch (first page or load-more) in flight for THIS tab. */
  loading: boolean;
  /** The last first-page fetch failed (the load-failure state). */
  error: boolean;
  /** At least one successful first page — gates spinner-vs-empty. */
  loaded: boolean;
}

export interface OwnerLeaveState {
  pending: LeaveTabPage;
  all: LeaveTabPage;
  /** The tab's cache may be behind a write/foreground — re-entry refetches. */
  stale: Record<LeaveTab, boolean>;
}

export function initialLeaveTabPage(): LeaveTabPage {
  return {
    items: [],
    cursor: null,
    endReached: false,
    loading: false,
    error: false,
    loaded: false,
  };
}

export function initialOwnerLeaveState(): OwnerLeaveState {
  return {
    pending: initialLeaveTabPage(),
    all: initialLeaveTabPage(),
    stale: { pending: false, all: false },
  };
}

export type OwnerLeaveAction =
  /** First-page fetch start (a tab entering empty). */
  | { type: 'pageStart'; tab: LeaveTab }
  | {
      type: 'pageSuccess';
      tab: LeaveTab;
      items: LeaveRequestRow[];
      nextCursor: string | null;
      hasMore: boolean;
    }
  | { type: 'pageError'; tab: LeaveTab }
  /** Load-more start — paginates ONLY this tab's own cursor. */
  | { type: 'loadMoreStart'; tab: LeaveTab }
  | {
      type: 'loadMoreSuccess';
      tab: LeaveTab;
      items: LeaveRequestRow[];
      nextCursor: string | null;
      hasMore: boolean;
    }
  /** Load-more failure keeps the loaded rows AND the cursor (retryable). */
  | { type: 'loadMoreError'; tab: LeaveTab }
  /** First-page reset — pull-to-refresh, stale re-entry, focus refetch. */
  | { type: 'refreshStart'; tab: LeaveTab }
  | {
      type: 'refreshSuccess';
      tab: LeaveTab;
      items: LeaveRequestRow[];
      nextCursor: string | null;
      hasMore: boolean;
    }
  /** Refresh failure keeps the last loaded list (D1's notice). */
  | { type: 'refreshError'; tab: LeaveTab }
  /** Writes mark BOTH tabs; foregrounding marks both the same way. */
  | { type: 'markStale'; tabs: LeaveTab[] }
  /** D2: Pending is a filtered list — a decided row leaves it. */
  | { type: 'removeRow'; id: string }
  /** D2: the All tab swaps the refreshed view in place. */
  | { type: 'replaceRow'; row: LeaveRequestRow };

type PageResult = { items: LeaveRequestRow[]; nextCursor: string | null; hasMore: boolean };

function withResult(page: LeaveTabPage, result: PageResult): LeaveTabPage {
  return {
    items: result.items,
    cursor: result.nextCursor,
    endReached: !result.hasMore,
    loading: false,
    error: false,
    loaded: true,
  };
}

export function ownerLeaveReducer(
  state: OwnerLeaveState,
  action: OwnerLeaveAction,
): OwnerLeaveState {
  switch (action.type) {
    case 'pageStart':
      return {
        ...state,
        [action.tab]: { ...state[action.tab], loading: true, error: false },
      };
    case 'pageSuccess':
      return { ...state, [action.tab]: withResult(state[action.tab], action) };
    case 'pageError':
      return {
        ...state,
        [action.tab]: { ...state[action.tab], loading: false, error: true },
      };
    case 'loadMoreStart':
      return {
        ...state,
        [action.tab]: { ...state[action.tab], loading: true, error: false },
      };
    case 'loadMoreSuccess':
      return {
        ...state,
        [action.tab]: {
          // Append — deduped by id: a cursor replay answered the same rows.
          items: [
            ...state[action.tab].items.filter(
              item => !action.items.some(row => row.id === item.id),
            ),
            ...action.items,
          ],
          cursor: action.nextCursor,
          endReached: !action.hasMore,
          loading: false,
          error: false,
          loaded: true,
        },
      };
    case 'loadMoreError':
      return {
        ...state,
        [action.tab]: { ...state[action.tab], loading: false },
      };
    case 'refreshStart':
      return {
        ...state,
        [action.tab]: { ...state[action.tab], loading: true, error: false },
      };
    case 'refreshSuccess':
      return { ...state, [action.tab]: withResult(state[action.tab], action), stale: { ...state.stale, [action.tab]: false } };
    case 'refreshError':
      return {
        ...state,
        [action.tab]: { ...state[action.tab], loading: false },
      };
    case 'markStale':
      return {
        ...state,
        stale: {
          ...state.stale,
          ...Object.fromEntries(action.tabs.map(tab => [tab, true])),
        },
      };
    case 'removeRow':
      return {
        ...state,
        pending: {
          ...state.pending,
          items: state.pending.items.filter(item => item.id !== action.id),
        },
      };
    case 'replaceRow':
      return {
        ...state,
        all: {
          ...state.all,
          items: state.all.items.map(item =>
            item.id === action.row.id
              ? // The WRITE response never carries employeeName (the list
                // endpoint enriches it) — keep the row's list-earned name or
                // the All tab falls back to "Team member" until refetch
                // (17-6 review P1).
                { ...action.row, employeeName: action.row.employeeName ?? item.employeeName }
              : item,
          ),
        },
      };
    default:
      return state;
  }
}

// --- The decision-write error posture (spec D2/D4; 17-7 extends the
// --- vocabulary to the revoke/cancel actions for BOTH roles — the one
// --- home for the leave write/preview failure classification).

/** The FE-owned transport line (§4 copy table) — the action is named so a
 *  rejected-while-offline owner isn't told about "Approving" (review P2). */
export type LeaveWriteAction = 'approve' | 'reject' | 'revoke' | 'cancel';

export function leaveWriteOfflineMessage(action: LeaveWriteAction): string {
  switch (action) {
    case 'reject':
      return "You're offline. Rejecting needs a working connection.";
    case 'revoke':
      return "You're offline. Revoking needs a working connection.";
    case 'cancel':
      return "You're offline. Cancelling needs a working connection.";
    default:
      return "You're offline. Approving needs a working connection.";
  }
}
export const LEAVE_WRITE_GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/** The preview-fetch transport fallback (17-7 D5: transport line). */
export const LEAVE_PREVIEW_GENERIC_MESSAGE =
  "Couldn't load the preview. Check your connection.";

export type LeaveWriteFailure =
  /** 409 — the request moved to a terminal state under us
   *  (LEAVE_NOT_PENDING / LEAVE_NOT_REVOKABLE / LEAVE_NOT_CANCELLABLE);
   *  the sheet swaps to the already-handled notice. */
  | { kind: 'already-handled' }
  /** The FE-owned transport line (§4 copy table). */
  | { kind: 'offline'; message: string }
  /** Any other failure — `ApiError.message` verbatim. */
  | { kind: 'failed'; message: string };

/** The 409 state-conflict codes that all share the already-handled posture. */
const ALREADY_HANDLED_CODES = new Set([
  'LEAVE_NOT_PENDING',
  'LEAVE_NOT_REVOKABLE',
  'LEAVE_NOT_CANCELLABLE',
]);

export function classifyLeaveWriteFailure(
  err: ApiError,
  action: LeaveWriteAction,
): LeaveWriteFailure {
  if (ALREADY_HANDLED_CODES.has(err.code)) return { kind: 'already-handled' };
  if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
    return { kind: 'offline', message: leaveWriteOfflineMessage(action) };
  }
  return { kind: 'failed', message: err.message || LEAVE_WRITE_GENERIC_MESSAGE };
}

/**
 * The PREVIEW-fetch failure (17-7 D5): offline keeps the action-named
 * line; any HTTP failure surfaces the server message verbatim; only a
 * message-less non-offline failure falls back to the transport line.
 */
export function classifyLeavePreviewFailure(
  err: ApiError,
  action: LeaveWriteAction,
): { message: string } {
  if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
    return { message: leaveWriteOfflineMessage(action) };
  }
  const message = err.message?.trim();
  return { message: message ? message : LEAVE_PREVIEW_GENERIC_MESSAGE };
}
