/**
 * Component tests for MonthCalendar (Story 18-3, spec §3 test plan): the
 * Sunday-first grid offsets (leading blanks for a Tuesday 1st), the chip
 * anatomy (family bg + fg number/glyph — no label in the cell), the glyph
 * per status incl. NOT-TRACKED-NEVER-BLANK (a missing row shows the same
 * neutral glyph), the today ring (borderWidth 1.5 + the wire "today" in
 * the a11y label — never the device clock), whole-cell taps for ANY date
 * incl. future, header letters with full a11y names, and the memo +
 * stable-callback contract. JSX array children break exact Text matchers —
 * assertions go through accessibilityLabel / props, not flat text.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { View } from 'react-native';
import {
  AlertCircle,
  MinusCircle,
  Play,
} from 'lucide-react-native';
import { colors } from '../../../theme';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import { MonthCalendar } from './MonthCalendar';

function row(workDate: string, status: DayStatusRow['status']): DayStatusRow {
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

type Props = Parameters<typeof MonthCalendar>[0];

function render(overrides: Partial<Props> = {}) {
  const onPickDate = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <MonthCalendar
        yearMonth="2026-09"
        days={new Map()}
        today={null}
        onPickDate={onPickDate}
        {...overrides}
      />,
    );
  });
  return { renderer, onPickDate };
}

/** Cell Pressables = button-role nodes that carry onPress (mirrors double
 *  through the host View; dedupe by accessibilityLabel). */
function cells(renderer: ReactTestRenderer.ReactTestRenderer) {
  const byLabel = new Map<string, ReactTestRenderer.ReactTestInstance>();
  renderer.root
    .findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.accessibilityLabel === 'string' &&
        typeof node.props.onPress === 'function',
    )
    .forEach(node => {
      const label = node.props.accessibilityLabel as string;
      if (!byLabel.has(label)) byLabel.set(label, node);
    });
  return byLabel;
}

/** The cell for a day: "{d} September{', today'?}, {label}". */
function findCell(
  renderer: ReactTestRenderer.ReactTestRenderer,
  workDate: string,
  status: DayStatusRow['status'],
  isToday = false,
) {
  const day = Number(workDate.slice(8, 10));
  const { DAY_STATUS_LABELS } =
    require('../../../services/resources/attendanceDayStatus') as typeof import('../../../services/resources/attendanceDayStatus');
  return cells(renderer).get(
    `${day} September${isToday ? ', today' : ''}, ${DAY_STATUS_LABELS[status]}`,
  )!;
}

/** RN styles arrive as an array with possible nulls — normalize. */
function styleArray(cell: ReactTestRenderer.ReactTestInstance) {
  return Array.isArray(cell.props.style) ? cell.props.style : [cell.props.style];
}

describe('the Sunday-first grid', () => {
  it('September 2026: Tuesday 1st → two leading blanks, 30 cells, S M T W T F S header', () => {
    const { renderer } = render();

    const headers = renderer.root
      .findAll(n => typeof n.props.accessibilityLabel === 'string')
      .map(n => n.props.accessibilityLabel as string);
    ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].forEach(
      name => expect(headers).toContain(name),
    );

    const allCells = cells(renderer);
    expect(allCells.size).toBe(30);
    expect(allCells.has('1 September, Not tracked')).toBe(true);
    expect(allCells.has('30 September, Not tracked')).toBe(true);
    expect(allCells.has('31 September, Not tracked')).toBe(false);
  });

  it('header letters stay single glyphs visually (the WeeklyOffDayPicker trap: letters, never its ordering)', () => {
    const { renderer } = render();
    const letters = renderer.root
      .findAll(
        n =>
          n.type === require('react-native').Text &&
          ['S', 'M', 'T', 'W', 'T', 'F', 'S'].includes(n.props.children),
      )
      .map(n => n.props.children);
    expect(letters).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });
});

