/**
 * QuickActions — the three tap targets that sit above Today's jobs on Home:
 * New job (primary), Today's jobs, and Customers.
 *
 * Purely presentational: the screen owns navigation and passes the handlers.
 * Each tile is an interactive `Card`, so press feedback and the surface
 * treatment come from the design system rather than being re-styled here.
 *
 * Note the `View` wrapper around each Card: an interactive Card renders its
 * own `Animated.View` on the outside (for the press-scale), so `flex: 1` on
 * the Card's own style would land on the inner Pressable and the three tiles
 * would size to their labels instead of splitting the row evenly. The wrapper
 * owns the flex; the Card stretches to fill it.
 */
import { StyleSheet, Text, View } from 'react-native';
import { ClipboardList, PlusCircle, Users } from 'lucide-react-native';
import { Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';

export type QuickActionsProps = {
  onNewJob: () => void;
  /** Navigates to the Jobs tab on its Today scope — there is no all-time
   * job view to point at since Story 1.5, hence the "Today's jobs" label. */
  onTodayJobs: () => void;
  onCustomers: () => void;
};

const ICON_SIZE = 26;
const ICON_STROKE = 1.75;
/**
 * Labels shrink rather than truncate. "Customers" is the longest and the row
 * splits into thirds, so on a 320px-wide device each tile only has ~64px of
 * inner width — not enough for 14px semibold. Scaling down to 85% (≈12px)
 * covers that; anything wider keeps the full size.
 */
const MIN_FONT_SCALE = 0.85;

export function QuickActions({
  onNewJob,
  onTodayJobs,
  onCustomers,
}: QuickActionsProps) {
  return (
    <View style={styles.row}>
      <View style={styles.tileWrap}>
        <Card
          interactive
          padding="sm"
          onPress={onNewJob}
          style={[styles.tile, styles.primaryTile]}>
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
        <Card interactive padding="sm" onPress={onTodayJobs} style={styles.tile}>
          <ClipboardList
            color={colors.primary}
            size={ICON_SIZE}
            strokeWidth={ICON_STROKE}
          />
          <Text
            style={styles.label}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={MIN_FONT_SCALE}>
            Today's jobs
          </Text>
        </Card>
      </View>

      <View style={styles.tileWrap}>
        <Card interactive padding="sm" onPress={onCustomers} style={styles.tile}>
          <Users
            color={colors.primary}
            size={ICON_SIZE}
            strokeWidth={ICON_STROKE}
          />
          <Text
            style={styles.label}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={MIN_FONT_SCALE}>
            Customers
          </Text>
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
    // Padding is `sm` (12), not `md`: at `md` a 380px screen leaves only 76px
    // of inner width per tile, which clips "Customers".
    // Comfortably past the 44px minimum touch target with padding included.
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
  },
  primaryTile: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  primaryLabel: {
    color: colors.onPrimary,
  },
});
