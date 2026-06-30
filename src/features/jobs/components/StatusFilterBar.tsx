/**
 * StatusFilterBar — horizontally scrollable segmented filter chips
 * (All / Scheduled / In Progress / Done). Matches current filter-UI best
 * practice for status lists: a single always-visible chip row, one active
 * selection, no overflow menu needed for this small a set.
 */
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, fontSize, radius, spacing, weight } from '../../../theme';
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
          <TouchableOpacity
            key={filter.value}
            activeOpacity={0.8}
            onPress={() => onChange(filter.value)}
            style={[styles.chip, active ? styles.chipActive : null]}>
            <Text style={[styles.label, active ? styles.labelActive : null]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
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
    height: 36,
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
  label: {
    fontSize: fontSize.sm,
    fontWeight: weight.semibold,
    color: colors.textBody,
  },
  labelActive: {
    color: colors.onPrimary,
  },
});
