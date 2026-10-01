/**
 * AttendanceSummaryView.tsx — the FR-4 summary rows (Office, Timings,
 * Late cut-off, Weekly offs) shared by the active and upcoming state
 * screens (Story 15-10). Pure presentation: rows derive in
 * `attendanceMeModel.buildSummaryRows`, and this renders the tri-state
 * contract around them — a first-load shimmer (the summary-shaped
 * Skeleton); blocking error + Retry when there is nothing to show;
 * InlineError over live rows when a refetch
 * failed (the InlineError docblock's exact "stale" case).
 */
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, InlineError, Skeleton } from '../../../components/ui';
import { colors, fontSize, radius, spacing } from '../../../theme';
import { buildSummaryRows } from './attendanceMeModel';
import type { AttendanceSummaryState } from './useAttendanceSummary';

type Props = {
  state: AttendanceSummaryState;
  onRetry: () => void;
};

export function AttendanceSummaryView({ state, onRetry }: Props) {
  if (state.isLoading) {
    // First load: a summary-shaped shimmer, labelled (the 19-5 idiom).
    return (
      <View accessibilityLabel="Loading attendance">
        <Skeleton rows={4} height={44} />
      </View>
    );
  }
  if (state.error) {
    return (
      <View style={styles.errorWrap}>
        <InlineError message={state.error} />
        <Button variant="secondary" size="md" onPress={onRetry}>
          Retry
        </Button>
      </View>
    );
  }
  const rows = buildSummaryRows(state.summary);
  return (
    <View style={styles.wrap}>
      {state.isStale && state.summary !== null && (
        <InlineError message="Couldn't refresh just now — these details may be out of date." />
      )}
      <Card style={styles.card}>
        {rows.map(row => (
          <View key={row.label} style={styles.row}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue}>{row.value}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.s3,
  },
  card: {
    padding: spacing.s4,
    gap: spacing.s3,
    borderRadius: radius.lg,
  },
  row: {
    gap: spacing.s1,
  },
  rowLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  rowValue: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textStrong,
  },
  errorWrap: {
    gap: spacing.s3,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
