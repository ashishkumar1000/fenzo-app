/**
 * ReportRow — one history-list row of the Reports screen (story 12-6).
 * A Card composing the design-system Badge (fixed status vocabulary) with
 * the report's title, range, scope and requested-on line.
 *
 * Tapping is meaningful only when the row is `ready` — then it opens the
 * PDF (the screen owns that call). Failed rows are not tappable; their
 * explanation rides in the row as friendly copy (`failedReportCopy`) with a
 * Retry button (story 12-7) that re-queues the SAME row — no duplicate
 * history entry.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '../../../components/ui';
import { Badge } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { ReportListItem } from '../../../services';
import {
  failedReportCopy,
  formatRangeLabel,
  formatRequestedAt,
  statusBadge,
  technicianScopeLabel,
} from '../reportModel';

type Props = {
  item: ReportListItem;
  /** True while this row's presigned-URL fetch + open is in flight. */
  isOpening: boolean;
  /** True while this row's retry POST is in flight (Retry button spins). */
  isRetrying: boolean;
  onPress?: (item: ReportListItem) => void;
  onRetry?: (item: ReportListItem) => void;
};

export function ReportRow({ item, isOpening, isRetrying, onPress, onRetry }: Props) {
  const badge = statusBadge(item.status);
  const ready = item.status === 'ready';
  const failed = item.status === 'failed';

  return (
    <Card
      interactive={ready}
      onPress={ready ? () => onPress?.(item) : undefined}
      style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            Technician job report
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatRangeLabel(item.range.startDate, item.range.endDate)}
            {' · '}
            {technicianScopeLabel(item.technicianCount)}
          </Text>
        </View>
        <Badge status={badge.status} size="sm">
          {isOpening ? 'Opening…' : badge.label}
        </Badge>
      </View>

      {failed ? (
        <View style={styles.failedBlock}>
          <Text style={styles.failedCopy} numberOfLines={2}>
            {failedReportCopy(item.errorCode)}
          </Text>
          <Button
            variant="secondary"
            size="sm"
            loading={isRetrying}
            disabled={isRetrying}
            onPress={() => onRetry?.(item)}
            style={styles.retryButton}>
            Retry
          </Button>
        </View>
      ) : (
        <Text style={styles.requested} numberOfLines={1}>
          Requested {formatRequestedAt(item.createdAt)}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  requested: {
    ...typography.caption,
    color: colors.textMuted,
  },
  failedBlock: {
    gap: spacing.s2,
  },
  failedCopy: {
    ...typography.caption,
    color: colors.status.cancelled.fg,
  },
  // A compact affordance, not a full-width CTA — the row stays a history
  // entry, not a form.
  retryButton: {
    alignSelf: 'flex-start',
  },
});