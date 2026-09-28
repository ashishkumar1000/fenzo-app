/**
 * HolidaysStep — wizard step 4 (Story 15-8). Shows the UPCOMING holidays
 * (today onward) as the in-step summary; "Manage holidays" pushes
 * `AttendanceHolidays` for all editing. Holidays is the ONLY skippable
 * step — the footer's "Skip for now" advances the marker to Employees
 * without any holiday data (15-2 made skipping a FE concern).
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CalendarX2 } from 'lucide-react-native';
import { Button, Card, EmptyState, InlineError } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { ApiError, Holiday } from '../../../services';

/** At most this many upcoming rows render inline — the rest collapse into
 *  a "+N more" line (the full list lives behind Manage holidays). */
const MAX_ROWS = 5;

type Props = {
  holidays: Holiday[];
  /** IST today (YYYY-MM-DD) — the upcoming/upcoming-count cut-off. */
  today: string;
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onManageHolidays: () => void;
};

export function HolidaysStep({
  holidays,
  today,
  isLoading,
  hasLoaded,
  error,
  onRetry,
  onManageHolidays,
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
        <InlineError message="Couldn't load holidays. Check your connection and try again." />
        <Button variant="secondary" onPress={onRetry}>
          Retry
        </Button>
      </View>
    );
  }

  const upcoming = holidays.filter((holiday) => holiday.date >= today);
  const shown = upcoming.slice(0, MAX_ROWS);

  if (upcoming.length === 0) {
    return (
      <View style={styles.stack}>
        <EmptyState
          icon={
            <CalendarX2 size={24} color={colors.primary} strokeWidth={1.5} />
          }
          title="No upcoming holidays"
          description="Holidays are optional — weekly off already covers the regular days off. You can add one-off holidays here or any time later."
          ctaLabel="Manage holidays"
          ctaIcon={<CalendarX2 size={16} color={colors.onPrimary} strokeWidth={2} />}
          onPressCta={onManageHolidays}
        />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <Card padding="md">
        <Text style={styles.count}>
          {upcoming.length === 1
            ? '1 upcoming holiday'
            : `${upcoming.length} upcoming holidays`}
        </Text>
        <View style={styles.rows}>
          {shown.map((holiday) => (
            <View key={holiday.id} style={styles.row}>
              <Text style={styles.rowName} numberOfLines={1}>
                {holiday.name}
              </Text>
              <Text style={styles.rowDate}>{holiday.date}</Text>
            </View>
          ))}
        </View>
        {upcoming.length > shown.length ? (
          <Text style={styles.more}>
            +{upcoming.length - shown.length} more
          </Text>
        ) : null}
      </Card>
      <Button
        variant="secondary"
        leadingIcon={
          <CalendarX2 size={16} color={colors.primary} strokeWidth={2} />
        }
        onPress={onManageHolidays}>
        Manage holidays
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
  count: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textStrong,
    marginBottom: spacing.s2,
  },
  rows: {
    gap: spacing.s2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  rowName: {
    ...typography.body,
    color: colors.textBody,
    flex: 1,
  },
  rowDate: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  more: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s2,
  },
});
