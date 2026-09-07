/**
 * DispatchTip — the Upcoming empty state's hint strip: points the owner at
 * the Overdue segment when work is falling behind. Rendered only when the
 * overdue count is non-zero, so the copy always agrees with the badge on the
 * segmented control above. Purely presentational — the live count
 * (`profile.jobCounts.overdue`) is passed in by the screen.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Lightbulb } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';

type Props = {
  /** Live overdue count — rendered so the tip matches the segment badge. */
  overdueCount: number;
};

export function DispatchTip({ overdueCount }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.iconTile}>
        <Lightbulb size={16} color={colors.primary} strokeWidth={2} />
      </View>
      <Text style={styles.text}>
        <Text style={styles.lead}>Dispatch tip: </Text>
        Tap Overdue ({overdueCount}) to clear or reassign delayed assignments.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s6,
    paddingBottom: spacing.s6,
  },
  iconTile: {
    width: spacing.s8,
    height: spacing.s8,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...typography.bodySm,
    color: colors.textMuted,
    flexShrink: 1,
  },
  lead: {
    ...typography.bodySm,
    color: colors.textStrong,
  },
});