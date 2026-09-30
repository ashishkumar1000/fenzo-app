/**
 * Tests for the FR-25 owner monthly SCREEN (Story 19-5, spec §5.3, as
 * built per D4/D5/D8/D9). The screen is a read-only renderer over ONE
 * monthly envelope; the requirements these pin:
 *
 *  - ONE fetch per appearance: the first focus IS the initial load (the
 *    useFocusEffect contract); no mount fetch ever runs.
 *  - the device-seeded LAST month is the bootstrap (its plain window — no
 *    clamp: the device clock never draws a fetch boundary); the skeleton
 *    stands in labelled "Loading attendance", then the rows swap in.
 *  - the echo-correction fires ONCE when the echo's last month differs
 *    and no navigation happened; a user navigation stands it down.
 *  - rows render name/office/chips with per-chip family colours; a tap
 *    navigates with {employeeId, employeeName, yearMonth}.
 *  - › is disabled-until-known and disabled AT the current month
 *    (accessibilityState pinned), enabled one month earlier; BOTH
 *    chevrons render disabled while a load is in flight.
 *  - a month switch fetches the CLAMPED window and a failure reverts the
 *    {month, office} PAIR; the seq-guard drops older-resolves-late
 *    responses (never commit, never revert).
 *  - office filter: the sheet runs stats-null (name-only rows); Apply
 *    refetches with the officeId; a failed pick reverts.
 *  - empty → the EmptyState copy (no "yet"); first-load failure → the
 *    composition with the MONTHLY message; focus refetch keeps last-good
 *    and reloads the VIEWED month/office; AppState-active refetches only
 *    while focused.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../services', () => ({
  fetchMonthly: jest.fn(),
  officesService: {
    list: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AppState, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMonthly, officesService } from '../../../services';
import { monthRange } from '../../../services/resources/attendanceDayStatus';
import type { AttendanceMonthlyData } from '../../../services';
import { colors } from '../../../theme';
import AttendanceMonthlyScreen from './AttendanceMonthlyScreen';
import { shiftYearMonth, monthTitle } from './monthlyModel';
import { MONTHLY_ERROR_COPY } from './useMonthlyData';
import { LoadErrorRetry } from '../dashboard/LoadErrorRetry';
import { OfficeFilterSheet } from '../dashboard/OfficeFilterSheet';
import { Skeleton } from '../../../components/ui';

const fetchMock = fetchMonthly as jest.Mock;
const officesListMock = officesService.list as jest.Mock;

/** The device clock seeds which month to LOOK at first (declared
 *  scaffolding, D4) — the tests derive the SAME seed from the clock. */
function deviceThisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
const SEED = shiftYearMonth(deviceThisMonth(), -1);
/** An echo whose canonical default equals the seed → the bootstrap
 *  correction must NOT fire (mid-device-month, so the clamp is real). */
const ECHO_TODAY = `${deviceThisMonth()}-15`;
const NEXT_MONTH = shiftYearMonth(deviceThisMonth(), 1);

/** A wire-valid employee row. */
function employee(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    employeeId: 'e1',
    employeeName: 'Asha',
    officeId: 'o1',
    officeName: 'Andheri West',
    summary: {
      daysWorked: 18,
      halfDays: 2,
      lateCount: 0,
      leave: 0,
      weeklyOffs: 2,
      holidays: 0,
      workedOnHoliday: 0,
      absent: 1,
      checkoutMissing: 0,
    },
    ...overrides,
  };
}

/** A fully valid envelope for the seed month (echo = this month's 15th —
 *  canonical default = the seed, so no correction). */
function envelope(overrides: Record<string, unknown> = {}): AttendanceMonthlyData {
  return {
    from: `${SEED}-01`,
    to: monthRange(SEED).to,
    today: ECHO_TODAY,
    employees: [employee(), employee({ employeeId: 'e2', employeeName: 'Ben' })],
    ...overrides,
  } as unknown as AttendanceMonthlyData;
}

let consumedFocusCalls = 0;

async function fireFocus() {
  const calls = (useFocusEffect as jest.Mock).mock.calls.slice(consumedFocusCalls);
  consumedFocusCalls = (useFocusEffect as jest.Mock).mock.calls.length;
  expect(calls.length).toBeGreaterThan(0);
  await act(async () => {
    calls.forEach(call => call[0]());
  });
}

