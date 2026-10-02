/**
 * Stage tests for DayDetailSheet (Story 18-3, spec §3 test plan): the
 * "{Weekday}, {d} {Month}" title (no subtitle); the StatusBadge + wrapping
 * flag row; the labelled value rows with the distance rules (gps metres,
 * "At the office" ONLY at 0, manual → no suffix, "(next day)"); the
 * omission rules (no-row day = badge only; a future leave day = no time
 * rows); the corrections disclosure (a11y expanded, actor/old→new/note
 * entries, "Show earlier", count = the loaded page's count); the KEYED
 * history fetch (a resolve for a non-current day or after dismissal is
 * discarded) with per-open reset; the small-spinner loading + InlineError
 * + Retry; announce-on-present; read-only.
 *
 * Story 18-4 stage coverage (spec D1/D2/D4/D5): the "Correct day" entry's
 * D1 truth table (owner + plumbing + row + tracked + workDate ≤ wire
 * today; readOnly suppresses even a correctable day — the proof pane);
 * the morph under the SAME title with the times-line subtitle; the XOR
 * bodies per mode; the WRITE posture (latch = one wire call, dismissible
 * flipped off mid-flight, server copy verbatim / transport copy / offline
 * probe) and the success morph-back + host refresh; the per-open stage
 * reset. RTR gotchas: Buttons driven by type+children, async flushes via
 * `await act(async () => {})`; NetInfo through the root mock's
 * __setNetInfoState seam.
 */
jest.mock('../../../services/resources/attendanceCorrections', () => ({
  ...jest.requireActual('../../../services/resources/attendanceCorrections'),
  fetchCorrections: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, ActivityIndicator, Text } from 'react-native';
import { Button, InlineError, Input, Sheet, TimeField } from '../../../components/ui';
import { fetchCorrections } from '../../../services/resources/attendanceCorrections';
import type { CorrectionEntry } from '../../../services/resources/attendanceCorrections';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import {
  // The root __mocks__ module auto-applies for this package under jest and
  // carries these mock-only helpers; the real package's types do not.
  // @ts-expect-error — mock-only named exports
  __setNetInfoState,
  // @ts-expect-error — mock-only named exports
  __resetNetInfoMock,
} from '@react-native-community/netinfo';
import { DayDetailSheet } from './DayDetailSheet';

const fetchCorrectionsMock = fetchCorrections as jest.Mock;

const offlineState = {
  type: 'none',
  isConnected: false,
  isInternetReachable: false,
  details: null,
} as never;

function row(overrides: Partial<DayStatusRow> = {}): DayStatusRow {
  return {
    workDate: '2026-09-14',
    status: 'present',
    lateMinutes: 22,
    isLate: true,
    earlyCheckoutMinutes: null,
    earlyCheckout: false,
    workedMinutes: 488,
    daysWorked: 1,
    leaveCredit: 0,
    workedOnHolidayCredit: 0,
    isWeeklyOff: false,
    holidayName: null,
    isWorkingDay: true,
    officeId: 'o1',
    officeName: 'Andheri',
    checkinAt: '2026-09-14T10:22:00+05:30',
    checkoutAt: '2026-09-14T18:30:00+05:30',
    checkinSource: 'gps',
    checkoutSource: 'gps',
    checkinDistanceM: 42,
    checkoutDistanceM: 120,
    markers: [],
    ...overrides,
    // 20-1 — leaveRequestId normalizes AFTER the spread (Partial leaks
    // undefined through it); only the leave-day rows carry a UUID.
    leaveRequestId: overrides.leaveRequestId ?? null,

  };
}

function entry(overrides: Partial<CorrectionEntry> = {}): CorrectionEntry {
  return {
    id: 'c1',
    employeeId: 'e1',
    workDate: '2026-09-14',
    correctedAt: '2026-09-15T09:00:00+05:30',
    actorName: 'Ayush',
    note: 'Fixed the check-in time',
    oldValue: { status: 'absent', checkinAt: null, checkoutAt: null },
    newValue: {
      status: null,
      checkinAt: '2026-09-14T10:22:00+05:30',
      checkoutAt: null,
    },
    ...overrides,
  };
}

type Props = Parameters<typeof DayDetailSheet>[0];

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    visible: true,
    workDate: '2026-09-14',
    day: row(),
    // The wire's tenant-local today echo — the D1 gate never reads a clock.
    today: '2026-09-29',
    scope: { kind: 'owner', employeeId: 'e1' },
    onClose: jest.fn(),
    ...overrides,
  };
}

let lastRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

async function renderSheet(props: Partial<Props> = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(<DayDetailSheet {...baseProps(props)} />);
  });
  lastRenderer = renderer;
  return renderer.root;
}

function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map(child => (child == null ? '' : String(child))).join('')
    : String(children ?? '');
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

function findButtonByText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root.findAllByType(Button).find(b => b.props.children === text);
}

/** Presses the pressable ancestor of the FIRST Text carrying exactly
 *  `label` (segment segments and other non-Button presses — a Text's
 *  pressable ancestor is the only reliable walk-up). */
async function pressLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const text = root.find(n => n.type === Text && flatText(n) === label);
  let node = text.parent;
  while (node != null && typeof node.props.onPress !== 'function') {
    node = node.parent;
  }
  if (node == null) throw new Error(`no pressable ancestor for "${label}"`);
  await act(async () => {
    node!.props.onPress();
  });
}

/** Drives the labelled field's onChangeText (the RevokeSheet idiom —
 *  act-wrapped, or the state never flushes into the tree). */
async function typeInto(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
  text: string,
) {
  await act(async () => {
    field(root, label).props.onChangeText(text);
  });
}

function field(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const input = root.findAllByType(Input).find(i => i.props.label === label);
  if (input == null) throw new Error(`no input labelled "${label}"`);
  return input;
}

/** Enters the correct stage (the plumbing must be in the props). */
async function enterCorrectStage(root: ReactTestRenderer.ReactTestInstance) {
  const entry = findButtonByText(root, 'Correct day');
  if (entry == null) throw new Error('the Correct day entry did not render');
  await act(async () => {
    entry.props.onPress();
  });
}