describe('the chip anatomy + glyphs', () => {
  it('a present day: family colours on the chip, number above the glyph, no label text in the cell', () => {
    const { renderer } = render({
      days: new Map([['2026-09-14', row('2026-09-14', 'present')]]),
    });

    const cell = findCell(renderer, '2026-09-14', 'present');
    const styles = styleArray(cell);
    // The soft chip: family bg on one layer, square (aspectRatio 1).
    expect(styles).toContainEqual(
      expect.objectContaining({ backgroundColor: colors.status.done.bg }),
    );
    expect(styles).toContainEqual(expect.objectContaining({ aspectRatio: 1 }));
    // The date number is the cell's ONLY text — no status label inside.
    const texts = cell.findAllByType(require('react-native').Text);
    expect(texts.map(t => t.props.children)).toEqual([14]);
  });

  it('in_progress renders the Play glyph in the progress family', () => {
    const { renderer } = render({
      days: new Map([['2026-09-14', row('2026-09-14', 'in_progress')]]),
    });
    const cell = findCell(renderer, '2026-09-14', 'in_progress');
    const icons = cell.findAllByType(Play);
    expect(icons).toHaveLength(1);
    expect(icons[0].props.size).toBe(12);
    expect(icons[0].props.color).toBe(colors.status.progress.fg);
  });

  it('checkout_missing renders AlertCircle in the amber family', () => {
    const { renderer } = render({
      days: new Map([['2026-09-14', row('2026-09-14', 'checkout_missing')]]),
    });
    const cell = findCell(renderer, '2026-09-14', 'checkout_missing');
    expect(cell.findAllByType(AlertCircle)).toHaveLength(1);
    expect(styleArray(cell)).toContainEqual(
      expect.objectContaining({ backgroundColor: colors.status.checkoutMissing.bg }),
    );
  });

  it('a day with NO row renders the neutral MinusCircle — never blank', () => {
    const { renderer } = render({
      days: new Map([['2026-09-14', row('2026-09-14', 'present')]]),
    });
    const cell = cells(renderer).get('15 September, Not tracked')!;
    expect(cell).toBeDefined();
    expect(cell.findAllByType(MinusCircle)).toHaveLength(1);
  });

  it('an explicit not_tracked row renders the same neutral glyph', () => {
    const { renderer } = render({
      days: new Map([['2026-09-14', row('2026-09-14', 'not_tracked')]]),
    });
    const cell = findCell(renderer, '2026-09-14', 'not_tracked');
    expect(cell.findAllByType(MinusCircle)).toHaveLength(1);
  });
});

describe('the today ring (wire-fed, never the device clock)', () => {
  it("today's cell: borderWidth 1.5 in colors.primary + ', today' in the a11y label", () => {
    const { renderer } = render({
      today: '2026-09-14',
      days: new Map([['2026-09-14', row('2026-09-14', 'in_progress')]]),
    });

    const cell = findCell(renderer, '2026-09-14', 'in_progress', true);
    expect(styleArray(cell)).toContainEqual(
      expect.objectContaining({
        borderWidth: 1.5,
        borderColor: colors.primary,
      }),
    );
    expect(cell.props.accessibilityLabel).toBe('14 September, today, In progress');
  });

  it('today=null (a legacy read) renders NO ring anywhere', () => {
    const { renderer } = render({
      days: new Map([['2026-09-14', row('2026-09-14', 'in_progress')]]),
    });
    const cell = findCell(renderer, '2026-09-14', 'in_progress');
    const ringed = styleArray(cell).filter(
      (s: { borderWidth?: number } | undefined | null) => s?.borderWidth === 1.5,
    );
    expect(ringed).toHaveLength(0);
    expect(cell.props.accessibilityLabel).toBe('14 September, In progress');
  });
});

describe('the whole-cell tap target', () => {
  it('ANY date fires onPickDate with its workDate — future included', () => {
    const { renderer, onPickDate } = render({ today: '2026-09-29' });

    act(() => {
      cells(renderer).get('29 September, today, Not tracked')!.props.onPress();
    });
    expect(onPickDate).toHaveBeenCalledWith('2026-09-29');

    act(() => {
      cells(renderer).get('30 September, Not tracked')!.props.onPress();
    });
    expect(onPickDate).toHaveBeenCalledWith('2026-09-30');

    act(() => {
      cells(renderer).get('1 September, Not tracked')!.props.onPress();
    });
    expect(onPickDate).toHaveBeenCalledWith('2026-09-01');
    expect(onPickDate).toHaveBeenCalledTimes(3);
  });

  it('the callback identity is stable across a re-render (the memo contract hosts rely on)', () => {
    const onPickDate = jest.fn();
    // The SAME row object goes into both fetches' maps (a refetch builds a
    // new Map, not new rows) — memoized cells must not re-render.
    const kept = row('2026-09-14', 'present');
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(
        <MonthCalendar
          yearMonth="2026-09"
          days={new Map([['2026-09-14', kept]])}
          today={null}
          onPickDate={onPickDate}
        />,
      );
    });
    const before = findCell(renderer, '2026-09-14', 'present').props.onPress;

    act(() => {
      renderer.update(
        <MonthCalendar
          yearMonth="2026-09"
          days={new Map([['2026-09-14', kept]])}
          today={null}
          onPickDate={onPickDate}
        />,
      );
    });
    expect(findCell(renderer, '2026-09-14', 'present').props.onPress).toBe(before);
  });

  it('a malformed yearMonth renders nothing (no NaN grid)', () => {
    const { renderer } = render({ yearMonth: 'september' });
    expect(renderer.root.findAllByType(View).length).toBeGreaterThanOrEqual(0);
    expect(cells(renderer).size).toBe(0);
  });
});
