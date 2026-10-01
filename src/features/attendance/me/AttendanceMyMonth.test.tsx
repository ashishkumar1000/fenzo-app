/**
 * Tests for AttendanceMyMonth (Story 19-6, spec §5.3): the me-scoped pane
 * embed (the employeeId ABSENCE pinned); the so-far line ONLY on the
 * canonical current month AND loaded (formatCredit decimal, ABOVE the
 * chips); the shared chips + counts-only meta line (omitted when all
 * zero); the ACTIVE-only holidays block (comma a11y labels; omitted on
 * []); the read-only sheet wiring; the › bounds in BOTH postures; the
 * 19-5 bootstrap idiom (history_only opens the ended month; the
 * correction is a parameter load; ‹/› is the only stand-down); and the
 * grouped a11y label (the worked chip omitted FROM the current month's
 * label). The component is REAL — the service seams are mocked, the
 * house pane-test idiom.
 */
jest.mock('../../../services/resources/attendanceDayStatus', () => ({
  ...jest.requireActual('../../../services/resources/attendanceDayStatus'),
  fetchMyDayStatuses: jest.fn(),
}));

jest.mock('../../../services', () => ({
  ...jest.requireActual('../../../services'),
  fetchMyMonthly: jest.fn(),
}));

// The hook's focus refresh needs a navigator; this suite drives the
// parameter/echo paths directly, so focus is a recorded no-op.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AppState, Text } from 'react-native';
import {
  fetchMyDayStatuses,
  monthRange,
} from '../../../services/resources/attendanceDayStatus';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import { fetchMyMonthly } from '../../../services';
import type { MeMonthlyData } from '../../../services';
import { AttendanceMyMonth } from './AttendanceMyMonth';
import { RealMonthPane } from '../calendar/RealMonthPane';
import { DayDetailSheet } from '../calendar/DayDetailSheet';
import { dayMonthLabel } from '../calendar/dayDetailModel';
import { shiftYearMonth } from '../monthly/monthlyModel';

const fetchPane = fetchMyDayStatuses as jest.Mock;
const fetchMe = fetchMyMonthly as jest.Mock;

/** The device month — the component's declared navigation seed (the only
 *  place the device clock is allowed; tests derive expectations from it). */
const SEED = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
})();

function row(workDate: string): DayStatusRow {
  return {
    workDate,
    status: 'present',
    lateMinutes: null,
    isLate: false,
    earlyCheckoutMinutes: null,
    earlyCheckout: false,
    workedMinutes: 480,
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

function paneEnvelope(days: DayStatusRow[], today: string) {
  return { from: '2026-01-01', to: '2026-01-31', today, days };
}

function meData(overrides: Partial<MeMonthlyData> = {}): MeMonthlyData {
  return {
    from: '2026-01-01',
    to: '2026-01-31',
    today: '2026-01-15',
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
    upcomingHolidays: [
      { holidayDate: '2026-10-02', holidayName: 'Gandhi Jayanti' },
    ],
    ...overrides,
  };
}

/** The pane echo's tenant today INSIDE the seed month (no correction). */
const TODAY_IN_SEED = `${SEED}-15`;

const renderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderSection(props: {
  attendanceEndedOn?: string | null;
  historyOnly?: boolean;
}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AttendanceMyMonth
        attendanceEndedOn={props.attendanceEndedOn ?? null}
        historyOnly={props.historyOnly ?? false}
      />,
    );
  });
  renderers.push(renderer);
  return renderer;
}

/** The dynamic variant for the prop-driven paths (the check-in bridge, the
 *  R9 date-arrival re-correction): same defaults, plus a setProps channel. */
function renderSectionDynamic(props: {
  attendanceEndedOn?: string | null;
  historyOnly?: boolean;
  todaySignal?: string | null;
}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const element = (endedOn: string | null, signal: string | null) => (
    <AttendanceMyMonth
      attendanceEndedOn={endedOn}
      historyOnly={props.historyOnly ?? false}
      todaySignal={signal}
    />
  );
  act(() => {
    renderer = create(element(props.attendanceEndedOn ?? null, props.todaySignal ?? null));
  });
  renderers.push(renderer);
  return {
    renderer,
    setProps(next: { attendanceEndedOn?: string | null; todaySignal?: string | null }) {
      // EXPLICIT-KEY semantics: an explicit null must stay null (the ?? chain
      // would silently re-deliver the mount prop and fake a signal change).
      act(() => {
        renderer.update(
          element(
            'attendanceEndedOn' in next ? (next.attendanceEndedOn ?? null) : (props.attendanceEndedOn ?? null),
            'todaySignal' in next ? (next.todaySignal ?? null) : (props.todaySignal ?? null),
          ),
        );
      });
    },
  };
}