async function flush(times = 5) {
  // act-wrapped (the month-detail helper's shape) — a state update that
  // lands in here must never ride outside act.
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** The composite Pressable is mirrored by a host View in the RTR tree —
 *  require the onPress (the house idiom). */
function findButton(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
) {
  const matches = renderer.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

/** All Text contents, string children joined (fragments render as arrays). */
function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    );
}

/** The screen's error compositions — their onRetry callables. */
function retries(renderer: ReactTestRenderer.ReactTestRenderer): Array<() => void> {
  return renderer.root
    .findAllByType(LoadErrorRetry as never)
    .map(block => block.props.onRetry as () => void);
}

/** A chip Text's applied colour (the atomic chip's family fg). */
function chipColor(
  renderer: ReactTestRenderer.ReactTestRenderer,
  prefix: string,
): string | undefined {
  const chip = renderer.root
    .findAllByType(Text)
    .find(t =>
      (Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? '')
      ).startsWith(prefix),
    );
  expect(chip).toBeDefined();
  const style = Array.isArray(chip!.props.style)
    ? chip!.props.style.find((s: Record<string, unknown>) => s && 'color' in s)
    : chip!.props.style;
  return style?.color as string | undefined;
}

function renderScreen() {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => true),
    isFocused: jest.fn(() => true),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AttendanceMonthlyScreen
        navigation={navigation as never}
        route={{} as never}
      />,
    );
  });
  return { renderer, navigation };
}

describe('AttendanceMonthlyScreen — bootstrap + loading postures', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
  });

  it('does NOT fetch on mount — the first focus is the initial load', async () => {
    fetchMock.mockResolvedValue(envelope());
    renderScreen();
    expect(fetchMock).not.toHaveBeenCalled();
    await fireFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches the device-seeded LAST month with its plain (unclamped) window', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();
    expect(fetchMock.mock.calls[0].slice(0, 2)).toEqual([
      `${SEED}-01`,
      monthRange(SEED).to,
    ]);
    expect(texts(renderer)).toContain(monthTitle(SEED));
  });

  it('shows the labelled Skeleton BEFORE the fetch settles, then the rows', async () => {
    let resolve!: (v: AttendanceMonthlyData) => void;
    fetchMock.mockReturnValue(
      new Promise<AttendanceMonthlyData>(r => {
        resolve = r;
      }),
    );
    const { renderer } = renderScreen();
    await fireFocus();

    // In flight: the chrome is up, the labelled skeleton stands in.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(texts(renderer)).toContain('All offices');
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      renderer.root.findAllByType(Skeleton as never).length,
    ).toBeGreaterThanOrEqual(1);

    await act(async () => {
      resolve(envelope());
      await flush();
    });
    const shown = texts(renderer);
    expect(shown).toContain('Asha');
    expect(shown).toContain('Ben');
    expect(shown).toContain('18 worked');
    expect(shown).toContain('Andheri West · 2 weekly offs');
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBe(0);
  });

  it('exactly ONE fetch on first appearance', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(texts(renderer)).toContain('Asha');
  });

  it('the echo-correction fires ONCE when the echo last-month differs (no navigation)', async () => {
    // The echo says NEXT month is "today" → the canonical default is THIS
    // month, which differs from the device-seeded last month.
    const laterEcho = `${NEXT_MONTH}-10`;
    fetchMock
      .mockResolvedValueOnce(envelope({ today: laterEcho }))
      .mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();
    await flush();

    // The month corrected to the canonical default and REFETCHED it —
    // the canonical default is a PAST month relative to that echo, so
    // the window is its full range (no clamp).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1].slice(0, 2)).toEqual([
      `${deviceThisMonth()}-01`,
      monthRange(deviceThisMonth()).to,
    ]);
    expect(texts(renderer)).toContain(monthTitle(deviceThisMonth()));

    // A later focus refetch must NOT re-correct (computed once).
    await fireFocus();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(texts(renderer)).toContain(monthTitle(deviceThisMonth()));
  });

  it('a USER navigation stands the echo-correction down', async () => {
    const laterEcho = `${NEXT_MONTH}-10`;
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      // The navigation's load answers for the NAVIGATED month with a
      // differing echo — the correction must stand down.
      .mockResolvedValue(envelope({ today: laterEcho }));
    const { renderer } = renderScreen();
    await fireFocus();
    await flush();

    // First load failed → the owner navigates ‹ (their choice); that
    // load IS the retry.
    await act(async () => {
      findButton(renderer, 'Previous month').props.onPress();
      await flush();
    });

    const navigated = shiftYearMonth(SEED, -1);
    expect(fetchMock.mock.calls[1].slice(0, 2)).toEqual([
      `${navigated}-01`,
      monthRange(navigated).to,
    ]);
    expect(texts(renderer)).toContain(monthTitle(navigated));
    // No correction refetch followed (their choice stands).
    expect(texts(renderer)).not.toContain(monthTitle(deviceThisMonth()));
  });

  it('a first-load failure renders the composition with the MONTHLY message', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom: developer-shaped'));
    const { renderer } = renderScreen();
    await fireFocus();
    const shown = texts(renderer);
    expect(shown).toContain(MONTHLY_ERROR_COPY);
    expect(shown).not.toContain(
      "Couldn't load the dashboard. Check your connection and try again.",
    );
    expect(retries(renderer)).toHaveLength(1);

    // Retry succeeds → the rows render, the banner leaves.
    fetchMock.mockResolvedValueOnce(envelope());
    await act(async () => {
      retries(renderer)[0]();
      await flush();
    });
    expect(texts(renderer)).toContain('Asha');
    expect(texts(renderer)).not.toContain(MONTHLY_ERROR_COPY);
  });

  it('empty → the EmptyState copy inside the plain ScrollView (no "yet")', async () => {
    fetchMock.mockResolvedValue(envelope({ employees: [] }));
    const { renderer } = renderScreen();
    await fireFocus();
    const shown = texts(renderer);
    expect(shown).toContain('No attendance to review');
    expect(shown).toContain(
      'No one has tracked days in this month. Try another month or office.',
    );
    expect(shown.some(t => t.includes('yet'))).toBe(false);
  });
});

