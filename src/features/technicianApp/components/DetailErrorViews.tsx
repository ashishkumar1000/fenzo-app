/**
 * DetailErrorViews — the technician detail screen's three failure states
 * (spec §3/§8): 403 (reassigned away), 404 (not available), and any other
 * failed fetch with nothing to show. Purely presentational — the screen
 * passes the handlers.
 *
 * All CTAs are secondary buttons: these views are exits, not invitations.
 */
import { StyleSheet, View } from 'react-native';
import { FileQuestion, UserX } from 'lucide-react-native';
import { Button, EmptyState, InlineError } from '../../../components/ui';
import { colors, spacing } from '../../../theme';

type BackProps = { onBack: () => void };

/** 403 — the job was reassigned away from the caller. */
export function UnassignedView({ onBack }: BackProps) {
  return (
    <View style={styles.centered}>
      <EmptyState
        icon={<UserX size={36} color={colors.primary} strokeWidth={1.5} />}
        title="This job is no longer assigned to you"
        description="It may have been reassigned."
        ctaLabel="Go back"
        ctaVariant="secondary"
        onPressCta={onBack}
      />
    </View>
  );
}

/** 404 — the job isn't reachable (removed or out of scope). */
export function NotFoundView({ onBack }: BackProps) {
  return (
    <View style={styles.centered}>
      <EmptyState
        icon={<FileQuestion size={36} color={colors.primary} strokeWidth={1.5} />}
        title="This job isn't available"
        description="It may have been removed or reassigned."
        ctaLabel="Go back"
        ctaVariant="secondary"
        onPressCta={onBack}
      />
    </View>
  );
}

type FailedProps = { message: string; onRetry: () => void };

/** Fetch failed with no prior detail to keep on screen. */
export function FailedView({ message, onRetry }: FailedProps) {
  return (
    <View style={styles.centered}>
      <InlineError message={message} />
      <Button variant="secondary" size="md" onPress={onRetry}>
        Retry
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
});