async function flush(times = 6) {
  await act(async () => {
    for (let i = 0; i < times; i++) await Promise.resolve();
  });
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

function findButton(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  const matches = renderer.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

function paneNode(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(RealMonthPane as never)[0];
}

function sheetNode(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(DayDetailSheet as never)[0];
}

function findCell(renderer: ReactTestRenderer.ReactTestRenderer, workDate: string) {
  const matches = renderer.root.findAll(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith(`${dayMonthLabel(workDate)},`) &&
      typeof node.props.onPress === 'function',
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

/** The grouped a11y element (the ONE summary label container). RTR mirrors
 *  the composite View through its host node, so match on the LABEL and take
 *  the first — the count is not the contract, the string is. */
function summaryGroup(renderer: ReactTestRenderer.ReactTestRenderer) {
  const matches = renderer.root.findAll(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityElementsHidden === true,
  );
  expect(matches.length).toBeGreaterThanOrEqual(1);
  return matches[0];
}

let appStateListener: ((state: string) => void) | null = null;

beforeEach(() => {
  jest.resetAllMocks();
  // Sane defaults so an unexpected settle never crashes the hook's .then
  // chain; individual tests override with mockResolvedValueOnce/… as needed.
  fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
  fetchMe.mockResolvedValue(meData());
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

describe('the section shell + sheet wiring (D5)', () => {
  it('renders SectionHead "My month", the me-scoped pane (NO employeeId) and the read-only sheet', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const renderer = renderSection({});
    await flush();

    expect(texts(renderer)).toContain('My month');
    const pane = paneNode(renderer);
    expect(pane.props.employeeId).toBeUndefined();
    const sheet = sheetNode(renderer);
    expect(sheet.props.scope).toEqual({ kind: 'me' });
    expect(sheet.props.readOnly).toBe(true);
    expect(sheet.props.onCorrect).toBeUndefined();
    expect(sheet.props.onCorrected).toBeUndefined();
  });

  it('a day tap opens the sheet with the pane report row; a loading month offers NO cells to pick', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([row(`${SEED}-14`)], TODAY_IN_SEED));
    const renderer = renderSection({});
    await flush();

    act(() => {
      findCell(renderer, `${SEED}-14`).props.onPress();
    });
    expect(sheetNode(renderer).props.visible).toBe(true);
    expect(sheetNode(renderer).props.day).toMatchObject({ workDate: `${SEED}-14` });
    act(() => {
      sheetNode(renderer).props.onClose();
    });
    expect(sheetNode(renderer).props.visible).toBe(false);

    // The switch: the map clears → the grid gates off → no cell exists, so
    // no false "Not tracked" sheet can be minted mid-flight (the pane gate
    // the host rides; the onPickDay guard is the belt-and-braces half).
    fetchPane.mockReturnValue(new Promise(() => undefined));
    act(() => {
      findButton(renderer, 'Previous month').props.onPress();
    });
    const cells = renderer.root.findAll(
      node =>
        typeof node.props.accessibilityLabel === 'string' &&
        typeof node.props.onPress === 'function' &&
        node.props.accessibilityLabel.includes(dayMonthLabel(`${SEED}-14`)),
    );
    expect(cells).toHaveLength(0);
    expect(sheetNode(renderer).props.visible).toBe(false);
  });
});

describe('the summary block (D5/D9)', () => {
  it('the so-far line renders ONLY on the canonical current month AND loaded, ABOVE the chips, with the formatCredit decimal', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const renderer = renderSection({});
    await flush();

    const all = texts(renderer);
    expect(all).toContain('Days worked: 14.5 so far');
    const soFar = all.indexOf('Days worked: 14.5 so far');
    const workedChip = all.indexOf('14.5 worked');
    expect(soFar).toBeGreaterThan(-1);
    expect(workedChip).toBeGreaterThan(soFar); // ABOVE the chips

    // ‹ to a past month: no so-far line (never a stale number).
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    await act(async () => {
      findButton(renderer, 'Previous month').props.onPress();
    });
    await flush();
    expect(texts(renderer)).not.toContain('Days worked: 14.5 so far');
  });

  it('no so-far line while the summary is in flight (the block shimmers, the pane no longer covers first paint)', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockReturnValue(new Promise(() => undefined));
    const renderer = renderSection({});
    await flush();

    // The summary block carries its OWN labelled shimmer while in flight
    // (the pane's shimmer covers the grid, never these rows).
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBeGreaterThan(0);
    // No grouped a11y element exists while loading (D9: loading = no element).
    const groups = renderer.root.findAll(
      node =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityElementsHidden === true,
    );
    expect(groups).toHaveLength(0);
    expect(texts(renderer)).not.toContain('Days worked: 14.5 so far');
  });

  it('the chips keep the worked anchor first; the meta line is counts-only and omitted when all zero', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const renderer = renderSection({});
    await flush();

    const all = texts(renderer);
    expect(all.indexOf('14.5 worked')).toBeGreaterThan(-1);
    expect(all).toContain('2 half days');
    expect(all).toContain('1 late');
    expect(all).toContain('1 leave');
    expect(all).toContain('1 absent');
    expect(all).toContain('2 missing checkouts');
    expect(all).toContain('3 weekly offs · 1 holiday'); // workedOnHoliday 0 suppressed
  });

  it('an all-zero meta renders no meta line (the empty-omit precedent)', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(
      meData({
        summary: {
          daysWorked: 0,
          halfDays: 0,
          lateCount: 0,
          leave: 0,
          weeklyOffs: 0,
          holidays: 0,
          workedOnHoliday: 0,
          absent: 0,
          checkoutMissing: 0,
        },
      }),
    );
    const renderer = renderSection({});
    await flush();

    const all = texts(renderer);
    expect(all).not.toContain('0 weekly offs');
    expect(all).not.toContain('0 holidays');
  });

  it('the grouped a11y label: current month carries the so-far sentence and OMITS the worked chip from the label (exact string)', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const renderer = renderSection({});
    await flush();

    const group = summaryGroup(renderer);
    expect(group.props.accessibilityLabel).toBe(
      'Days worked: 14.5 so far, 2 half days, 1 late, 1 leave, 1 absent, '
        + '2 missing checkouts, 3 weekly offs, 1 holiday',
    );
  });

  it('the grouped a11y label on a PAST month: chips (worked anchor first) + meta, commas', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const renderer = renderSection({});
    await flush();

    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    await act(async () => {
      findButton(renderer, 'Previous month').props.onPress();
    });
    await flush();

    expect(summaryGroup(renderer).props.accessibilityLabel).toBe(
      '14.5 worked, 2 half days, 1 late, 1 leave, 1 absent, '
        + '2 missing checkouts, 3 weekly offs, 1 holiday',
    );
  });

  it('a summary failure renders the fixed copy + the labelled Retry (refires the SAME clamped window)', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockRejectedValueOnce(new Error('monthly: boom'));
    const renderer = renderSection({});
    await flush();

    expect(texts(renderer)).toContain(
      "Couldn't load your month summary. Check your connection and try again.",
    );
    const retry = findButton(renderer, 'Retry month summary');
    expect(texts(renderer)).toContain('Retry');

    fetchMe.mockResolvedValueOnce(meData());
    await act(async () => {
      retry.props.onPress();
    });
    await flush();
    expect(fetchMe).toHaveBeenLastCalledWith(`${SEED}-01`, TODAY_IN_SEED);
  });
});

