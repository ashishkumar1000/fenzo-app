/**
 * OverdueStrip — a single pointer row on Home's Today section: it renders a
 * count only, never overdue rows inline. One press target, always to the
 * Jobs tab pre-set to the Overdue scope (same one-shot `scope` param pattern
 * the header's KPI tiles use — see HomeHeader's `StatCard`, which this
 * mirrors: a plain `Pressable` wrapping a non-interactive `Card`, since `Card`
 * itself doesn't forward `accessibilityRole`).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, ChevronRight } from 'lucide-react-native';
import { Card } from '../../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../../theme';

export type OverdueStripProps = {
  count: number;
  onPress: () => void;
};

export function OverdueStrip({ count, onPress }: OverdueStripProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Overdue, ${count} ${count === 1 ? 'job' : 'jobs'}`}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
      <Card padding="md" style={styles.strip}>
        <AlertCircle size={18} color={colors.status.scheduled.fg} strokeWidth={2} />
        <Text style={styles.label}>Overdue</Text>
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
    backgroundColor: colors.status.scheduled.bg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  countText: {
    ...typography.bodyStrong,
    color: colors.status.scheduled.fg,
  },
  spacer: {
    flex: 1,
  },
});
