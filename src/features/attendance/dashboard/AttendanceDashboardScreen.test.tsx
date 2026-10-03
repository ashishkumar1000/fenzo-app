/**
 * Tests for the FR-24 owner dashboard SCREEN (Story 19-4, spec §5.4, as
 * built per spec §9). The screen is a read-only renderer over ONE
 * dashboard envelope; the requirements these pin:
 *
 *  - ONE fetch per appearance: the first focus IS the initial load (the
 *    useFocusEffect contract — capturing the effect and firing it is how
 *    the tests simulate the navigator); no mount fetch ever runs.
 *  - first render shows the static chrome (header + WorkspaceSelector)
 *    with the Skeleton in the content region — THEN the tiles.
 *  - the tiles render the SIX counts + the present-share card, and they
 *    are NON-interactive (no Pressable in a tile's subtree — an
 *    un-wired tap affordance is a future trap).
 *  - strips: absent at count 0; shown and TAPPABLE at count > 0 → the
 *    one FlagListSheet opens with that kind's rows; dismissal clears it.
 *  - tracked 0 → the EmptyState replaces the grid, while strips still
 *    render (past-day truth outlives today's roster).
 *  - office filter: the selector opens the sheet with the ENVELOPE's
 *    stats (no second office source when the BE carries `offices`);
 *    Apply commits → refetch WITH the encoded officeId; Reset commits
 *    null → refetch bare; a dismissal (X/drag/back) changes nothing.
 *  - refetch failure keeps the last-good render and surfaces the
 *    InlineError + Retry composition; Retry refetches.
 *  - the sites pill shows the envelope's office count, and hides rather
 *    than renders a made-up number when the source fails.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../services', () => ({
  fetchDashboard: jest.fn(),
  officesService: {
    list: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { ActivityIndicator, AppState, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchDashboard, officesService } from '../../../services';
import type { AttendanceDashboardData } from '../../../services';
import AttendanceDashboardScreen from './AttendanceDashboardScreen';
import { FlagListSheet } from './FlagListSheet';
import { OfficeFilterSheet } from './OfficeFilterSheet';
import { LoadErrorRetry } from './LoadErrorRetry';
import { DashboardHeader } from './DashboardHeader';
import { flagRowDetail } from './dashboardModel';
import { LOAD_ERROR_COPY } from './LoadErrorRetry';
import { Skeleton } from '../../../components/ui';

const fetchMock = fetchDashboard as jest.Mock;
const officesListMock = officesService.list as jest.Mock;

/** A fully valid envelope — stats included (the deployed-BE shape). */
function envelope(overrides: Record<string, unknown> = {}): AttendanceDashboardData {
  return {
    date: '2026-09-30',
    // The four buckets PARTITION tracked (2 + 2 + 1 + 0 = 5; shortDay
    // parked at 0 here, exercised with a 1 in the counts test) —
    // 20-2's fail-closed shape, never a five-key envelope again.
    counts: { tracked: 5, checkedIn: 2, notCheckedIn: 2, late: 1, onLeave: 1, shortDay: 0 },
    flags: { checkoutMissing: [], fakeLocationAttempt: [] },
    offices: [
      { id: 'o1', name: 'Hero wala', tracked: 3, checkedIn: 2 },
      { id: 'o2', name: 'Yuka', tracked: 2, checkedIn: 1 },
      { id: 'o3', name: 'Andheri', tracked: 0, checkedIn: 0 },
    ],
    ...overrides,
  } as unknown as AttendanceDashboardData;
}

function flagRow(overrides: Record<string, unknown> = {}) {
  return {
    employeeId: 'e1',
    employeeName: 'Arya',
    workDate: '2026-09-14',
    officeName: 'Hero wala',
    ...overrides,
  };
}

const EMPTY_COUNTS = { tracked: 0, checkedIn: 0, notCheckedIn: 0, late: 0, onLeave: 0, shortDay: 0 };

/** The tile pairing ("Tracked: 5") is an a11y LABEL on the tile's View —
 *  the value and word render as separate Texts. Any node carrying the
 *  label means the pairing exists (the composite mirrors carry it too). */
