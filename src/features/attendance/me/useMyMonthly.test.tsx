/**
 * Hook tests for useMyMonthly (Story 19-6, spec §5.2): the ECHO GATE —
 * NO fetch while `today == null` (the P1 regression pin: me/monthly 422s
 * a future `to`, so a plain-range current-month fetch would fail ~29 days
 * out of 30 and its Retry would re-derive the same 422); the first fetch
 * once the echo lands, clamped through monthlyWindow; the yearMonth
 * change's RUNFETCH posture (data cleared, loading true — triage #4);
 * the seq guard; focus + AppState-active SILENT in-place refreshes;
 * Retry refires with the SAME clamped window; the fixed error copy.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../services', () => ({
  ...jest.requireActual('../../../services'),
  fetchMyMonthly: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMyMonthly } from '../../../services';
import type { MeMonthlyData } from '../../../services';
import { useMyMonthly, MY_MONTHLY_ERROR_COPY } from './useMyMonthly';

const fetchMe = fetchMyMonthly as jest.Mock;

function meData(overrides: Partial<MeMonthlyData> = {}): MeMonthlyData {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    today: '2026-09-30',
    summary: {
      daysWorked: 14.5,
      halfDays: 2,
      lateCount: 1,
      leave: 1,
      weeklyOffs: 3,
      holidays: 1,
      workedOnHoliday: 0,
      absent: 1,
      checkoutMissing: 2,
    },
    weeklyOffs: [7],
    upcomingHolidays: [{ holidayDate: '2026-10-02', holidayName: 'Gandhi Jayanti' }],
    ...overrides,
  };
}

type Hook = ReturnType<typeof useMyMonthly>;
let latest: Hook;

const renderers: ReactTestRenderer.ReactTestRenderer[] = [];

function Probe(props: { yearMonth: string; today: string | null }) {
  latest = useMyMonthly({ yearMonth: props.yearMonth, today: props.today });
  return null;
}

async function render(yearMonth: string, today: string | null) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(<Probe yearMonth={yearMonth} today={today} />);
  });
  renderers.push(renderer);
  return {
    renderer,
    async rerender(nextMonth: string, nextToday: string | null) {
      await act(async () => {
        renderer.update(<Probe yearMonth={nextMonth} today={nextToday} />);
      });
    },
  };
}

/** Fires the focus effects registered since the last call. */
let consumed = 0;
function fireFocus() {
  const effects = (useFocusEffect as jest.Mock).mock.calls
    .slice(consumed)
    .map(call => call[0] as () => void);
  consumed = (useFocusEffect as jest.Mock).mock.calls.length;
  act(() => {
    effects.forEach(effect => effect());
  });
}

let appStateListener: ((state: string) => void) | null = null;

beforeEach(() => {
  jest.resetAllMocks();
  consumed = 0;
  appStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: never,
  ) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  }) as never);
});

afterEach(() => {
  while (renderers.length > 0) {
    const renderer = renderers.pop()!;
    act(() => renderer.unmount());
  }
  (AppState.addEventListener as jest.Mock).mockRestore();
});

describe('the echo gate (the P1 fix)', () => {
  it('NO fetch while today == null — the hook idles loading', async () => {
    await render('2026-09', null);

    expect(fetchMe).not.toHaveBeenCalled();
    expect(latest.loading).toBe(true);
    expect(latest.data).toBeNull();
    expect(latest.error).toBeNull();
  });

  it('still no fetch when the month changes before the echo lands', async () => {
    const ctx = await render('2026-09', null);
    await ctx.rerender('2026-10', null);

    expect(fetchMe).not.toHaveBeenCalled();
    expect(latest.loading).toBe(true);
  });

  it('the FIRST fetch fires once the echo lands, clamped through monthlyWindow', async () => {
    fetchMe.mockResolvedValueOnce(meData());
    const ctx = await render('2026-09', null);

    await ctx.rerender('2026-09', '2026-09-15');

    expect(fetchMe).toHaveBeenCalledTimes(1);
    // The current month clamps to = today (a future `to` would 422).
    expect(fetchMe).toHaveBeenCalledWith('2026-09-01', '2026-09-15');
    expect(latest.loading).toBe(false);
    expect(latest.data?.summary.daysWorked).toBe(14.5);
  });

  it('a past month is a no-op clamp (the full month range)', async () => {
    fetchMe.mockResolvedValueOnce(meData({ from: '2026-08-01', to: '2026-08-31' }));
    await render('2026-08', '2026-09-15');

    expect(fetchMe).toHaveBeenCalledWith('2026-08-01', '2026-08-31');
    expect(latest.data?.to).toBe('2026-08-31');
  });
});

describe('the yearMonth change runs the runFetch posture (triage #4)', () => {
  it('clears data + sets loading in the same update — September never paints under October', async () => {
    fetchMe.mockResolvedValue(meData());
    const ctx = await render('2026-09', '2026-09-30');
    await act(async () => {});
    expect(latest.data?.from).toBe('2026-09-01');

    // The switch: in flight, loading true, September's chips GONE.
    fetchMe.mockImplementationOnce(() => new Promise(() => undefined));
    await ctx.rerender('2026-10', '2026-09-30');
    expect(fetchMe).toHaveBeenLastCalledWith('2026-10-01', '2026-09-30');
    expect(latest.loading).toBe(true);
    expect(latest.data).toBeNull();
    expect(latest.error).toBeNull();
  });
});

