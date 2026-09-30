/**
 * MonthCalendar — the pure, host-fed month grid (Story 18-3 D4). Epic 19's
 * host screens (19-5 owner monthly view, 19-6 self-view) embed it as-is; it
 * owns NOTHING else — no summary chips, no legend, no month navigation
 * (host furniture, spec §4), no fetching (`useMonthStatuses` owns that).
 *
 * Cell anatomy (the soft chip, per the mock + design pass): a square
 * (`aspectRatio: 1`, `radius.sm`) tinted with the status family's `bg`;
 * the 2xs bold date number above ONE 12px family-`fg` icon glyph — the
 * identical mapping `Badge tone="soft"` uses, no text label in the cell.
 * Number and glyph are fixed-size (no Dynamic Type) — the Day Detail
 * sheet's full label is the accessibility fallback.
 *
 * A day with no row or `not_tracked` renders the neutral MinusCircle glyph
 * — NEVER blank (silence would read as data). Today's cell carries the
 * app's established `colors.primary` ring at `borderWidth: 1.5` (the
 * ui/Calendar.tsx treatment) regardless of glyph — no status carries a
 * ring of its own (the mock's inset rings are mock-only noise: a blue inset
 * ring would be indistinguishable from today's). `today` is the wire echo,
 * never the device clock.
 *
 * The WHOLE cell is the tap target (the Accessibility Floor's stated ~40px
 * calendar-cell exception) → `onPickDate(workDate)` for ANY date including
 * future ones. Sunday-first grid (the mock's S M T W T F S header — the
 * Monday-first WeeklyOffDayPicker is a recorded trap: reuse its letters +
 * full-a11y-names pattern, never its ordering).
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing, weight } from '../../../theme';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import {
  DAY_STATUS_VISUALS,
  dayStatusColors,
} from './dayStatusVisual';
import { dayMonthLabel } from './dayDetailModel';

export type MonthCalendarProps = {
  /** 'YYYY-MM' — which month the grid renders. */
  yearMonth: string;
  /** The month's rows keyed by workDate (the hook's map). */
  days: ReadonlyMap<string, DayStatusRow>;
  /** The tenant-local today (the wire echo); null before first success —
   *  the ring simply doesn't render. */
  today: string | null;
  /** Fires with the tapped day's workDate — any date, future included. */
  onPickDate: (workDate: string) => void;
};

/** Sunday-first header letters (the mock's pattern), full names for a11y. */
const WEEKDAY_HEADERS: { letter: string; name: string }[] = [
  { letter: 'S', name: 'Sunday' },
  { letter: 'M', name: 'Monday' },
  { letter: 'T', name: 'Tuesday' },
  { letter: 'W', name: 'Wednesday' },
  { letter: 'T', name: 'Thursday' },
  { letter: 'F', name: 'Friday' },
  { letter: 'S', name: 'Saturday' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const GLYPH_SIZE = 12;

/** Parse 'YYYY-MM' → { year, month } or null (defensive against a
 *  malformed prop — the grid renders empty rather than NaN rows). */
function parseYearMonth(yearMonth: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * One memoized cell (spec: cells memo on their row; the host passes a
 * stable `onPickDate`, so a fast ‹ › page change only rebuilds changed
 * rows). Row identity drives the re-render, not the whole month map.
 */
const DayCell = memo(function DayCell({
  workDate,
  dayNumber,
  row,
  isToday,
  onPress,
}: {
  workDate: string;
  dayNumber: number;
  row: DayStatusRow | undefined;
  isToday: boolean;
  onPress: (workDate: string) => void;
}) {
  // Not tracked NEVER renders blank — a missing row shows the same neutral
  // glyph as an explicit not_tracked day.
  const status = row?.status ?? 'not_tracked';
  const visual = DAY_STATUS_VISUALS[status];
  const family = dayStatusColors(status);
  const Icon = visual.icon;
  const label = `${dayMonthLabel(workDate)}${isToday ? ', today' : ''}, ${visual.label}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(workDate)}
      style={[
        styles.cell,
        { backgroundColor: family.bg },
        isToday ? styles.cellToday : null,
      ]}>
      <Text style={[styles.dayNumber, { color: family.fg }]}>{dayNumber}</Text>
      <Icon size={GLYPH_SIZE} color={family.fg} strokeWidth={2} />
    </Pressable>
  );
});

export function MonthCalendar({
  yearMonth,
  days,
  today,
  onPickDate,
}: MonthCalendarProps) {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return null;

  // UTC-anchored date math on explicit Y/M/D — deterministic on every
  // device zone (no local-midnight DST edges).
  const { year, month } = parsed;
  // Sunday-first offset: JS getUTCDay is already 0=Sunday.
  const leadingBlanks = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (string | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => {
      const dd = String(i + 1).padStart(2, '0');
      const mm = String(month).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }),
  ];

  return (
    <View accessibilityRole="grid" accessibilityLabel={`Calendar, ${MONTH_NAMES[month - 1]} ${year}`}>
      <View style={styles.headerRow}>
        {WEEKDAY_HEADERS.map(header => (
          <View key={header.name} style={styles.headerCell}>
            {/* Single letters visually; the full name keeps the two S's
                and two T's from ever sharing an accessible name. */}
            <Text
              accessibilityLabel={header.name}
              style={styles.headerLetter}>
              {header.letter}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((workDate, index) =>
          workDate == null ? (
            <View key={`blank-${index}`} style={styles.cell} />
          ) : (
            <DayCell
              key={workDate}
              workDate={workDate}
              dayNumber={Number(workDate.slice(8, 10))}
              row={days.get(workDate)}
              isToday={workDate === today}
              onPress={onPickDate}
            />
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    marginBottom: spacing.s1,
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
  },
  headerLetter: {
    fontSize: fontSize['2xs'],
    fontWeight: weight.semibold,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: 2,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  dayNumber: {
    fontSize: fontSize['2xs'],
    fontWeight: weight.bold,
  },
});
