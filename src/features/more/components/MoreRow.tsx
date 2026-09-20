/**
 * MoreRow — full-width list row used in More for entries that don't need a
 * stat tile (Customers, Log out). Composes Card: icon box left, title and
 * optional subtitle, chevron right. Pass `onPress` to make it tappable (the
 * Card then gets press feedback, a chevron and the button role); pass
 * `danger` for the destructive treatment (red icon, label and chevron).
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
  /** Optional second line under the title (e.g. a count). */
  subtitle?: string;
  /** Destructive row — icon and label render in the danger color. */
  danger?: boolean;
  onPress?: () => void;
};

export function MoreRow({ icon, iconBg, title, subtitle, danger = false, onPress }: Props) {
  const accent = danger ? colors.danger : colors.textStrong;

  return (
    <Card
      padding="md"
      interactive={Boolean(onPress)}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      style={styles.row}>
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: accent }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <ChevronRight size={18} color={danger ? colors.danger : colors.textMuted} strokeWidth={2} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.heading,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});