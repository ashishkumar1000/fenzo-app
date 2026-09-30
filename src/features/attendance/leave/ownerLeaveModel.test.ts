/**
 * Model tests for `ownerLeaveModel` (Story 17-6, spec §5): the per-tab
 * pagination reducer — THE cursor-safety invariant (a Pending cursor can
 * never feed an All load-more and vice versa), append dedup, stale marks,
 * write invalidation of BOTH tabs, the Pending-remove/All-replace branches,
 * and the decision-write failure classification (409 → already-handled,
 * transport → the offline line, anything else → the server message).
 */
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import {
  classifyLeavePreviewFailure,
  classifyLeaveWriteFailure,
  initialOwnerLeaveState,
  ownerLeaveReducer,
} from './ownerLeaveModel';

function row(id: string, status = 'pending'): LeaveRequestRow {
  return {
    id,
    employeeId: `e-${id}`,
    employeeName: `Employee ${id}`,
    startDate: '2026-10-05',
    endDate: '2026-10-05',
    part: 'full_day',
    reason: 'Family',
    status,
    workingDays: 1,
    totalDays: 1,
    createdBy: 'self',
    createdAt: '2026-09-29T10:00:00Z',
    dates: [{ date: '2026-10-05', state: status }],
  };
}

function loaded(state = initialOwnerLeaveState()) {
  return ownerLeaveReducer(state, {
    type: 'pageSuccess',
    tab: 'pending',
    items: [row('p1')],
    nextCursor: 'CUR-PENDING-1',
    hasMore: true,
  });
}

describe('per-tab cursor isolation (the CRITICAL invariant)', () => {
  it('a Pending page lands only in the Pending tab — All stays empty', () => {
    const state = loaded();
    expect(state.pending.items).toHaveLength(1);
    expect(state.pending.cursor).toBe('CUR-PENDING-1');
    expect(state.all.items).toHaveLength(0);
    expect(state.all.cursor).toBeNull();
  });

  it('a Pending cursor never paginates the All tab (load-more reads its own)', () => {
    let state = loaded();
    // The All tab loads its OWN first page with its own cursor.
    state = ownerLeaveReducer(state, {
      type: 'pageSuccess',
      tab: 'all',
      items: [row('a1', 'approved')],
      nextCursor: 'CUR-ALL-1',
      hasMore: true,
    });
    // A Pending load-more consumes ONLY the pending cursor.
    state = ownerLeaveReducer(state, {
      type: 'loadMoreSuccess',
      tab: 'pending',
      items: [row('p2')],
      nextCursor: 'CUR-PENDING-2',
      hasMore: true,
    });
    expect(state.pending.cursor).toBe('CUR-PENDING-2');
    expect(state.all.cursor).toBe('CUR-ALL-1');
    expect(state.all.items.map(r => r.id)).toEqual(['a1']);
  });

  it('an All load-more leaves the Pending tab untouched', () => {
    let state = loaded();
    state = ownerLeaveReducer(state, {
      type: 'pageSuccess',
      tab: 'all',
      items: [row('a1', 'approved')],
      nextCursor: 'CUR-ALL-1',
      hasMore: false,
    });
    state = ownerLeaveReducer(state, {
      type: 'loadMoreSuccess',
      tab: 'all',
      items: [row('a2', 'approved')],
      nextCursor: null,
      hasMore: false,
    });
    expect(state.pending.cursor).toBe('CUR-PENDING-1');
    expect(state.all.endReached).toBe(true);
  });

  it('load-more appends and dedups by id', () => {
    let state = loaded();
    state = ownerLeaveReducer(state, {
      type: 'loadMoreSuccess',
      tab: 'pending',
      items: [row('p1'), row('p2')], // cursor replay re-answers p1
      nextCursor: null,
      hasMore: false,
    });
    expect(state.pending.items.map(r => r.id)).toEqual(['p1', 'p2']);
    expect(state.pending.endReached).toBe(true);
  });
});