function hasA11yLabel(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
  present: boolean,
) {
  const count = renderer.root.findAll(
    node => node.props.accessibilityLabel === label,
  ).length;
  if (present) {
    expect(count).toBeGreaterThan(0);
  } else {
    expect(count).toBe(0);
  }
}

let consumedFocusCalls = 0;

/** Fire the focus effect(s) registered since the last fire — the real
 *  navigator runs the effect on mount focus AND on every refocus; jest's
 *  jest.fn records the callbacks and the test replays them. */
async function fireFocus() {
  const calls = (useFocusEffect as jest.Mock).mock.calls.slice(consumedFocusCalls);
  consumedFocusCalls = (useFocusEffect as jest.Mock).mock.calls.length;
  expect(calls.length).toBeGreaterThan(0);
  await act(async () => {
    calls.forEach(call => call[0]());
  });
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/**
 * The composite Pressable is mirrored by a host View in the RTR tree, so
 * a label match alone is ambiguous — require the onPress (the house idiom).
 */
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

/** The screen's refetch composition — its onRetry callable(s). */
function retries(renderer: ReactTestRenderer.ReactTestRenderer): Array<() => void> {
  const blocks = renderer.root.findAllByType(LoadErrorRetry as never);
  return blocks.map(block => block.props.onRetry as () => void);
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
      <AttendanceDashboardScreen
        navigation={navigation as never}
        route={{} as never}
      />,
    );
  });
  return { renderer, navigation };
}

describe('AttendanceDashboardScreen — loading postures', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    // The sites-pill fallback list: every test's FIRST load runs it in
    // parallel (data is not yet on screen). Resolve empty by default;
    // individual tests override.
    officesListMock.mockResolvedValue([]);
  });

  it('shows the chrome + Skeleton BEFORE the fetch settles, then the tiles', async () => {
    let resolve!: (v: AttendanceDashboardData) => void;
    fetchMock.mockReturnValue(
      new Promise<AttendanceDashboardData>(r => {
        resolve = r;
      }),
    );
    const { renderer } = renderScreen();
    await fireFocus();

    // In flight: the chrome is up (static), no office card content yet.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(texts(renderer)).toContain('All offices');
    expect(texts(renderer).filter(t => t === 'Hero wala')).toHaveLength(0);

    await act(async () => {
      resolve(envelope());
      await flush();
    });
    const shown = texts(renderer);
    expect(shown).toContain('On attendance');
    expect(shown).toContain('Checked in');
    // The stats arrived with the SAME fetch — never a second round-trip.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fetch on mount — the first focus is the initial load (no double fetch)', async () => {
    fetchMock.mockResolvedValueOnce(envelope());
    renderScreen();
    expect(fetchMock).not.toHaveBeenCalled();
    await fireFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders the six counts + the present share, and the tiles are NOT interactive', async () => {
    // An envelope with a SHORT DAY (partition-consistent: 2 + 1 + 1 + 1 = 5)
    // — the sixth tile renders its pairing from the wire, not empty.
    fetchMock.mockResolvedValueOnce(
      envelope({
        counts: { tracked: 5, checkedIn: 2, notCheckedIn: 1, late: 0, onLeave: 1, shortDay: 1 },
      }),
    );
    const { renderer } = renderScreen();
    await fireFocus();
    const shown = texts(renderer);
    hasA11yLabel(renderer, 'On attendance: 5', true);
    hasA11yLabel(renderer, 'Checked in: 2', true);
    hasA11yLabel(renderer, 'Not checked in: 1', true);
    hasA11yLabel(renderer, 'Short hours: 1', true);
    hasA11yLabel(renderer, 'Late: 0', true);
    hasA11yLabel(renderer, 'On leave: 1', true);
    // The share derives from the counts themselves (2 of 5 → 40%).
    expect(shown).toContain('40% workforce present today');

    // NON-interactive tiles — and the WHOLE press surface is the pinned
    // set, exactly (a subset `arrayContaining` could not fail if tiles or
    // strips became pressable): the two header chips, the filter field and
    // the closed sheets' hidden-but-rendered rows, nothing else. The flag
    // strips are absent here (count 0); in their posture each strip adds
    // exactly its own press (pinned by the flag-strips describe).
    const presses = renderer.root.findAll(
      node =>
        typeof node.props.onPress === 'function' &&
        node.props.accessibilityLabel !== undefined,
    );
    expect(presses.map(n => n.props.accessibilityLabel).sort()).toEqual([
      'All offices',
      'Andheri',
      'Close',
      'Close',
      'Filter by office, currently All offices',
      'Go back',
      'Hero wala',
      'Refresh',
      'Yuka',
    ]);
  });

  it('tracked 0 → the EmptyState replaces the grid (no labels, no share)', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ counts: EMPTY_COUNTS, offices: [] }),
    );
    const { renderer } = renderScreen();
    await fireFocus();
    const shown = texts(renderer);
    expect(shown).toContain('No one is on attendance today');
    expect(shown).toContain("Add employees to attendance to see today's summary here.");
    hasA11yLabel(renderer, 'On attendance: 0', false);
    expect(shown).not.toContain('40% workforce present today');
  });
});

