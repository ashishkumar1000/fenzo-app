/**
 * PresentCard — the dashboard's sixth tile (19-4 redesign): the present
 * share of today's workforce as a progress line. Honest labelling: the
 * card's refresh behaviour is the screen's refetch-per-appearance, so the
 * header says "Updates automatically" — no claim of a background push feed
 * (the caption names the number's meaning; the percent is derivable
 * FE-side from the BE's own counts — no second source).
 *
 * The share is `checkedInPct` (dashboardModel) rounded to a whole percent
 * — the same number the Checked-in pill shows, one source.
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../../theme';

export function PresentCard({
  pct,
  width,
}: {
  pct: number;
  width: number;
}) {
  // The MODEL deliberately exposes an unclamped pct (drift detection) —
  // clamping belongs here, one layer up: the bar clamps AND the caption
  // + a11y label too, so a drifted envelope can never read as
  // "200% workforce present today".
  const shown = Math.min(100, Math.max(0, pct));
  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={styles.pulseDot} />
          <Text style={styles.title}>Updates automatically</Text>
        </View>
      </View>
      <View
        style={styles.track}
        accessibilityLabel={`Updates automatically: ${shown}% workforce present today`}
        accessibilityRole="progressbar">
        <View style={[styles.fill, { width: `${shown}%` }]} />
      </View>
      <Text style={styles.caption}>{shown}% workforce present today</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xl,
    padding: spacing.s4,
    gap: spacing.s2,
    minHeight: 158,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s2,
  },
  headLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  caption: {
    ...typography.body,
    color: colors.textBody,
  },
});
