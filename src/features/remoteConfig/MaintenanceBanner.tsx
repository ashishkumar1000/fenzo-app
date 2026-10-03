import { Text, View, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

/**
 * Top-of-app banner driven by the `maintenance_banner` config key — empty
 * string means hidden (the shipped default), so this renders nothing until
 * ops puts copy in the DB. Styled as the system's warning hue (the
 * scheduled/pending amber family), the vocabulary the app already uses for
 * "attention, not failure".
 */
export function MaintenanceBanner({ text }: { text: string }) {
  if (!text) return null;
  return (
    <View style={styles.banner} testID="maintenance-banner">
      <Text style={[typography.bodySm, styles.text]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.status.scheduled.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.status.scheduled.border,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
  text: {
    color: colors.status.scheduled.fg,
    textAlign: 'center',
  },
});
