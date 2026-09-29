/**
 * GenericNotificationCard — the event-type registry's fallback card
 * (Story 14-3): one card for a notification row whose event type this
 * build doesn't know. Deliberately inert — NOT pressable, no deep link, no
 * badge, no timeline — so a tap can never touch job UI and a later epic's
 * first new event type renders as readable text, never a broken card.
 *
 * Same card anatomy family as `ReportNotificationCard` (icon + title +
 * message + relative time + unread dot), minus every interactive element.
 */
import { StyleSheet, Text, View, Pressable } from 'react-native';
import type { ReactNode } from 'react';
import { BellRing } from 'lucide-react-native';
import { colors, radius, shadow, spacing, typography } from '../../../theme';
import { relativeTime } from '../../../utils';
import type {
  AttendanceNotificationCardData,
  GenericNotificationCardData,
} from '../notificationEventRegistry';
import type { LeaveNotificationCardData } from '../leaveNotificationModel';

/**
 * `onPress` — Story 15-10: attendance cards render through this component
 * and ARE tappable (the screen's tap guard decides whether the deep link
 * goes anywhere). Without an `onPress` the card stays inert exactly as
 * before — the generic fallback's contract is unchanged.
 *
 * `icon` — Story 17-6: ONE additive optional prop for the leave cards (the
 * D5 table's per-event glyphs); default stays `BellRing`. A prop, not a
 * new shell.
 */
interface GenericNotificationCardProps {
  card:
    | GenericNotificationCardData
    | AttendanceNotificationCardData
    | LeaveNotificationCardData;
  onPress?: () => void;
  /** Replaces the default bell glyph (the leave cards' D5 icon column). */
  icon?: ReactNode;
}

export function GenericNotificationCard({
  card,
  onPress,
  icon,
}: GenericNotificationCardProps) {
  const time = relativeTime(card.latestCreatedAt);

  const body = (
    <>
      {/* Unread marker — the other cards' static primary dot. */}
      {card.isUnread ? <View style={styles.unreadDot} /> : null}

      <View style={styles.header}>
        <View style={styles.iconWrap}>
          {icon ?? (
            <BellRing size={18} color={colors.textStrong} strokeWidth={2} />
          )}
        </View>
        <Text
          style={[styles.title, card.isUnread ? styles.titleUnread : null]}
          numberOfLines={1}>
          {card.title}
        </Text>
      </View>

      {card.message ? (
        <Text style={styles.message} numberOfLines={2}>
          {card.message}
        </Text>
      ) : null}

      <Text style={styles.time}>{time}</Text>
    </>
  );

  // Inert cards render a plain View (the pre-15-10 contract): a Pressable
  // with `disabled` would merge `disabled: true` into accessibilityState and
  // announce every generic card as disabled to screen readers.
  if (!onPress) {
    return (
      <View
        accessibilityLabel={`${card.isUnread ? 'Unread. ' : ''}${card.title}${time ? `, ${time}` : ''}`}
        style={styles.card}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.isUnread ? 'Unread. ' : ''}${card.title}${time ? `, ${time}` : ''}`}
      onPress={onPress}
      style={styles.card}>
      {body}
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
  message: {
    ...typography.bodySm,
    color: colors.textBody,
  },
  time: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
