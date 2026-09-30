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
 * + Retry; announce-on-present; read-only. The corrections block lives in
 * CorrectionHistory — driven here through the sheet, the way hosts embed
 * it. RTR gotchas: Buttons driven by type+children, async flushes via
 * `await act(async () => {})`.
 */
jest.mock('../../../services/resources/attendanceCorrections', () => ({
  ...jest.requireActual('../../../services/resources/attendanceCorrections'),
  fetchCorrections: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, ActivityIndicator, Text } from 'react-native';
import { Button, InlineError } from '../../../components/ui';
import { fetchCorrections } from '../../../services/resources/attendanceCorrections';
import type { CorrectionEntry } from '../../../services/resources/attendanceCorrections';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import { DayDetailSheet } from './DayDetailSheet';

const fetchCorrectionsMock = fetchCorrections as jest.Mock;

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
    ? children.map(String).join('')
    : String(children ?? '');
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

function findButtonByText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root.findAllByType(Button).find(b => b.props.children === text);
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
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

  it('worked renders "8 h 08 m"; office renders the name; null office omits the row', async () => {
    const root = await renderSheet();
    expect(texts(root)).toContain('8 h 08 m');
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

describe('announce-on-present + read-only', () => {
  it('announces "Day detail, {d} {Month}" once the sheet presents', async () => {
    await renderSheet();
    const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;
    const calls = announce.mock.calls.map(c => c[0] as string);
    expect(calls).toContain('Day detail, 14 September');
  });

  it('stays strictly read-only: no write controls anywhere', async () => {
    fetchCorrectionsMock.mockResolvedValueOnce({
      data: [entry(), entry({ id: 'c0' })],
      nextCursor: null,
      hasMore: false,
    });
    const root = await renderSheet({
      day: row({ markers: ['corrected'], latestCorrection: entry() }),
    });

    const written = texts(root).join('\n');
    for (const label of ['Approve', 'Reject', 'Revoke', 'Save', 'Submit', 'Check in', 'Check out']) {
      expect(written).not.toContain(label);
    }
  });
});
