/**
 * LoadErrorRetry — the dashboard's load-failure composition (Story 19-4,
 * the house posture generalized to a read screen): InlineError + Retry.
 * InlineError itself has no retry prop, so the screen composes it with a
 * secondary Button — non-dismissible, Retry is the way out (the
 * ReportsScreen posture). One copy for both postures: first-load failure
 * (nothing stale to keep) and refetch failure (last-good render stays).
 *
 * Story 19-5 adds the optional `message` prop: the monthly view renders
 * this same composition with ITS fixed copy (never err.message) — the
 * default stays the dashboard's LOAD_ERROR_COPY, so the dashboard is
 * untouched (one implementation, two messages).
 */
import { View, StyleSheet } from 'react-native';
import { Button, InlineError } from '../../../components/ui';
import { spacing } from '../../../theme';

/** The dashboard's error banner copy (spec copy table) — the default. */
export const LOAD_ERROR_COPY =
  "Couldn't load the dashboard. Check your connection and try again.";

export function LoadErrorRetry({
  onRetry,
  message = LOAD_ERROR_COPY,
}: {
  onRetry: () => void;
  /** The banner copy — a read screen's own fixed message (19-5). */
  message?: string;
}) {
  return (
    <View style={styles.block}>
      <InlineError message={message} />
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
