/**
 * WeeklyOffStep — wizard step 3 (Story 15-8). Shows the SAVED canonical
 * tenant default (the GET result — the Sunday preselection on the weekly
 * off screen is visual-only and never counts); "Set weekly off" pushes
 * `AttendanceWeeklyOff` where the save lives. Step 3 is NOT skippable:
 * the footer's Continue gate requires `defaultDays !== null` (the model's
 * caption "Save your default weekly off first.").
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { Button, Card, Eyebrow, InlineError } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { ApiError, IsoWeekday } from '../../../services';
import { describeDays } from '../settings/weeklyOffModel';

type Props = {
  /** The saved default's days, or null when no default exists server-side
   *  (never configured, or explicitly cleared). */
  defaultDays: IsoWeekday[] | null;
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onManageWeeklyOff: () => void;
};

export function WeeklyOffStep({
  defaultDays,
  isLoading,
  hasLoaded,
  error,
  onRetry,
  onManageWeeklyOff,
}: Props) {
  if (isLoading && !hasLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && !hasLoaded) {
    return (
      <View style={styles.stack}>
        <InlineError message="Couldn't load your weekly off. Check your connection and try again." />
        <Button variant="secondary" onPress={onRetry}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <Card padding="md">
        <Eyebrow>Default weekly off</Eyebrow>
        <Text style={styles.days} accessibilityLabel="Default weekly off days">
          {defaultDays === null ? 'Not set yet' : describeDays(defaultDays)}
        </Text>
        <Text style={styles.helper}>
          {defaultDays === null
            ? 'Pick the days your team is off each week — everyone works the rest.'
            : 'Everyone works the other days. Individual overrides can be set per employee later.'}
        </Text>
      </Card>
      <Button
        variant="secondary"
        leadingIcon={
          <CalendarDays size={16} color={colors.primary} strokeWidth={2} />
        }
        onPress={onManageWeeklyOff}>
        Set weekly off
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.s3,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  days: {
    ...typography.title,
    color: colors.textStrong,
    marginTop: spacing.s2,
  },
  helper: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s2,
  },
});
