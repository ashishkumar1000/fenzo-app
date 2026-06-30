/**
 * JobCard — one row in the Jobs list. Composes Card + Badge + Avatar.
 * Customer name + status badge on top, service description + time below,
 * then a divider and the assigned technician + amount.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Clock, Droplet, Snowflake, Wrench } from 'lucide-react-native';
import { Avatar, Badge, Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { Job } from '../types';

type Props = {
  job: Job;
  onPress?: (job: Job) => void;
};

const STATUS_LABEL: Record<Job['status'], string> = {
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

const formatRupees = (amount: number) =>
  amount > 0 ? `₹${amount.toLocaleString('en-IN')}` : '—';

export function JobCard({ job, onPress }: Props) {
  const ServiceIcon = SERVICE_ICON[job.serviceIcon];

  return (
    <Card
      padding="md"
      interactive={Boolean(onPress)}
      onPress={onPress ? () => onPress(job) : undefined}
      style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.customerName} numberOfLines={1}>
          {job.customerName}
        </Text>
        <Badge status={job.status} dot>
          {STATUS_LABEL[job.status]}
        </Badge>
      </View>

      <View style={styles.metaRow}>
        <ServiceIcon size={15} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.metaText} numberOfLines={1}>
          {job.description}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Clock size={15} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.metaText}>{job.timeLabel}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.footerRow}>
        <View style={styles.techRow}>
          <Avatar name={job.technicianName} size="sm" />
          <Text style={styles.techName} numberOfLines={1}>
            {job.technicianName}
          </Text>
        </View>
        <Text style={styles.amount}>{formatRupees(job.amount)}</Text>
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
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  amount: {
    ...typography.heading,
    color: colors.textStrong,
  },
});
