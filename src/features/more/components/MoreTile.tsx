/**
 * MoreTile — square stat tile used in the 2-up grid at the top of More
 * (Technicians, Notifications). Composes Card. Pass `onPress` to make it
 * tappable (the Card then gets press feedback).
 *
 * Pass `inactive` for a feature that exists in the UI but isn't available
 * yet: greyed text on a sunken surface, so it reads as not-yet rather than
 * broken.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';

type Props = {
  icon: ReactNode;
  iconBg: string;
  title: string;
  /** Omit when there's no real figure to show — the tile renders title-only. */
  subtitle?: string;
  /** Greys the tile out — for not-yet-available features. */
  inactive?: boolean;
  size: number;
  onPress?: () => void;
};

export function MoreTile({
  icon,
  iconBg,
  title,
  subtitle,
  inactive = false,
  size,
  onPress,
}: Props) {
  // `inactive` wins over `onPress`: a tile that looks disabled must not animate
  // or navigate, even if a caller passes both.
  const isTappable = Boolean(onPress) && !inactive;

  return (
    <Card
      padding="md"
      interactive={isTappable}
      onPress={isTappable ? onPress : undefined}
      elevated={!inactive}
      accessibilityState={inactive ? { disabled: true } : undefined}
      style={[
        styles.tile,
        { width: size, height: size },
        inactive && styles.tileInactive,
      ]}>
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>{icon}</View>
      <Text
        style={[styles.title, inactive && styles.titleInactive]}
        numberOfLines={1}>
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
  tileInactive: {
    backgroundColor: colors.surfaceSunken,
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
  titleInactive: {
    // gray500 on the sunken gray100 surface — 22px semibold counts as large
    // text, so this clears the 3:1 contrast floor.
    color: colors.textMuted,
  },
  subtitle: {
    // Stays textMuted even when inactive: textDisabled (gray400) on the sunken
    // surface is ~2.3:1, well under the 4.5:1 that 14px text needs.
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
