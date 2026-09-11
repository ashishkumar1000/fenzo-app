import { StyleSheet, Text, View } from 'react-native';
import { Calendar, Clock, MapPin } from 'lucide-react-native';
import { Badge, Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { JobDetail } from '../../../services';
import { formatTimeLabel } from '../../jobs/format';

type Props = {
  detail: JobDetail;
  urgent: boolean;
  statusBadge: string | null;
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
  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.badgeRow}>
        {urgent ? (
          <Badge status="cancelled" tone="soft" size="sm">
            Urgent
          </Badge>
        ) : null}
        {statusBadge ? (
          <Badge status={statusBadge} dot>
            {STATUS_LABEL[statusBadge] ?? detail.status}
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
      <View style={styles.metaRow}>
        <MapPin size={15} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.metaText} numberOfLines={3}>
          {detail.serviceLocation}
        </Text>
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
