/**
 * SegmentedControl — the Design System's single-select segmented control: a
 * sunken track holding equal-width segments, exactly one active. For 2–5
 * short, mutually exclusive options that switch a view instantly (the Apple
 * HIG / Material 3 "segmented button" use case).
 *
 * Not a filter: changing a segment changes *which view you're looking at*
 * (e.g. the Jobs tab's timeline scopes). For filtering a result set, use a
 * filter chip bar (e.g. `StatusFilterBar`) — its soft-tint active state reads
 * as "filter", while this control's raised-card active segment reads as
 * "you are here".
 *
 * Options are caller-supplied `{ value, label }` pairs, so the control stays
 * vocabulary-free — it renders whatever enum the caller owns. `value`s must
 * be unique (they're React keys and the selection identity); 2–5 options.
 *
 * Each segment is a `Pressable` carrying `accessibilityRole="button"` and
 * `accessibilityState.selected` (the same contract as the chip primitives),
 * so screen readers announce the active segment — the raised-card styling
 * alone doesn't. Pressing the already-active segment is a no-op (no
 * redundant `onChange`).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, shadow, spacing, touch, weight } from '../../theme';

export type SegmentOption<V extends string> = { value: V; label: string };

type Props<V extends string> = {
  options: ReadonlyArray<SegmentOption<V>>;
  value: V;
  onChange: (next: V) => void;
};

export function SegmentedControl<V extends string>({ options, value, onChange }: Props<V>) {
  return (
    <View style={styles.track}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            // No-op on the already-active segment: a view switch control
            // shouldn't re-announce a view you're already on (and callers
            // shouldn't get a redundant onChange/refetch).
            onPress={() => {
              if (!active) onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              active ? styles.segmentActive : null,
              pressed ? styles.segmentPressed : null,
            ]}>
            <Text
              numberOfLines={1}
              style={[styles.label, active ? styles.labelActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: spacing.s1,
    gap: spacing.s1,
  },
  segment: {
    // touch.min per segment: each one is an independent tap target and the DS
    // floor for those is 44px (the track is therefore 44 + 2 × s1 = 52 tall).
    flex: 1,
    height: touch.min,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.surfaceCard,
    ...shadow.sm,
  },
  segmentPressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: weight.semibold,
    color: colors.textBody,
  },
  labelActive: {
    color: colors.textStrong,
  },
});
