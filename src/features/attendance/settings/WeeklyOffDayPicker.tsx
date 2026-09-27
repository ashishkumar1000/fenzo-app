/**
 * WeeklyOffDayPicker — 7 pill row (Mon..Sun) for selecting weekly-off days
 * (Story 15-6). Mirrors the Fenzit DS day-pill pattern (radius.pill +
 * typography.heading); selection state is owned by the parent.
 *
 * Accessibility floor (UX-DR):
 *   - Every pill carries a full accessible label ("Sunday"), NOT just the
 *     visible glyph — the two S's and two T's must never share an a11y label.
 *   - The pills are CHECKBOXES in a labelled group (15-6 review): the
 *     control is genuinely multi-select (any combination of days), so
 *     radio/radiogroup semantics announced it as single-select. Each pill
 *     carries `accessibilityState={{ checked }}`, which is how the selected
 *     state is announced ("Sunday, checkbox, checked" — the UX-DR's
 *     "Sunday, selected" in AT vocabulary); the group View carries the
 *     "Days off" label so the seven read as one widget.
 *   - The full day-of-week name comes from a hoisted module formatter
 *     anchored to `timeZone: 'UTC'` (15-6 review iteration 1: formatting a
 *     UTC instant WITHOUT that option lets the device zone shift the name —
 *     TZ=America/New_York announced "Sunday" for the Monday pill). The
 *     formatter is built once per module load, wrapped in try/catch with a
 *     hardcoded English fallback (Hermes ships incomplete Intl on some
 *     builds — see utils/istDate's note), and the unused `locale` param is
 *     gone: the app is hardcoded-English with no i18n layer (the
 *     localization stance is a recorded review deferral).
 *   - 44px tall (touch.min floor; the calendar cells are the only stated
 *     exception in the attendance module).
 *
 * "All 7 selected" gate: surfaced as a sibling text (the parent renders
 * the inline rule). The picker itself never blocks a tap — the parent's
 * `onChange` decides whether to disable Save.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography, touch } from '../../../theme';
import type { IsoWeekday } from '../../../services';

export const WEEKLY_OFF_DAY_LETTERS: Record<IsoWeekday, string> = {
  1: 'M',
  2: 'T',
  3: 'W',
  4: 'T',
  5: 'F',
  6: 'S',
  7: 'S',
};

/** Stable ordering for the row: Mon=1 .. Sun=7. */
export const WEEKLY_OFF_DAY_ORDER: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export type WeeklyOffDayPickerProps = {
  /** Selected ISO weekdays (1..7). */
  value: IsoWeekday[];
  onChange: (next: IsoWeekday[]) => void;
  /** Disables all pills (e.g. while a save is in flight). */
  disabled?: boolean;
};

const DAY_NAME_FALLBACK: Record<IsoWeekday, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

// Built once, not per pill per render; the instant is UTC-anchored AND the
// format is pinned to UTC, so the device zone can never shift the name.
const weekdayNames = (() => {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      timeZone: 'UTC',
    });
    return (day: IsoWeekday): string =>
      fmt.format(new Date(Date.UTC(2026, 0, 5) + (day - 1) * 86400000));
  } catch {
    // Hermes builds with incomplete Intl (or a thrown constructor): the
    // hardcoded English map is the answer, unchanged.
    return (day: IsoWeekday): string => DAY_NAME_FALLBACK[day];
  }
})();

/** Full day-of-week name for one ISO weekday — timezone-independent. */
export function weeklyOffDayName(day: IsoWeekday): string {
  return weekdayNames(day);
}

export function WeeklyOffDayPicker({
  value,
  onChange,
  disabled,
}: WeeklyOffDayPickerProps) {
  const selected = new Set<IsoWeekday>(value);
  const toggle = (day: IsoWeekday) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    // Sort ascending so the PUT body matches the canonical `[1, 2, …]`
    // shape — the BE CHECKs uniqueness + range but the FE keeps the wire
    // format deterministic for diffs.
    onChange(WEEKLY_OFF_DAY_ORDER.filter((d) => next.has(d)));
  };

  return (
    <View
      style={styles.row}
      accessibilityRole="group"
      accessibilityLabel="Days off">
      {WEEKLY_OFF_DAY_ORDER.map((day) => {
        const isSelected = selected.has(day);
        const longName = weeklyOffDayName(day);
        return (
          <Pressable
            key={day}
            accessibilityRole="checkbox"
            accessibilityLabel={longName}
            accessibilityState={{ checked: isSelected }}
            disabled={disabled}
            onPress={() => toggle(day)}
            style={({ pressed }) => [
              styles.pill,
              isSelected && styles.pillSelected,
              pressed && !disabled && styles.pillPressed,
            ]}>
            <Text
              style={[
                styles.pillLabel,
                isSelected && styles.pillLabelSelected,
              ]}>
              {WEEKLY_OFF_DAY_LETTERS[day]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const PILL_SIZE = touch.min;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
  },
  pill: {
    flex: 1,
    height: PILL_SIZE,
    minWidth: PILL_SIZE,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillPressed: {
    opacity: 0.85,
  },
  pillLabel: {
    ...typography.heading,
    color: colors.textStrong,
  },
  pillLabelSelected: {
    color: colors.onPrimary,
  },
});
