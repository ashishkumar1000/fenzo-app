/**
 * FlagStrip — the dashboard's flag strip card (Story 19-4 D5, the 19-4
 * redesign): a Pressable wrapping a NON-interactive tinted Card (Card
 * doesn't forward accessibilityRole) in the flag's status family from
 * the calendar's own visual tables — the strip is brand-consistent with
 * the flag the owner already knows (verified sources: the
 * DAY_STATUS_VISUALS.checkoutMissing family; the dayFlagVisuals
 * fake_location_attempt row → ShieldAlert + the cancelled family).
 *
 * Anatomy: solid icon square, title (+ the fake-attempt strip's CRITICAL
 * tag), one-line detail (days — the wire has no device identity), the
 * count as a solid round badge, chevron. Renders ALWAYS; the count-0
 * guard is the caller's conditional render (the TodaysJobsSection idiom).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, ShieldAlert } from 'lucide-react-native';
import { Card } from '../../../components/ui';
import { DAY_STATUS_VISUALS } from '../calendar/dayStatusVisual';
import { colors, radius, spacing, touch, typography } from '../../../theme';

export function FlagStrip({
  icon,
  label,
  detail,
  count,
  chip,
  critical,
  onPress,
  a11yLabel,
}: {
  /** The strip's icon element — the calendar's own glyph for this flag. */
  icon: React.ReactNode;
  label: string;
  /** The one-line detail (dashboardModel builds it from the row count). */
  detail: string;
  count: number;
  /** The flag's status family (bg/fg/solid) from the DS status tokens. */
  chip: { bg: string; fg: string; solid: string };
  /** The fake-location strip's severity tag — the only critical strip. */
  critical?: boolean;
  onPress: () => void;
  a11yLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
      <Card padding="md" style={[styles.strip, { backgroundColor: chip.bg }]}>
        <View style={[styles.iconSquare, { backgroundColor: chip.solid }]}>
          {icon}
        </View>
        <View style={styles.texts}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{label}</Text>
            {critical ? (
              <View style={[styles.criticalPill, { borderColor: colors.status.cancelled.border }]}>
                <Text style={[styles.critical, { color: chip.fg }]}>CRITICAL</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.detail}>{detail}</Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: chip.solid }]}>
          <Text style={styles.countText}>{count}</Text>
        </View>
        <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: touch.min + 10,
  },
  iconSquare: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  title: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  criticalPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.s2,
    paddingVertical: 1,
  },
  critical: {
    ...typography.captionStrong,
    letterSpacing: 0.5,
  },
  detail: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  countBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s1,
  },
  countText: {
    ...typography.bodyStrong,
    color: colors.surfaceCard,
  },
});

/** The strips' icon + chip colours — the dashboard's single source so a
 *  flag's family can never drift between the two strip usages. The icon
 *  glyph is the card element itself (the solid square renders it); chips
 *  carry the family's bg/fg for the CRITICAL pill + the tint. */
export const FLAG_STRIP_VISUALS = {
  checkoutMissing: {
    icon: DAY_STATUS_VISUALS.checkout_missing.icon,
    chip: colors.status[DAY_STATUS_VISUALS.checkout_missing.badgeStatus],
  },
  fakeLocationAttempt: {
    icon: ShieldAlert,
    chip: colors.status.cancelled,
  },
};