describe('AttendanceDashboardScreen — flag strips', () => {
  const flags = {
    checkoutMissing: [
      { employeeId: 'e1', employeeName: 'Arya', workDate: '2026-09-14', officeName: 'Hero wala' },
      { employeeId: 'e2', employeeName: 'Ben', workDate: '2026-09-15', officeName: null },
    ],
    fakeLocationAttempt: [
      { employeeId: 'e3', employeeName: 'Citra', workDate: '2026-09-16', officeName: 'Yuka', attemptCount: 2 },
    ],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
  });

  it('strips are absent at count 0', async () => {
    fetchMock.mockResolvedValueOnce(envelope());
    const { renderer } = renderScreen();
    await fireFocus();
    expect(texts(renderer)).not.toContain('Check-out missing');
    expect(texts(renderer)).not.toContain('Fake location attempt');
  });

  it('strips render at count > 0 and open the ONE flag list sheet with that kind', async () => {
    fetchMock.mockResolvedValue(envelope({ flags }));
    const { renderer } = renderScreen();
    await fireFocus();
    const shown = texts(renderer);
    expect(shown).toContain('Check-out missing');
    expect(shown).toContain('No check-out recorded for 2 past days.');
    expect(shown).toContain('Fake location attempt');
    expect(shown).toContain('CRITICAL');

    // Tap the checkout-missing strip → the sheet carries that kind.
    act(() => {
      findButton(renderer, 'Check-out missing, 2 days').props.onPress();
    });
    const sheet = renderer.root.findAllByType(FlagListSheet as never)[0];
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.kind).toBe('checkoutMissing');
    expect(sheet.props.rows).toHaveLength(2);
    expect(sheet.props.rows[0].employeeName).toBe('Arya');

    // Dismiss clears it (the screen keeps ONE sheet instance).
    act(() => {
      sheet.props.onClose();
    });
    expect(renderer.root.findAllByType(FlagListSheet as never)[0].props.visible)
      .toBe(false);
  });

  it('the fake-location strip opens the same sheet with its rows + attempt counts', async () => {
    fetchMock.mockResolvedValue(envelope({ flags }));
    const { renderer } = renderScreen();
    await fireFocus();
    act(() => {
      findButton(renderer, 'Fake location attempt, 1 day').props.onPress();
    });
    const sheet = renderer.root.findAllByType(FlagListSheet as never)[0];
    expect(sheet.props.kind).toBe('fakeLocationAttempt');
    expect(sheet.props.rows).toEqual([
      expect.objectContaining({ employeeName: 'Citra', attemptCount: 2 }),
    ]);
  });

  it('a flag-row press closes the sheet AND navigates in the SAME tick (19-5 D7)', async () => {
    fetchMock.mockResolvedValue(envelope({ flags }));
    const { renderer, navigation } = renderScreen();
    await fireFocus();
    act(() => {
      findButton(renderer, 'Check-out missing, 2 days').props.onPress();
    });
    const sheet = renderer.root.findAllByType(FlagListSheet as never)[0];
    expect(sheet.props.visible).toBe(true);

    // The row press: the sheet closes AND the drill-down pushes — same
    // tick (the native TrueSheet must not float over the pushed screen),
    // at the FLAG'S month with the day sheet auto-opened.
    await act(async () => {
      sheet.props.onRowPress({
        employeeId: 'e1',
        employeeName: 'Arya',
        workDate: '2026-09-14',
        officeName: 'Hero wala',
      });
      await flush();
    });
    expect(
      renderer.root.findAllByType(FlagListSheet as never)[0].props.visible,
    ).toBe(false);
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceEmployeeMonth', {
      employeeId: 'e1',
      employeeName: 'Arya',
      yearMonth: '2026-09',
      focusDate: '2026-09-14',
    });
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
  });

  it('the whole press surface with flags present and the sheet OPEN gains exactly the row presses (the 19-5 pin)', async () => {
    fetchMock.mockResolvedValue(envelope({ flags }));
    const { renderer } = renderScreen();
    await fireFocus();
    act(() => {
      findButton(renderer, 'Check-out missing, 2 days').props.onPress();
    });
    // The CLOSED press set (sorted-equal, the same discipline as the
    // tiles pin) plus the two strips and the two sheet rows — nothing
    // else became pressable.
    const presses = renderer.root.findAll(
      node =>
        typeof node.props.onPress === 'function' &&
        node.props.accessibilityLabel !== undefined,
    );
    expect(presses.map(n => n.props.accessibilityLabel).sort()).toEqual([
      'All offices',
      'Andheri',
      `Arya, ${flagRowDetail(flags.checkoutMissing[0])}`,
      'Ben, Tuesday, 15 September 2026',
      'Check-out missing, 2 days',
      'Close',
      'Close',
      'Fake location attempt, 1 day',
      'Filter by office, currently All offices',
      'Go back',
      'Hero wala',
      'Refresh',
      'Yuka',
    ]);
  });

  it('strips still render in the tracked-empty posture (past-day truth outlives the roster)', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ counts: EMPTY_COUNTS, offices: [], flags }),
    );
    const { renderer } = renderScreen();
    await fireFocus();
    expect(texts(renderer)).toContain('No one is on attendance today');
    expect(texts(renderer)).toContain('Check-out missing');
  });
});