describe('AttendanceMonthlyScreen — rows', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
  });

  it('renders chips with their family colours (all six families pinned)', async () => {
    // A summary where every chip renders (late/leave/checkoutMissing are
    // zero-suppressed in the default fixture) — a wrong token on ANY of
    // the six must fail CI.
    fetchMock.mockResolvedValue(
      envelope({
        employees: [
          employee({
            summary: {
              daysWorked: 18,
              halfDays: 2,
              lateCount: 1,
              leave: 2.5,
              weeklyOffs: 2,
              holidays: 0,
              workedOnHoliday: 0,
              absent: 1,
              checkoutMissing: 1,
            },
          }),
        ],
      }),
    );
    const { renderer } = renderScreen();
    await fireFocus();
    expect(chipColor(renderer, '18 worked')).toBe(colors.status.done.fg);
    expect(chipColor(renderer, '2 half days')).toBe(colors.status.scheduled.fg);
    expect(chipColor(renderer, '1 late')).toBe(colors.status.scheduled.fg);
    expect(chipColor(renderer, '2.5 leave')).toBe(colors.status.leave.fg);
    expect(chipColor(renderer, '1 absent')).toBe(colors.status.cancelled.fg);
    expect(chipColor(renderer, '1 missing checkout')).toBe(
      colors.status.checkoutMissing.fg,
    );
  });

  it('a row tap navigates to the drill-down with the viewed month', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer, navigation } = renderScreen();
    await fireFocus();
    const ashaRow = renderer.root.findAll(
      node =>
        typeof node.props.onPress === 'function' &&
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Asha. '),
    );
    expect(ashaRow).toHaveLength(1);
    // The EXACT assembled label (model-pinned shape, comma-joined).
    expect(ashaRow[0].props.accessibilityLabel).toBe(
      'Asha. 18 worked, 2 half days, 1 absent. Andheri West, 2 weekly offs',
    );
    act(() => {
      ashaRow[0].props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceEmployeeMonth', {
      employeeId: 'e1',
      employeeName: 'Asha',
      yearMonth: SEED,
    });
  });
});

