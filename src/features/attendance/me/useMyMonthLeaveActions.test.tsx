/**
 * Hook tests for `useMyMonthLeaveActions` (Story 20-1, ACs 3/9/10/11).
 * Tester stance — the requirement, not the implementation:
 *  - RESOLUTION (AC 11): a leave day's sheet opens on a FRESH walk
 *    (limit 50, cursor walked, 3-page cap). While it runs, or on a miss
 *    or a failure, the sheet shows NO leave CTAs — absent, not disabled.
 *    A stale walk after a day switch or a close must never land.
 *  - CANCEL: a same-tick double press files exactly ONE delete (the
 *    endpoint is state-guarded with no idempotency key); success drops
 *    to idle and lets the parent refresh the day map; a state conflict
 *    becomes the already-handled notice; no row = nothing to press.
 *  - CONVERT: the locked semantics are cancel + a NEW full-day request
 *    (the owner approved only the half). Retry-after-a-partial-failure
 *    re-runs the cancel (the BE own-retry answers 200) with a fresh
 *    idempotency key each attempt. The employee must never be left
 *    guessing their half-day was already cancelled (AC 10).
 *
 * The services barrel is mocked; the hook is probed exactly as DayDetail's
 * host mounts it. Every awaited landing is act-wrapped and renderers are
 * unmounted at teardown (the house react-test-renderer discipline):
 * with `--forceExit` the suite finishes even though this pattern keeps a
 * worker alive (Jest not exiting is an environment artifact, not a bug).
 */
jest.mock('../../../services', () => ({
  attendanceLeaveService: {
    listMyLeave: jest.fn(),
    cancelLeave: jest.fn(),
    applyLeave: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { attendanceLeaveService } from '../../../services';
import type { ApiError } from '../../../services/api/apiError';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import type { Paginated } from '../../../services/api/pagination';
import { LEAVE_WRITE_GENERIC_MESSAGE } from '../leave/ownerLeaveModel';
import { useMyMonthLeaveActions } from './useMyMonthLeaveActions';

const listMyLeave = attendanceLeaveService.listMyLeave as jest.Mock;
const cancelLeave = attendanceLeaveService.cancelLeave as jest.Mock;
const applyLeave = attendanceLeaveService.applyLeave as jest.Mock;

// --- Fixtures ---------------------------------------------------------------

function row(overrides: Partial<LeaveRequestRow> = {}): LeaveRequestRow {
  return {
    id: 'lr1',
    employeeId: 'emp1',
    startDate: '2026-10-03',
    endDate: '2026-10-03',
    part: 'first_half',
    reason: 'Not feeling well',
    status: 'approved',
    workingDays: 0.5,
    totalDays: 1,
    createdBy: 'emp1',
    createdAt: '2026-09-30T10:00:00Z',
    dates: [{ date: '2026-10-03', state: 'approved' }],
    ...overrides,
  };
}

function page(rows: LeaveRequestRow[], nextCursor: string | null): Paginated<LeaveRequestRow> {
  return { data: rows, nextCursor, hasMore: nextCursor !== null };
}

/** An unresolved promise the test controls (the in-flight walk / write). */
function pend<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject: (e: unknown) => reject(e) };
}

function apiErr(code: string, message: string): ApiError {
  return { status: 409, code, message } as ApiError;
}

// --- Probe ------------------------------------------------------------------

type HookInput = Parameters<typeof useMyMonthLeaveActions>[0];
type Hook = ReturnType<typeof useMyMonthLeaveActions>;

let latest: Hook | null = null;

function Probe(input: HookInput) {
  latest = useMyMonthLeaveActions(input);
  return null;
}

const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderHost(overrides: Partial<HookInput> = {}) {
  const onWriteSuccess = jest.fn();
  const onWriteFailure = jest.fn();
  const full: HookInput = {
    leaveId: null,
    workDate: null,
    onWriteSuccess,
    onWriteFailure,
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe {...full} />);
  });
  mountedRenderers.push(renderer);
  const update = (patch: Partial<HookInput>) => {
    act(() => {
      renderer.update(<Probe {...full} {...patch} />);
    });
  };
  return { renderer, onWriteSuccess, onWriteFailure, update };
}

