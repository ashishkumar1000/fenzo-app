/**
 * MoreTile — square stat tile used in the 2-up grid at the top of More
 * (Technicians, Notifications). Composes Card. Pass `onPress` to make it
 * tappable (the Card then gets press feedback).
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';

type Props = {
  icon: ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  size: number;
  onPress?: () => void;
};

export function MoreTile({ icon, iconBg, title, subtitle, size, onPress }: Props) {
  return (
    <Card
      padding="md"
      interactive={Boolean(onPress)}
      onPress={onPress}
      style={[styles.tile, { width: size, height: size }]}>
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: {
    gap: spacing.s2,
    justifyContent: 'center',
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
