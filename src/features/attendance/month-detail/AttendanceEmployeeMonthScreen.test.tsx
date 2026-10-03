/**
 * Tests for the drill-down host (Story 19-5, spec §5.4, D6 + the D7
 * arrival): the pane renders with the params identity; the focusDate
 * auto-open follows the EXACT arming rules (fires ONCE on the first
 * SUCCESSFUL landing when the row exists — NOT when missing, NOT after a
 * manual pick, and again after a failed-then-retried first load); the
 * sheet's `visible` flips only post-resolution; › is disabled-until-known
 * and disabled AT the current month (nextDisabled from the report's
 * today); loading-month taps are suppressed (no grid mid-switch, so no
 * false "Not tracked" sheets); onCorrected refreshes; the correction
 * write passes through to `correctDay`; a mismatched yearMonth/focusDate
 * pair is dev-warned and the focusDate treated as absent.
 *
 * The service seam is mocked (the requireActual idiom); the pane, the
 * calendar and the sheet are REAL — the host is tested through them.
 */
jest.mock('../../../services/resources/attendanceDayStatus', () => ({
  ...jest.requireActual('../../../services/resources/attendanceDayStatus'),
  fetchDayStatuses: jest.fn(),
}));

jest.mock('../../../services/resources/attendanceCorrections', () => ({
  ...jest.requireActual('../../../services/resources/attendanceCorrections'),
  correctDay: jest.fn(),
  fetchCorrections: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  fetchDayStatuses,
} from '../../../services/resources/attendanceDayStatus';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import {
  correctDay,
  fetchCorrections,
} from '../../../services/resources/attendanceCorrections';
import AttendanceEmployeeMonthScreen from './AttendanceEmployeeMonthScreen';
import { RealMonthPane } from '../calendar/RealMonthPane';
import { DayStatusLegend } from '../calendar/DayStatusLegend';
import { DayDetailSheet } from '../calendar/DayDetailSheet';
import { MonthCalendar } from '../calendar/MonthCalendar';
import { dayMonthLabel } from '../calendar/dayDetailModel';
import type { CorrectionWriteBody } from '../../../services/resources/attendanceCorrections';

const fetchOwner = fetchDayStatuses as jest.Mock;
const correctDayMock = correctDay as jest.Mock;
const fetchCorrectionsMock = fetchCorrections as jest.Mock;

function row(
  workDate: string,
  status: DayStatusRow['status'] = 'present',
): DayStatusRow {
  return {
    workDate,
    status,
    lateMinutes: null,
    isLate: false,
    earlyCheckoutMinutes: null,
    earlyCheckout: false,
    workedMinutes: status === 'present' ? 480 : null,
    daysWorked: status === 'present' ? 1 : 0,
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
    leaveRequestId: null, // 20-1 — no leave day
    markers: [],
  };
}

function envelope(employeeId: string, days: DayStatusRow[]) {
  return { employeeId, from: '2026-09-01', to: '2026-09-30', today: '2026-09-29', days };
}

type HostParams = {
  employeeId: string;
  employeeName: string;
  yearMonth: string;
  focusDate?: string | null;
};

function renderHost(params: HostParams) {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => true),
    isFocused: jest.fn(() => true),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AttendanceEmployeeMonthScreen
        navigation={navigation as never}
        route={{ key: 'host', params } as never}
      />,
    );
  });
  return { renderer, navigation };
}

async function flush(times = 5) {
  // Act-wrapped: the resolved promises' setState calls must flush the
  // renderer (a bare microtask drain does not re-render in RTR).
  await act(async () => {
    for (let i = 0; i < times; i++) await Promise.resolve();
  });
}

function sheetNode(
  renderer: ReactTestRenderer.ReactTestRenderer,
): ReactTestRenderer.ReactTestInstance {
  return renderer.root.findAllByType(DayDetailSheet as never)[0];
}

function paneNode(
  renderer: ReactTestRenderer.ReactTestRenderer,
): ReactTestRenderer.ReactTestInstance {
  return renderer.root.findAllByType(RealMonthPane as never)[0];
}

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    );
}

/** The Pressable whose label is `label` (direct a11y label — cells, nav
 *  buttons). */
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

/** The Pressable behind a Button whose visible text is `label` (the
 *  HolidaysScreen walk — Button renders its children as a Text). */
function findTextButton(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const candidates = renderer.root.findAllByType(Text).filter(t => {
    const content = Array.isArray(t.props.children)
      ? t.props.children.join('')
      : String(t.props.children ?? '');
    return content === label;
  });
  for (const text of candidates) {
    let cur: ReactTestRenderer.ReactTestInstance | null = text.parent;
    while (cur) {
      if (typeof cur.props.onPress === 'function') return cur;
      cur = cur.parent;
    }
  }
  throw new Error(`No Button Pressable labelled "${label}"`);
}

/** The calendar cell for a workDate (the cell label starts with the
 *  dayMonthLabel — "14 September"). */
