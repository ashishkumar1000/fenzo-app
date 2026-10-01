/**
 * Hook tests for `useEnrolments` (Story 15-8, extended by 15-9): the
 * useOffices tri-state contract (first-load loading window — rendered as
 * the shimmer / first-load error /
 * stale banner over kept rows), the per-row write lifecycle (server-truth
 * merges — never an optimistic flip), the per-row latch, the special error
 * branches (404 EMPLOYEE_NOT_FOUND + 422 ASSIGNMENT_NOT_ENROLLED → roster
 * refetch; 409 OFFICE_ARCHIVED → the host's onOfficeArchived), and 15-9's
 * reassignment moves (future-dated commits record the scheduled move;
 * enable/disable supersede it). Services are mocked at the barrel; the
 * focus effect is captured and fired manually, same convention as
 * `useOffices.test.tsx`.
 *
 * The write mocks resolve with the BE's REAL response shape — the 7-field
 * access state WITHOUT identity fields (`EnrolmentWriteState`); mocking a
 * full row here once let a nameless-ghost bug ship (found live on device).
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../services', () => ({
  enrolmentsService: {
    list: jest.fn(),
    enable: jest.fn(),
    reassign: jest.fn(),
    disable: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { useFocusEffect } from '@react-navigation/native';
import { enrolmentsService } from '../../../services';
import type { EnrolmentOverview, EnrolmentWriteState } from '../../../services';
import { useEnrolments } from './useEnrolments';

const list = enrolmentsService.list as jest.Mock;
const enable = enrolmentsService.enable as jest.Mock;
const reassign = enrolmentsService.reassign as jest.Mock;
const disable = enrolmentsService.disable as jest.Mock;
const useFocusEffectMock = useFocusEffect as jest.Mock;

const TODAY = '2026-09-28';

function row(overrides: Partial<EnrolmentOverview> = {}): EnrolmentOverview {
  return {
    employeeId: 'e1',
    employeeName: 'Priya',
    phone: '+919000000000',
    attendanceEnabled: false,
    attendanceAccess: 'none',
    attendanceStartDate: null,
    enabledAt: null,
    onboardedAt: null,
    officeId: null,
    officeName: null,
    ...overrides,
  };
}

function writeState(
  overrides: Partial<EnrolmentWriteState> = {},
): EnrolmentWriteState {
  return {
    attendanceEnabled: true,
    attendanceAccess: 'active',
    attendanceStartDate: null,
    enabledAt: '2026-09-28T10:00:00Z',
    onboardedAt: null,
    officeId: 'o1',
    officeName: 'HQ',
    ...overrides,
  };
}

const PRIYA = row();
const RAMESH = row({
  employeeId: 'e2',
  employeeName: 'Ramesh',
  phone: '+919000000001',
});

let probe: ReturnType<typeof useEnrolments>;
function Probe({
  options,
}: {
  options?: Parameters<typeof useEnrolments>[0];
}) {
  probe = useEnrolments(options ?? { today: TODAY });
  return null;
}

function renderProbe(options?: Parameters<typeof useEnrolments>[0]) {
  act(() => {
    create(<Probe options={options} />);
  });
}

/** Captures the effect the hook registered and runs it like a focus. */
function fireFocus() {
  expect(useFocusEffectMock).toHaveBeenCalled();
  const effect = useFocusEffectMock.mock.calls.at(-1)?.[0] as () => void;
  effect();
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

async function focusAndFlush() {
  fireFocus();
  await act(async () => {
    await flush();
  });
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — an unconsumed mockRejectedValueOnce
  // would leak into the next test's first fetch.
  jest.resetAllMocks();
});

