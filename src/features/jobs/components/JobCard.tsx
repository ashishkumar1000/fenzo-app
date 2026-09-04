/**
 * JobCard — one row in the Jobs list. Composes Card + Badge + Avatar.
 *
 * Renders `ApiJob` directly: names are passed in as props (list rows carry
 * only ids — the screen resolves them from the customers store and roster),
 * and every other piece comes from the formatter layer in `format.ts`.
 * Header: title + status badge (with an Urgent marker when applicable) ·
 * meta rows: service + time · footer: the assigned technician. No amount —
 * jobs don't carry one.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Clock, Droplet, Snowflake, Wrench } from 'lucide-react-native';
import { Avatar, Badge, Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { StatusKey } from '../../../theme';
import { daysOverdue, formatIstDateLabel } from '../../../utils';
import type { ApiJob, JobScope } from '../types';
import { formatTimeLabel, serviceTypeLabel, serviceTypeToIcon, statusToBadge } from '../format';

type Props = {
  job: ApiJob;
  /**
   * Which timeline scope the row is rendered in — drives the scheduled-time
   * meta row. Defaults to `today`, whose rendering is the original
   * time-only one: the technician screens (`TodayScreen`, `HistoryScreen`)
   * pass nothing and must render byte-identical to before Story 1.5.
   *   upcoming — prefixed with the scheduled IST date (times alone aren't
   *              enough when rows span days).
   *   overdue  — time label plus a neutral "N days overdue" badge (attention,
   *              NOT a status-colour badge competing with the fixed vocabulary).
   *   history  — completion date/time from `completedAt`, or "Cancelled".
   */
  scope?: JobScope;
  /** Resolved customer display name; falls back to the service type label. */
  customerName?: string;
  /** Resolved technician display name; falls back to a neutral placeholder. */
  technicianName?: string;
  onPress?: (job: ApiJob) => void;
};

/** Badge labels — the one title-case exception in the design system. */
const STATUS_LABEL: Record<Exclude<StatusKey, 'neutral'>, string> = {
  done: 'Done',
  progress: 'In Progress',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
};

const SERVICE_ICON = {
  wrench: Wrench,
  droplet: Droplet,
  snowflake: Snowflake,
} as const;

export function JobCard({ job, scope = 'today', customerName, technicianName, onPress }: Props) {
  const badgeStatus = statusToBadge(job.status);
  const ServiceIcon = SERVICE_ICON[serviceTypeToIcon(job.serviceType)];
  const serviceLabel = serviceTypeLabel(job.serviceType);

  // The scheduled-time meta row, per scope. Today keeps the original
  // time-only rendering byte-for-byte. In history, a completed row with a
  // null completedAt falls back to the scheduled slot — unreachable via the
  // current BE payloads (completion stamps completedAt), kept so the row
  // still shows a sensible time if the stamp is ever absent.
  const timeText =
    scope === 'upcoming'
      ? `${formatIstDateLabel(job.scheduledStart)} · ${formatTimeLabel(job.scheduledStart, job.scheduledEnd)}`
      : scope === 'history' && job.status === 'cancelled'
        ? 'Cancelled'
        : scope === 'history' && job.completedAt
          ? `${formatIstDateLabel(job.completedAt)} · ${formatTimeLabel(job.completedAt, null)}`
          : formatTimeLabel(job.scheduledStart, job.scheduledEnd);
  // Only computed in the overdue scope (IST day-diff vs today).
  const overdueDays = scope === 'overdue' ? daysOverdue(job.scheduledStart) : 0;

  return (
    <Card
      padding="md"
      interactive={Boolean(onPress)}
      onPress={onPress ? () => onPress(job) : undefined}
      style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.customerName} numberOfLines={1}>
          {customerName ?? serviceLabel}
        </Text>
        <View style={styles.badgeRow}>
          {job.priority === 'urgent' ? (
            // Urgent borrows the cancelled palette — red communicates urgency
            // without inventing a new status colour.
            <Badge status="cancelled" tone="soft" size="sm">
              Urgent
            </Badge>
          ) : null}
          <Badge status={badgeStatus} dot>
            {STATUS_LABEL[badgeStatus]}
          </Badge>
        </View>
      </View>

      <View style={styles.metaRow}>
        <ServiceIcon size={15} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.metaText} numberOfLines={1}>
          {job.description ?? serviceLabel}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Clock size={15} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.metaText}>{timeText}</Text>
        {scope === 'overdue' ? (
          // Neutral badge on purpose: overdue is an attention marker, not one
          // of the four job statuses — a new colour would break the fixed
          // status vocabulary (DESIGN_SYSTEM.md).
          <Badge status="neutral" tone="soft" size="sm">
            {`${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} overdue`}
          </Badge>
        ) : null}
      </View>

      <View style={styles.divider} />

      <View style={styles.footerRow}>
        <View style={styles.techRow}>
          <Avatar name={technicianName ?? 'Technician'} size="sm" />
          <Text style={styles.techName} numberOfLines={1}>
            {technicianName ?? 'Technician'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  customerName: {
    ...typography.heading,
    color: colors.textStrong,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  metaText: {
    ...typography.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginTop: spacing.s1,
  },
  // Left-aligned now that the amount is gone — the row keeps the Avatar +
  // name pattern for when the technician side omits it (Story 3.1).
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    flex: 1,
  },
  techName: {
    ...typography.bodySm,
    color: colors.textBody,
  },
});