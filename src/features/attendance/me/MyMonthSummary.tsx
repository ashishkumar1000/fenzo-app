/**
 * MyMonthSummary — the self view's LOADED summary group (Story 19-6 D5/D9,
 * split from AttendanceMyMonth under the ≤300-line rule; restyled 2026-10
 * into the stat-tile CARD per the My Month mock): the "Days worked: X so
 * far" head line (current month only; a past month reads "Days worked: X"),
 * the "Tracking for {month}" subtitle and the month-length chip, a
 * hairline divider, then the FOUR stat tiles — Worked / Absent / Offs /
 * Holiday, each in one of the system's EXISTING status families (the
 * colour lives with this component, the MonthlyEmployeeRow CHIP_COLORS
 * precedent — no new palette entry). Counts the tiles don't carry (half
 * days, late arrivals, leave pay, missing checkouts, worked-on-holiday)
 * keep the 19-5 zero-suppressed chips line UNDER the grid — the redesign
 * loses no information.
 *
 * ONE accessibility element with one assembled comma label, children
 * hidden — per-tile labels would announce the numbers twice (the
 * MonthlyEmployeeRow recipe transposed to a static group): the head
 * sentence, then the tiles ("Worked 0", …), then the residual chips.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Badge, Card } from '../../../components/ui';
import { colors, fontSize, radius, spacing, typography, weight, type StatusKey } from '../../../theme';
import type { MonthlyEmployeeSummary } from '../../../services';
import {
  daysInMonth,
  formatCredit,
  monthTitle,
  summaryChips,
  type MonthlyChipSpec,
} from '../monthly/monthlyModel';

/** Tile family colours — the SAME five-hue system, mapped per tile (the
 *  D4 colour-lives-with-the-component rule). */
const TILE_FAMILIES: Record<TileKey, StatusKey> = {
  worked: 'done',
  absent: 'cancelled',
  offs: 'leave',
  holiday: 'scheduled',
} as const;

type TileKey = 'worked' | 'absent' | 'offs' | 'holiday';

/** Residual chip colour — the SAME D4 map the owner row renders (the
 *  tiles above take over worked/absent; what remains is this shared map). */
const CHIP_COLORS: Record<
  Exclude<MonthlyChipSpec['key'], 'daysWorked' | 'absent'>,
  string
> = {
  halfDays: colors.status.scheduled.fg,
  lateCount: colors.status.scheduled.fg,
  leave: colors.status.leave.fg,
  checkoutMissing: colors.status.checkoutMissing.fg,
};

/** The group's ONE a11y label: the head sentence leads (the "so far"
 *  carries the worked number), then the tiles as "«label» «count»", then
 *  the residual chips. */
function summaryA11yLabel(
  summary: MonthlyEmployeeSummary,
  isCurrentMonth: boolean,
  tileCount: (key: TileKey) => string,
): string {
  const parts: string[] = [];
  if (isCurrentMonth) {
    parts.push(`Days worked: ${formatCredit(summary.daysWorked)} so far`);
  }
  for (const tile of Object.keys(TILE_FAMILIES) as TileKey[]) {
    parts.push(
      `${tile === 'worked' ? 'Worked' : tile === 'absent' ? 'Absent' : tile === 'offs' ? 'Days off' : 'Holiday'} ${tileCount(tile)}`,
    );
  }
  for (const chip of summaryChips(summary)) {
    if (chip.key === 'daysWorked' || chip.key === 'absent') continue;
    parts.push(chip.label);
  }
  if (summary.workedOnHoliday > 0) {
    parts.push(`${formatCredit(summary.workedOnHoliday)} worked on holiday`);
  }
  return parts.join(', ');
}

export function MyMonthSummary({
  summary,
  isCurrentMonth,
  yearMonth,
}: {
  summary: MonthlyEmployeeSummary;
  isCurrentMonth: boolean;
  /** The DISPLAYED month — the subtitle + length chip read it (the same
   *  'YYYY-MM' the month label shows; always the section's yearMonth). */
  yearMonth: string;
}) {
  const tileCount = (key: TileKey): string => {
    const value =
      key === 'worked'
        ? summary.daysWorked
        : key === 'absent'
          ? summary.absent
          : key === 'offs'
            ? summary.weeklyOffs
            : summary.holidays;
    return formatCredit(value);
  };

  const residualChips = summaryChips(summary).filter(
    chip => chip.key !== 'daysWorked' && chip.key !== 'absent',
  );
  const monthChip = daysInMonth(yearMonth);
  const title = isCurrentMonth
    ? `Days worked: ${formatCredit(summary.daysWorked)} so far`
    : `Days worked: ${formatCredit(summary.daysWorked)}`;

  return (
    <Card padding="md">
      <View
        accessibilityLabel={summaryA11yLabel(summary, isCurrentMonth, tileCount)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              Tracking for {monthTitle(yearMonth)}
            </Text>
          </View>
          {monthChip > 0 ? (
            <Badge status="neutral" size="sm">{`${monthChip} Days`}</Badge>
          ) : null}
        </View>
        <View style={styles.divider} />
        <View style={styles.tiles}>
          {((
            [
              ['worked', 'Worked'],
              ['absent', 'Absent'],
              ['offs', 'Offs'],
              ['holiday', 'Holiday'],
            ] as [TileKey, string][]
          ).map(([key, label]) => {
            const family = colors.status[TILE_FAMILIES[key]];
            return (
              <View
                key={key}
                style={[styles.tile, { backgroundColor: family.bg }]}>
                <Text style={[styles.tileLabel, { color: family.fg }]}>
                  {label}
                </Text>
                <Text style={[styles.tileCount, { color: family.fg }]}>
                  {tileCount(key)}
                </Text>
              </View>
            );
          }))}
        </View>
        {residualChips.length > 0 ? (
          <View style={styles.chips}>
            {residualChips.map((chip, i) => (
              <View key={chip.key} style={styles.chipRun}>
                <Text
                  style={[
                    styles.chip,
                    {
                      color:
                        CHIP_COLORS[
                          chip.key as Exclude<
                            MonthlyChipSpec['key'],
                            'daysWorked' | 'absent'
                          >
                        ],
                    },
                  ]}>
                  {chip.label}
                </Text>
                {i < residualChips.length - 1 ? (
                  <Text style={styles.chipDot}>·</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        {summary.workedOnHoliday > 0 ? (
          <Text style={styles.meta}>
            {`${formatCredit(summary.workedOnHoliday)} worked on holiday`}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s2,
  },
  headText: {
    flex: 1,
    gap: spacing.s1,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.s3,
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  tile: {
    flex: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s3,
    gap: spacing.s1,
  },
  tileLabel: {
    ...typography.captionStrong,
    color: colors.textStrong,
  },
  tileCount: {
    fontSize: fontSize.lg,
    fontWeight: weight.bold,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
    marginTop: spacing.s3,
  },
  chipRun: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    ...typography.captionStrong,
  },
  chipDot: {
    ...typography.captionStrong,
    color: colors.textMuted,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.s2,
  },
});