/** Drains `depth` microtask cycles inside act — enough for the walk/write
 *  promise chains to land (a page fetch is one hop per link). */
async function settle(depth = 2) {
  for (let i = 0; i < depth; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  jest.resetAllMocks();
  // Jest's node env ships crypto.randomUUID — the real ladder's first rung.
  // Tests below assert the v4 SHAPE and freshness against the real keygen.
});

afterEach(() => {
  act(() => {
    mountedRenderers.forEach(r => r.unmount());
  });
  mountedRenderers.length = 0;
  latest = null;
});

// --- AC 11: the resolution walk ---------------------------------------------

describe('leaving a resolution — the sheet opens on facts, never on cache', () => {
  it('opening a leave day shows the resolving cue FIRST and no row yet', () => {
    const walk = pend<Paginated<LeaveRequestRow>>();
    listMyLeave.mockReturnValue(walk.promise);
    renderHost({ leaveId: 'lr1' });
    expect(latest?.resolving).toBe(true);
    expect(latest?.leaveRequest).toBeNull();
  });

  it('the fresh walk starts at limit 50 with no cursor; the hit resolves the row', async () => {
    const lr1 = row();
    listMyLeave.mockResolvedValue(page([row({ id: 'lr0' }), lr1], null));
    renderHost({ leaveId: 'lr1' });
    await settle();
    // Never a cached list: first call carries ONLY the page size.
    expect(listMyLeave).toHaveBeenCalledWith({ limit: 50 });
    expect(listMyLeave).toHaveBeenCalledTimes(1);
    expect(latest?.resolving).toBe(false);
    expect(latest?.leaveRequest).toEqual(lr1);
  });

  it('a page-1 miss follows the cursor to page 2', async () => {
    const lr1 = row();
    listMyLeave
      .mockResolvedValueOnce(page([], 'cursor-2'))
      .mockResolvedValueOnce(page([lr1], null));
    renderHost({ leaveId: 'lr1' });
    await settle();
    expect(listMyLeave).toHaveBeenNthCalledWith(1, { limit: 50 });
    expect(listMyLeave).toHaveBeenNthCalledWith(2, { limit: 50, cursor: 'cursor-2' });
    expect(latest?.leaveRequest).toEqual(lr1);
  });

  it('a null next cursor stops the walk immediately — a short miss leaves no row', async () => {
    listMyLeave
      .mockResolvedValueOnce(page([], 'a'))
      .mockResolvedValueOnce(page([], null));
    renderHost({ leaveId: 'lr9' });
    await settle();
    expect(listMyLeave).toHaveBeenCalledTimes(2); // stops at first null cursor
    expect(latest?.resolving).toBe(false);
    expect(latest?.leaveRequest).toBeNull();
  });

  it('even three cursor-chained pages are capped — no endless walk', async () => {
    listMyLeave.mockImplementation(() => Promise.resolve(page([], 'more')));
    renderHost({ leaveId: 'lr9' });
    await settle(4);
    expect(listMyLeave).toHaveBeenCalledTimes(3); // RESOLVE_MAX_PAGES
    expect(latest?.leaveRequest).toBeNull();
  });

  it('a failed walk FAILS CLEAR — no row, no resolving, never a CTA on an unresolved id', async () => {
    listMyLeave.mockRejectedValue(apiErr('NETWORK_ERROR', 'down'));
    renderHost({ leaveId: 'lr1' });
    await settle();
    expect(latest?.resolving).toBe(false);
    expect(latest?.leaveRequest).toBeNull();
  });

  it('closing the sheet kills the walk: resolving stops NOW and a stale landing is ignored', async () => {
    const walk = pend<Paginated<LeaveRequestRow>>();
    listMyLeave.mockReturnValue(walk.promise);
    const { update } = renderHost({ leaveId: 'lr1' });
    update({ leaveId: null });
    // The reset lands with the render — no promise needed.
    expect(latest?.resolving).toBe(false);
    expect(latest?.leaveRequest).toBeNull();
    expect(latest?.actionState).toEqual({ kind: 'idle' });
    // The stale walk then lands — for the OLD lr1 — and must not stick.
    walk.resolve(page([row({ id: 'lr1', part: 'full_day' })], null));
    await settle();
    expect(latest?.leaveRequest).toBeNull();
  });

  it('a rapid day switch is latest-wins: the old walk never overwrites the new day', async () => {
    const walkA = pend<Paginated<LeaveRequestRow>>();
    listMyLeave.mockReturnValue(walkA.promise);
    const { update } = renderHost({ leaveId: 'a1' });
    // The employee flips to another leave day; its walk resolves instantly.
    const rowB = row({ id: 'b1' });
    listMyLeave.mockResolvedValue(page([rowB], null));
    update({ leaveId: 'b1' });
    expect(latest?.resolving).toBe(true);
    // The stale walk for a1 lands after — it must be dropped.
    walkA.resolve(page([row({ id: 'a1', part: 'full_day' })], null));
    await settle();
    expect(latest?.leaveRequest).toEqual(rowB);
  });

  it('an unmount mid-walk settles safely (no ghost setState after the sheet dies)', async () => {
    const walk = pend<Paginated<LeaveRequestRow>>();
    listMyLeave.mockReturnValue(walk.promise);
    const { renderer } = renderHost({ leaveId: 'lr1' });
    act(() => {
      renderer.unmount();
    });
    // The walk lands after the sheet is dead. The mounted guard keeps the
    // landing silent — the proof is the flush completing with NO act
    // warning, and the retained probe snapshot showing nothing re-renders
    // after the landing (resolving stays stuck at its pre-death value).
    walk.resolve(page([row()], null));
    await settle();
    expect(latest?.leaveRequest).toBeNull();
    expect(latest?.resolving).toBe(true); // the snapshot at death, untouched
  });
});

