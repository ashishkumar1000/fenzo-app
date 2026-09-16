import { StyleSheet, Text, View } from 'react-native';
import { Calendar, Clock, MapPin } from 'lucide-react-native';
import { Badge, Card } from '../../../components/ui';
import { colors, palette, radius, spacing, typography, type StatusKey } from '../../../theme';
import type { JobDetail } from '../../../services';
import { formatTimeLabel } from '../../jobs/format';
import { eventStatusKey, resolveEventLabel } from '../eventLabels';

type Props = {
  detail: JobDetail;
  urgent: boolean;
  /** `statusToBadge(detail.status)` — the Badge vocabulary minus neutral. */
  statusBadge: Exclude<StatusKey, 'neutral'> | null;
};

const STATUS_LABEL = {
  done: 'Done',
  progress: 'In Progress',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
} as const;

function dateLine(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function JobHeaderCard({ detail, urgent, statusBadge }: Props) {
  // Latest activity event (the log is oldest-first) as a badge after the
  // status badge — the same label the timeline's last row shows, so the
  // header answers "where is this job right now" at a glance.
  const latestEvent =
    detail.activityLog && detail.activityLog.length > 0
      ? detail.activityLog[detail.activityLog.length - 1]
      : null;

  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.badgeRow}>
        {urgent ? (
          <Badge status="cancelled" tone="soft">
            Urgent
          </Badge>
        ) : null}
        {statusBadge ? (
          <Badge status={statusBadge} dot>
            {STATUS_LABEL[statusBadge] ?? detail.status}
          </Badge>
        ) : null}
        {latestEvent ? (
          <Badge status={eventStatusKey(latestEvent.eventType)} tone="soft">
            {resolveEventLabel(latestEvent.eventType, detail.workflowTemplate)}
          </Badge>
        ) : null}
      </View>

      <Text style={styles.serviceLabel} numberOfLines={1}>
        {detail.skill?.name || 'Service'}
      </Text>

      <View style={styles.metaRow}>
        <Calendar size={15} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.metaText}>{dateLine(detail.scheduledStart)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Clock size={15} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.metaText}>
          {formatTimeLabel(detail.scheduledStart, detail.scheduledEnd)}
        </Text>
      </View>
      {/* Address gets the same bordered-box treatment as the customer
          card's address (border 1 · radius.sm · gray50 ground · city chip).
          The job carries one address string; the city comes from the
          customer, the same source the customer card's chip uses. */}
      <View style={styles.addressBox}>
        <Text style={styles.addressText} numberOfLines={3}>
          {detail.serviceLocation}
        </Text>
        {detail.customer.city ? (
          <View style={styles.cityRow}>
            <Badge
              status="neutral"
              tone="soft"
              size="sm"
              icon={<MapPin size={12} color={colors.status.neutral.fg} />}>
              {detail.customer.city}
            </Badge>
          </View>
        ) : null}
      </View>

      {detail.status === 'in_progress' &&
      detail.currentStepIndex !== null &&
      detail.currentStepIndex !== undefined &&
      detail.workflowTemplate?.steps ? (
        <Text style={styles.progressLine}>
          {`Step ${detail.currentStepIndex + 1} of ${detail.workflowTemplate.steps.length} — ${
            detail.workflowTemplate.steps[detail.currentStepIndex]?.label ?? 'Unknown step'
          }`}
        </Text>
      ) : null}

      {detail.description ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.bodyText}>{detail.description}</Text>
        </>
      ) : null}
      {detail.notesForTechnician ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.notesLabel}>Notes for technician</Text>
          <Text style={styles.bodyText}>{detail.notesForTechnician}</Text>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  serviceLabel: {
    ...typography.heading,
    color: colors.textStrong,
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
  // Same bordered box as the customer card's address: hairline border,
  // radius.sm corners, gray50 ground.
  addressBox: {
    borderWidth: 1,
    borderRadius: radius.sm,
    borderColor: colors.borderSubtle,
    padding: spacing.s2,
    gap: spacing.s2,
    backgroundColor: palette.gray50,
  },
  addressText: {
    ...typography.bodySm,
    color: palette.gray600,
    flex: 1,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  progressLine: {
    ...typography.labelStrong,
    color: colors.status.progress.fg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginTop: spacing.s1,
  },
  bodyText: {
    ...typography.body,
    color: colors.textBody,
  },
  notesLabel: {
    ...typography.label,
    color: colors.textMuted,
  },
});
