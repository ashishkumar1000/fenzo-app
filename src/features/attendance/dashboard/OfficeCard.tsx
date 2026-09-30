/**
 * OfficeCard — one selectable card in the OfficeFilterSheet (Story 19-4,
 * D7; split from OfficeFilterSheet under the ≤300-line rule). White with
 * the family border; selected adds the primary border + soft background.
 * Anatomy (left to right): icon chip, title + subtitle, optional "Active"
 * chip, radio circle.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';

export function OfficeCard({
  leading,
  chipBg,
  title,
  subtitle,
  activeChip = false,
  a11yHint,
  selected,
  onPress,
}: {
  leading: React.ReactNode;
  chipBg: string;
  title: string;
  subtitle?: string;
  /** The green "Active" chip — shown only when someone is checked in at
   *  this office today (never fabricated while stats are unavailable). */
  activeChip?: boolean;
  a11yHint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      accessibilityHint={a11yHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        selected && styles.cardSelected,
      ]}>
      <View style={[styles.chip, { backgroundColor: chipBg }]}>{leading}</View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      {activeChip ? (
        <View style={styles.activeChip}>
          <Text style={styles.activeChipText}>Active</Text>
        </View>
      ) : null}
      {selected ? (
        <View style={styles.radioChecked}>
          <Check size={14} color={colors.onPrimary} strokeWidth={2.5} />
        </View>
      ) : (
        <View style={styles.radioEmpty} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: 56,
    padding: spacing.s3,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chip: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardTitle: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  cardSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  activeChip: {
    backgroundColor: colors.status.done.bg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  activeChipText: {
    ...typography.captionStrong,
    color: colors.status.done.fg,
  },
  radioChecked: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
  },
});