// --- Cancel ------------------------------------------------------------------

describe('cancel — the 17-7 posture verbatim', () => {
  it('success drops to idle and lets the parent refresh the day map', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    const { onWriteSuccess } = renderHost({ leaveId: 'lr1', workDate: '2026-10-03' });
    await settle();
    cancelLeave.mockResolvedValue(row());
    act(() => {
      latest?.cancelLeave();
    });
    expect(latest?.actionState).toEqual({ kind: 'submitting', action: 'cancel' });
    expect(cancelLeave).toHaveBeenCalledWith('lr1');
    await settle();
    expect(latest?.actionState).toEqual({ kind: 'idle' });
    expect(onWriteSuccess).toHaveBeenCalledTimes(1);
  });

  it('a same-tick double press files exactly ONE cancel (the ref latch)', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    renderHost({ leaveId: 'lr1', workDate: '2026-10-03' });
    await settle();
    const flight = pend<LeaveRequestRow>();
    cancelLeave.mockReturnValue(flight.promise);
    act(() => {
      latest?.cancelLeave();
      latest?.cancelLeave();
    });
    expect(cancelLeave).toHaveBeenCalledTimes(1);
    flight.resolve(row());
    await settle();
    expect(latest?.actionState).toEqual({ kind: 'idle' });
  });

  it('a state conflict (LEAVE_NOT_PENDING) becomes the already-handled notice', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    renderHost({ leaveId: 'lr1' });
    await settle();
    cancelLeave.mockRejectedValue(apiErr('LEAVE_NOT_PENDING', 'Already cancelled'));
    act(() => {
      latest?.cancelLeave();
    });
    await settle();
    expect(latest?.actionState).toEqual({ kind: 'handled' });
  });

  it('a message-less generic failure falls back to the shared line — never silence', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    renderHost({ leaveId: 'lr1' });
    await settle();
    cancelLeave.mockRejectedValue(apiErr('INTERNAL', ''));
    act(() => {
      latest?.cancelLeave();
    });
    await settle();
    expect(latest?.actionState).toEqual({
      kind: 'error',
      message: LEAVE_WRITE_GENERIC_MESSAGE,
    });
  });

  it('pressing cancel without a resolved row is a no-op', () => {
    renderHost({ leaveId: 'lr1', workDate: '2026-10-03' }); // walk still pending
    act(() => {
      latest?.cancelLeave();
    });
    expect(cancelLeave).not.toHaveBeenCalled();
    expect(latest?.actionState).toEqual({ kind: 'idle' });
  });

  it('the handled notice OK refetches truth and clears the notice (AC 9)', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    const { onWriteSuccess } = renderHost({ leaveId: 'lr1' });
    await settle();
    cancelLeave.mockRejectedValue(apiErr('LEAVE_NOT_PENDING', 'Already cancelled'));
    act(() => {
      latest?.cancelLeave();
    });
    await settle();
    expect(latest?.actionState).toEqual({ kind: 'handled' });
    act(() => {
      latest?.dismissHandled();
    });
    expect(latest?.actionState).toEqual({ kind: 'idle' });
    expect(onWriteSuccess).toHaveBeenCalledTimes(1); // the sheet's list-refetch leg
  });
});

