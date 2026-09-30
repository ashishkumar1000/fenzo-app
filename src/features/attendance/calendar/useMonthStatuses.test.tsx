/**
 * Hook tests for useMonthStatuses (Story 18-3, spec §3 test plan): the
 * FRESH-FETCH lifecycle (mount + every month change, no cache — data
 * clears between months); the LAST-REQUEST-WINS seq guard (a stale slow
 * month can never paint over a newer one, incl. the A→B→A replay);
 * the ordinary error state + retry; the owner/me route split; unmount
 * mid-flight safe. RTR gotchas honoured: state reads through a Probe
 * ref, async flushes via `await act(async () => {})`, unmounts act-wrapped.
 */
jest.mock('../../../services/resources/attendanceDayStatus', () => ({
  ...jest.requireActual('../../../services/resources/attendanceDayStatus'),
  fetchDayStatuses: jest.fn(),
  fetchMyDayStatuses: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import {
  fetchDayStatuses,
  fetchMyDayStatuses,
} from '../../../services/resources/attendanceDayStatus';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import { useMonthStatuses } from './useMonthStatuses';

const fetchOwner = fetchDayStatuses as jest.Mock;
const fetchMe = fetchMyDayStatuses as jest.Mock;

function row(workDate: string, status: DayStatusRow['status'] = 'present'): DayStatusRow {
  return {
    workDate,
    status,
    lateMinutes: null,
    isLate: false,
    earlyCheckoutMinutes: null,
    earlyCheckout: false,
    workedMinutes: null,
    daysWorked: 1,
    leaveCredit: 0,
    workedOnHolidayCredit: 0,
    isWeeklyOff: false,
    holidayName: null,
    isWorkingDay: true,
    officeId: null,
    officeName: null,
    checkinAt: null,
    checkoutAt: null,
    checkinSource: null,
    checkoutSource: null,
    checkinDistanceM: null,
    checkoutDistanceM: null,
    markers: [],
  };
}

function ownerEnvelope(employeeId: string, days: DayStatusRow[]) {
  return { employeeId, from: '2026-09-01', to: '2026-09-30', today: '2026-09-29', days };
}

type Hook = ReturnType<typeof useMonthStatuses>;
let latest: Hook;

/** Every renderer this suite created — act-wrapped unmount in afterEach. */
const renderers: ReactTestRenderer.ReactTestRenderer[] = [];

function Probe(props: { scope: Parameters<typeof useMonthStatuses>[0]['scope']; yearMonth: string }) {
  latest = useMonthStatuses({ scope: props.scope, yearMonth: props.yearMonth });
  return null;
}

type Ctx = {
  renderer: ReactTestRenderer.ReactTestRenderer;
  rerender: (scope: Parameters<typeof useMonthStatuses>[0]['scope'], yearMonth: string) => void;
};

function render(
  scope: Parameters<typeof useMonthStatuses>[0]['scope'],
  yearMonth: string,
): Ctx {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe scope={scope} yearMonth={yearMonth} />);
  });
  renderers.push(renderer);
  return {
    renderer,
    rerender(nextScope, nextMonth) {
      act(() => {
        renderer.update(<Probe scope={nextScope} yearMonth={nextMonth} />);
      });
    },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

afterEach(() => {
  // Act-wrapped unmounts everywhere: the mounted guard runs in a passive
  // cleanup, and an in-flight fetch may settle after the test ends.
  while (renderers.length > 0) {
    const renderer = renderers.pop()!;
    act(() => renderer.unmount());
  }
});

describe('the fresh-fetch lifecycle (no cache)', () => {
  it('fetches on mount with the monthRange bounds; rows land keyed by workDate', async () => {
    fetchOwner.mockResolvedValueOnce(ownerEnvelope('e1', [row('2026-09-14'), row('2026-09-15', 'leave')]));

    let ctx!: Ctx;
    await act(async () => {
      ctx = render({ kind: 'owner', employeeId: 'e1' }, '2026-09');
    });

    expect(fetchOwner).toHaveBeenCalledTimes(1);
    expect(fetchOwner).toHaveBeenCalledWith('e1', '2026-09-01', '2026-09-30');
    expect(latest.loading).toBe(false);
    expect(latest.error).toBeNull();
    expect(latest.today).toBe('2026-09-29');
    expect(latest.data.get('2026-09-14')?.status).toBe('present');
    expect(latest.data.get('2026-09-15')?.status).toBe('leave');
  });

  it('a month change refetches FRESH — the old map clears first, no cache', async () => {
    fetchOwner.mockResolvedValue(ownerEnvelope('e1', [row('2026-09-14')]));

    let ctx!: Ctx;
    await act(async () => {
      ctx = render({ kind: 'owner', employeeId: 'e1' }, '2026-09');
    });
    expect(latest.data.size).toBe(1);

    // While the next month is in flight: loading, and September's data is
    // GONE (a stale month must never masquerade as the new one).
    fetchOwner.mockImplementationOnce(() => new Promise(() => undefined));
    ctx.rerender({ kind: 'owner', employeeId: 'e1' }, '2026-10');
    expect(fetchOwner).toHaveBeenLastCalledWith('e1', '2026-10-01', '2026-10-31');
    expect(latest.loading).toBe(true);
    expect(latest.data.size).toBe(0);
  });

  it('the me scope routes to fetchMyDayStatuses', async () => {
    fetchMe.mockResolvedValueOnce({ from: 'a', to: 'b', today: '2026-09-29', days: [row('2026-09-14')] });

    await act(async () => {
      render({ kind: 'me' }, '2026-09');
    });

    expect(fetchMe).toHaveBeenCalledWith('2026-09-01', '2026-09-30');
    expect(fetchOwner).not.toHaveBeenCalled();
  });
});

describe('the last-request-wins seq guard', () => {
  it('a slow STALE month resolve is dropped after a newer one landed', async () => {
    let resolveStale!: (v: ReturnType<typeof ownerEnvelope>) => void;
    fetchOwner
      .mockImplementationOnce(
        () => new Promise(resolve => (resolveStale = resolve)),
      )
      .mockResolvedValueOnce(ownerEnvelope('e1', [row('2026-10-05')]));

    let ctx!: Ctx;
    await act(async () => {
      ctx = render({ kind: 'owner', employeeId: 'e1' }, '2026-09');
    });
    // Page ‹ › fast: October answers while September still hangs.
    ctx.rerender({ kind: 'owner', employeeId: 'e1' }, '2026-10');
    await act(async () => {});
    expect(latest.data.get('2026-10-05')?.status).toBe('present');
    expect(latest.loading).toBe(false);

    // September's late answer must NOT repaint the map.
    await act(async () => {
      resolveStale(ownerEnvelope('e1', [row('2026-09-14')]));
      await Promise.resolve();
    });
    expect(latest.data.has('2026-09-14')).toBe(false);
    expect(latest.data.get('2026-10-05')?.status).toBe('present');
  });

  it('a stale month resolve cannot overwrite either (A→B→A replay)', async () => {
    let resolveA1!: (v: ReturnType<typeof ownerEnvelope>) => void;
    fetchOwner
      .mockImplementationOnce(
        () => new Promise(resolve => (resolveA1 = resolve)),
      )
      .mockResolvedValueOnce(ownerEnvelope('e1', [row('2026-10-05')]))
      .mockResolvedValueOnce(ownerEnvelope('e1', [row('2026-09-14', 'leave')]));

    let ctx!: Ctx;
    await act(async () => {
      ctx = render({ kind: 'owner', employeeId: 'e1' }, '2026-09');
    });
    ctx.rerender({ kind: 'owner', employeeId: 'e1' }, '2026-10');
    ctx.rerender({ kind: 'owner', employeeId: 'e1' }, '2026-09');
    await act(async () => {});

    // The FIRST September request is stale (request 3 owns the map).
    await act(async () => {
      resolveA1(ownerEnvelope('e1', [row('2026-09-14')]));
      await Promise.resolve();
    });
    expect(latest.data.get('2026-09-14')?.status).toBe('leave');
  });
});

describe('the ordinary error state + retry', () => {
  it('a failure exposes the message, keeps the map empty; Retry refetches', async () => {
    fetchOwner
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR', message: 'Network request failed' })
      .mockResolvedValueOnce(ownerEnvelope('e1', [row('2026-09-14')]));

    let ctx!: Ctx;
    await act(async () => {
      ctx = render({ kind: 'owner', employeeId: 'e1' }, '2026-09');
    });

    expect(latest.error).toBe('Network request failed');
    expect(latest.loading).toBe(false);
    expect(latest.data.size).toBe(0);

    await act(async () => {
      latest.retry();
    });
    expect(fetchOwner).toHaveBeenCalledTimes(2);
    expect(latest.error).toBeNull();
    expect(latest.data.get('2026-09-14')?.status).toBe('present');
  });

  it('a message-less rejection falls back to the copy line', async () => {
    fetchOwner.mockRejectedValueOnce({ status: 500 });

    await act(async () => {
      render({ kind: 'owner', employeeId: 'e1' }, '2026-09');
    });

    expect(latest.error).toBe(
      "Couldn't load the month. Check your connection and try again.",
    );
  });

  it('the me 403 ATTENDANCE_NOT_TRACKED is the SAME ordinary error state', async () => {
    fetchMe.mockRejectedValueOnce({
      status: 403,
      code: 'ATTENDANCE_NOT_TRACKED',
      message: 'Attendance is not enabled for you',
    });

    await act(async () => {
      render({ kind: 'me' }, '2026-09');
    });

    expect(latest.error).toBe('Attendance is not enabled for you');
    expect(latest.loading).toBe(false);
  });

  it('an error on a changed month is dropped when a newer request succeeded', async () => {
    let rejectStale!: (e: unknown) => void;
    fetchOwner
      .mockImplementationOnce(
        () => new Promise((_resolve, reject) => (rejectStale = reject)),
      )
      .mockResolvedValueOnce(ownerEnvelope('e1', [row('2026-10-05')]));

    let ctx!: Ctx;
    await act(async () => {
      ctx = render({ kind: 'owner', employeeId: 'e1' }, '2026-09');
    });
    ctx.rerender({ kind: 'owner', employeeId: 'e1' }, '2026-10');
    await act(async () => {});
    expect(latest.error).toBeNull();

    await act(async () => {
      rejectStale({ status: 500 });
      await Promise.resolve();
    });
    expect(latest.error).toBeNull();
    expect(latest.data.size).toBe(1);
  });
});

describe('unmount mid-flight', () => {
  it('a resolve after unmount is dropped without touching state', async () => {
    let resolveLate!: (v: ReturnType<typeof ownerEnvelope>) => void;
    fetchOwner.mockImplementationOnce(
      () => new Promise(resolve => (resolveLate = resolve)),
    );

    let ctx!: Ctx;
    await act(async () => {
      ctx = render({ kind: 'owner', employeeId: 'e1' }, '2026-09');
    });
    const renderer = ctx.renderer;
    act(() => renderer.unmount());

    await act(async () => {
      resolveLate(ownerEnvelope('e1', [row('2026-09-14')]));
      await Promise.resolve();
    });
    // Documents the mounted-guard contract. HONEST LIMIT: RTR cannot
    // observe a setState-after-unmount (React 18+ no longer warns), so this
    // test stays green even with the guard deleted — it is documentation;
    // the seq-guard tests above are the enforced ones.
    expect(fetchOwner).toHaveBeenCalledTimes(1);
  });
});
