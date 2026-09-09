/**
 * StatusBanner — transient top banner for owner job-status updates
 * (Story 3.3). Pure presentation: the hook owns show/dismiss timing
 * (including replace-and-reset on a newer event), this component only
 * renders the current banner over the navigator. Non-interactive by design —
 * the deep-link tap-through is Story 3.4's scope.
 */
import { Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell } from 'lucide-react-native';
import { colors, radius, shadow, spacing, touch, typography } from '../theme';
import type { OwnerNotificationBanner } from '../features/notifications/useOwnerNotifications';

interface StatusBannerProps {
  /** `null` → render nothing (banner dismissed / no event yet). */
  banner: OwnerNotificationBanner | null;
}

export function StatusBanner({ banner }: StatusBannerProps) {
  const insets = useSafeAreaInsets();

  if (!banner) return null;

  return (
    <View
      pointerEvents="box-none"
      accessibilityRole="alert"
      accessibilityLabel={banner.text}
      style={[styles.banner, { top: insets.top + spacing.s2 }]}>
      <Bell size={16} color={colors.info} />
      <Text style={styles.text} numberOfLines={2}>
        {banner.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: spacing.s3,
    right: spacing.s3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    backgroundColor: colors.surfaceCard,
    borderColor: colors.borderSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    ...shadow.sm,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    minHeight: touch.min,
  },
  text: {
    flex: 1,
    ...typography.body,
    color: colors.textBody,
  },
});