describe('the holidays block (D5 — ACTIVE only)', () => {
  it('active: Eyebrow + «name · d MMM» rows with comma a11y labels', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const renderer = renderSection({});
    await flush();

    const all = texts(renderer);
    expect(all).toContain('Upcoming holidays');
    expect(all).toContain('Gandhi Jayanti · 2 Oct');
    const labelled = renderer.root.findAll(
      node => node.props.accessibilityLabel === 'Gandhi Jayanti, 2 Oct',
    );
    expect(labelled.length).toBeGreaterThan(0);
  });

  it('[] omits the block entirely (honest absence)', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData({ upcomingHolidays: [] }));
    const renderer = renderSection({});
    await flush();

    expect(texts(renderer)).not.toContain('Upcoming holidays');
  });

  it('history_only HIDES the block (the posture grammar is subtraction)', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const renderer = renderSection({ historyOnly: true });
    await flush();

    expect(texts(renderer)).not.toContain('Upcoming holidays');
    expect(texts(renderer)).not.toContain('Gandhi Jayanti · 2 Oct');
  });
});

describe('the › bound (D5 — both postures)', () => {
  it('active: disabled-until-known and disabled AT the current month', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    const renderer = renderSection({});

    expect(paneNode(renderer).props.nextDisabled).toBe(true); // echo not landed
    expect(findButton(renderer, 'Next month').props.disabled).toBe(true);

    await flush();
    expect(paneNode(renderer).props.nextDisabled).toBe(true); // AT the today month

    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    await act(async () => {
      findButton(renderer, 'Previous month').props.onPress();
    });
    await flush();
    expect(paneNode(renderer).props.nextDisabled).toBe(false);
    expect(findButton(renderer, 'Next month').props.disabled).toBe(false);
  });

  it('history_only: bound at the ended month (the wire date); null date falls back to canonical today', async () => {
    const endedMonth = shiftYearMonth(SEED, -2);
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const renderer = renderSection({
      attendanceEndedOn: `${endedMonth}-28`,
      historyOnly: true,
    });
    await flush();

    // The bootstrap opened the ended month — forward travel stops there.
    expect(paneNode(renderer).props.nextDisabled).toBe(true);

    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    await act(async () => {
      findButton(renderer, 'Previous month').props.onPress();
    });
    await flush();
    expect(paneNode(renderer).props.nextDisabled).toBe(false);

    // Null date: the today month is the fallback bound.
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const nullDate = renderSection({ attendanceEndedOn: null, historyOnly: true });
    await flush();
    expect(paneNode(nullDate).props.nextDisabled).toBe(true);
  });
});

