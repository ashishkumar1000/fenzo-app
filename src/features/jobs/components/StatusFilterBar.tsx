/**
 * StatusFilterBar — horizontally scrollable segmented filter chips
 * (All / Scheduled / In Progress / Done). Matches current filter-UI best
 * practice for status lists: a single always-visible chip row, one active
 * selection, no overflow menu needed for this small a set.
 *
 * Each chip is a `Pressable` (consistent with every other control in the app)
 * carrying `accessibilityRole="button"` and `accessibilityState.selected`, so
 * screen readers announce which filter is active — colour alone doesn't.
 */
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, fontSize, radius, spacing, touch, weight } from '../../../theme';
import { JOB_FILTERS } from '../data';
import type { JobFilter } from '../types';

type Props = {
  value: JobFilter;
  onChange: (next: JobFilter) => void;
};

export function StatusFilterBar({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {JOB_FILTERS.map(filter => {
        const active = filter.value === value;
        return (
          <Pressable
            key={filter.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(filter.value)}
            style={({ pressed }) => [
              styles.chip,
              active ? styles.chipActive : null,
              pressed ? styles.chipPressed : null,
            ]}>
            <Text style={[styles.label, active ? styles.labelActive : null]}>
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.s2,
    paddingRight: spacing.s4,
  },
  chip: {
    // touch.min, not a smaller "designed" height: this row is always on screen
    // and the DS floor for tap targets is 44px.
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
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: weight.semibold,
    color: colors.textBody,
  },
  labelActive: {
    color: colors.onPrimary,
  },
});
