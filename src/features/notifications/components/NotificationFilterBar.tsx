/**
 * NotificationFilterBar — the All / Active / Completed chip row on the
 * redesigned notifications screen. Follows the jobs screen's
 * `StatusFilterBar` styling (soft-tint active state — a filter, not
 * navigation; 44px chips; `accessibilityState.selected`), with the counts
 * the reference design shows: each chip labels how many loaded cards match.
 *
 * Unlike `StatusFilterBar` this is a plain wrapping row, not a horizontal
 * ScrollView: three chips always fit, and a horizontal ScrollView's content
 * can drift/clip vertically on iOS (it was caught half-hidden under the
 * header). `flexWrap` also absorbs larger accessibility font sizes.
 *
 * The counts are over the LOADED pages only (client-side filter) — they
 * grow as the user pages in more history; no extra request backs them.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, touch, typography } from '../../../theme';
import type { NotificationFilter } from '../notificationCardModel';

const FILTERS: { value: NotificationFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

type Props = {
  value: NotificationFilter;
  onChange: (next: NotificationFilter) => void;
  /** Loaded-card count per filter, for the chip labels ("All (3)"). */
  counts: Record<NotificationFilter, number>;
};

export function NotificationFilterBar({ value, onChange, counts }: Props) {
  return (
    <View style={styles.row}>
      {FILTERS.map(filter => {
        const active = filter.value === value;
        return (
          <Pressable
            key={filter.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            // The counts are per-JOB cards, not raw notifications — say so.
            accessibilityLabel={`${filter.label}, ${counts[filter.value]} ${counts[filter.value] === 1 ? 'job' : 'jobs'}`}
            onPress={() => onChange(filter.value)}
            style={({ pressed }) => [
              styles.chip,
              active ? styles.chipActive : null,
              pressed ? styles.chipPressed : null,
            ]}>
            <Text style={[styles.label, active ? styles.labelActive : null]}>
              {filter.label} ({counts[filter.value]})
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    // Wrapping row (not a scroll view — see the header comment): vertical
    // padding keeps the pills clear of the header's bottom border; the
    // horizontal padding aligns the first chip with the cards.
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
  chip: {
    // touch.min — the DS floor for always-on-screen tap targets.
    height: touch.min,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.8,
  },
  label: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.textBody,
  },
  labelActive: {
    color: colors.primaryHover,
  },
});
