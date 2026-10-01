/**
 * LeaveReviewStrip — the attendance pointer row on Home's "Today & needs
 * attention" section (Story 20-1 AC 12): a count only, never pending leave
 * rows inline. One press target, always to the owner's Leave screen
 * pre-set to the Pending tab. OverdueStrip's anatomy verbatim (the same
 * "plain Pressable wrapping a non-interactive Card" pointer idiom), in the
 * leave hue family (the calendar's leave glyph colour — one vocabulary).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarCheck2, ChevronRight } from 'lucide-react-native';
import { Card } from '../../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../../theme';

export type LeaveReviewStripProps = {
  count: number;
  onPress: () => void;
};

export function LeaveReviewStrip({ count, onPress }: LeaveReviewStripProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Leave requests to review, ${count} ${count === 1 ? 'request' : 'requests'}`}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
      <Card padding="md" style={styles.strip}>
        <CalendarCheck2 size={18} color={colors.status.leave.fg} strokeWidth={2} />
        <Text style={styles.label}>Leave requests to review</Text>
        <View style={styles.countChip}>
          <Text style={styles.countText}>{count}</Text>
        </View>
        <View style={styles.spacer} />
        <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: touch.min,
  },
  label: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  countChip: {
    backgroundColor: colors.status.leave.bg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  countText: {
    ...typography.bodyStrong,
    color: colors.status.leave.fg,
  },
  spacer: {
    flex: 1,
  },
});