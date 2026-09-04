/**
 * StatusFilterBar — horizontally scrollable segmented filter chips
 * (All / Scheduled / In progress / Done / Cancelled). Matches current
 * filter-UI best practice for status lists: a single always-visible chip row,
 * one active selection, no overflow menu needed for this small a set.
 *
 * Chip values are the API's status enum (so the store can put them straight
 * on the wire); the labels are sentence case — these are controls, not Badge
 * vocabulary.
 *
 * Each chip is a `Pressable` (consistent with every other control in the app)
 * carrying `accessibilityRole="button"` and `accessibilityState.selected`, so
 * screen readers announce which filter is active — colour alone doesn't.
 *
 * Active styling is a soft tint (`primarySoft` bg + primary border), not a
 * solid fill: this is a filter, not navigation. View switching belongs to
 * `SegmentedControl` — that's what keeps the raised/active visual language
 * unambiguous when both rows sit on the same screen.
 */
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, fontSize, radius, spacing, touch, weight } from '../../../theme';
import type { JobFilter } from '../types';

/** Chip values are API status enums; `all` sends no status param. */
const JOB_FILTERS: { value: JobFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

type Props = {
  value: JobFilter;
  onChange: (next: JobFilter) => void;
  /**
   * Which chips to show, in `JOB_FILTERS` order. Defaults to all five —
   * the Today-scope baseline. Scopes where the server pre-narrows status
   * (History) pass a subset (`all` → no status param → both finished
   * statuses; Upcoming/Overdue hide the row entirely — chips there would
   * lie about a status set the caller can't change).
   */
  filters?: JobFilter[];
};

export function StatusFilterBar({ value, onChange, filters }: Props) {
  const shown = filters ? JOB_FILTERS.filter(f => filters.includes(f.value)) : JOB_FILTERS;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {shown.map(filter => {
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
    // Soft tint, not solid primary: this row filters the result set, it
    // doesn't switch views — a filled tint reads as "filter is applied" and
    // keeps solid primary reserved for primary actions (New job). Matches
    // the SegmentedControl/StatusFilterBar hierarchy split (2026-09-04).
    backgroundColor: colors.primarySoft,
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
    color: colors.primaryHover,
  },
});