/** The corrected note, typed and saved (times mode keeps the pre-fill). */
async function enterAndSave(
  root: ReactTestRenderer.ReactTestInstance,
  note: string,
) {
  await enterCorrectStage(root);
  await typeInto(root, 'Note (required)', note);
  await act(async () => {
    findButtonByText(root, 'Save correction')!.props.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  __resetNetInfoMock();
  if (lastRenderer) {
    const renderer = lastRenderer;
    lastRenderer = null;
    act(() => renderer.unmount());
  }
});

describe('title, badge and flags', () => {
  it('titles "{Weekday}, {d} {Month}" — 2026-09-14 is the mock\'s "Monday, 14 September"', async () => {
    const root = await renderSheet();
    const sheetHeader = root.findAll(
      n => n.type === Text && n.props.children === 'Monday, 14 September',
    );
    expect(sheetHeader).toHaveLength(1);
  });

  it('no subtitle: the muted times line never duplicates the rows', async () => {
    // The Sheet's subtitle prop would render a second muted header line —
    // the sheet passes none (asserted by the title being the ONLY header
    // text at 22px: pragmatic proxy — no text repeats the row values).
    const root = await renderSheet();
    expect(texts(root).filter(t => t.includes('September'))).toEqual([
      'Monday, 14 September',
    ]);
  });

  it('the StatusBadge renders the label; the late flag tags on a WRAPPING row', async () => {
    const root = await renderSheet();
    expect(texts(root)).toContain('Present');
    expect(texts(root)).toContain('Late · 22m');
  });

  it('a no-row day opens as "Not tracked" — badge only, no rows, no flags', async () => {
    const root = await renderSheet({ day: null });
    expect(texts(root)).toContain('Not tracked');
    expect(texts(root)).not.toContain('Check-in');
    expect(texts(root)).not.toContain('Andheri');
  });
});

describe('the value rows + distance rules', () => {
  it('gps metres: "10:22 AM · 42 m from Andheri" / "6:30 PM · 120 m from Andheri"', async () => {
    const root = await renderSheet();
    expect(texts(root)).toContain('10:22 AM · 42 m from Andheri');
    expect(texts(root)).toContain('6:30 PM · 120 m from Andheri');
  });

  it('"At the office" ONLY at exactly 0 m (never a guessed radius)', async () => {
    const root = await renderSheet({
      day: row({ checkinDistanceM: 0, checkoutDistanceM: 0 }),
    });
    expect(texts(root)).toContain('10:22 AM · At the office');
    expect(texts(root)).toContain('6:30 PM · At the office');
  });

  it('a manual/null distance renders the bare time (no suffix)', async () => {
    const root = await renderSheet({
      day: row({ checkinDistanceM: null, checkoutDistanceM: null }),
    });
    expect(texts(root)).toContain('10:22 AM');
    expect(texts(root).some(t => t.includes('m from'))).toBe(false);
  });

  it('the flag row WRAPS (a flag tag never truncates — Dynamic-type floor)', async () => {
    const root = await renderSheet({
      day: row({ markers: ['corrected'], isLate: true, lateMinutes: 22 }),
    });
    expect(texts(root)).toContain('Late · 22m');
    const wrapping = root.findAll(
      node => (node.props.style as { flexWrap?: string } | undefined)?.flexWrap === 'wrap',
    );
    expect(wrapping.length).toBeGreaterThanOrEqual(1);
  });

  it('a fractional distance renders in WHOLE metres (walkthrough-found: the wire is a double)', async () => {
    const root = await renderSheet({
      day: row({ checkinDistanceM: 1.40956901883579 }),
    });
    expect(texts(root)).toContain('10:22 AM · 1 m from Andheri');
    expect(texts(root).some(t => t.includes('1.40'))).toBe(false);
  });

  it('a checkout carried on the NEXT date appends "(next day)"', async () => {
    const root = await renderSheet({
      day: row({ checkoutAt: '2026-09-15T01:10:00+05:30' }),
    });
    expect(texts(root)).toContain('1:10 AM · 120 m from Andheri (next day)');
  });

  it('an instant carried on an EARLIER date gets no "(next day)" suffix', async () => {
    // direction matters: only a LATER carried date is "next day"
    const root = await renderSheet({
      day: row({ checkoutAt: '2026-09-13T11:00:00+05:30' }),
    });
    expect(texts(root)).toContain('11:00 AM · 120 m from Andheri');
    expect(texts(root).some(t => t.includes('(next day)'))).toBe(false);
  });

  it('worked renders "8 hrs 8 min"; office renders the name; null office omits the row', async () => {
    const root = await renderSheet();
    expect(texts(root)).toContain('8 hrs 8 min');
    expect(texts(root)).toContain('Andheri');

    const withoutOffice = await renderSheet({ day: row({ officeName: null }) });
    // The Office LABEL disappears with the value (the omission rule).
    const officeLabel = texts(withoutOffice).filter(t => t === 'Office');
    expect(officeLabel).toHaveLength(0);
  });

  it('a future leave day: known state only — no time/worked rows', async () => {
    const root = await renderSheet({
      day: row({
        status: 'leave',
        lateMinutes: null,
        isLate: false,
        workedMinutes: null,
        officeId: null,
        officeName: null,
        checkinAt: null,
        checkoutAt: null,
        checkinDistanceM: null,
        checkoutDistanceM: null,
      }),
    });
    expect(texts(root)).toContain('Leave');
    expect(texts(root)).not.toContain('Check-in');
    expect(texts(root)).not.toContain('Check-out');
    expect(texts(root)).not.toContain('Worked');
  });
});

describe('corrections: note, disclosure and the scrollable history', () => {
  it('a corrected day quotes the latest note; history fetch fires with limit 50', async () => {
    fetchCorrectionsMock.mockResolvedValueOnce({
      data: [entry()],
      nextCursor: null,
      hasMore: false,
    });
    const root = await renderSheet({
      day: row({ markers: ['corrected'], latestCorrection: entry() }),
    });

    expect(fetchCorrectionsMock).toHaveBeenCalledWith({
      employeeId: 'e1',
      workDate: '2026-09-14',
      limit: 50,
    });
    expect(texts(root)).toContain('“Fixed the check-in time”');
    // One entry → note only, NO disclosure row.
    expect(texts(root).some(t => t.startsWith('Correction history'))).toBe(false);
  });

  it('>1 entry: the disclosure row-card with the LOADED count; expand renders every entry', async () => {
    fetchCorrectionsMock.mockResolvedValueOnce({
      data: [
        entry(),
        entry({
          id: 'c0',
          actorName: null,
          note: 'Original entry corrected',
          oldValue: { status: 'not_tracked', checkinAt: null, checkoutAt: null },
          newValue: { status: 'absent', checkinAt: null, checkoutAt: null },
        }),
      ],
      nextCursor: null,
      hasMore: false,
    });
    const root = await renderSheet({
      day: row({ markers: ['corrected'], latestCorrection: entry() }),
    });

    expect(texts(root)).toContain('Correction history · 2 corrections');
    // Collapsed: no entries visible yet.
    expect(texts(root).some(t => t.includes('→'))).toBe(false);

    const expandedLabel = () =>
      root.findAll(
        n => typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.startsWith('Correction history'),
      )[0];
    expect(expandedLabel().props.accessibilityState).toEqual({ expanded: false });

    await act(async () => {
      expandedLabel().props.onPress();
    });
    expect(expandedLabel().props.accessibilityState).toEqual({ expanded: true });
    expect(texts(root)).toContain('Ayush · 15 Sep 2026');
    expect(texts(root)).toContain('Absent → Times 10:22 AM');
    expect(texts(root)).toContain('“Fixed the check-in time”');
    // A null actor renders "Owner".
    expect(texts(root)).toContain('Owner · 15 Sep 2026');
    expect(texts(root)).toContain('Not tracked → Absent');
    expect(texts(root)).toContain('“Original entry corrected”');
  });

  it('a returned nextCursor renders "Show earlier"; pressing pages with the cursor', async () => {
    fetchCorrectionsMock
      .mockResolvedValueOnce({
        data: [entry(), entry({ id: 'c0' })],
        nextCursor: 'page-2',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        data: [entry({ id: 'c-1' })],
        nextCursor: null,
        hasMore: false,
      });
    const root = await renderSheet({
      day: row({ markers: ['corrected'], latestCorrection: entry() }),
    });

    expect(texts(root)).toContain('Correction history · 2 corrections');
    const disclosureFor = () =>
      root.findAll(
        n => typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.startsWith('Correction history'),
      )[0];
    await act(async () => {
      disclosureFor().props.onPress();
    });
    expect(texts(root)).toContain('Show earlier');

    await act(async () => {
      root.findAll(
        n => n.props.accessibilityLabel === 'Show earlier corrections',
      )[0].props.onPress();
    });
    expect(fetchCorrectionsMock).toHaveBeenLastCalledWith({
      employeeId: 'e1',
      workDate: '2026-09-14',
      cursor: 'page-2',
      limit: 50,
    });
    // Entries APPEND (3 total now).
    expect(texts(root)).toContain('Correction history · 3 corrections');
  });

  it('an uncorrected day fetches NO history', async () => {
    await renderSheet();
    expect(fetchCorrectionsMock).not.toHaveBeenCalled();
  });
});

describe('the keyed-fetch discipline + loading/error postures', () => {
  it('loading: the small spinner while the first history page is in flight', async () => {
    fetchCorrectionsMock.mockReturnValueOnce(new Promise(() => undefined));
    const root = await renderSheet({
      day: row({ markers: ['corrected'], latestCorrection: entry() }),
    });
    const spinners = root.findAllByType(ActivityIndicator);
    expect(spinners).toHaveLength(1);
    expect(spinners[0].props.size).toBe('small');
    expect(spinners[0].props.color).toBeDefined();
  });

  it('failure: InlineError + Retry; Retry refetches the SAME day', async () => {
    fetchCorrectionsMock
      .mockRejectedValueOnce({ status: 500, code: 'SERVER_ERROR', message: 'boom' })
      .mockResolvedValueOnce({ data: [entry()], nextCursor: null, hasMore: false });
    const root = await renderSheet({
      day: row({ markers: ['corrected'], latestCorrection: entry() }),
    });

    const errors = root.findAllByType(InlineError);
    expect(errors).toHaveLength(1);
    expect(errors[0].props.message).toBe("Couldn't load the correction history.");

    await act(async () => {
      findButtonByText(root, 'Retry')!.props.onPress();
    });
    expect(fetchCorrectionsMock).toHaveBeenCalledTimes(2);
    expect(root.findAllByType(InlineError)).toHaveLength(0);
  });

  it('a resolve for a NON-CURRENT day is DISCARDED (no wrong-day paint)', async () => {
    let resolveStale!: (v: unknown) => void;
    fetchCorrectionsMock
      .mockImplementationOnce(
        () => new Promise(resolve => (resolveStale = resolve)),
      )
      .mockResolvedValueOnce({
        data: [entry(), entry({ id: 'c0' })],
        nextCursor: null,
        hasMore: false,
      });

    let root!: ReactTestRenderer.ReactTestInstance;
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DayDetailSheet
          {...baseProps({
            day: row({ markers: ['corrected'], latestCorrection: entry() }),
          })}
        />,
      );
    });
    lastRenderer = renderer;
    root = renderer.root;

    // The host swaps to day B (a corrected day too) — a new fetch fires.
    await act(async () => {
      renderer.update(
        <DayDetailSheet
          {...baseProps({
            workDate: '2026-09-15',
            day: row({
              workDate: '2026-09-15',
              markers: ['corrected'],
              latestCorrection: entry(),
            }),
          })}
        />,
      );
    });
    await act(async () => {});
    expect(texts(root)).toContain('Correction history · 2 corrections');

    // Day A's late resolve lands — it must NOT repaint day B's history.
    await act(async () => {
      resolveStale({
        data: [entry(), entry({ id: 'x2' }), entry({ id: 'x3' })],
        nextCursor: null,
        hasMore: false,
      });
      await Promise.resolve();
    });
    expect(texts(root)).toContain('Correction history · 2 corrections');
  });

  it('a STALE resolve from a previous open loses the same-day reopen race (seq guard)', async () => {
    // The strongest form of the discard contract: SAME day, reopened — the
    // key guard alone cannot save it (the key matches again), only the seq
    // guard can. Fetch 1 (open #1) hangs; fetch 2 (open #2) resolves fast;
    // THEN fetch 1 resolves late with MORE entries — it must not win.
    let resolveStaleFirst!: (v: unknown) => void;
    fetchCorrectionsMock
      .mockImplementationOnce(
        () => new Promise(resolve => (resolveStaleFirst = resolve)),
      )
      .mockResolvedValueOnce({
        data: [entry(), entry({ id: 'c0' })],
        nextCursor: null,
        hasMore: false,
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DayDetailSheet
          {...baseProps({
            visible: false,
            day: row({ markers: ['corrected'], latestCorrection: entry() }),
          })}
        />,
      );
    });
    lastRenderer = renderer;
    const root = renderer.root;

    // Open #1 (fetch 1 hangs), then close.
    await act(async () => {
      renderer.update(
        <DayDetailSheet
          {...baseProps({
            day: row({ markers: ['corrected'], latestCorrection: entry() }),
          })}
        />,
      );
    });
    await act(async () => {
      renderer.update(
        <DayDetailSheet
          {...baseProps({
            visible: false,
            day: row({ markers: ['corrected'], latestCorrection: entry() }),
          })}
        />,
      );
    });

    // Open #2, SAME day: fetch 2 resolves with 2 entries.
    await act(async () => {
      renderer.update(
        <DayDetailSheet
          {...baseProps({
            day: row({ markers: ['corrected'], latestCorrection: entry() }),
          })}
        />,
      );
    });
    await act(async () => {});
    expect(fetchCorrectionsMock).toHaveBeenCalledTimes(2);
    expect(texts(root)).toContain('Correction history · 2 corrections');

    // Fetch 1 lands LATE with 3 entries — the stale open must NOT repaint.
    await act(async () => {
      resolveStaleFirst({
        data: [entry(), entry({ id: 'c0' }), entry({ id: 'stale' })],
        nextCursor: null,
        hasMore: false,
      });
      await Promise.resolve();
    });
    expect(texts(root)).toContain('Correction history · 2 corrections');
    expect(texts(root)).not.toContain('Correction history · 3 corrections');
  });

  it('the OPEN day GAINING a correction from a host refetch fetches without a reopen', async () => {
    // D5: the sheet follows live data — the disclosure must appear when the
    // row's latestCorrection arrives mid-open (the deps-suppression bug this
    // pins rendered it unreachable until close/reopen).
    fetchCorrectionsMock.mockResolvedValueOnce({
      data: [entry(), entry({ id: 'c0' })],
      nextCursor: null,
      hasMore: false,
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DayDetailSheet {...baseProps({ day: row() })} />,
      );
    });
    lastRenderer = renderer;
    const root = renderer.root;
    expect(fetchCorrectionsMock).not.toHaveBeenCalled();

    // Host refetch: the same day now carries a correction.
    await act(async () => {
      renderer.update(
        <DayDetailSheet
          {...baseProps({
            day: row({ markers: ['corrected'], latestCorrection: entry() }),
          })}
        />,
      );
    });
    await act(async () => {});
    expect(fetchCorrectionsMock).toHaveBeenCalledTimes(1);
    expect(texts(root)).toContain('Correction history · 2 corrections');
  });

  it('the expanded history list is SCROLLABLE and height-bounded (50 entries stay reachable)', async () => {
    fetchCorrectionsMock.mockResolvedValue({
      data: Array.from({ length: 12 }, (_, i) => entry({ id: `c${i}` })),
      nextCursor: null,
      hasMore: false,
    });
    const root = await renderSheet({
      day: row({ markers: ['corrected'], latestCorrection: entry() }),
    });
    // Expand the disclosure.
    const disclosure = root.find(
      node => node.props.accessibilityRole === 'button'
        && typeof node.props.accessibilityLabel === 'string'
        && node.props.accessibilityLabel.includes('Correction history'),
    );
    await act(async () => {
      disclosure.props.onPress();
    });
    const scroller = root.findByType(require('react-native').ScrollView);
    const style = Array.isArray(scroller.props.style)
      ? Object.assign({}, ...scroller.props.style)
      : scroller.props.style;
    expect(style.maxHeight).toBeGreaterThan(0);
  });

  it('per-open UI state resets on every open (expanded starts collapsed again)', async () => {
    fetchCorrectionsMock
      .mockResolvedValueOnce({
        data: [entry(), entry({ id: 'c0' })],
        nextCursor: null,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        data: [entry(), entry({ id: 'c0' })],
        nextCursor: null,
        hasMore: false,
      });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DayDetailSheet
          {...baseProps({
            day: row({ markers: ['corrected'], latestCorrection: entry() }),
          })}
        />,
      );
    });
    lastRenderer = renderer;
    const root = renderer.root;
    const disclosureFor = () =>
      root.findAll(
        n => typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.startsWith('Correction history'),
      )[0];

    await act(async () => {
      disclosureFor().props.onPress(); // expanded = true
    });
    expect(disclosureFor().props.accessibilityState).toEqual({ expanded: true });

    // Close, then reopen the SAME day — the expansion resets.
    await act(async () => {
      renderer.update(
        <DayDetailSheet
          {...baseProps({
            visible: false,
            day: row({ markers: ['corrected'], latestCorrection: entry() }),
          })}
        />,
      );
    });
    await act(async () => {
      renderer.update(
        <DayDetailSheet
          {...baseProps({
            day: row({ markers: ['corrected'], latestCorrection: entry() }),
          })}
        />,
      );
    });
    await act(async () => {});
    expect(disclosureFor().props.accessibilityState).toEqual({ expanded: false });
  });
});

