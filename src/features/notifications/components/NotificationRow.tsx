/**
 * NotificationRow — one row of the notifications list (Story 3.4).
 *
 * Renders entirely from the notification's denormalized `payload` (Story
 * 3.1's INSERT) plus `createdAt` — never a per-row fetch. Missing or drifted
 * payload fields degrade to generic copy ("Job status updated"), never a
 * blank line or `undefined` (same fallback philosophy as the 3.3 banner).
 *
 * Unread rows carry the primary dot and stronger text; read rows go muted.
 * The whole row is the tap target (≥44px via min-height + padding).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../../theme';
import { relativeTime } from '../../../utils';
import type { ApiNotification } from '../../../services';
import { notificationStepLabel } from '../notificationBannerModel';

/** Generic copy when the payload doesn't carry the three fields. */
const FALLBACK_ROW_TITLE = 'Job status updated';

interface NotificationRowProps {
  notification: ApiNotification;
  onPress: (notification: ApiNotification) => void;
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * "{technician_name} · {job_number}" — the row's title line. A partial
 * payload is not worth a partial sentence: any missing field collapses the
 * whole line to the generic copy (matching `bannerTextFromEvent`'s rule).
 */
export function rowTitle(payload: Record<string, unknown>): string {
  const { job_number: jobNumber, technician_name: technicianName } = payload;
  if (!isText(jobNumber) || !isText(technicianName)) return FALLBACK_ROW_TITLE;
  return `${technicianName} · ${jobNumber}`;
}

export function NotificationRow({ notification, onPress }: NotificationRowProps) {
  const isUnread = notification.readAt === null;
  const title = rowTitle(notification.payload);
  const stepLabel = notificationStepLabel(notification.payload.step);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        `${isUnread ? 'Unread. ' : ''}${title}, ${stepLabel}, ${relativeTime(notification.createdAt)}`
      }
      onPress={() => onPress(notification)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {/* Unread marker column — a fixed-width slot keeps every title
          aligned whether or not the dot is present. */}
      <View style={styles.markerColumn}>
        {isUnread ? <View style={styles.unreadDot} /> : null}
      </View>

      <View style={styles.textColumn}>
        <Text style={[styles.title, isUnread ? styles.titleUnread : null]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {stepLabel}
        </Text>
      </View>

      <Text style={styles.time} numberOfLines={1}>
        {relativeTime(notification.createdAt)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: spacing.s3,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.s3,
  },
  rowPressed: {
    opacity: 0.8,
  },
  markerColumn: {
    width: 10,
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.body,
    color: colors.textMuted,
  },
  titleUnread: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  time: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
