/**
 * MonthlyEmployeeRow — one row of the owner's monthly list (Story 19-5
 * D4): the TechnicianPicker row STYLE re-composed (the picker is a
 * single-select with a check circle and a 240 cap; the sheet rows are
 * sheet-bound — neither composes this), a FLAT bordered card — no shadow
 * — with the trailing ChevronRight affordance the owner learned on the
 * Today screen's FlagStrip.
 *
 * Anatomy: Avatar md → a text column (name bodyStrong, the chips line,
 * the caption line) → chevron. The chips are ATOMIC captionStrong Texts
 * in their family colours (Q3) in a wrapping row, so a wrap breaks
 * BETWEEN chips, never mid-phrase; the caption joins with " · " and is
 * omitted entirely when empty. Colour never carries a fact alone — every
 * chip and caption segment self-labels (FR-25).
 *
 * ONE focusable element: the Pressable carries the model's assembled
 * a11y label (commas, never "·" — TalkBack reads the dot) and the
 * children are hidden from the accessibility tree.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Avatar } from '../../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../../theme';
import type { EmployeeMonthlyRow } from '../../../services';
import {
  monthlyCaption,
  monthlyRowA11yLabel,
  summaryChips,
  type MonthlyChipSpec,
} from './monthlyModel';

/** The row's TYPICAL height (body name + one chips line + the caption +
 *  the s3 paddings) — the loading Skeleton stands in at this height so
 *  the swap doesn't jump for the common row. A row whose chips wrap to a
 *  second line grows past it; the skeleton is the first-load stand-in,
 *  not a promise (recorded in the 19-5 review triage). */
export const ROW_HEIGHT = 84;

/** Chip family colours (Sally Q3, token-verified): worked is the house
 *  present/worked family (progress is byte-identical to leave — done is
 *  the worked family); half + late share the scheduled amber (there is no
 *  `late` token — the Late tile is scheduled); absent is cancelled;
 *  missing checkout its own amber family. */
const CHIP_COLORS: Record<MonthlyChipSpec['key'], string> = {
  daysWorked: colors.status.done.fg,
  halfDays: colors.status.scheduled.fg,
  lateCount: colors.status.scheduled.fg,
  leave: colors.status.leave.fg,
  absent: colors.status.cancelled.fg,
  checkoutMissing: colors.status.checkoutMissing.fg,
};

/** A ZERO count never renders in a status colour — a green "0 worked"
 *  reads as good (2026-10 copy review). The DS neutral grey keeps the
 *  zero an honest answer; absent stays red and late amber at any count. */
const NEUTRAL_CHIP_COLOR = colors.status.neutral.fg;

const chipColor = (chip: MonthlyChipSpec): string =>
  chip.count === 0 ? NEUTRAL_CHIP_COLOR : CHIP_COLORS[chip.key];

export function MonthlyEmployeeRow({
  row,
  onPress,
}: {
  row: EmployeeMonthlyRow;
  onPress: () => void;
}) {
  const chips = summaryChips(row.summary);
  const caption = monthlyCaption(row);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={monthlyRowA11yLabel(row)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <Avatar name={row.employeeName} size="md" />
      <View style={styles.texts}>
        <Text style={styles.name} numberOfLines={1}>
          {row.employeeName}
        </Text>
        <View style={styles.chips}>
          {chips.map((chip, i) => (
            <View key={chip.key} style={styles.chipRun}>
              <Text style={[styles.chip, { color: chipColor(chip) }]}>
                {chip.label}
              </Text>
              {/* The separator is its OWN muted atom BETWEEN chips — a
                  wrap strand can never end in a dangling "·", and the
                  dot never inherits a chip's status colour (the a11y
                  label uses commas; TalkBack reads the dot). */}
              {i < chips.length - 1 ? (
                <Text style={styles.chipDot}>·</Text>
              ) : null}
            </View>
          ))}
        </View>
        {caption !== '' ? (
          <Text style={styles.caption} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: touch.large,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
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
  caption: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
