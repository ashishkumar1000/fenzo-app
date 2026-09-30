/**
 * LoadErrorRetry — the dashboard's load-failure composition (Story 19-4,
 * the house posture generalized to a read screen): InlineError + Retry.
 * InlineError itself has no retry prop, so the screen composes it with a
 * secondary Button — non-dismissible, Retry is the way out (the
 * ReportsScreen posture). One copy for both postures: first-load failure
 * (nothing stale to keep) and refetch failure (last-good render stays).
 */
import { View, StyleSheet } from 'react-native';
import { Button, InlineError } from '../../../components/ui';
import { spacing } from '../../../theme';

/** The error banner copy (spec copy table) — shared by both postures. */
export const LOAD_ERROR_COPY =
  "Couldn't load the dashboard. Check your connection and try again.";

export function LoadErrorRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.block}>
      <InlineError message={LOAD_ERROR_COPY} />
      <Button variant="secondary" size="md" onPress={onRetry}>
        Retry
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.s3,
  },
});