describe('stale marks and refresh branches', () => {
  it('markStale hits exactly the named tabs — a write marks BOTH', () => {
    let state = initialOwnerLeaveState();
    state = ownerLeaveReducer(state, { type: 'markStale', tabs: ['pending', 'all'] });
    expect(state.stale).toEqual({ pending: true, all: true });
    state = ownerLeaveReducer(state, { type: 'markStale', tabs: ['pending'] });
    expect(state.stale).toEqual({ pending: true, all: true });
  });

  it('a tab refresh success clears ITS stale mark only', () => {
    let state = initialOwnerLeaveState();
    state = ownerLeaveReducer(state, { type: 'markStale', tabs: ['pending', 'all'] });
    state = ownerLeaveReducer(state, {
      type: 'refreshSuccess',
      tab: 'pending',
      items: [row('p1')],
      nextCursor: null,
      hasMore: false,
    });
    expect(state.stale).toEqual({ pending: false, all: true });
  });

  it('a pull-to-refresh resets the ACTIVE tab and never the other', () => {
    let state = initialOwnerLeaveState();
    state = ownerLeaveReducer(state, {
      type: 'pageSuccess',
      tab: 'all',
      items: [row('a1', 'approved')],
      nextCursor: 'CUR-ALL-1',
      hasMore: true,
    });
    state = ownerLeaveReducer(state, {
      type: 'refreshSuccess',
      tab: 'all',
      items: [row('a2', 'approved')],
      nextCursor: null,
      hasMore: false,
    });
    expect(state.all.items.map(r => r.id)).toEqual(['a2']); // reset, not append
    expect(state.pending.items).toEqual([]);
  });

  it('a refresh failure keeps the last loaded list (the notice keeps it honest)', () => {
    let state = loaded();
    state = ownerLeaveReducer(state, { type: 'refreshError', tab: 'pending' });
    expect(state.pending.items).toHaveLength(1);
    expect(state.pending.loaded).toBe(true);
    expect(state.pending.loading).toBe(false);
  });

  it('a load-more failure keeps rows AND the cursor (retryable)', () => {
    let state = loaded();
    state = ownerLeaveReducer(state, { type: 'loadMoreError', tab: 'pending' });
    expect(state.pending.items).toHaveLength(1);
    expect(state.pending.cursor).toBe('CUR-PENDING-1');
    expect(state.pending.loading).toBe(false);
  });

  it('a first-page error flags the tab for the load-failure state', () => {
    const state = ownerLeaveReducer(initialOwnerLeaveState(), {
      type: 'pageError',
      tab: 'pending',
    });
    expect(state.pending.error).toBe(true);
    expect(state.pending.loaded).toBe(false);
  });
});

describe('the write branches (spec D2)', () => {
  it('Pending REMOVES the decided row (a filtered list must not linger)', () => {
    let state = loaded();
    state = ownerLeaveReducer(state, { type: 'removeRow', id: 'p1' });
    expect(state.pending.items).toEqual([]);
  });

  it('All REPLACES the decided row in place, order intact', () => {
    let state = initialOwnerLeaveState();
    state = ownerLeaveReducer(state, {
      type: 'pageSuccess',
      tab: 'all',
      items: [row('a1', 'pending'), row('a2', 'pending'), row('a3', 'approved')],
      nextCursor: null,
      hasMore: false,
    });
    state = ownerLeaveReducer(state, { type: 'replaceRow', row: row('a2', 'approved') });
    expect(state.all.items.map(r => r.id)).toEqual(['a1', 'a2', 'a3']);
    expect(state.all.items[1].status).toBe('approved');
  });

  it('a nameless WRITE view keeps the row\u2019s list-earned employeeName', () => {
    let state = initialOwnerLeaveState();
    state = ownerLeaveReducer(state, {
      type: 'pageSuccess',
      tab: 'all',
      items: [row('a1', 'pending')],
      nextCursor: null,
      hasMore: false,
    });
    // The write path's view carries NO employeeName (list-only enrichment).
    const { employeeName: _dropped, ...nameless } = row('a1', 'approved');
    state = ownerLeaveReducer(state, {
      type: 'replaceRow',
      row: nameless as LeaveRequestRow,
    });
    expect(state.all.items[0].employeeName).toBe('Employee a1');
    expect(state.all.items[0].status).toBe('approved');
  });
});

