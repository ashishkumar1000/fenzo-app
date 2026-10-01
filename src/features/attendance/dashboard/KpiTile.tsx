/**
 * KpiTile — one dashboard KPI tile (Story 19-4 D4, the 19-4 redesign): a
 * NON-interactive tile (no Pressable in the subtree — the answer can
 * never read as a drill-down that isn't wired yet), big count over the
 * label, one status-family colour per tile.
 *
 * Colour discipline: white tiles carry their family's hue (icon chip,
 * label, corner dot) straight from the DS status families — the Tracked
 * tile alone is the app's primary blue (an in-system hue; a rendered
 * View sheen, no native gradient module). The
 * a11y label carries the pairing ("Tracked: 9"), the visuals carry the
 * rest; the corner dots and sheens are decoration — decorative only,
 * never the sole carrier of a fact.
 */
import { StyleSheet, Text, View } from 'react-native';
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Users,
  XCircle,
} from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';
import type { KpiTileSpec } from './dashboardModel';

type TileKey = KpiTileSpec['key'];

/** One status family per tile — every colour from the DS status tables,
 *  so a tile can never drift from the badges the owner already knows.
 *  (`tracked` is absent — the accent render owns that key.) The Short day
 *  tile (20-2) rides the same family the day sheet's Absent badge uses
 *  (`dayStatusVisual.ts` maps `absent → cancelled / XCircle`) — its rows
 *  ARE engine-graded absent, the tile just answers the owner's "how many
 *  punched in but didn't make a day". */
const TILE_VISUALS: Record<
  Exclude<TileKey, 'tracked'>,
  {
    icon: React.ComponentType<React.PropsWithoutRef<LucideProps>>;
    chipBg: string;
    fg: string;
    dot: string;
    border: string;
  }
> = {
  checkedIn: {
    icon: Check,
    chipBg: colors.status.done.border,
    fg: colors.status.done.fg,
    dot: colors.status.done.solid,
    border: colors.status.done.border,
  },
  notCheckedIn: {
    icon: Clock,
    chipBg: colors.status.neutral.bg,
    fg: colors.status.neutral.fg,
    dot: colors.borderStrong,
    border: colors.borderSubtle,
  },
  shortDay: {
    icon: XCircle,
    chipBg: colors.status.cancelled.bg,
    fg: colors.status.cancelled.fg,
    dot: colors.status.cancelled.solid,
    border: colors.status.cancelled.border,
  },
  late: {
    icon: AlertTriangle,
    chipBg: colors.status.scheduled.bg,
    fg: colors.status.scheduled.fg,
    dot: colors.status.scheduled.solid,
    border: colors.status.scheduled.border,
  },
  onLeave: {
    icon: Calendar,
    chipBg: colors.status.leave.border,
    fg: colors.status.leave.fg,
    dot: colors.status.leave.solid,
    border: colors.borderSubtle,
  },
};

export function KpiTile({ tile, width }: { tile: KpiTileSpec; width: number }) {
  return (
    <View
      style={[styles.tile, { width }]}
      accessibilityLabel={tile.a11yLabel}>
      {tile.key === 'tracked' ?
        <TrackedTile tile={tile} />
      : <FamilyTile tile={tile} />}
    </View>
  );
}

/** The primary-blue accent tile — the only colourful surface on the dashboard
 *  (the answer's headline) with two translucent sheen circles for depth. */
function TrackedTile({ tile }: { tile: KpiTileSpec }) {
  return (
    <View style={[styles.tileInner, styles.trackedTile]}>
      <View style={[styles.sheen, styles.sheenLarge]} />
      <View style={[styles.sheen, styles.sheenSmall]} />
      <View style={styles.trackedChip}>
        <Users size={20} color={colors.onPrimary} strokeWidth={2} />
      </View>
      <Text style={[styles.value, styles.valueOnColor]}>{tile.value}</Text>
      <Text style={[styles.label, styles.labelOnColor]}>{tile.label}</Text>
    </View>
  );
}

/** The four white family tiles: icon chip, corner dot, label row (+ the
 *  checked-in tile's percent pill). */
function FamilyTile({ tile }: { tile: KpiTileSpec }) {
  const visuals =
    TILE_VISUALS[tile.key as Exclude<TileKey, 'tracked'>];
  const Icon = visuals.icon;
  return (
    <View style={[styles.tileInner, { borderColor: visuals.border }]}>
      <View style={[styles.dot, { backgroundColor: visuals.dot }]} />
      <View
        style={[styles.iconChip, { backgroundColor: visuals.chipBg }]}
        accessibilityElementsHidden>
        <Icon size={20} color={visuals.fg} strokeWidth={2} />
      </View>
      <Text style={styles.value}>{tile.value}</Text>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: visualLabel(tile.key) }]}>
          {tile.label}
        </Text>
        {tile.pct !== null ? (
          <View style={[styles.pctPill, { backgroundColor: visuals.chipBg }]}>
            <Text style={[styles.pct, { color: visuals.fg }]}>
              {tile.pct}%
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Label hue per family: the checked-in / short-day / late / on-leave
 *  labels read in their hue (the state word IS the family),
 *  not-checked-in stays neutral. */
function visualLabel(key: TileKey): string {
  switch (key) {
    case 'checkedIn':
      return colors.status.done.fg;
    case 'shortDay':
      return colors.status.cancelled.fg;
    case 'late':
      return colors.status.scheduled.fg;
    case 'onLeave':
      return colors.status.leave.fg;
    default:
      return colors.textMuted;
  }
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 158,
    overflow: 'hidden',
    borderRadius: radius.xl,
  },
  tileInner: {
    flex: 1,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.s4,
    gap: spacing.s3,
  },
  trackedTile: {
    backgroundColor: colors.primary,
    borderWidth: 0,
    borderRadius: radius.xl,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: spacing.s4,
    right: spacing.s4,
    width: 9,
    height: 9,
    borderRadius: radius.pill,
  },
  sheen: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: colors.onPrimarySoft,
  },
  sheenLarge: {
    width: 170,
    height: 170,
    right: -70,
    bottom: -70,
  },
  sheenSmall: {
    width: 96,
    height: 96,
    left: -34,
    top: -34,
    backgroundColor: colors.onPrimaryFaint,
    opacity: 0.35,
  },
  trackedChip: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.onPrimarySoft,
  },
  value: {
    ...typography.display,
    color: colors.textStrong,
  },
  valueOnColor: {
    color: colors.onPrimary,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.textMuted,
    flex: 1,
  },
  labelOnColor: {
    color: colors.onPrimaryFaint,
  },
  pctPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  pct: {
    ...typography.captionStrong,
  },
});