describe('the bootstrap (D5 — the 19-5 idiom)', () => {
  it('history_only seeds the device month, then the echo corrects ONCE to the ended month as a PARAMETER load', async () => {
    const endedMonth = shiftYearMonth(SEED, -2);
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData({ from: `${endedMonth}-01`, to: `${endedMonth}-31` }));
    const renderer = renderSection({
      attendanceEndedOn: `${endedMonth}-28`,
      historyOnly: true,
    });

    // First (seeded) fetch is the DEVICE month.
    expect(fetchPane).toHaveBeenCalledWith(`${SEED}-01`, monthRangeLastDay(SEED));

    await flush();

    // The correction re-fetched the ENDED month under its changed label.
    expect(fetchPane).toHaveBeenLastCalledWith(
      `${endedMonth}-01`,
      monthRangeLastDay(endedMonth),
    );
    expect(texts(renderer)).toContain(monthTitleOf(endedMonth));
    // The follow-up summary fetch rides the corrected month too (clamped
    // by the echo — the ended month is fully in the past, so its own last
    // day is the `to`).
    expect(fetchMe).toHaveBeenLastCalledWith(
      `${endedMonth}-01`,
      monthRangeLastDay(endedMonth),
    );
  });

  it('R9 seed-window burn: a correction that fired on a NULL date re-opens when the wire date arrives (un-navigated)', async () => {
    const endedMonth = shiftYearMonth(SEED, -2);
    // The fresh-login sequence: the seed posture is history_only but the
    // date has not landed (the mirror carries no date), and the pane's echo
    // is IN the seed month — so the one-shot "corrects" nowhere (burned on
    // today's month, the device seed).
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const ctx = renderSectionDynamic({ attendanceEndedOn: null, historyOnly: true });
    await flush();
    expect(fetchPane).toHaveBeenLastCalledWith(`${SEED}-01`, monthRangeLastDay(SEED));

    // The wire date lands (me/access answered) while the employee has not
    // navigated: the shot re-opens and the section corrects to the ENDED
    // month as a parameter load — the pane refetches under the new label.
    ctx.setProps({ attendanceEndedOn: `${endedMonth}-28` });
    await flush();
    expect(fetchPane).toHaveBeenLastCalledWith(
      `${endedMonth}-01`,
      monthRangeLastDay(endedMonth),
    );
    expect(texts(ctx.renderer)).toContain(monthTitleOf(endedMonth));
  });

  it('R9 guard: a navigated employee stands the re-correction down (the date lands late, the user chose a month)', async () => {
    const endedMonth = shiftYearMonth(SEED, -2);
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const ctx = renderSectionDynamic({ attendanceEndedOn: null, historyOnly: true });
    await flush();

    // The user pages ‹ before the date lands.
    await act(async () => {
      findButton(ctx.renderer, 'Previous month').props.onPress();
    });
    await flush();
    const navigatedMonth = shiftYearMonth(SEED, -1);
    expect(fetchPane).toHaveBeenLastCalledWith(
      `${navigatedMonth}-01`,
      monthRangeLastDay(navigatedMonth),
    );

    // The date's arrival must NOT yank the month to the ended month.
    ctx.setProps({ attendanceEndedOn: `${endedMonth}-28` });
    await flush();
    expect(fetchPane).toHaveBeenLastCalledWith(
      `${navigatedMonth}-01`,
      monthRangeLastDay(navigatedMonth),
    );
    expect(texts(ctx.renderer)).toContain(monthTitleOf(navigatedMonth));
  });

  it('active: an off-month echo corrects to the today month once', async () => {
    const nextMonth = shiftYearMonth(SEED, 1);
    fetchPane.mockResolvedValue(paneEnvelope([], `${nextMonth}-05`));
    fetchMe.mockResolvedValue(meData({ from: `${nextMonth}-01`, to: `${nextMonth}-05` }));
    const renderer = renderSection({});

    await flush();

    // The pane fetches the month's PLAIN range (only the summary hook
    // clamps — the echo gate lives there).
    expect(fetchPane).toHaveBeenLastCalledWith(
      `${nextMonth}-01`,
      monthRangeLastDay(nextMonth),
    );
    expect(texts(renderer)).toContain(monthTitleOf(nextMonth));
    expect(fetchMe).toHaveBeenLastCalledWith(`${nextMonth}-01`, `${nextMonth}-05`);
  });

  it('"navigated" is ‹/› ONLY: a ‹ press before the echo stands the correction down', async () => {
    const endedMonth = shiftYearMonth(SEED, -2);
    fetchPane.mockReturnValue(new Promise(() => undefined));
    const renderer = renderSection({
      attendanceEndedOn: `${endedMonth}-28`,
      historyOnly: true,
    });

    // The user pages before any echo landed — their choice wins.
    fetchPane.mockResolvedValue(paneEnvelope([], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    await act(async () => {
      findButton(renderer, 'Previous month').props.onPress();
    });
    await flush();

    expect(fetchPane).toHaveBeenLastCalledWith(
      `${shiftYearMonth(SEED, -1)}-01`,
      monthRangeLastDay(shiftYearMonth(SEED, -1)),
    );
    // No snap back to the ended month after the echo lands.
    expect(fetchPane.mock.calls).toHaveLength(2);
  });

  it('a FAILED correction follow-up does NOT snap the month back — the label stays at the target and Retry recovers', async () => {
    // The captured AppState listeners (the pane AND the hook register one
    // each) — fired directly, the jest-preset idiom.
    const listeners: Array<(state: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      listener: never,
    ) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    }) as never);
    try {
      const nextMonth = shiftYearMonth(SEED, 1);
      fetchPane
        .mockResolvedValue(paneEnvelope([], `${nextMonth}-05`));
      // The pre-correction summary AND the correction follow-up FAIL.
      fetchMe
        .mockRejectedValueOnce(new Error('monthly: boom'))
        .mockRejectedValueOnce(new Error('monthly: boom'))
        .mockResolvedValue(meData());
      const renderer = renderSection({});
      await flush();

      // The correction APPLIED (parameter load to next month — the pane
      // refetched under the changed label) and the failed follow-up did
      // NOT revert it: the 19-5 re-arm ruling re-arms the one shot instead
      // of burning it, and the month stays at the echo's target.
      expect(fetchPane).toHaveBeenLastCalledWith(
        `${nextMonth}-01`,
        monthRangeLastDay(nextMonth),
      );
      expect(texts(renderer)).toContain(monthTitleOf(nextMonth));

      // A foregrounding refresh (silent, in place) SUCCEEDS — and a healthy
      // silent refresh now clears the standing failure banner and restores
      // the summary IN PLACE (review 2026-09-30): no Retry press is needed.
      // (The first-load Retry path is pinned in the summary-failure test.)
      await act(async () => {
        listeners.forEach(fire => fire('active'));
      });
      await flush();
      expect(fetchMe).toHaveBeenLastCalledWith(`${nextMonth}-01`, `${nextMonth}-05`);
      expect(texts(renderer)).toContain(monthTitleOf(nextMonth));
      expect(texts(renderer)).toContain('Days worked: 14.5 so far');
      expect(
        renderer.root.findAll(
          node =>
            node.props.accessibilityLabel === 'Retry month summary' &&
            typeof node.props.onPress === 'function',
        ),
      ).toHaveLength(0);
    } finally {
      (AppState.addEventListener as jest.Mock).mockRestore();
    }
  });
});