describe('announce-on-present + the read-only postures', () => {
  it('announces "Day detail, {d} {Month}" once the sheet presents', async () => {
    await renderSheet();
    const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;
    const calls = announce.mock.calls.map(c => c[0] as string);
    expect(calls).toContain('Day detail, 14 September');
  });

  it('a me-scope sheet stays strictly read-only: no write controls anywhere', async () => {
    fetchCorrectionsMock.mockResolvedValueOnce({
      data: [entry(), entry({ id: 'c0' })],
      nextCursor: null,
      hasMore: false,
    });
    const root = await renderSheet({
      scope: { kind: 'me' },
      onCorrect: jest.fn(),
      day: row({ markers: ['corrected'], latestCorrection: entry() }),
    });

    const written = texts(root).join('\n');
    for (const label of ['Approve', 'Reject', 'Revoke', 'Save', 'Submit', 'Check in', 'Check out']) {
      expect(written).not.toContain(label);
    }
    expect(findButtonByText(root, 'Correct day')).toBeUndefined();
  });
});

describe('the Correct day entry (18-4 D1)', () => {
  it('renders for an owner with the plumbing on a past tracked day, and the morph keeps the SAME title', async () => {
    const root = await renderSheet({ onCorrect: jest.fn() });
    expect(findButtonByText(root, 'Correct day')).toBeDefined();

    await enterCorrectStage(root);

    // Same heading; the subtitle slot now carries the day's times line.
    expect(texts(root)).toContain('Monday, 14 September');
    expect(texts(root)).toContain('10:22 AM – 6:30 PM');
    // The form: mode segments, the times fields, the note, Save.
    expect(texts(root)).toContain('Times');
    expect(texts(root)).toContain('Status');
    expect(texts(root)).toContain('Check-in time');
    expect(texts(root)).toContain('Note (required)');
    expect(findButtonByText(root, 'Save correction')).toBeDefined();
    expect(findButtonByText(root, 'Back')).toBeDefined();
    // The detail content is swapped out, not stacked.
    expect(texts(root).some(t => t.includes('m from Andheri'))).toBe(false);
  });

  it('a day carrying instants opens the stage in Times mode with the wall times pre-filled', async () => {
    const root = await renderSheet({ onCorrect: jest.fn() });
    await enterCorrectStage(root);
    // The times are picker fields (§10 D-TP2); the note is the one typed Input.
    expect(root.findAllByType(TimeField).map(f => f.props.value)).toEqual([
      '10:22',
      '18:30',
    ]);
    expect(root.findAllByType(Input).map(i => i.props.value)).toEqual(['']);
  });

  it('readOnly suppresses the entry even on a correctable day (the lab proof pane)', async () => {
    const root = await renderSheet({ readOnly: true, onCorrect: jest.fn() });
    expect(findButtonByText(root, 'Correct day')).toBeUndefined();
  });

  it.each([
    ['a me scope', { scope: { kind: 'me' } as const }],
    ['a not_tracked day', { day: row({ status: 'not_tracked', checkinAt: null, checkoutAt: null, workedMinutes: null }) }],
    ['a day after the wire today', { workDate: '2026-09-30', day: row({ workDate: '2026-09-30' }) }],
    ['a null today echo', { today: null }],
    ['no write plumbing', { onCorrect: undefined }],
  ])('renders no entry for %s', async (_name, overrides) => {
    const root = await renderSheet({ onCorrect: jest.fn(), ...overrides });
    expect(findButtonByText(root, 'Correct day')).toBeUndefined();
  });
});

