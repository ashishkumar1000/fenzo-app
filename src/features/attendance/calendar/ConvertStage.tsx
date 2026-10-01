/**
 * ConvertStage — the approved-half-day's "Convert to full day" confirm
 * (Story 20-1, ACs 2, 4, 10; the story's locked copy decision), rendered
 * INSIDE DayDetailSheet as a stage morph (never a stacked sheet; the 17-7
 * doctrine). Small presentational block: the plain confirm paragraph under
 * the same day heading (the half-day request will be cancelled and a
 * full-day request put in for the same date — the owner approves it
 * again; the original reason is reused, never re-asked or editable), then
 * the solid-danger "Cancel and send new request" and the "Keep half day" back.
 *
 * The WRITE stays host-owned (the sheet renders the host's submitting /
 * failure state): a partial failure (the apply leg after the cancel leg
 * succeeded) reads the host-composed AC 10 message inline — "your half-day
 * request is already cancelled" under the server's line — and the pressed
 * confirm doubles as the retry (it re-runs cancel — the BE's own-retry
 * answers 200 for a last-cause employee_cancel — then the apply). No
 * separate Retry button: the confirm never disables on an error.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Button, InlineError } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { dayMonthLabel } from './dayDetailModel';

export function ConvertStage(input: {
  workDate: string;
  /** The host write in flight (confirm spins; Keep-half-day disables). */
  submitting: boolean;
  /** The host-composed failure (server verbatim + the already-cancelled
   *  line on a partial failure, AC 10). */
  errorMessage: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { workDate, submitting, errorMessage, onBack, onConfirm } = input;

  return (
    <View style={styles.block}>
      <View
        style={styles.copyCard}
        accessibilityLabel={`Convert to full day. Your half-day request will be cancelled, and a new full-day request will be sent for ${dayMonthLabel(workDate)}. Your owner needs to approve it again. Your reason stays the same.`}>
        <Text style={styles.copyTitle}>Convert to full day</Text>
        <Text style={styles.copyBody}>
          Your half-day request will be cancelled, and a new full-day request
          will be sent for {dayMonthLabel(workDate)}. Your owner needs to
          approve it again. Your reason stays the same.
        </Text>
      </View>

      {errorMessage !== null ? <InlineError message={errorMessage} /> : null}

      <Button
        variant="danger"
        size="lg"
        fullWidth
        onPress={onConfirm}
        loading={submitting}
        disabled={submitting}
        accessibilityState={{ disabled: submitting }}>
        Cancel and send new request
      </Button>
      <Button variant="ghost" size="lg" fullWidth onPress={onBack} disabled={submitting}>
        Keep half day
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.s3,
  },
  copyCard: {
    backgroundColor: colors.surfacePage,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: spacing.s3,
    gap: spacing.s1,
  },
  copyTitle: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  copyBody: {
    ...typography.body,
    color: colors.textBody,
  },
});