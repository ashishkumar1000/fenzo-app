/**
 * ReportNotificationCard — one report notification's card on the
 * redesigned notifications list (Epic 12 follow-up). Renders entirely from
 * a `ReportNotificationCardData` (see `reportNotificationModel.ts`) — no
 * per-card fetch.
 *
 * Report notifications point at a REPORT, not a job (the worker inserts
 * them with job_id NULL), so this is deliberately NOT the job card's
 * anatomy: no avatar, no job-number pill, no stage timeline. Instead:
 * title ("Report ready" / "Report failed"), a status banner in the same
 * Fenzit status family the Reports screen's Badge uses (done / cancelled),
 * the friendly message line, and a "View report" footer button that opens
 * the Reports screen (same navigate-first contract as the job card's tap).
 * Unread cards carry the primary dot top-right, like the job card.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import { Button } from '../../../components/ui';
import { colors, radius, shadow, spacing, typography } from '../../../theme';
import { relativeTime } from '../../../utils';
import type { ReportNotificationCardData } from '../reportNotificationModel';

interface ReportNotificationCardProps {
  card: ReportNotificationCardData;
  onPress: (card: ReportNotificationCardData) => void;
}

export function ReportNotificationCard({ card, onPress }: ReportNotificationCardProps) {
  const statusColors = colors.status[card.statusKey];
  const time = relativeTime(card.latestCreatedAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.isUnread ? 'Unread. ' : ''}${card.title}, ${card.statusLabel}, ${time}`}
      onPress={() => onPress(card)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      {/* Unread marker — the job card's static primary dot. */}
      {card.isUnread ? <View style={styles.unreadDot} /> : null}

      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <FileText size={18} color={colors.textStrong} strokeWidth={2} />
        </View>
        <Text
          style={[styles.title, card.isUnread ? styles.titleUnread : null]}
          numberOfLines={1}>
          {card.title}
        </Text>
      </View>

      {/* Status banner — the same family the job card banner uses. */}
      <View
        style={[styles.banner, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
        <View style={styles.bannerLead}>
          <View style={[styles.bannerDot, { backgroundColor: statusColors.solid }]} />
          <Text numberOfLines={1} style={[styles.bannerLabel, { color: statusColors.fg }]}>
            {card.statusLabel}
          </Text>
        </View>
        <Text style={[styles.bannerTime, { color: statusColors.fg }]}>{time}</Text>
      </View>

      <Text style={styles.message} numberOfLines={2}>
        {card.message}
      </Text>

      <Button variant="secondary" size="md" fullWidth onPress={() => onPress(card)}>
        View report
      </Button>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.s4,
    gap: spacing.s3,
    ...shadow.sm,
  },
  cardPressed: {
    opacity: 0.8,
  },
  unreadDot: {
    position: 'absolute',
    top: spacing.s4,
    right: spacing.s4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    // Room for the absolute unread dot at the top-right corner.
    paddingRight: spacing.s4,
    gap: spacing.s3,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.body,
    color: colors.textMuted,
    flexShrink: 1,
  },
  titleUnread: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    gap: spacing.s2,
  },
  bannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bannerLabel: {
    ...typography.caption,
    fontWeight: '700',
    flexShrink: 1,
  },
  bannerTime: {
    ...typography.caption,
  },
  bannerLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    flexShrink: 1,
  },
  message: {
    ...typography.bodySm,
    color: colors.textBody,
  },
});