describe('AttendanceDashboardScreen — office filter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
  });

  it('the sites pill shows the envelope count while All offices is active', async () => {
    fetchMock.mockResolvedValueOnce(envelope());
    const { renderer } = renderScreen();
    await fireFocus();
    expect(texts(renderer)).toContain('3 offices');
  });

  it('Apply commits the pick → refetch WITH the officeId + the selector shows the name', async () => {
    const first = envelope();
    fetchMock
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(
        envelope({
          counts: { tracked: 3, checkedIn: 2, notCheckedIn: 1, late: 0, onLeave: 0, shortDay: 0 },
        }),
      );
    const { renderer } = renderScreen();
    await fireFocus();

    // Open the sheet — it receives the ENVELOPE's stats (one source).
    act(() => {
      findButton(renderer, 'Filter by office, currently All offices').props.onPress();
    });
    const sheet = renderer.root.findAllByType(OfficeFilterSheet as never)[0];
    expect(sheet.props.stats).toEqual(first.offices);

    // Commit the pick.
    await act(async () => {
      sheet.props.onPick({ id: 'o1', name: 'Hero wala' });
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('o1');
    expect(
      renderer.root.findAllByType(OfficeFilterSheet as never)[0].props.visible,
    ).toBe(false);
    expect(texts(renderer)).toContain('Hero wala');
    // Filtered: the sites pill hides (an all-office aggregate is not the
    // answer to the office's question).
    expect(texts(renderer)).not.toContain('3 offices');
  });

  it('Reset commits null from a filtered state → refetch bare + the pill returns', async () => {
    fetchMock
      .mockResolvedValueOnce(
        envelope({
          counts: { tracked: 3, checkedIn: 2, notCheckedIn: 1, late: 0, onLeave: 0, shortDay: 0 },
        }),
      )
      .mockResolvedValueOnce(envelope())
      .mockResolvedValueOnce(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    // Apply the office filter first (the state Reset must revert FROM).
    act(() => {
      findButton(renderer, 'Filter by office, currently All offices').props.onPress();
    });
    let sheet = renderer.root.findAllByType(OfficeFilterSheet as never)[0];
    await act(async () => {
      sheet.props.onPick({ id: 'o1', name: 'Hero wala' });
      await flush();
    });

    // Open the sheet again — the selector now reads the office.
    act(() => {
      findButton(renderer, 'Filter by office, currently Hero wala').props.onPress();
    });
    sheet = renderer.root.findAllByType(OfficeFilterSheet as never)[0];
    await act(async () => {
      sheet.props.onPick(null);
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBeUndefined();
    expect(texts(renderer)).toContain('3 offices');
  });

  it("Apply's PICK refetch runs under the card shimmer — the previous office's numbers never sit under the picked name (20-2)", async () => {
    let resolvePick!: (v: AttendanceDashboardData) => void;
    fetchMock
      .mockResolvedValueOnce(envelope())
      // HOLD the pick's fetch — the sheet's Apply is what fires it.
      .mockImplementationOnce(
        () =>
          new Promise<AttendanceDashboardData>(res => {
            resolvePick = res;
          }),
      );
    const { renderer } = renderScreen();
    await fireFocus();

    act(() => {
      findButton(renderer, 'Filter by office, currently All offices').props.onPress();
    });
    const sheet = renderer.root.findAllByType(OfficeFilterSheet as never)[0];
    await act(async () => {
      sheet.props.onPick({ id: 'o1', name: 'Hero wala' });
      await flush();
    });

    // The PICKED name is already up (the field updates instantly) while the
    // content region shows the shimmer — the OLD numbers, not the new.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('o1');
    expect(texts(renderer)).toContain('Hero wala');
    hasA11yLabel(renderer, 'On attendance: 5', false);
    const shimmerRows = renderer.root.findAllByType(Skeleton as never).length;
    expect(shimmerRows).toBeGreaterThanOrEqual(1);

    // Settle → the PICKED office's numbers replace the shimmer (the
    // refcount cleared, no lingering shimmer either).
    await act(async () => {
      resolvePick(
        envelope({
          counts: { tracked: 3, checkedIn: 2, notCheckedIn: 1, late: 0, onLeave: 0, shortDay: 0 },
        }),
      );
      await flush();
    });
    hasA11yLabel(renderer, 'On attendance: 3', true);
    hasA11yLabel(renderer, 'On attendance: 5', false);
    expect(
      renderer.root.findAllByType(OfficeFilterSheet as never)[0].props.visible,
    ).toBe(false);
  });

  it('a DISMISSED sheet (X/drag/back) commits nothing and refetches nothing', async () => {
    fetchMock.mockResolvedValueOnce(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    act(() => {
      findButton(renderer, 'Filter by office, currently All offices').props.onPress();
    });
    const sheet = renderer.root.findAllByType(OfficeFilterSheet as never)[0];
    act(() => {
      sheet.props.onClose();
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the sites pill hides rather than invents a count when every source fails', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ offices: null }));
    officesListMock.mockRejectedValueOnce(new Error('network down'));
    const { renderer } = renderScreen();
    await fireFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Unknown count → NO pill (null hides it) — never a '0' masquerading
    // as data.
    expect(
      texts(renderer).some(t => t.includes('Site')),
    ).toBe(false);
  });
});

describe('AttendanceDashboardScreen — refetch discipline', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
  });

  it('keeps the last-good render on a refetch failure + composes the banner below', async () => {
    fetchMock
      .mockResolvedValueOnce(envelope())
      .mockRejectedValueOnce(new Error('network down'));
    const { renderer } = renderScreen();
    await fireFocus();
    // The later focus refetches — last-good data must survive its failure.
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await fireFocus();

    const shown = texts(renderer);
    hasA11yLabel(renderer, 'On attendance: 5', true); // last-good render intact
    expect(shown).toContain(LOAD_ERROR_COPY);
    expect(retries(renderer)).toHaveLength(1);
  });

  it('Retry refetches after a refetch failure', async () => {
    fetchMock
      .mockResolvedValueOnce(envelope())
      .mockRejectedValueOnce(new Error('network down'));
    const { renderer } = renderScreen();
    await fireFocus();
    await fireFocus();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const onRetry = retries(renderer)[0];
    await act(async () => {
      onRetry();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('Refresh press re-shows the card shimmer; a focus refetch does NOT', async () => {
    fetchMock.mockResolvedValueOnce(envelope());
    const { renderer } = renderScreen();
    await fireFocus();
    let resolveRefetch!: (v: AttendanceDashboardData) => void;
    fetchMock.mockReturnValue(
      new Promise<AttendanceDashboardData>(res => {
        resolveRefetch = res;
      }),
    );

    // The manual press: the tile content swaps to the shimmer grid.
    await act(async () => {
      findButton(renderer, 'Refresh').props.onPress();
      await flush();
    });
    // Content replaced by the shimmer (the helper asserts internally).
    hasA11yLabel(renderer, 'On attendance: 5', false);
    const shimmerRows = renderer.root.findAllByType(Skeleton as never).length;
    expect(shimmerRows).toBeGreaterThanOrEqual(1);

    // Settle → the real cards render again.
    await act(async () => {
      resolveRefetch(envelope());
      await flush();
    });
    hasA11yLabel(renderer, 'On attendance: 5', true);

    // A FOCUS refetch is silent — no shimmer flash on refocus.
    fetchMock.mockResolvedValueOnce(envelope());
    await fireFocus();
    hasA11yLabel(renderer, 'On attendance: 5', true); // still the cards, not shimmer
  });

  it('the Refresh control shows the pull on every in-flight fetch (not just first load)', async () => {
    fetchMock.mockResolvedValueOnce(envelope());
    const { renderer } = renderScreen();
    await fireFocus();
    expect(
      renderer.root.findAllByType(DashboardHeader as never)[0].props.refreshing,
    ).toBe(false);

    // A REFETCH in flight (unchanged numbers or not) dims/disables it —
    // AND swaps the icon for a real spinner (the press must visibly work).
    let resolveRefetch!: (v: AttendanceDashboardData) => void;
    fetchMock.mockReturnValue(
      new Promise<AttendanceDashboardData>(res => {
        resolveRefetch = res;
      }),
    );
    await fireFocus();
    const refetchHeader = renderer.root.findAllByType(DashboardHeader as never)[0];
    expect(refetchHeader.props.refreshing).toBe(true);
    expect(
      renderer.root.findAllByType(ActivityIndicator as never).length,
    ).toBe(1);

    // ...and releases it when the fetch settles.
    await act(async () => {
      resolveRefetch(envelope());
      await flush();
    });
    expect(
      renderer.root.findAllByType(DashboardHeader as never)[0].props.refreshing,
    ).toBe(false);
  });

  it('a first-load failure replaces the content region with the composition', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const { renderer } = renderScreen();
    await fireFocus();
    const shown = texts(renderer);
    expect(shown).toContain(LOAD_ERROR_COPY);
    hasA11yLabel(renderer, 'On attendance: 5', false);

    // Retry succeeds → the tiles render.
    fetchMock.mockResolvedValueOnce(envelope());
    await act(async () => {
      retries(renderer)[0]();
      await flush();
    });
    hasA11yLabel(renderer, 'On attendance: 5', true);
    expect(texts(renderer)).not.toContain(LOAD_ERROR_COPY);
  });
});

describe('AttendanceDashboardScreen — AppState-active refetch (19-4)', () => {
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

  it('foregrounding while focused refetches EXACTLY once', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      appStateListener?.('active');
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Still the settled cards afterwards.
    hasA11yLabel(renderer, 'On attendance: 5', true);
  });

  it('ignores foregrounding while NOT focused (deep in the stack)', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer, navigation } = renderScreen();
    await fireFocus();
    (navigation.isFocused as jest.Mock).mockReturnValue(false);
    await act(async () => {
      appStateListener?.('active');
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores NON-active app states (background / inactive transitions)', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();
    await act(async () => {
      appStateListener?.('background');
      appStateListener?.('inactive');
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
