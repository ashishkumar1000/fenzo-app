/**
 * WeeklyOffOverridesSection — the per-employee override list of
 * `WeeklyOffScreen` (Story 15-6, FR-19): header row with the "+ Add
 * override" CTA, plus the loading / error / empty / list states.
 *
 * Owns its OWN fetch states (15-6 review P10): the default block's fetch is
 * independent, so a failed default first-load must not hide this section,
 * and a failed overrides first-load shows error + Retry here — not the
 * empty-state copy, which would claim "everyone follows the tenant default"
 * about data the screen never received.
 *
 * Each row surfaces the override's scheduled future edit (`next`) in the
 * same shape as the default block's Upcoming-changes panel (15-6 review
 * P12): "From {date}: {days}" — otherwise a rescheduled override is
 * invisible and looks like the row is lying about the employee's days.
 *
 * Presentational only — the screen owns the hooks and the sheet wiring.
 * Split out to keep `WeeklyOffScreen.tsx` under the ~300-line file limit.
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { UserPlus } from 'lucide-react-native';
import {
  Button,
  Card,
  Eyebrow,
  InlineError,
  InlineNotice,
} from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { WeeklyOffOverrideResponse } from '../../../services';
import { describeDays, formatLongDate, viewDays } from './weeklyOffModel';

export type WeeklyOffOverridesSectionProps = {
  overrides: WeeklyOffOverrideResponse[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: unknown;
  /** Re-runs the overrides fetch (the first-load error's Retry). */
  onRetry: () => void;
  /** Owner has no employees yet — the CTA is disabled. */
  addDisabled: boolean;
  /**
   * Why the CTA is disabled, shown right under the header so the owner
   * never meets a dead button without an explanation. Null/undefined when
   * the CTA is enabled.
   */
  addDisabledReason?: string | null;
  onAdd: () => void;
  onEdit: (override: WeeklyOffOverrideResponse) => void;
};

export function WeeklyOffOverridesSection({
  overrides,
  isLoading,
  hasLoaded,
  error,
  onRetry,
  addDisabled,
  addDisabledReason,
  onAdd,
  onEdit,
}: WeeklyOffOverridesSectionProps) {
  return (
    <>
      <View style={styles.header}>
        <Eyebrow>Employee-wise weekly off</Eyebrow>
        <Button
          variant="ghost"
          size="sm"
          onPress={onAdd}
          leadingIcon={
            <UserPlus size={16} color={colors.primary} strokeWidth={2} />
          }
          disabled={addDisabled}>
          Set weekly off
        </Button>
      </View>

      {/* The gate's reason as an amber notice (device-check 2026-09-27):
          a dead CTA must explain itself, and plainly enough for a
          non-technical owner — copy-only, no icon. */}
      {addDisabled && addDisabledReason ? (
        <InlineNotice tone="info" icon={null} message={addDisabledReason} />
      ) : null}

      {error && hasLoaded ? (
        <View style={styles.staleError}>
          <InlineError message="Couldn't refresh overrides. Showing the last loaded list." />
          {/* The rows on screen are stale — offer the re-fetch right here
              instead of forcing a leave-and-return to recover (the same
              affordance the holidays list carries; 15-6 review iteration 1). */}
          <Button variant="secondary" size="sm" onPress={onRetry}>
            Retry
          </Button>
        </View>
      ) : null}

      {isLoading && !hasLoaded ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !hasLoaded && error ? (
        <View style={styles.firstLoadError}>
          <InlineError message="Couldn't load overrides. Check your connection and try again." />
          <Button variant="secondary" onPress={onRetry}>
            Retry
          </Button>
        </View>
      ) : !hasLoaded ? (
        // Not loading, no error, nothing loaded yet — the first fetch has
        // not produced a result. Render nothing rather than an empty state
        // the data cannot back.
        null
      ) : overrides.length === 0 ? (
        <Text style={styles.emptyText}>
          No employee-wise weekly offs yet. Everyone follows the tenant default
          above.
        </Text>
      ) : (
        overrides.map((o) => (
          <OverrideRow key={o.employeeId} override={o} onPress={() => onEdit(o)} />
        ))
      )}
    </>
  );
}

/** One employee with an override — avatar initial, name, day subtitle, Edit. */
function OverrideRow({
  override,
  onPress,
}: {
  override: WeeklyOffOverrideResponse;
  onPress: () => void;
}) {
  const subtitle = describeDays(viewDays(override.current));
  // The scheduled future edit, in the default block's Upcoming shape.
  const next = override.next;
  return (
    <Card padding="none">
      <View style={styles.rowPress}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>
            {(override.employeeName || '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.rowTexts}>
          <Text style={styles.rowName}>{override.employeeName}</Text>
          <Text style={styles.rowMeta}>{subtitle}</Text>
          {next ? (
            <Text style={styles.rowUpcoming}>
              {`From ${formatLongDate(next.validFrom)}: ${describeDays(next.days)}`}
            </Text>
          ) : null}
        </View>
        <Button variant="secondary" size="sm" onPress={onPress}>
          Edit
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.s4,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s8,
  },
  firstLoadError: {
    gap: spacing.s3,
  },
  staleError: {
    gap: spacing.s3,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.s4,
  },
  rowPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
    borderRadius: radius.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...typography.heading,
    color: colors.primary,
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    ...typography.heading,
    color: colors.textStrong,
  },
  rowMeta: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  rowUpcoming: {
    ...typography.bodySm,
    color: colors.textBody,
  },
});
