/**
 * StatusBanner — transient bottom toast for owner job-status updates
 * (Story 3.3; redesigned 2026-09-09 to the identity-card style: technician
 * avatar + name, job-number chip, colored step chip). Anchored just ABOVE
 * the tab bar (footer) with a bottom margin so the footer stays visible —
 * `layout.bottomNavH` is the tab bar's height token.
 *
 * On-color styling: the card is brand blue, not white — a white card was
 * indistinguishable from the white cards it floats over. Text/chips use
 * on-color tokens; the step chip stays SOFT tone because the solid progress
 * blue would vanish against the blue card (soft pills read on any status).
 *
 * Pure presentation: the hook owns show/dismiss timing (including
 * replace-and-reset on a newer event), this component only renders the
 * current banner over the navigator. Per-field rendering — whatever the
 * event payload lacked is dropped; with no fields at all the generic
 * fallback line renders alone. Non-interactive by design — the deep-link
 * tap-through is Story 3.4's scope.
 */
import { Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './ui/Avatar';
import { Badge } from './ui/Badge';
import { colors, layout, radius, shadow, spacing, typography } from '../theme';
import type { OwnerNotificationBanner } from '../features/notifications/useOwnerNotifications';

interface StatusBannerProps {
  /** `null` → render nothing (banner dismissed / no event yet). */
  banner: OwnerNotificationBanner | null;
}

export function StatusBanner({ banner }: StatusBannerProps) {
  const insets = useSafeAreaInsets();

  if (!banner) return null;

  const technicianName = banner.technicianName;
  const jobNumber = banner.jobNumber;
  const hasName = technicianName !== null;
  const hasJob = jobNumber !== null;
  const hasStep = banner.stepLabel !== null;
  const hasAny = hasName || hasJob || hasStep;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.overlay, { bottom: insets.bottom + layout.bottomNavH + spacing.s2 }]}>
      {/* The card is ONE accessibility element (role alert, composed label):
          without `accessible` a screen reader reads the label and then
          re-reads every fragment inside. `accessibilityLiveRegion` gives
          Android its announcement path on mount. */}
      <View
        style={styles.card}
        testID="status-banner-card"
        accessible
        accessibilityRole="alert"
        accessibilityLabel={banner.text}
        accessibilityLiveRegion="polite">
        {hasName && (
          <View>
            <Avatar name={technicianName} size="sm" variant="onColor" />
            {hasStep && (
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: colors.status[banner.stepStatus].solid },
                ]}
              />
            )}
          </View>
        )}

        <View style={styles.column}>
          {(hasName || hasJob) && (
            <View style={styles.row}>
              {hasName && (
                <Text style={styles.name} numberOfLines={1}>
                  {technicianName}
                </Text>
              )}
              {hasName && hasJob && <View style={styles.separator} />}
              {hasJob && (
                <Badge status="neutral" size="sm" style={styles.jobBadge}>
                  {jobNumber}
                </Badge>
              )}
            </View>
          )}
          {hasStep && (
            <Badge status={banner.stepStatus} size="sm" dot>
              {banner.stepLabel}
            </Badge>
          )}
          {!hasAny && (
            <Text style={styles.fallback} numberOfLines={2}>
              {banner.text}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: spacing.s3,
    right: spacing.s3,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    ...shadow.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
  },
  column: {
    flex: 1,
    gap: spacing.s1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  name: {
    ...typography.labelStrong,
    color: colors.textOnColor,
    flexShrink: 1,
  },
  separator: {
    width: 3,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.textOnColor,
    opacity: 0.6,
  },
  // Lets a long job number shrink (the Badge label truncates) instead of
  // pushing the name to zero width.
  jobBadge: {
    flexShrink: 1,
  },
  statusDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.onPrimary,
  },
  fallback: {
    ...typography.bodySm,
    color: colors.textOnColor,
  },
});