describe('the seq guard', () => {
  it('a slow STALE resolve is dropped after a newer one landed', async () => {
    let resolveStale!: (v: MeMonthlyData) => void;
    fetchMe
      .mockImplementationOnce(
        () => new Promise<MeMonthlyData>(r => (resolveStale = r)),
      )
      .mockResolvedValueOnce(meData({ from: '2026-10-01', to: '2026-10-15' }));

    const ctx = await render('2026-09', '2026-09-30');
    await ctx.rerender('2026-10', '2026-09-30');
    await act(async () => {});
    expect(latest.data?.from).toBe('2026-10-01');

    await act(async () => {
      resolveStale(meData());
      await Promise.resolve();
    });
    expect(latest.data?.from).toBe('2026-10-01');
  });
});

describe('the silent refreshes (focus + AppState-active)', () => {
  it('focus refetches in place — data kept, no loading flip', async () => {
    fetchMe.mockResolvedValueOnce(meData());
    await render('2026-09', '2026-09-30');
    await act(async () => {});
    expect(latest.data).not.toBeNull();

    // PERSISTENT pending: useFocusEffect registers once per render, so a
    // fireFocus may legally fire more than one silent refresh — every one
    // of them must meet a promise, never a bare undefined.
    let resolveRefresh!: (v: MeMonthlyData) => void;
    fetchMe.mockImplementation(
      () => new Promise<MeMonthlyData>(r => (resolveRefresh = r)),
    );
    fireFocus();
    expect(fetchMe).toHaveBeenLastCalledWith('2026-09-01', '2026-09-30');
    // In place: no clearing, no spinner flip.
    expect(latest.loading).toBe(false);
    expect(latest.data).not.toBeNull();

    await act(async () => {
      resolveRefresh(
        meData({ summary: { ...meData().summary, daysWorked: 15 } }),
      );
      await Promise.resolve();
    });
    expect(latest.data?.summary.daysWorked).toBe(15);
  });

  it('AppState-active refetches in place; background does not', async () => {
    fetchMe.mockResolvedValueOnce(meData());
    await render('2026-09', '2026-09-30');
    await act(async () => {});
    const calls = fetchMe.mock.calls.length;

    act(() => appStateListener?.('background'));
    expect(fetchMe.mock.calls.length).toBe(calls);

    // The listener fires the fetch AND its flush inside act — the resolve
    // must never land outside it (the act() warning class).
    fetchMe.mockResolvedValueOnce(meData());
    await act(async () => {
      appStateListener?.('active');
      await Promise.resolve();
    });
    expect(fetchMe.mock.calls.length).toBe(calls + 1);
  });

  it('a second focus within the shared min-gap does not re-fetch (push/pop round trips stay quiet)', async () => {
    fetchMe.mockResolvedValueOnce(meData());
    await render('2026-09', '2026-09-30');
    await act(async () => {});
    const calls = fetchMe.mock.calls.length;

    // Persistent pending: an unflushed silent refresh must never resolve
    // outside act, and the counts are the assertion.
    fetchMe.mockImplementation(() => new Promise<MeMonthlyData>(() => undefined));
    fireFocus();
    expect(fetchMe.mock.calls.length).toBe(calls + 1);
    fireFocus(); // within ACCESS_REFRESH_MIN_GAP_MS → skipped
    expect(fetchMe.mock.calls.length).toBe(calls + 1);
  });

  it('the silent refresh stays gated: today == null → focus never fetches', async () => {
    await render('2026-09', null);
    fireFocus();
    expect(fetchMe).not.toHaveBeenCalled();
  });
});

describe('error + retry', () => {
  it('a failure surfaces the FIXED copy; Retry refires with the SAME clamped window', async () => {
    fetchMe.mockRejectedValueOnce(new Error('monthly: boom'));
    await render('2026-09', '2026-09-15');

    expect(latest.error).toBe(MY_MONTHLY_ERROR_COPY);
    expect(latest.error).toBe(
      "Couldn't load your month summary. Check your connection and try again.",
    );
    expect(latest.data).toBeNull();
    expect(latest.loading).toBe(false);

    fetchMe.mockResolvedValueOnce(meData());
    await act(async () => {
      latest.retry();
    });
    expect(fetchMe).toHaveBeenLastCalledWith('2026-09-01', '2026-09-15');
    expect(latest.error).toBeNull();
    expect(latest.data).not.toBeNull();
  });

  it('a silent-refresh failure flags the error but keeps the loaded summary standing', async () => {
    fetchMe.mockResolvedValueOnce(meData());
    await render('2026-09', '2026-09-30');
    await act(async () => {});

    fetchMe.mockRejectedValue(new Error('monthly: boom'));
    fireFocus();
    await act(async () => {});
    expect(latest.error).toBe(MY_MONTHLY_ERROR_COPY);
    // In-place contract: the loaded data is never cleared by a refresh.
    expect(latest.data).not.toBeNull();
    expect(latest.loading).toBe(false);
  });

  it('a silent-refresh SUCCESS clears a standing error — the banner never outlives a healthy refresh', async () => {
    fetchMe.mockRejectedValueOnce(new Error('monthly: boom'));
    await render('2026-09', '2026-09-15');
    expect(latest.error).toBe(MY_MONTHLY_ERROR_COPY);
    expect(latest.data).toBeNull();

    fetchMe.mockResolvedValueOnce(meData());
    fireFocus();
    await act(async () => {});
    expect(latest.error).toBeNull();
    expect(latest.data?.summary.daysWorked).toBe(14.5);
  });
});
