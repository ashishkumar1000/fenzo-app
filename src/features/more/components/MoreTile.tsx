/**
 * MoreTile — square stat tile used in the 2-up grid on More
 * (Technicians, Notifications). Composes Card. Pass `onPress` to
 * make it tappable (the Card then gets press feedback and a chevron
 * shows top-right).
 *
 * Every tile here backs a live screen, so there is no `inactive` state —
 * if a future tile fronts a not-yet-available feature, reintroduce the
 * greyed treatment then (see git history for its old styles).
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';

type Props = {
  icon: ReactNode;
  iconBg: string;
  title: string;
  /** Omit when there's no real figure to show — the tile renders title-only. */
  subtitle?: string;
  size: number;
  onPress?: () => void;
};

export function MoreTile({
  icon,
  iconBg,
  title,
  subtitle,
  size,
  onPress,
}: Props) {
  return (
    <Card
      padding="md"
      interactive={Boolean(onPress)}
      onPress={onPress}
      style={[styles.tile, { width: size, height: size }]}>
      <View style={styles.iconRow}>
        <View style={[styles.iconBox, { backgroundColor: iconBg }]}>{icon}</View>
        {onPress ? <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} /> : null}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: {
    gap: spacing.s2,
    justifyContent: 'center',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.heading,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
