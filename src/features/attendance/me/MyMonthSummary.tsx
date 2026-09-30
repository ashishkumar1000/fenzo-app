/**
 * MyMonthSummary — the self view's LOADED summary group (Story 19-6 D5/D9,
 * split from AttendanceMyMonth under the ≤300-line rule): the so-far line
 * (current month only), the 19-5 atomic chips row and the counts-only meta
 * line. ONE accessibility element with one assembled comma label, children
 * hidden — per-line labels would announce the worked number twice (the
 * MonthlyEmployeeRow recipe transposed to a static group).
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../../theme';
import type { MonthlyEmployeeSummary } from '../../../services';
import {
  formatCredit,
  summaryChips,
  summaryMetaSegments,
  type MonthlyChipSpec,
} from '../monthly/monthlyModel';

/** Chip family colours — the SAME D4 map the owner row renders (colour
 *  lives with the component; the builder is the one shared piece). */
const CHIP_COLORS: Record<MonthlyChipSpec['key'], string> = {
  daysWorked: colors.status.done.fg,
  halfDays: colors.status.scheduled.fg,
  lateCount: colors.status.scheduled.fg,
  leave: colors.status.leave.fg,
  absent: colors.status.cancelled.fg,
  checkoutMissing: colors.status.checkoutMissing.fg,
};

/** The group's ONE a11y label: current month leads with the so-far
 *  sentence (the worked chip is omitted FROM THE LABEL — the sentence
 *  carries the number); a past month keeps the worked chip as the anchor.
 *  Remaining chips + meta segments join with commas. */
function summaryA11yLabel(
  summary: MonthlyEmployeeSummary,
  isCurrentMonth: boolean,
): string {
  const chips = summaryChips(summary);
  const chipLabels = (isCurrentMonth ? chips.slice(1) : chips).map(
    chip => chip.label,
  );
  const parts = isCurrentMonth
    ? [`Days worked: ${formatCredit(summary.daysWorked)} so far`, ...chipLabels]
    : chipLabels;
  return [...parts, ...summaryMetaSegments(summary)].join(', ');
}

export function MyMonthSummary({
  summary,
  isCurrentMonth,
}: {
  summary: MonthlyEmployeeSummary;
  isCurrentMonth: boolean;
}) {
  const chips = summaryChips(summary);
  const metaSegments = summaryMetaSegments(summary);
  return (
    <View
      accessibilityLabel={summaryA11yLabel(summary, isCurrentMonth)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {isCurrentMonth ? (
        <Text style={styles.soFar}>
          Days worked: {formatCredit(summary.daysWorked)} so far
        </Text>
      ) : null}
      <View style={styles.chips}>
        {chips.map((chip, i) => (
          <View key={chip.key} style={styles.chipRun}>
            <Text style={[styles.chip, { color: CHIP_COLORS[chip.key] }]}>
              {chip.label}
            </Text>
            {/* The separator is its OWN muted atom BETWEEN chips — a wrap
                strand can never end in a dangling "·" (the row idiom). */}
            {i < chips.length - 1 ? <Text style={styles.chipDot}>·</Text> : null}
          </View>
        ))}
      </View>
      {metaSegments.length > 0 ? (
        <Text style={styles.meta}>{metaSegments.join(' · ')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  soFar: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
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
  },
});
