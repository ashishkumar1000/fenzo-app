/**
 * QuickActions — the three tap targets at the top of Home's dashboard:
 * New job (primary), Add customer, and Add technician. (The old middle tile,
 * "Today's jobs", was removed on product feedback 2026-09-20 — the owner can
 * reach the same list via the Jobs tab and the "Today & needs attention"
 * section right below.)
 *
 * Purely presentational: the screen owns navigation and passes the handlers.
 * Each tile is an interactive `Card`, so press feedback and the surface
 * treatment come from the design system rather than being re-styled here.
 * The row is also the setup gate: with no technicians, New job disables and
 * Add technician becomes the primary (see `canCreateJob`).
 *
 * The two "add" tiles carry a plain count line (product feedback 2026-09-20)
 * — muted caption text under the label, no chip/badge around it. Hidden at
 * zero: a fresh account has nothing to count yet.
 *
 * The tiles share one `minHeight` sized for the count line, so the row stays
 * level whether the counts are showing or not.
 *
 * Note the `View` wrapper around each Card: an interactive Card renders its
 * own `Animated.View` on the outside (for the press-scale), so `flex: 1` on
 * the Card's own style would land on the inner Pressable and the three tiles
 * would size to their labels instead of splitting the row evenly. The wrapper
 * owns the flex; the Card stretches to fill it.
 */
import { StyleSheet, Text, View } from 'react-native';
import { HardHat, PlusCircle, UserPlus } from 'lucide-react-native';
import { Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';

export type QuickActionsProps = {
  onNewJob: () => void;
  /**
   * False while the account has no technicians — a job must be assigned to
   * someone, so the New job tile disables (Button's 0.5-opacity disabled
   * look) and the Add technician tile takes over as the row's primary.
   */
  canCreateJob: boolean;
  /** Pushes the full-page Add customer form (`returnRouteName: 'Home'`). */
  onAddCustomer: () => void;
  /** Pushes Technicians with its Add sheet already open. */
  onAddTechnician: () => void;
  /** Tenant-wide totals for the count lines (hidden while 0 / omitted). */
  customerCount?: number;
  technicianCount?: number;
};

const ICON_SIZE = 26;
const ICON_STROKE = 1.75;
/**
 * Labels shrink rather than truncate. "Add technician" is the longest and the
 * row splits into thirds, so on a 320px-wide device each tile only has ~64px
 * of inner width — not enough for 14px semibold. Scaling down to 85% (≈12px)
 * covers that; anything wider keeps the full size.
 */
const MIN_FONT_SCALE = 0.85;

export function QuickActions({
  onNewJob,
  canCreateJob,
  onAddCustomer,
  onAddTechnician,
  customerCount = 0,
  technicianCount = 0,
}: QuickActionsProps) {
  return (
    <View style={styles.row}>
      <View style={styles.tileWrap}>
        <Card
          interactive
          padding="sm"
          onPress={onNewJob}
          disabled={!canCreateJob}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreateJob }}
          style={[
            styles.tile,
            styles.primaryTile,
            !canCreateJob && styles.disabledTile,
          ]}>
          <PlusCircle
            color={colors.onPrimary}
            size={ICON_SIZE}
            strokeWidth={ICON_STROKE}
          />
          <Text
            style={[styles.label, styles.primaryLabel]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={MIN_FONT_SCALE}>
            New job
          </Text>
        </Card>
      </View>

      <View style={styles.tileWrap}>
        <Card
          interactive
          padding="sm"
          onPress={onAddCustomer}
          accessibilityRole="button"
          style={styles.tile}>
          <UserPlus
            color={colors.primary}
            size={ICON_SIZE}
            strokeWidth={ICON_STROKE}
          />
          <Text
            style={styles.label}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={MIN_FONT_SCALE}>
            Add customer
          </Text>
          {customerCount > 0 ? (
            <Text
              style={styles.countText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={MIN_FONT_SCALE}>
              {customerCount} total
            </Text>
          ) : null}
        </Card>
      </View>

      <View style={styles.tileWrap}>
        {/* Takes the primary treatment while New job is gated — the row
            always offers exactly one next action. */}
        <Card
          interactive
          padding="sm"
          onPress={onAddTechnician}
          accessibilityRole="button"
          style={[styles.tile, !canCreateJob && styles.primaryTile]}>
          <HardHat
            color={canCreateJob ? colors.primary : colors.onPrimary}
            size={ICON_SIZE}
            strokeWidth={ICON_STROKE}
          />
          <Text
            style={[styles.label, !canCreateJob && styles.primaryLabel]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={MIN_FONT_SCALE}>
            Add technician
          </Text>
          {technicianCount > 0 ? (
            <Text
              style={styles.countText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={MIN_FONT_SCALE}>
              {technicianCount} total
            </Text>
          ) : null}
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  tileWrap: {
    flex: 1,
  },
  tile: {
    // Padding is `sm` (12), not `md`: at `md` a 380px screen leaves too little
    // inner width per tile, which clips "Add technician".
    // Shared by all three tiles and sized for the count line (icon 26 + gap 8
    // + label ~18 + gap 8 + caption ~16 + padding 24 ≈ 100, plus 4px headroom
    // so the row stays level whether the counts are showing or not.
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
  },
  primaryTile: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  // Matches Button's disabled treatment (opacity 0.5) — the filled tile dims
  // in place instead of changing palette.
  disabledTile: {
    opacity: 0.5,
  },
  label: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  primaryLabel: {
    color: colors.onPrimary,
  },
  countText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