describe('classifyLeaveWriteFailure', () => {
  it('409 LEAVE_NOT_PENDING → the already-handled sheet branch', () => {
    expect(classifyLeaveWriteFailure({ status: 409, code: 'LEAVE_NOT_PENDING', message: 'x' }, 'approve')).toEqual({
      kind: 'already-handled',
    });
  });

  it('409 LEAVE_NOT_REVOKABLE / LEAVE_NOT_CANCELLABLE share the already-handled posture (17-7)', () => {
    expect(
      classifyLeaveWriteFailure({ status: 409, code: 'LEAVE_NOT_REVOKABLE', message: 'No future dates left to revoke' }, 'revoke'),
    ).toEqual({ kind: 'already-handled' });
    expect(
      classifyLeaveWriteFailure({ status: 409, code: 'LEAVE_NOT_CANCELLABLE', message: 'No future dates left to cancel' }, 'cancel'),
    ).toEqual({ kind: 'already-handled' });
  });

  it('transport failures carry the FE-owned offline line, named for the action', () => {
    for (const code of ['NETWORK_ERROR', 'TIMEOUT']) {
      expect(classifyLeaveWriteFailure({ status: 0, code, message: 'x' }, 'approve')).toEqual({
        kind: 'offline',
        message: "You're offline. Approving needs a working connection.",
      });
      expect(classifyLeaveWriteFailure({ status: 0, code, message: 'x' }, 'reject')).toEqual({
        kind: 'offline',
        message: "You're offline. Rejecting needs a working connection.",
      });
      expect(classifyLeaveWriteFailure({ status: 0, code, message: 'x' }, 'revoke')).toEqual({
        kind: 'offline',
        message: "You're offline. Revoking needs a working connection.",
      });
      expect(classifyLeaveWriteFailure({ status: 0, code, message: 'x' }, 'cancel')).toEqual({
        kind: 'offline',
        message: "You're offline. Cancelling needs a working connection.",
      });
    }
  });

  it('any other failure surfaces the server message verbatim; empty falls back', () => {
    expect(
      classifyLeaveWriteFailure({ status: 403, code: 'FORBIDDEN', message: 'Not allowed' }, 'approve'),
    ).toEqual({ kind: 'failed', message: 'Not allowed' });
    expect(
      classifyLeaveWriteFailure({ status: 500, code: 'SERVER_ERROR', message: '' }, 'reject'),
    ).toEqual({ kind: 'failed', message: 'Something went wrong. Please try again.' });
  });
});

describe('classifyLeavePreviewFailure (17-7 D5)', () => {
  it('offline keeps the action-named line', () => {
    expect(
      classifyLeavePreviewFailure({ status: 0, code: 'NETWORK_ERROR', message: 'x' }, 'revoke'),
    ).toEqual({ message: "You're offline. Revoking needs a working connection." });
    expect(
      classifyLeavePreviewFailure({ status: 0, code: 'TIMEOUT', message: 'x' }, 'cancel'),
    ).toEqual({ message: "You're offline. Cancelling needs a working connection." });
  });

  it('an HTTP failure surfaces the server message verbatim', () => {
    expect(
      classifyLeavePreviewFailure({ status: 500, code: 'SERVER_ERROR', message: 'Server is angry' }, 'revoke'),
    ).toEqual({ message: 'Server is angry' });
  });

  it('a message-less non-offline failure falls back to the transport line', () => {
    expect(
      classifyLeavePreviewFailure({ status: 502, code: 'SERVER_ERROR', message: '' }, 'cancel'),
    ).toEqual({ message: "Couldn't load the preview. Check your connection." });
  });
});
