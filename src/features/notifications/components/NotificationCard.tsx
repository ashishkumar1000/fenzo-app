/**
 * NotificationCard — one job's card in the redesigned notifications list
 * (Story 3.4 redesign). Renders entirely from a `NotificationCardData` the
 * screen derives from the shared store — no per-card fetch.
 *
 * Anatomy (top to bottom): technician avatar + name + job-number pill, a
 * status banner in the step's Fenzit status family (label uppercase), the
 * four-stage timeline derived from the job's own notifications (see
 * `notificationCardModel.ts`), and a "View Job" footer button (same
 * navigate-first contract as the card tap).
 * Unread cards carry the primary dot top-right; the whole card is the tap
 * target (the row-tap deep-link contract lives in the screen).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Avatar, Button } from '../../../components/ui';
import { colors, radius, shadow, spacing, typography } from '../../../theme';
import { relativeTime } from '../../../utils';
import type { NotificationCardData } from '../notificationCardModel';
import { CARD_FALLBACK_TITLE, cardTitle, stepStatusKey } from '../notificationCardModel';
import { notificationStepLabel } from '../notificationBannerModel';
import { StageStepper } from './StageStepper';

interface NotificationCardProps {
  card: NotificationCardData;
  onPress: (card: NotificationCardData) => void;
}

export function NotificationCard({ card, onPress }: NotificationCardProps) {
  const title = cardTitle(card);
  const status = stepStatusKey(card.currentStep);
  const statusColors = colors.status[status];
  // Uppercased in JS, not CSS `textTransform`: RN measures the text BEFORE
  // applying a textTransform, so the wider uppercase render truncates inside
  // a width measured for the mixed-case string (space left over, "COMPLE…").
  const stepLabel = notificationStepLabel(card.currentStep).toUpperCase();
  const time = relativeTime(card.latestCreatedAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.isUnread ? 'Unread. ' : ''}${title}, ${stepLabel}, ${time}`}
      onPress={() => onPress(card)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      {/* Unread marker — a static primary dot (no decorative loops). */}
      {card.isUnread ? <View style={styles.unreadDot} /> : null}

      <View style={styles.header}>
        {/* No name, no avatar — a blank initials circle above the generic
            copy would read as a rendering bug, not a fallback. */}
        {card.technicianName !== null ? <Avatar name={card.technicianName} size="md" /> : null}
        {card.jobNumber !== null && card.technicianName !== null ? (
          <>
            <Text
              style={[styles.title, card.isUnread ? styles.titleUnread : null]}
              numberOfLines={1}>
              {card.technicianName}
            </Text>
            {/* Job number as its own sunken pill (per redesign feedback). */}
            <View style={styles.jobChip}>
              <Text style={styles.jobChipText} numberOfLines={1}>
                {card.jobNumber}
              </Text>
            </View>
          </>
        ) : (
          // Payload drifted — the generic copy replaces the whole title row.
          <View style={styles.headerText}>
            <Text
              style={[styles.title, card.isUnread ? styles.titleUnread : null]}
              numberOfLines={1}>
              {CARD_FALLBACK_TITLE}
            </Text>
          </View>
        )}
      </View>

      {/* Status banner — the step's status family carries the color. */}
      <View style={[styles.banner, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
        <View style={styles.bannerLead}>
          <View style={[styles.bannerDot, { backgroundColor: statusColors.solid }]} />
          <Text numberOfLines={1} style={[styles.bannerLabel, { color: statusColors.fg }]}>
            {stepLabel}
          </Text>
        </View>
        <Text style={[styles.bannerTime, { color: statusColors.fg }]}>{time}</Text>
      </View>

      <StageStepper stages={card.stages} currentColor={statusColors.fg} />

      <Button variant="secondary" size="md" fullWidth onPress={() => onPress(card)}>
        View Job
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
  headerText: {
    flex: 1,
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
  jobChip: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  jobChipText: {
    ...typography.caption,
    fontWeight: '600',
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
});