describe('the write posture (18-4 D4/D5)', () => {
  it('Save in Times mode sends the instants arm carrying the row offset; no checkout key when the pre-fill is empty', async () => {
    const onCorrect = jest.fn().mockResolvedValue({ workDate: '2026-09-14' });
    const root = await renderSheet({ onCorrect, day: row({ checkoutAt: null }) });

    await enterCorrectStage(root);
    await typeInto(root, 'Note (required)', '  Forgot to check out  ');
    await act(async () => {
      findButtonByText(root, 'Save correction')!.props.onPress();
    });

    expect(onCorrect).toHaveBeenCalledWith({
      checkinAt: '2026-09-14T10:22:00+05:30',
      note: 'Forgot to check out',
    });
  });

  it('Save in Status mode sends the {status, note} arm and nothing else', async () => {
    const onCorrect = jest.fn().mockResolvedValue({ workDate: '2026-09-14' });
    const root = await renderSheet({ onCorrect });

    await enterCorrectStage(root);
    await pressLabel(root, 'Status');
    await typeInto(root, 'Note (required)', 'No attendance exists for this day');
    await act(async () => {
      findButtonByText(root, 'Save correction')!.props.onPress();
    });

    expect(onCorrect).toHaveBeenCalledWith({
      status: 'present',
      note: 'No attendance exists for this day',
    });
  });

  it('a same-tick double press files ONE wire call (no idempotency key — the latch)', async () => {
    const onCorrect = jest.fn(() => new Promise(() => undefined));
    const root = await renderSheet({ onCorrect });

    await enterCorrectStage(root);
    await typeInto(root, 'Note (required)', 'once only');
    await act(async () => {
      const save = findButtonByText(root, 'Save correction')!;
      save.props.onPress();
      save.props.onPress();
    });

    expect(onCorrect).toHaveBeenCalledTimes(1);
  });

  it('while the write is in flight the sheet is not dismissible and Save spins; success morphs back + refreshes', async () => {
    let resolveSave!: (v: unknown) => void;
    const onCorrect = jest.fn(
      () => new Promise(resolve => (resolveSave = resolve)),
    );
    const onCorrected = jest.fn();
    const root = await renderSheet({ onCorrect, onCorrected });
    const sheet = () => root.findAllByType(Sheet)[0];
    expect(sheet().props.dismissible).toBe(true);

    await enterCorrectStage(root);
    await typeInto(root, 'Note (required)', 'fixing it');
    await act(async () => {
      findButtonByText(root, 'Save correction')!.props.onPress();
    });

    expect(sheet().props.dismissible).toBe(false);
    expect(findButtonByText(root, 'Save correction')!.props.loading).toBe(true);

    await act(async () => {
      resolveSave({
        workDate: '2026-09-14',
        override: { status: 'present', checkinAt: null, checkoutAt: null },
        correctedAt: '2026-09-29T10:00:00+05:30',
        actorId: 'a1',
      });
    });

    // D5: the stage morphs back to detail; the HOST refresh fired.
    expect(sheet().props.dismissible).toBe(true);
    expect(findButtonByText(root, 'Correct day')).toBeDefined();
    expect(findButtonByText(root, 'Save correction')).toBeUndefined();
    expect(onCorrected).toHaveBeenCalledTimes(1);
    // The morph-back swaps content under the same heading — the saved cue
    // announces (triage a11y patch).
    const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;
    const announced = announce.mock.calls.map(([text]) => text);
    expect(announced).toContain('Correction saved');
  });

  it('a server failure renders the server message verbatim and stays on the stage', async () => {
    const onCorrect = jest.fn().mockRejectedValue({
      status: 422,
      code: 'ATTENDANCE_INVALID_RANGE',
      message: 'Check-out must be after check-in.',
    });
    const onCorrected = jest.fn();
    const root = await renderSheet({ onCorrect, onCorrected });

    await enterAndSave(root, 'wrong order');
    expect(texts(root)).toContain('Check-out must be after check-in.');
    expect(findButtonByText(root, 'Save correction')).toBeDefined();
    expect(onCorrected).not.toHaveBeenCalled();
  });

  it('a transport failure renders the connection copy, not the raw error', async () => {
    const onCorrect = jest.fn().mockRejectedValue({
      code: 'NETWORK_ERROR',
      message: 'Network request failed',
    });
    const root = await renderSheet({ onCorrect });

    await enterAndSave(root, 'offline-ish');
    expect(texts(root)).toContain(
      "Couldn't save the correction. Check your connection.",
    );
  });

  it('an offline probe shows the offline copy and never calls the write', async () => {
    __setNetInfoState(offlineState);
    const onCorrect = jest.fn();
    const root = await renderSheet({ onCorrect });

    await enterAndSave(root, 'airplane mode');
    expect(onCorrect).not.toHaveBeenCalled();
    expect(texts(root)).toContain(
      "You're offline. Correcting attendance needs a working connection.",
    );
    // Entries intact — the note survives for the retry.
    expect(
      root.findAllByType(Input).find(i => i.props.label === 'Note (required)')!
        .props.value,
    ).toBe('airplane mode');
  });

  it('closing and reopening lands back on the detail stage with a fresh form', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = create(<DayDetailSheet {...baseProps({ onCorrect: jest.fn() })} />);
    });
    lastRenderer = renderer;
    const root = renderer.root;

    await enterCorrectStage(root);
    await typeInto(root, 'Note (required)', 'typed then abandoned');
    await act(async () => {
      renderer.update(
        <DayDetailSheet {...baseProps({ onCorrect: jest.fn(), visible: false })} />,
      );
    });
    await act(async () => {
      renderer.update(
        <DayDetailSheet {...baseProps({ onCorrect: jest.fn() })} />,
      );
    });

    expect(findButtonByText(root, 'Save correction')).toBeUndefined();
    expect(findButtonByText(root, 'Correct day')).toBeDefined();

    // Re-entering mounts a FRESH form — no carried note.
    await enterCorrectStage(root);
    expect(
      root.findAllByType(Input).find(i => i.props.label === 'Note (required)')!
        .props.value,
    ).toBe('');
  });
});
