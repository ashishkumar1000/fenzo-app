/**
 * ScopeSelector — the Design System's single-select chip row (what the web
 * system would call a segmented control). One active selection, always
 * visible; the Jobs tab uses it for its timeline scopes
 * (Today · Upcoming · Overdue · History, Story 1.5).
 *
 * Options are caller-supplied `{ value, label }` pairs, so the control stays
 * vocabulary-free — it renders whatever enum the caller owns.
 *
 * Each chip is a `Pressable` carrying `accessibilityRole="button"` and
 * `accessibilityState.selected` (mirrors `StatusFilterBar`), so screen
 * readers announce the active scope — colour alone doesn't.
 */
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, fontSize, radius, spacing, touch, weight } from '../../theme';

export type ScopeOption<V extends string> = { value: V; label: string };

type Props<V extends string> = {
  options: ReadonlyArray<ScopeOption<V>>;
  value: V;
  onChange: (next: V) => void;
};

export function ScopeSelector<V extends string>({ options, value, onChange }: Props<V>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.chip,
              active ? styles.chipActive : null,
              pressed ? styles.chipPressed : null,
            ]}>
            <Text style={[styles.label, active ? styles.labelActive : null]}>
              {option.label}
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