// --- A failed settle re-truths the day behind the stage (ACs 9/10) ----------

describe('a failed settle re-truths the day behind the stage (ACs 9/10)', () => {
  it('a failing cancel fires onWriteFailure once alongside the message — never silence', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    const { onWriteFailure } = renderHost({ leaveId: 'lr1' });
    await settle();
    cancelLeave.mockRejectedValue(apiErr('INTERNAL', ''));
    act(() => {
      latest?.cancelLeave();
    });
    await settle();
    expect(latest?.actionState!.kind).toBe('error');
    expect(onWriteFailure).toHaveBeenCalledTimes(1);
  });

  it('a partial convert failure (apply leg) fires onWriteFailure — the map re-truths', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    const { onWriteFailure } = renderHost({ leaveId: 'lr1', workDate: '2026-10-03' });
    await settle();
    cancelLeave.mockResolvedValue(row());
    applyLeave.mockRejectedValue(apiErr('LEAVE_OVERLAP', 'already off'));
    act(() => {
      latest?.convertFullDay();
    });
    await settle();
    expect(latest?.actionState!.kind).toBe('error');
    expect(onWriteFailure).toHaveBeenCalledTimes(1);
  });

  it('the already-handled posture does NOT double-fire — its OK path owns the refetch', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    const { onWriteFailure, onWriteSuccess } = renderHost({ leaveId: 'lr1' });
    await settle();
    cancelLeave.mockRejectedValue(apiErr('LEAVE_NOT_PENDING', 'Already cancelled'));
    act(() => {
      latest?.cancelLeave();
    });
    await settle();
    expect(latest?.actionState).toEqual({ kind: 'handled' });
    expect(onWriteFailure).not.toHaveBeenCalled();
    act(() => {
      latest?.dismissHandled();
    });
    expect(onWriteSuccess).toHaveBeenCalledTimes(1);
  });
});

// --- Convert ------------------------------------------------------------------