describe('tri-state contract (the useOffices shape)', () => {
  it('starts in the first-load state: loading, nothing loaded, empty roster', () => {
    renderProbe();
    expect(probe.isLoading).toBe(true);
    expect(probe.hasLoaded).toBe(false);
    expect(probe.roster).toEqual([]);
    expect(probe.error).toBeNull();
  });

  it('a settled focus fetch fills the roster and clears loading', async () => {
    list.mockResolvedValue([PRIYA, RAMESH]);
    renderProbe();
    await focusAndFlush();

    expect(list).toHaveBeenCalledTimes(1);
    expect(probe.isLoading).toBe(false);
    expect(probe.hasLoaded).toBe(true);
    expect(probe.roster.map((r) => r.employeeId)).toEqual(['e1', 'e2']);
  });

  it('a first-load failure surfaces the error with hasLoaded false (retry state)', async () => {
    list.mockRejectedValue({ status: 500, code: 'SERVER_ERROR' });
    renderProbe();
    await focusAndFlush();

    expect(probe.error?.status).toBe(500);
    expect(probe.hasLoaded).toBe(false);
    expect(probe.isLoading).toBe(false);
    expect(probe.roster).toEqual([]);
  });

  it('a REFRESH failure over loaded rows keeps the rows (stale-banner state)', async () => {
    list.mockResolvedValue([PRIYA]);
    renderProbe();
    await focusAndFlush();

    list.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' });
    await focusAndFlush();

    expect(probe.error?.code).toBe('NETWORK_ERROR');
    expect(probe.hasLoaded).toBe(true);
    expect(probe.roster.map((r) => r.employeeId)).toEqual(['e1']);
  });

  it('every focus refetches (returning from a pushed screen shows the truth)', async () => {
    list.mockResolvedValue([PRIYA]);
    renderProbe();
    await focusAndFlush();
    await focusAndFlush();

    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe('enable — toggle-on', () => {
  it('merges the returned ACCESS STATE into the row by the called employeeId (BE returns no identity fields)', async () => {
    list.mockResolvedValue([PRIYA]);
    enable.mockResolvedValue(
      writeState({ attendanceStartDate: '2026-09-28', officeId: 'o1', officeName: 'HQ' }),
    );
    renderProbe();
    await focusAndFlush();

    let committed = false;
    await act(async () => {
      committed = await probe.enable('e1', 'o1');
    });

    expect(enable).toHaveBeenCalledWith('e1', 'o1', undefined);
    expect(committed).toBe(true);
    // The row UPDATED in place — no nameless ghost appended.
    expect(probe.roster).toHaveLength(1);
    expect(probe.roster[0]).toMatchObject({
      employeeId: 'e1',
      employeeName: 'Priya',
      phone: PRIYA.phone,
      // The gate-relevant raw truth merged in (start date + office)…
      attendanceStartDate: '2026-09-28',
      officeId: 'o1',
      officeName: 'HQ',
      // …alongside the (module-flag) fields the BE returned.
      attendanceEnabled: true,
      attendanceAccess: 'active',
    });
    expect(probe.rowError('e1')).toBeNull();
  });

  it('an enable for an employee no longer on the roster falls back to a refetch (no ghost row)', async () => {
    // Initial roster has Priya; a focus refetch while the PUT is in flight
    // (e.g. she was removed elsewhere) drops her — the merge must not
    // append her write state as a nameless ghost, it must refetch.
    list.mockResolvedValueOnce([PRIYA]);
    list.mockResolvedValueOnce([]); // the in-flight refetch that lost the row
    list.mockResolvedValueOnce([PRIYA]); // the merge fallback refetch
    enable.mockImplementationOnce(async () => {
      void probe.refresh(); // the roster loses the row mid-PUT
      await flush();
      return writeState({});
    });
    renderProbe();
    await focusAndFlush();

    await act(async () => {
      await probe.enable('e1', 'o1');
      await flush(); // the fallback refetch is fire-and-forget
    });

    expect(list).toHaveBeenCalledTimes(3);
    expect(probe.roster.map((r) => r.employeeId)).toEqual(['e1']);
  });

  it('404 EMPLOYEE_NOT_FOUND records the row error AND refetches the roster (row gone)', async () => {
    list.mockResolvedValueOnce([PRIYA]);
    list.mockResolvedValueOnce([]); // the refetched roster without the row
    enable.mockRejectedValueOnce({
      status: 404,
      code: 'ATTENDANCE_EMPLOYEE_NOT_FOUND',
    });
    renderProbe();
    await focusAndFlush();

    await act(async () => {
      await probe.enable('e1', 'o1');
    });

    expect(enable).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2); // initial + the 404 refetch
    expect(probe.roster).toEqual([]);
    expect(probe.rowError('e1')?.code).toBe('ATTENDANCE_EMPLOYEE_NOT_FOUND');
    expect(probe.isRowPending('e1')).toBe(false);
  });

  it('409 OFFICE_ARCHIVED records the row error and notifies the host (offices refetch)', async () => {
    const onOfficeArchived = jest.fn();
    list.mockResolvedValue([PRIYA]);
    enable.mockRejectedValue({
      status: 409,
      code: 'ATTENDANCE_OFFICE_ARCHIVED',
    });
    renderProbe({ today: TODAY, onOfficeArchived });
    await focusAndFlush();

    await act(async () => {
      await probe.enable('e1', 'o1');
    });

    expect(probe.rowError('e1')?.code).toBe('ATTENDANCE_OFFICE_ARCHIVED');
    expect(onOfficeArchived).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1); // no roster refetch for this branch
    expect(probe.roster[0].attendanceEnabled).toBe(false); // reverted-by-truth
  });

  it('any other failure records the row error and leaves roster + host alone', async () => {
    const onOfficeArchived = jest.fn();
    list.mockResolvedValue([PRIYA]);
    enable.mockRejectedValue({ status: 500, code: 'SERVER_ERROR' });
    renderProbe({ today: TODAY, onOfficeArchived });
    await focusAndFlush();

    await act(async () => {
      await probe.enable('e1', 'o1');
    });

    expect(probe.rowError('e1')?.status).toBe(500);
    expect(onOfficeArchived).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe('disable — toggle-off', () => {
  it('merges the returned post-disable state (identity preserved)', async () => {
    list.mockResolvedValue([
      row({ attendanceEnabled: true, officeId: 'o1', officeName: 'HQ' }),
    ]);
    disable.mockResolvedValue(
      writeState({
        attendanceEnabled: false,
        attendanceAccess: 'history_only',
        officeId: null,
        officeName: null,
      }),
    );
    renderProbe();
    await focusAndFlush();

    let committed = false;
    await act(async () => {
      committed = await probe.disable('e1');
    });

    expect(disable).toHaveBeenCalledWith('e1');
    expect(committed).toBe(true);
    expect(probe.roster).toHaveLength(1);
    expect(probe.roster[0]).toMatchObject({
      employeeId: 'e1',
      employeeName: 'Priya',
      attendanceEnabled: false,
      attendanceAccess: 'history_only',
      officeId: null,
      officeName: null,
    });
  });

  it('a failure records the row error and keeps the pre-write row', async () => {
    list.mockResolvedValue([
      row({ attendanceEnabled: true, officeId: 'o1', officeName: 'HQ' }),
    ]);
    disable.mockRejectedValue({
      status: 404,
      code: 'ATTENDANCE_EMPLOYEE_NOT_FOUND',
    });
    renderProbe();
    await focusAndFlush();

    await act(async () => {
      await probe.disable('e1');
    });

    expect(probe.rowError('e1')?.status).toBe(404);
    // The 404 ALSO refetches — the row is gone server-side.
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe('per-row latch', () => {
  it('a second call while a write is in flight does NOT fire a second PUT', async () => {
    let release!: (v: EnrolmentWriteState) => void;
    enable.mockImplementation(
      () =>
        new Promise<EnrolmentWriteState>((resolve) => (release = resolve)),
    );
    list.mockResolvedValue([PRIYA]);
    renderProbe();
    await focusAndFlush();

    let secondResult: boolean | null = null;
    await act(async () => {
      const first = probe.enable('e1', 'o1');
      const second = probe.enable('e1', 'o1').then((v) => {
        secondResult = v; // the double-tap race loses
      });
      release(writeState({}));
      await Promise.all([first, second]);
    });

    expect(secondResult).toBe(false);
    expect(enable).toHaveBeenCalledTimes(1);
  });

  it('the latch is PER-ROW — another employee toggles freely in parallel', async () => {
    let releaseFirst!: (v: EnrolmentWriteState) => void;
    enable
      .mockImplementationOnce(
        () =>
          new Promise<EnrolmentWriteState>(
            (resolve) => (releaseFirst = resolve),
          ),
      )
      .mockResolvedValueOnce(writeState({}));
    list.mockResolvedValue([PRIYA, RAMESH]);
    renderProbe();
    await focusAndFlush();

    await act(async () => {
      const priya = probe.enable('e1', 'o1');
      const ramesh = probe.enable('e2', 'o1'); // different row — must fire
      releaseFirst(writeState({}));
      await Promise.all([priya, ramesh]);
    });

    expect(enable).toHaveBeenCalledTimes(2);
    expect(enable).toHaveBeenCalledWith('e2', 'o1', undefined);
    // Both merges landed on their own rows (identity preserved).
    expect(probe.roster.map((r) => r.employeeName)).toEqual(['Priya', 'Ramesh']);
    expect(probe.roster.every((r) => r.attendanceEnabled)).toBe(true);
  });
});

describe('row errors', () => {
  it('a row error is cleared by the NEXT write to that row', async () => {
    list.mockResolvedValue([PRIYA]);
    enable
      .mockRejectedValueOnce({ status: 500, code: 'SERVER_ERROR' })
      .mockResolvedValueOnce(writeState({ attendanceStartDate: TODAY, officeId: 'o1', officeName: 'HQ' }));
    renderProbe();
    await focusAndFlush();

    await act(async () => {
      await probe.enable('e1', 'o1');
    });
    expect(probe.rowError('e1')?.status).toBe(500);

    await act(async () => {
      await probe.enable('e1', 'o1');
    });
    expect(probe.rowError('e1')).toBeNull();
    expect(enable).toHaveBeenCalledTimes(2);
  });

  it('rows hold independent errors — one row failing never mutes another', async () => {
    list.mockResolvedValue([PRIYA, RAMESH]);
    enable.mockRejectedValueOnce({ status: 409, code: 'ATTENDANCE_OFFICE_ARCHIVED' });
    enable.mockResolvedValueOnce(writeState({}));
    renderProbe();
    await focusAndFlush();

    await act(async () => {
      await probe.enable('e1', 'o1');
      await probe.enable('e2', 'o1');
    });

    expect(probe.rowError('e1')?.code).toBe('ATTENDANCE_OFFICE_ARCHIVED');
    expect(probe.rowError('e2')).toBeNull();
  });
});

describe('enable — the 15-9 start date', () => {
  it('a picked future date rides on the PUT; an undefined pick omits the param (server-default today)', async () => {
    list.mockResolvedValue([PRIYA]);
    enable.mockResolvedValue(writeState({ attendanceStartDate: '2026-11-01' }));
    renderProbe();
    await focusAndFlush();

    await act(async () => {
      await probe.enable('e1', 'o1', '2026-11-01');
      await probe.enable('e1', 'o1', undefined);
    });

    expect(enable).toHaveBeenNthCalledWith(1, 'e1', 'o1', '2026-11-01');
    expect(enable).toHaveBeenNthCalledWith(2, 'e1', 'o1', undefined);
  });
});

describe('reassign — FR-6 with an explicit effective date (15-9)', () => {
  const COVERING = row({
    attendanceStartDate: TODAY,
    officeId: 'o1',
    officeName: 'HQ',
  });

  it('merges the post-write state and records a SCHEDULED MOVE for a future effectiveFrom', async () => {
    list.mockResolvedValue([COVERING]);
    // A future move's write response still carries the CURRENT covering
    // office (the view cannot see the future) — that is why the note exists.
    reassign.mockResolvedValue(writeState({ attendanceStartDate: TODAY, officeId: 'o1', officeName: 'HQ' }));
    renderProbe();
    await focusAndFlush();

    let committed = false;
    await act(async () => {
      committed = await probe.reassign('e1', 'o2', '2026-11-01');
    });

    expect(reassign).toHaveBeenCalledWith('e1', 'o2', '2026-11-01');
    expect(committed).toBe(true);
    expect(probe.scheduledMove('e1')).toEqual({
      officeId: 'o2',
      effectiveFrom: '2026-11-01',
    });
  });

  it('a today-dated reassign records NO move (row truth updates from the merge)', async () => {
    list.mockResolvedValue([COVERING]);
    reassign.mockResolvedValue(writeState({ attendanceStartDate: TODAY, officeId: 'o2', officeName: 'Branch' }));
    renderProbe();
    await focusAndFlush();

    await act(async () => {
      await probe.reassign('e1', 'o2', TODAY);
    });

    expect(probe.scheduledMove('e1')).toBeNull();
    expect(probe.roster[0]).toMatchObject({ officeId: 'o2', officeName: 'Branch' });
  });

  it('the move clears once a refetch shows its office covering today (it took effect)', async () => {
    list.mockResolvedValueOnce([COVERING]);
    reassign.mockResolvedValue(writeState({ attendanceStartDate: TODAY, officeId: 'o1' }));
    renderProbe();
    await focusAndFlush();
    await act(async () => {
      await probe.reassign('e1', 'o2', '2026-11-01');
    });
    expect(probe.scheduledMove('e1')).not.toBeNull();

    // The move date has passed; the next focus refetch shows office o2
    // covering today — the note is now redundant (the row says it itself).
    list.mockResolvedValue([
      row({ attendanceStartDate: TODAY, officeId: 'o2', officeName: 'Branch' }),
    ]);
    await focusAndFlush();
    expect(probe.scheduledMove('e1')).toBeNull();
  });

  it('a later enable or disable supersedes the move', async () => {
    list.mockResolvedValue([COVERING]);
    reassign.mockResolvedValue(writeState({ attendanceStartDate: TODAY, officeId: 'o1' }));
    enable.mockResolvedValue(writeState({ attendanceStartDate: TODAY }));
    renderProbe();
    await focusAndFlush();

    await act(async () => {
      await probe.reassign('e1', 'o2', '2026-11-01');
    });
    expect(probe.scheduledMove('e1')).not.toBeNull();

    await act(async () => {
      await probe.enable('e1', 'o2');
    });
    expect(probe.scheduledMove('e1')).toBeNull();

    await act(async () => {
      await probe.reassign('e1', 'o2', '2026-11-01');
    });
    expect(probe.scheduledMove('e1')).not.toBeNull();

    await act(async () => {
      await probe.disable('e1');
    });
    expect(probe.scheduledMove('e1')).toBeNull();
  });

  it('422 ASSIGNMENT_NOT_ENROLLED records the row error AND refetches (the enrolment moved under the write)', async () => {
    list.mockResolvedValueOnce([COVERING]);
    list.mockResolvedValueOnce([]);
    reassign.mockRejectedValueOnce({
      status: 422,
      code: 'ATTENDANCE_ASSIGNMENT_NOT_ENROLLED',
    });
    renderProbe();
    await focusAndFlush();

    await act(async () => {
      await probe.reassign('e1', 'o2', TODAY);
    });

    expect(list).toHaveBeenCalledTimes(2);
    expect(probe.rowError('e1')?.code).toBe('ATTENDANCE_ASSIGNMENT_NOT_ENROLLED');
    expect(probe.isRowPending('e1')).toBe(false);
    expect(probe.scheduledMove('e1')).toBeNull();
  });
});