describe('the data-aware error postures + the check-in bridge (review 2026-09-30)', () => {
  const HARD_COPY =
    "Couldn't load your month summary. Check your connection and try again.";
  const STALE_NOTE =
    "Couldn't refresh just now — these numbers may be out of date.";

  it('a failed SILENT refresh over live chips renders the stale note — the summary stands, no Retry', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([row('2026-01-05')], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const ctx = renderSectionDynamic({});
    await flush();
    expect(fetchMe.mock.calls.length).toBe(1);

    // The AppState-active silent refresh fails; the loaded summary stands.
    // Fire AND settle inside one act — the pane's listener resolves on
    // microtasks, and its onData must never land outside act.
    fetchMe.mockRejectedValue(new Error('monthly: boom'));
    await act(async () => {
      appStateListener?.('active');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    await flush();

    const all = texts(ctx.renderer);
    expect(all).toContain(STALE_NOTE);
    expect(all).not.toContain(HARD_COPY);
    // The chips are still on screen (the worked anchor proves the group).
    expect(all.some(t => t.includes('worked'))).toBe(true);
    expect(
      ctx.renderer.root.findAll(
        node =>
          node.props.accessibilityLabel === 'Retry month summary' &&
          typeof node.props.onPress === 'function',
      ),
    ).toHaveLength(0);
  });

  it('a healthy silent refresh clears a standing first-load error — the banner never outlives the data', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([row('2026-01-05')], TODAY_IN_SEED));
    fetchMe.mockRejectedValueOnce(new Error('monthly: boom'));
    const ctx = renderSectionDynamic({});
    await flush();
    expect(texts(ctx.renderer)).toContain(HARD_COPY);

    fetchMe.mockResolvedValue(meData());
    await act(async () => {
      appStateListener?.('active');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    await flush();
    expect(texts(ctx.renderer)).not.toContain(HARD_COPY);
    expect(texts(ctx.renderer)).not.toContain(STALE_NOTE);
    // And the summary block is finally up (the so-far sentence for the
    // canonical current month — 2026-01-15 is inside the echo month).
    expect(texts(ctx.renderer)).toContain('Days worked: 14.5 so far');
  });

  it('the check-in bridge: a signal CHANGE fires the pane refresh; the first landing, a repeat and null stay inert', async () => {
    fetchPane.mockResolvedValue(paneEnvelope([row('2026-01-05')], TODAY_IN_SEED));
    fetchMe.mockResolvedValue(meData());
    const ctx = renderSectionDynamic({ todaySignal: `${TODAY_IN_SEED}|` });
    await flush();
    const afterMount = fetchPane.mock.calls.length;
    expect(afterMount).toBeGreaterThanOrEqual(1);

    // A genuine change (check-in landed) → the pane's non-clearing refresh.
    ctx.setProps({ todaySignal: `${TODAY_IN_SEED}|2026-01-15T08:55:00+05:30|` });
    await flush();
    expect(fetchPane.mock.calls.length).toBe(afterMount + 1);

    // The SAME fingerprint again → no refresh.
    ctx.setProps({ todaySignal: `${TODAY_IN_SEED}|2026-01-15T08:55:00+05:30|` });
    await flush();
    expect(fetchPane.mock.calls.length).toBe(afterMount + 1);

    // Null (summary unloaded) is inert; null → value is a fresh ARM, not a
    // change, so it never spends a GET either.
    ctx.setProps({ todaySignal: null });
    await flush();
    await flush();
    expect(fetchPane.mock.calls.length).toBe(afterMount + 1);
    ctx.setProps({ todaySignal: `${TODAY_IN_SEED}|2026-01-15T09:05:00+05:30|` });
    await flush();
    expect(fetchPane.mock.calls.length).toBe(afterMount + 1);
  });
});

/** The seed month's last day (string surgery, never the device zone). */
function monthRangeLastDay(yearMonth: string): string {
  return monthRange(yearMonth).to;
}

/** monthTitle via the shared model (kept out of the render assertions). */
function monthTitleOf(yearMonth: string): string {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[Number(yearMonth.slice(5, 7)) - 1]} ${yearMonth.slice(0, 4)}`;
}
