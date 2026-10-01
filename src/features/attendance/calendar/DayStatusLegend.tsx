/**
 * DayStatusLegend — the "what each mark means" key for the month
 * calendar (added with the 2026-10 My Month screen move). It renders
 * EVERY entry of `DAY_STATUS_VISUALS` — the ONE status→icon/colour table
 * the calendar's cells already read — as soft chips, so the legend can
 * never drift from the glyphs it explains; a table change that adds a
 * status adds a legend chip with it. Read-only, no press, one grouped
 * a11y label.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import {
  DAY_STATUS_VISUALS,
} from './dayStatusVisual';
import type { DayStatusKey } from '../../../services/resources/attendanceDayStatus';

/** The calendar's full wire-vocabulary order — the legend's reading
 *  order mirrors the DESIGN.md StatusBadge table. */
const LEGEND_KEYS = Object.keys(DAY_STATUS_VISUALS) as DayStatusKey[];

export function DayStatusLegend() {
  return (
    <Card padding="md">
      <View style={styles.headRow}>
        <Text accessibilityRole="header" style={styles.headLabel}>
          Day status legend
        </Text>
        {/* The 2026-10 mock's "12 Types" caption — the table's OWN length,
            so a table change re-counts itself. */}
        <Text style={styles.count} maxFontSizeMultiplier={1.6}>
          {`${LEGEND_KEYS.length} Types`}
        </Text>
      </View>
      <View style={styles.chips}>
        {LEGEND_KEYS.map(key => {
          const visual = DAY_STATUS_VISUALS[key];
          const c = colors.status[visual.badgeStatus];
          const Glyph = visual.icon;
          return (
            <View
              key={key}
              style={[styles.chip, { backgroundColor: c.bg, borderColor: c.border }]}>
              <Glyph size={13} color={c.fg} strokeWidth={2.2} />
              <Text
                style={[styles.chipText, { color: c.fg }]}
                maxFontSizeMultiplier={1.6}>
                {visual.label}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as const,
  headLabel: {
    ...typography.eyebrow,
    color: colors.textMuted,
  },
  count: {
    ...typography.caption,
    color: colors.textMuted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
  },
  chipText: {
    ...typography.captionStrong,
    color: colors.textStrong,
  },
});