function findCell(
  renderer: ReactTestRenderer.ReactTestRenderer,
  workDate: string,
) {
  const prefix = dayMonthLabel(workDate);
  const matches = renderer.root.findAll(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith(`${prefix},`) &&
      typeof node.props.onPress === 'function',
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

beforeEach(() => {
  jest.resetAllMocks();
  fetchCorrectionsMock.mockResolvedValue({ data: [], nextCursor: null });
});

describe('AttendanceEmployeeMonthScreen — the host (19-5 D6)', () => {
  it('renders the pane with the params identity (header, month, the owner fetch)', async () => {
    fetchOwner.mockResolvedValue(envelope('e1', [row('2026-09-14')]));
    const { renderer } = renderHost({
      employeeId: 'e1',
      employeeName: 'Asha',
      yearMonth: '2026-09',
    });
    expect(fetchOwner).toHaveBeenCalledWith('e1', '2026-09-01', '2026-09-30');
    const shown = texts(renderer);
    expect(shown).toContain('Asha');
    expect(shown).toContain('September 2026');
    // The icons' key rides under the calendar (2026-10 copy review) — the
    // SAME DayStatusLegend the My month screen renders.
    expect(renderer.root.findAllByType(DayStatusLegend as never)).toHaveLength(1);
    expect(shown).toContain('Day status legend');
  });

  it('focusDate auto-opens ONCE when the row exists — visible flips only post-resolution', async () => {
    let resolve!: (v: ReturnType<typeof envelope>) => void;
    fetchOwner.mockReturnValue(
      new Promise<ReturnType<typeof envelope>>(r => {
        resolve = r;
      }),
    );
    const { renderer } = renderHost({
      employeeId: 'e1',
      employeeName: 'Asha',
      yearMonth: '2026-09',
      focusDate: '2026-09-14',
    });

    // Pending: the sheet is closed even though focusDate arrived.
    expect(sheetNode(renderer).props.visible).toBe(false);

    await act(async () => {
      resolve(envelope('e1', [row('2026-09-14'), row('2026-09-15')]));
      await flush();
    });
    expect(sheetNode(renderer).props.visible).toBe(true);
    expect(sheetNode(renderer).props.workDate).toBe('2026-09-14');
    expect(sheetNode(renderer).props.day).toMatchObject({ workDate: '2026-09-14' });

    // Fires ONCE: closing the sheet must not re-open it.
    await act(async () => {
      sheetNode(renderer).props.onClose();
      await flush();
    });
    expect(sheetNode(renderer).props.visible).toBe(false);
  });

  it('does NOT auto-open when the focus row is missing — the manual pick works', async () => {
    fetchOwner.mockResolvedValue(envelope('e1', [row('2026-09-15')]));
    const { renderer } = renderHost({
      employeeId: 'e1',
      employeeName: 'Asha',
      yearMonth: '2026-09',
      focusDate: '2026-09-14',
    });
    await flush();

    // A missing row = flag cleared or day untracked → a silent landing.
    expect(sheetNode(renderer).props.visible).toBe(false);

    // The owner can still pick a day manually — THAT day's sheet opens.
    act(() => {
      findCell(renderer, '2026-09-15').props.onPress();
    });
    expect(sheetNode(renderer).props.visible).toBe(true);
    expect(sheetNode(renderer).props.workDate).toBe('2026-09-15');
  });

  it('a failed first load leaves the focus armed — the Retry success fires it', async () => {
    fetchOwner.mockRejectedValueOnce(new Error('network down'));
    const { renderer } = renderHost({
      employeeId: 'e1',
      employeeName: 'Asha',
      yearMonth: '2026-09',
      focusDate: '2026-09-14',
    });
    await flush();

    // First-load error: no ghost grid (the showGrid gate), no sheet.
    expect(renderer.root.findAllByType(MonthCalendar as never)).toHaveLength(0);
    expect(sheetNode(renderer).props.visible).toBe(false);

    // Retry succeeds → the armed focusDate fires on THAT landing.
    fetchOwner.mockResolvedValueOnce(envelope('e1', [row('2026-09-14')]));
    await act(async () => {
      findTextButton(renderer, 'Retry').props.onPress();
      await flush();
    });
    expect(sheetNode(renderer).props.visible).toBe(true);
    expect(sheetNode(renderer).props.workDate).toBe('2026-09-14');
  });

  it('› is disabled-until-known and disabled AT the current month (nextDisabled)', async () => {
    let resolve!: (v: ReturnType<typeof envelope>) => void;
    fetchOwner.mockReturnValue(
      new Promise<ReturnType<typeof envelope>>(r => {
        resolve = r;
      }),
    );
    const { renderer } = renderHost({
      employeeId: 'e1',
      employeeName: 'Asha',
      yearMonth: '2026-09',
    });

    // today == null → disabled (a future month would be a silent
    // all-not_tracked grid — the day-statuses route does NOT 422 it).
    expect(paneNode(renderer).props.nextDisabled).toBe(true);
    expect(findButton(renderer, 'Next month').props.disabled).toBe(true);
    expect(findButton(renderer, 'Next month').props.accessibilityState).toEqual({
      disabled: true,
    });

    // Landed at the today month (2026-09-29) → still disabled.
    await act(async () => {
      resolve(envelope('e1', [row('2026-09-14')]));
      await flush();
    });
    expect(findButton(renderer, 'Next month').props.disabled).toBe(true);

    // One month earlier → enabled.
    fetchOwner.mockResolvedValue(
      envelope('e1', []),
    );
    await act(async () => {
      findButton(renderer, 'Previous month').props.onPress();
      await flush();
    });
    expect(fetchOwner).toHaveBeenLastCalledWith('e1', '2026-08-01', '2026-08-31');
    expect(paneNode(renderer).props.nextDisabled).toBe(false);
    expect(findButton(renderer, 'Next month').props.disabled).toBe(false);
  });

  it('loading-month taps are suppressed — the switch gates the grid off', async () => {
    fetchOwner.mockResolvedValue(envelope('e1', [row('2026-09-14')]));
    const { renderer } = renderHost({
      employeeId: 'e1',
      employeeName: 'Asha',
      yearMonth: '2026-09',
    });
    await flush();
    expect(renderer.root.findAllByType(MonthCalendar as never)).toHaveLength(1);

    // The switch: the map CLEARS — no grid, so no cell can mint a false
    // "Not tracked" sheet mid-flight (U10).
    let resolveSwitch!: (v: ReturnType<typeof envelope>) => void;
    fetchOwner.mockReturnValue(
      new Promise<ReturnType<typeof envelope>>(r => {
        resolveSwitch = r;
      }),
    );
    await act(async () => {
      findButton(renderer, 'Previous month').props.onPress();
    });
    expect(renderer.root.findAllByType(MonthCalendar as never)).toHaveLength(0);
    expect(sheetNode(renderer).props.visible).toBe(false);

    await act(async () => {
      resolveSwitch(envelope('e1', []));
      await flush();
    });
    expect(renderer.root.findAllByType(MonthCalendar as never)).toHaveLength(1);
  });

  it('onCorrected refreshes the pane (the non-clearing refetch)', async () => {
    fetchOwner.mockResolvedValue(envelope('e1', [row('2026-09-14')]));
    const { renderer } = renderHost({
      employeeId: 'e1',
      employeeName: 'Asha',
      yearMonth: '2026-09',
    });
    await flush();
    const fetchesAfterLoad = fetchOwner.mock.calls.length;

    act(() => {
      findCell(renderer, '2026-09-14').props.onPress();
    });
    await act(async () => {
      sheetNode(renderer).props.onCorrected();
      await flush();
    });
    expect(fetchOwner.mock.calls.length).toBeGreaterThan(fetchesAfterLoad);
    expect(fetchOwner).toHaveBeenLastCalledWith('e1', '2026-09-01', '2026-09-30');
  });

  it('the correction write passes through to correctDay with the picked day', async () => {
    fetchOwner.mockResolvedValue(envelope('e1', [row('2026-09-14')]));
    const { renderer } = renderHost({
      employeeId: 'e1',
      employeeName: 'Asha',
      yearMonth: '2026-09',
    });
    await flush();
    act(() => {
      findCell(renderer, '2026-09-14').props.onPress();
    });
    const body: CorrectionWriteBody = {
      checkinAt: '2026-09-14T09:30:00+05:30',
      note: 'Checkout was forgotten — corrected.',
    };
    correctDayMock.mockResolvedValue({});
    await act(async () => {
      await sheetNode(renderer).props.onCorrect(body);
    });
    expect(correctDayMock).toHaveBeenCalledWith('e1', '2026-09-14', body);
  });
});

describe('AttendanceEmployeeMonthScreen — the params pair normalization (D6)', () => {
  it('a focusDate outside yearMonth is dev-warned and treated as absent', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // The wire answer CARRIES an August-keyed row — the mismatched
    // focusDate must still NOT auto-open (it is treated as absent, not
    // merely missing).
    fetchOwner.mockResolvedValue(
      envelope('e1', [row('2026-08-14')]),
    );
    const { renderer } = renderHost({
      employeeId: 'e1',
      employeeName: 'Asha',
      yearMonth: '2026-09',
      focusDate: '2026-08-14',
    });
    await flush();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('focusDate 2026-08-14'),
    );
    expect(sheetNode(renderer).props.visible).toBe(false);
    warnSpy.mockRestore();
  });

  it('a well-formed focusDate inside the month does NOT warn', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fetchOwner.mockResolvedValue(envelope('e1', [row('2026-09-14')]));
    renderHost({
      employeeId: 'e1',
      employeeName: 'Asha',
      yearMonth: '2026-09',
      focusDate: '2026-09-14',
    });
    await flush();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
