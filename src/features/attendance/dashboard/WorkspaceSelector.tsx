/**
 * WorkspaceSelector — the dashboard's office-filter card (19-4 redesign):
 * the old bordered Select-look filter field, restyled as the workspace
 * card from the mock — icon chip, "OFFICES" eyebrow, the current
 * selection, and (only while "All offices" is selected) the total number
 * of offices as a Sites pill (the same list the filter sheet offers —
 * no second office source: the sheet keeps its own per-presentation
 * fetch, so a stale pill can never hide a newly added office for long).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Building2, ChevronDown } from 'lucide-react-native';
import { colors, radius, spacing, touch, typography } from '../../../theme';

export function WorkspaceSelector({
  label,
  officesCount,
  onPress,
}: {
  /** The current selection ("All offices" or the office's name). */
  label: string;
  /** The office count — pill only while All offices is selected. */
  officesCount: number | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Filter by office, currently ${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View style={styles.iconChip}>
        <Building2 size={20} color={colors.primary} strokeWidth={2} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.eyebrow}>OFFICES</Text>
        <Text style={styles.selection} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.spacer} />
      {officesCount !== null ? (
        <View style={styles.sitesPill}>
          <Text style={[styles.sitesText, { color: colors.status.leave.fg }]}>
            {officesCount === 1 ? '1 office' : `${officesCount} offices`}
          </Text>
        </View>
      ) : null}
      <ChevronDown size={18} color={colors.textMuted} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: touch.min + 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.status.progress.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    // no gap — the eyebrow sits tight above its selection
  },
  eyebrow: {
    ...typography.captionStrong,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  selection: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  spacer: {
    flex: 1,
  },
  sitesPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.status.progress.bg,
    paddingHorizontal: spacing.s2,
    paddingVertical: 3,
  },
  sitesText: {
    ...typography.captionStrong,
  },
});
