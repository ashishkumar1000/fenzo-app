/**
 * BannerCard — the redesigned Attendance tab's solid action banners
 * (the 2026-10 tab redesign): "Apply for leave" (success green) and
 * "My month" (brand blue). The mockup's gradient banners render here as
 * FLAT solid surfaces (DESIGN_SYSTEM.md bans gradients): the brand
 * colour carries the card, white ink carries the label — the onPrimary +
 * onPrimarySoft/onPrimaryFaint tints the 19-4 dashboard's Tracked tile
 * already tokenised. One shared component so the two banners never drift.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { colors, fontSize, radius, spacing, touch, typography } from '../../../theme';

type BannerTone = 'success' | 'primary';

const TONE_BG: Record<BannerTone, string> = {
  success: colors.status.done.solid,
  primary: colors.primary,
};

type Props = {
  tone: BannerTone;
  icon: LucideIcon;
  title: string;
  /** The small pill by the title ("Time off", "October"); null = none. */
  chipLabel: string | null;
  subtitle: string;
  onOpen: () => void;
};

export function BannerCard({ tone, icon, title, chipLabel, subtitle, onOpen }: Props) {
  const Icon = icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: TONE_BG[tone] },
        pressed && styles.pressed,
      ]}>
      <View style={styles.iconTile}>
        <Icon size={20} color={colors.onPrimary} strokeWidth={2.2} />
      </View>
      <View style={styles.textCol}>
        <View style={styles.titleRow}>
          <Text style={styles.title} maxFontSizeMultiplier={1.4}>
            {title}
          </Text>
          {chipLabel !== null ? (
            <View style={styles.chip}>
              <Text style={styles.chipText} maxFontSizeMultiplier={1.4}>
                {chipLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.subtitle} maxFontSizeMultiplier={1.6}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.onPrimary} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: touch.large,
    borderRadius: radius.lg,
    padding: spacing.s4,
  },
  pressed: {
    opacity: 0.92,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.onPrimarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: spacing.s1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  title: {
    ...typography.labelStrong,
    fontSize: fontSize.lg,
    color: colors.onPrimary,
  },
  chip: {
    borderRadius: radius.pill,
    backgroundColor: colors.onPrimarySoft,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  chipText: {
    ...typography.captionStrong,
    color: colors.onPrimary,
  },
  subtitle: {
    ...typography.bodySm,
    flex: 1,
    color: colors.onPrimaryFaint,
  },
});