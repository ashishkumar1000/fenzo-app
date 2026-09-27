/**
 * HolidayRow — one holiday in the HolidaysScreen list (Story 15-6).
 *
 * Date-badge visual: 44×44 square, two lines (day number large + month
 * abbreviation uppercase). Past rows render at reduced opacity with a
 * "(past)" subtitle but stay tappable for edit (FR-20 — past dates can be
 * edited/removed).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { Holiday } from '../../../services';

export type HolidayRowProps = {
  holiday: Holiday;
  /** Today as YYYY-MM-DD, used for past/upcoming styling. */
  today: string;
  onPress: () => void;
};

const MONTH_ABBR = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

function parseDate(date: string): {
  day: number;
  monthIdx: number;
  year: number;
  valid: boolean;
} {
  const [y, m, d] = date.split('-').map(Number);
  const valid =
    Number.isInteger(y) &&
    Number.isInteger(m) &&
    Number.isInteger(d) &&
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= 31;
  return { day: d, monthIdx: m - 1, year: y, valid };
}

export default function HolidayRow({ holiday, today, onPress }: HolidayRowProps) {
  const { day, monthIdx, valid } = parseDate(holiday.date);
  // A malformed date (contract break — the BE guarantees YYYY-MM-DD) must
  // not render a "NaN" badge or a nonsense month label. The row still
  // renders: the meta line below shows the raw string the server sent, so
  // the bad data is visible rather than blanked (15-6 review P18).
  const isPast = valid && holiday.date < today;
  const monthLabel = valid ? (MONTH_ABBR[monthIdx] ?? '') : '';
  return (
    <Card padding="none" style={isPast ? styles.cardPast : undefined}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Holiday ${holiday.name}, ${holiday.date}${isPast ? ', past' : ''}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          pressed && styles.rowPressed,
        ]}>
        <View style={[styles.badge, isPast && styles.badgePast]}>
          <Text style={[styles.badgeDay, isPast && styles.badgeDayPast]}>
            {valid ? day : '–'}
          </Text>
          <Text style={[styles.badgeMonth, isPast && styles.badgeMonthPast]}>
            {monthLabel}
          </Text>
        </View>
        <View style={styles.texts}>
          <Text
            style={[styles.name, isPast && styles.namePast]}
            numberOfLines={1}>
            {holiday.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {isPast ? `${holiday.date} (past)` : holiday.date}
          </Text>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
    borderRadius: radius.md,
  },
  rowPressed: {
    opacity: 0.85,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePast: {
    backgroundColor: colors.surfaceSunken,
  },
  badgeDay: {
    ...typography.heading,
    fontSize: 18,
    color: colors.primary,
  },
  badgeDayPast: {
    color: colors.textMuted,
  },
  badgeMonth: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary,
    letterSpacing: 0.4,
  },
  badgeMonthPast: {
    color: colors.textMuted,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.heading,
    color: colors.textStrong,
  },
  namePast: {
    color: colors.textMuted,
  },
  meta: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  cardPast: {
    opacity: 0.6,
  },
});