describe('AttendanceMonthlyScreen — month nav', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
  });

  it('› is disabled-until-known (accessibilityState pinned), ‹ unbounded past', async () => {
    let resolve!: (v: AttendanceMonthlyData) => void;
    fetchMock.mockReturnValue(
      new Promise<AttendanceMonthlyData>(r => {
        resolve = r;
      }),
    );
    const { renderer } = renderScreen();
    await fireFocus();
    const next = findButton(renderer, 'Next month');
    expect(next.props.disabled).toBe(true);
    expect(next.props.accessibilityState).toEqual({ disabled: true });

    await act(async () => {
      resolve(envelope());
      await flush();
    });
    // One month earlier than today → › enabled, ‹ enabled.
    const settledNext = findButton(renderer, 'Next month');
    expect(settledNext.props.disabled).toBe(false);
    expect(settledNext.props.accessibilityState).toEqual({ disabled: false });
    expect(findButton(renderer, 'Previous month').props.disabled).toBe(false);
  });

  it('› is disabled AT the current month; the switch fetches the CLAMPED window', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    // Seed (last month) → › enabled. Press it → the clamped current-month
    // window (to = the echo's today), "so far" is the honest reading.
    let resolveRefetch!: (v: AttendanceMonthlyData) => void;
    fetchMock.mockReturnValue(
      new Promise<AttendanceMonthlyData>(r => {
        resolveRefetch = r;
      }),
    );
    await act(async () => {
      findButton(renderer, 'Next month').props.onPress();
      await flush();
    });
    expect(fetchMock.mock.calls[1].slice(0, 2)).toEqual([
      `${deviceThisMonth()}-01`,
      ECHO_TODAY,
    ]);

    // In flight: BOTH chevrons disabled (Q5) with the state pinned...
    const next = findButton(renderer, 'Next month');
    expect(next.props.disabled).toBe(true);
    expect(next.props.accessibilityState).toEqual({ disabled: true });
    const prev = findButton(renderer, 'Previous month');
    expect(prev.props.disabled).toBe(true);
    expect(prev.props.accessibilityState).toEqual({ disabled: true });

    // ...and the parameter load answers with the row Skeleton (the
    // user's 2026-09-30 loader direction) — the stale rows stand down
    // while it fetches. (The labelled query scopes to the SCREEN's
    // skeleton: the closed filter sheet's own in-flight skeleton is
    // mounted-but-hidden and must not count.)
    // The preset's mock wrapper duplicates the labelled View node — the
    // bootstrap test's >=1 idiom; exactness comes from the ZERO pins.
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBeGreaterThanOrEqual(1);

    // ...and AT the current month › stays disabled after it lands.
    await act(async () => {
      resolveRefetch(envelope({ from: `${deviceThisMonth()}-01` }));
      await flush();
    });
    expect(findButton(renderer, 'Next month').props.disabled).toBe(true);
    expect(texts(renderer)).toContain(monthTitle(deviceThisMonth()));
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBe(0);
  });

  it('a failed month switch reverts the PAIR (month AND office) and shows the fixed copy', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    // Apply an office first — the pair to revert FROM is {seed, o1}.
    await act(async () => {
      findButton(renderer, 'Filter by office, currently All offices').props.onPress();
    });
    await act(async () => {
      renderer.root.findAllByType(OfficeFilterSheet as never)[0].props.onPick({
        id: 'o1',
        name: 'Hero wala',
      });
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The month switch FAILS → both axes revert to the last-good pair.
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      findButton(renderer, 'Previous month').props.onPress();
      await flush();
    });
    expect(texts(renderer)).toContain(monthTitle(SEED));
    expect(texts(renderer)).toContain('Hero wala');
    expect(texts(renderer)).toContain(MONTHLY_ERROR_COPY);
    expect(retries(renderer)).toHaveLength(1);
    // The revert restores the rows' pair — it does not refetch.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('the seq-guard: an older-resolves-late load never commits and never reverts', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    // ‹ starts a month load; while it is in flight a focus refetch starts
    // (the non-chevron entry points are not loading-gated — a real
    // interleaving). The refetch is the LATEST request.
    const resolvers: Array<(v: AttendanceMonthlyData) => void> = [];
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<AttendanceMonthlyData>(r => {
            resolvers.push(r);
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<AttendanceMonthlyData>(r => {
            resolvers.push(r);
          }),
      );
    await act(async () => {
      findButton(renderer, 'Previous month').props.onPress();
    });
    await fireFocus();
    expect(resolvers).toHaveLength(2);

    // The LATEST request resolves with the month's rows → commit.
    await act(async () => {
      resolvers[1](envelope());
      await flush();
    });
    expect(texts(renderer)).toContain('Asha');

    // The OLDER request resolves late with different rows → dropped: no
    // commit, no error, no revert.
    await act(async () => {
      resolvers[0](
        envelope({
          employees: [employee({ employeeId: 'e9', employeeName: 'STALE' })],
        }),
      );
      await flush();
    });
    expect(texts(renderer)).toContain('Asha');
    expect(texts(renderer)).not.toContain('STALE');
    expect(texts(renderer)).not.toContain(MONTHLY_ERROR_COPY);
  });

  it('a focus refetch reloads the VIEWED month (never the defaults) and keeps last-good', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    // Apply an office FIRST — the seam under test is BOTH axes in the
    // refs (a focus refetch after the drill-down reloads the VIEWED
    // month AND office, never the defaults).
    await act(async () => {
      renderer.root.findAllByType(OfficeFilterSheet as never)[0].props.onPick({
        id: 'o1',
        name: 'Hero wala',
      });
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Navigate › to the current month (settled).
    fetchMock.mockResolvedValueOnce(
      envelope({ from: `${deviceThisMonth()}-01` }),
    );
    await act(async () => {
      findButton(renderer, 'Next month').props.onPress();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // A focus refetch with a SLOW response: the last-good rows stay up.
    let resolveFocus!: (v: AttendanceMonthlyData) => void;
    fetchMock.mockReturnValue(
      new Promise<AttendanceMonthlyData>(r => {
        resolveFocus = r;
      }),
    );
    await fireFocus();
    // EVERY focus refetch reloads the VIEWED month AND office — the refs,
    // never the bootstrap defaults (the focus helper may batch the
    // registrations a re-render recorded; the window+office is the contract).
    const post = fetchMock.mock.calls.slice(3);
    expect(post.length).toBeGreaterThanOrEqual(1);
    for (const call of post) {
      expect(call.slice(0, 2)).toEqual([`${deviceThisMonth()}-01`, ECHO_TODAY]);
      expect(call[2]).toBe('o1');
    }
    expect(texts(renderer)).toContain('Asha'); // last-good, not cleared
    // The silent refetch shows NO skeleton — only parameter loads do
    // (the loader is the month/office switch's answer, not every fetch).
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBe(0);
    await act(async () => {
      resolveFocus(envelope());
      await flush();
    });
    expect(texts(renderer)).toContain('Asha');
  });
});

describe('AttendanceMonthlyScreen — office filter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
  });

  it('the sheet runs its name-only fallback (stats null); Apply refetches with the officeId', async () => {
    fetchMock
      .mockResolvedValueOnce(envelope())
      .mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    act(() => {
      findButton(renderer, 'Filter by office, currently All offices').props.onPress();
    });
    const sheet = renderer.root.findAllByType(OfficeFilterSheet as never)[0];
    expect(sheet.props.visible).toBe(true);
    // NO envelope registry here — the sheet fetches its own name-only rows.
    expect(sheet.props.stats).toBeNull();

    await act(async () => {
      sheet.props.onPick({ id: 'o1', name: 'Hero wala' });
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1].slice(0, 3)).toEqual([
      `${SEED}-01`,
      monthRange(SEED).to,
      'o1',
    ]);
    expect(texts(renderer)).toContain('Hero wala');
    expect(
      renderer.root.findAllByType(OfficeFilterSheet as never)[0].props.visible,
    ).toBe(false);
  });

  it('a failed office pick reverts the office AND keeps the month (the pair seam)', async () => {
    fetchMock
      .mockResolvedValueOnce(envelope())
      .mockResolvedValueOnce(envelope())
      .mockRejectedValueOnce(new Error('network down'));
    const { renderer } = renderScreen();
    await fireFocus();

    // First pick commits: {seed, Hero wala}.
    act(() => {
      findButton(renderer, 'Filter by office, currently All offices').props.onPress();
    });
    await act(async () => {
      renderer.root.findAllByType(OfficeFilterSheet as never)[0].props.onPick({
        id: 'o1',
        name: 'Hero wala',
      });
      await flush();
    });

    // A second pick fails → the selector reverts to Hero wala, rows stay.
    act(() => {
      findButton(renderer, 'Filter by office, currently Hero wala').props.onPress();
    });
    await act(async () => {
      renderer.root.findAllByType(OfficeFilterSheet as never)[0].props.onPick({
        id: 'o2',
        name: 'Yuka',
      });
      await flush();
    });
    expect(texts(renderer)).toContain('Hero wala');
    expect(texts(renderer)).toContain('Asha'); // last-good rows stay
    expect(texts(renderer)).toContain(MONTHLY_ERROR_COPY);
  });
});

describe('AttendanceMonthlyScreen — AppState-active refetch (19-5)', () => {
  let appStateListener: ((state: string) => void) | null = null;

  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((
      (_type: string, listener: never) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('foregrounding while focused refetches EXACTLY once; not while unfocused', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { navigation } = renderScreen();
    await fireFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      appStateListener?.('active');
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    (navigation.isFocused as jest.Mock).mockReturnValue(false);
    await act(async () => {
      appStateListener?.('active');
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      appStateListener?.('background');
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