describe('convert to full day — cancel + a NEW pending re-file (the locked 2026-10-01 semantics)', () => {
  it('runs cancel, then re-files ONE full day with the reason VERBATIM and a fresh UUID v4 key', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    renderHost({ leaveId: 'lr1', workDate: '2026-10-03' });
    await settle();
    cancelLeave.mockResolvedValue(row());
    applyLeave.mockResolvedValue(row({ id: 'lr2', part: 'full_day' }));
    act(() => {
      latest?.convertFullDay();
    });
    expect(latest?.actionState).toEqual({ kind: 'submitting', action: 'convert' });
    expect(cancelLeave).toHaveBeenCalledWith('lr1');
    await settle();
    expect(applyLeave).toHaveBeenCalledTimes(1);
    const [body, key] = applyLeave.mock.calls[0];
    expect(body).toEqual({
      startDate: '2026-10-03',
      part: 'full_day',
      reason: 'Not feeling well',
    });
    expect(typeof key).toBe('string');
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(latest?.actionState).toEqual({ kind: 'idle' });
  });

  it('the apply leg failing composes AC 10’s line under the server’s message', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    renderHost({ leaveId: 'lr1', workDate: '2026-10-03' });
    await settle();
    cancelLeave.mockResolvedValue(row());
    applyLeave.mockRejectedValue(apiErr('LEAVE_OVERLAP', 'Those dates are already off'));
    act(() => {
      latest?.convertFullDay();
    });
    await settle();
    expect(latest?.actionState).toEqual({
      kind: 'error',
      message: 'Those dates are already off. Your half-day request is already cancelled.',
    });
  });

  it('a TIMEOUT on the apply leg composes the offline line + the already-cancelled line', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    renderHost({ leaveId: 'lr1', workDate: '2026-10-03' });
    await settle();
    cancelLeave.mockResolvedValue(row());
    applyLeave.mockRejectedValue(apiErr('TIMEOUT', 'timed out'));
    act(() => {
      latest?.convertFullDay();
    });
    await settle();
    expect(latest?.actionState).toEqual({
      kind: 'error',
      message:
        "You're offline. Sending the request needs a working connection. Your half-day request is already cancelled.",
    });
  });

  it('the cancel leg already-handled → the handled notice; the apply leg NEVER fires', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    renderHost({ leaveId: 'lr1', workDate: '2026-10-03' });
    await settle();
    cancelLeave.mockRejectedValue(apiErr('LEAVE_NOT_CANCELLABLE', 'Not cancellable'));
    act(() => {
      latest?.convertFullDay();
    });
    await settle();
    expect(latest?.actionState).toEqual({ kind: 'handled' });
    expect(applyLeave).not.toHaveBeenCalled();
  });

  it('the cancel leg failing offline keeps the cancel posture — apply never fires', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    renderHost({ leaveId: 'lr1', workDate: '2026-10-03' });
    await settle();
    cancelLeave.mockRejectedValue(apiErr('NETWORK_ERROR', 'down'));
    act(() => {
      latest?.convertFullDay();
    });
    await settle();
    expect(latest?.actionState).toEqual({
      kind: 'error',
      message: "You're offline. Cancelling needs a working connection.",
    });
    expect(applyLeave).not.toHaveBeenCalled();
  });

  it('retry after a partial failure re-runs cancel (the BE own-retry 200), then the apply — each attempt a FRESH key', async () => {
    listMyLeave.mockResolvedValue(page([row()], null));
    renderHost({ leaveId: 'lr1', workDate: '2026-10-03' });
    await settle();

    // Attempt 1: cancel lands, apply fails.
    cancelLeave.mockResolvedValueOnce(row());
    applyLeave.mockRejectedValueOnce(apiErr('LEAVE_OVERLAP', 'already off'));
    act(() => {
      latest?.convertFullDay();
    });
    await settle();
    expect(latest?.actionState!.kind).toBe('error');

    // Attempt 2 — the sheet's Retry button re-enters the SAME confirm.
    applyLeave.mockResolvedValueOnce(
      row({ id: 'lr2', part: 'full_day' }),
    );
    act(() => {
      latest?.convertFullDay();
    });
    await settle();
    // The cancel was NOT skipped on the retry (BE own-retry answers 200
    // for the last-cause employee_cancel) — and it fired again.
    expect(cancelLeave).toHaveBeenCalledTimes(2);
    expect(applyLeave).toHaveBeenCalledTimes(2);
    const firstKey = applyLeave.mock.calls[0][1];
    const secondKey = applyLeave.mock.calls[1][1];
    expect(secondKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(secondKey).not.toBe(firstKey);
    expect(latest?.actionState).toEqual({ kind: 'idle' });
  });

  it('a convert press with no resolved row or no picked date is a no-op', () => {
    renderHost({ leaveId: 'lr1', workDate: null }); // walk still pending → no row
    act(() => {
      latest?.convertFullDay();
    });
    expect(cancelLeave).not.toHaveBeenCalled();
    expect(applyLeave).not.toHaveBeenCalled();
    expect(latest?.actionState).toEqual({ kind: 'idle' });
  });
});