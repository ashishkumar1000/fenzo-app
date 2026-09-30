/**
 * DashboardHeader — the 19-4-redesign header bar for the owner dashboard:
 * a chevron back chip, the "Today" title, and a circular Refresh button
 * wired to the screen's refetch (a real control, not chrome — the
 * dashboard is a snapshot the owner can re-pull on demand). The two
 * decorative pills of the mock that the wire cannot honestly support are
 * left out (no realtime feed → no "LIVE"; no date parameter → no calendar
 * pill — the screen IS today).
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, RefreshCw } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';

export function DashboardHeader({
  onBack,
  onRefresh,
  refreshing,
}: {
  onBack: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          style={({ pressed }) => [styles.backChip, pressed && { opacity: 0.7 }]}>
          <ChevronLeft size={22} color={colors.textStrong} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title}>Today</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Refresh"
        accessibilityState={{ busy: refreshing }}
        onPress={onRefresh}
        disabled={refreshing}
        style={({ pressed }) => [
          styles.refresh,
          pressed && { opacity: 0.7 },
          refreshing && { opacity: 0.5 },
        ]}>
        {/* A real spinner while the pull runs — a press with unchanged
            numbers must visibly work (device-feedback finding). */}
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <RefreshCw size={20} color={colors.primary} strokeWidth={2} />
        )}
      </Pressable>
    </View>
  );
}

const CHIP = 44;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
    paddingBottom: spacing.s3,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  backChip: {
    width: CHIP,
    height: CHIP,
    borderRadius: 16,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  refresh: {
    width: CHIP,
    height: CHIP,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
    // CHIP (44) is already touch.min — no dead minHeight alongside it.
    alignItems: 'center',
    justifyContent: 'center',
  },
});
