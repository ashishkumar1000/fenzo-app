/**
 * HistoryRow — one job in a customer's history list. Card md: jobNumber with
 * its status Badge on the right, then date and service-type meta rows.
 *
 * Always pressable: BE 2-4 guarantees the row's `id`, and that id is what a
 * tap navigates to `JobDetail` with. Dumb by design: props in, UI out.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Calendar, Droplet, Snowflake, Wrench } from 'lucide-react-native';
import { Badge, Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { serviceTypeLabel, serviceTypeToIcon, statusToBadge } from '../../jobs/format';
import type { JobHistoryItem } from '../../../services';

/** Badge labels — the one title-case exception in the design system. */
const STATUS_LABEL = {
  done: 'Done',
  progress: 'In Progress',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
} as const;

const SERVICE_ICON = {
  wrench: Wrench,
  droplet: Droplet,
  snowflake: Snowflake,
} as const;

type Props = {
  item: JobHistoryItem;
  onPress: (item: JobHistoryItem) => void;
};

export function HistoryRow({ item, onPress }: Props) {
  const badgeStatus = statusToBadge(item.status);
  const ServiceIcon = SERVICE_ICON[serviceTypeToIcon(item.serviceType)];

  return (
    <Card padding="md" interactive onPress={() => onPress(item)} style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.jobNumber} numberOfLines={1}>
          {item.jobNumber}
        </Text>
        <Badge status={badgeStatus} size="sm">
          {STATUS_LABEL[badgeStatus] ?? item.status}
        </Badge>
      </View>
      <View style={styles.metaRow}>
        <Calendar size={15} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.metaText} numberOfLines={1}>
          {dateLine(item.scheduledStart)}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <ServiceIcon size={15} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.metaText} numberOfLines={1}>
          {serviceTypeLabel(item.serviceType)}
        </Text>
      </View>
    </Card>
  );
}

/** "12 Aug 2026" (spec §15). Unparseable input → raw. */
function dateLine(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jobNumber: {
    ...typography.bodyStrong,
    color: colors.textStrong,
    flex: 1,
    marginRight: spacing.s2,
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
});