/**
 * AttendanceSummaryView.tsx — the "Shift & location policy" card
 * (Stories 15-10 / 19 redraw 2026-10): the same Office / Timings /
 * Late cut-off / Weekly offs facts rendered as icon rows with right-side
 * chips (rows + chips derive in `attendanceMeModel.buildPolicyRows`).
 * Pure presentation around the tri-state contract — a first-load shimmer
 * (the summary-shaped Skeleton); blocking error + Retry when there is
 * nothing to show; InlineError over live rows when a refetch failed
 * (the InlineError docblock's exact "stale" case).
 */
import { StyleSheet, Text, View } from 'react-native';
import {
  Building2,
  CalendarDays,
  Clock,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  InlineError,
  Skeleton,
} from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { buildPolicyRows } from './attendanceMeModel';
import type { PolicyRow } from './attendanceMeModel';
import type { AttendanceSummaryState } from './useAttendanceSummary';

type Props = {
  state: AttendanceSummaryState;
  onRetry: () => void;
  /** 2026-10 — the LeaveApply policy sheet embeds this view under its own
   *  sheet title, so the card's head row (title + "Active rule" badge)
   *  would duplicate the heading. `embedded` drops the head row and keeps
   *  the rows verbatim. Default false — the tab card keeps its head. */
  embedded?: boolean;
};

/** One row's icon + tint family (the DESIGN.md row-tint vocabulary —
 *  soft-bg tiles; amber belongs to the late grace, blue to the off day). */
const ROW_ICONS: Record<
  PolicyRow['key'],
  { icon: LucideIcon; bg: string; fg: string }
> = {
  office: { icon: Building2, bg: colors.status.neutral.bg, fg: colors.status.neutral.solid },
  timings: { icon: Clock, bg: colors.status.neutral.bg, fg: colors.status.neutral.solid },
  cutOff: { icon: TriangleAlert, bg: colors.status.checkoutMissing.bg, fg: colors.status.checkoutMissing.solid },
  weekly: { icon: CalendarDays, bg: colors.status.leave.bg, fg: colors.status.leave.solid },
};

export function AttendanceSummaryView({ state, onRetry, embedded = false }: Props) {
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
  const rows = buildPolicyRows(state.summary);
  return (
    <View style={styles.wrap}>
      {state.isStale && state.summary !== null && (
        <InlineError message="Couldn't refresh just now — these details may be out of date." />
      )}
      <Card style={styles.card}>
        {embedded ? null : (
          <View style={styles.head}>
            <Text style={styles.headTitle} maxFontSizeMultiplier={1.4}>
              Shift &amp; location policy
            </Text>
            <Badge status="progress" size="sm">
              Active rule
            </Badge>
          </View>
        )}
        {rows.map((row, i) => {
          const tune = ROW_ICONS[row.key];
          const RowIcon = tune.icon;
          return (
            <View
              key={row.key}
              style={[styles.row, i > 0 && styles.rowDivided]}>
              <View style={[styles.rowIcon, { backgroundColor: tune.bg }]}>
                <RowIcon size={18} color={tune.fg} strokeWidth={2} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue} maxFontSizeMultiplier={1.4}>
                  {row.value}
                </Text>
              </View>
              {row.chip !== null ? (
                <Badge
                  status={row.key === 'cutOff' ? 'checkoutMissing' : row.key === 'weekly' ? 'leave' : 'neutral'}
                  size="sm">
                  {row.chip}
                </Badge>
              ) : null}
            </View>
          );
        })}
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
    gap: spacing.s2,
    borderRadius: radius.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingBottom: spacing.s2,
  },
  headTitle: {
    ...typography.eyebrow,
    color: colors.textStrong,
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s2,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowLabel: {
    ...typography.eyebrow,
  },
  rowValue: {
    ...typography.bodyStrong,
  },
  errorWrap: {
    gap: spacing.s3,
  },
});