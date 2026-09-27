/**
 * Calendar — Fenzit Design System's reusable calendar primitive.
 *
 * Wraps `react-native-ui-datepicker` with the Fenzit theme baked in
 * (primary-selected day, muted disabled days, brand outline for today,
 * page background everywhere else). Callers stay in YYYY-MM-DD strings;
 * the internal Date<->string conversion is hidden.
 *
 * Why a wrapper, not the raw library:
 *  - Themed once at the DS layer, so every screen looks the same.
 *  - Stable API (YYYY-MM-DD strings, onChange with a string) hides the
 *    library's `DateType` polymorphism (Date | string | dayjs | null).
 *  - Single-mode by default — range/multiple are not used anywhere yet
 *    (15-6 only needs single-date pick). If a future story needs range,
 *    add a `mode` prop here rather than leaking the library's types.
 *
 * Use this when you need a calendar surface. For a labeled "tap to pick"
 * field that bundles the value, label, helper, error and calendar in one
 * component, use `DatePickerField` (which composes this internally).
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import RNCDateTimePicker, {
  useDefaultStyles,
  type DateType,
} from 'react-native-ui-datepicker';
import { colors, radius, spacing } from '../../theme';

export type CalendarProps = {
  /** Selected date as YYYY-MM-DD. Empty/undefined = no selection. */
  value?: string;
  /** Today's YYYY-MM-DD. Anchors the month view when no value is set (and
   *  is timezone-agnostic by contract — the device clock and the BE's
   *  `attendance_today` may differ). It does NOT drive the library's own
   *  "today" ring — that highlight follows the device clock; this prop
   *  only decides which month is shown. */
  today: string;
  /** Floor (inclusive) — earlier dates render disabled. */
  minDate?: string;
  /** Ceiling (inclusive) — later dates render disabled. */
  maxDate?: string;
  /** Fires on every day-press with the new YYYY-MM-DD. */
  onChange: (next: string) => void;
  /** Wrap the calendar in a card surface (default true — matches the
   *  rest of the DS). Pass `false` when embedding in a Sheet/Screen that
   *  already provides its own surface. */
  framed?: boolean;
};

function toLocalDate(yyyyMmDd: string): Date {
  // Local-noon anchor: avoids any DST edge where midnight on a spring-
  // forward day would roll to the previous day.
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function fromLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Structural dayjs check — the library returns a dayjs instance in some
 * configs, but this file shouldn't import dayjs just for a type guard.
 */
type HasToDate = { toDate: () => Date };
function isDayjsLike(value: unknown): value is HasToDate {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as HasToDate).toDate === 'function'
  );
}

/**
 * Pull a Date out of the library's polymorphic `DateType` (Date | string |
 * dayjs | null) — or `undefined` when the value can't be interpreted.
 * Strict by design (15-6 review): this is a DS primitive stories 16-19
 * reuse, so it never fabricates a date. The device clock must not surface
 * as a user selection (no `new Date()` fallback), and an unparseable or
 * impossible string must not leak NaN into `onChange`.
 */
function coerceDateOut(value: DateType | undefined): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === 'string') {
    // Bare YYYY-MM-DD, or an ISO datetime whose date part we keep. The
    // round-trip check rejects impossible calendar dates ("2026-02-31"
    // rolls over to March inside the Date constructor).
    const match = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(value);
    if (!match) return undefined;
    const day = match[1];
    const parsed = toLocalDate(day);
    return fromLocalDate(parsed) === day ? parsed : undefined;
  }
  // dayjs: unwrap through its own toDate() — never anchor on the clock.
  if (isDayjsLike(value)) return value.toDate();
  return undefined;
}

export function Calendar({
  value,
  today,
  minDate,
  maxDate,
  onChange,
  framed = true,
}: CalendarProps) {
  // Recompute themed styles on first render only — token colours are
  // compile-time constants, and `useDefaultStyles` memoises internally.
  // (useMemo keeps React Navigation's screen-freshness checks from
  // re-running the spread on every parent re-render.)
  const defaultStyles = useDefaultStyles();
  const themedStyles = useMemo(
    () => ({
      ...defaultStyles,
      // Container: transparent so `framed` (the View below) controls the
      // surface; the library's wrapper is layout-only.
      days: {
        ...defaultStyles.days,
        backgroundColor: 'transparent',
      },
      header: {
        ...defaultStyles.header,
        backgroundColor: 'transparent',
      },
      month_selector_label: {
        ...defaultStyles.month_selector_label,
        color: colors.textStrong,
      },
      year_selector_label: {
        ...defaultStyles.year_selector_label,
        color: colors.textStrong,
      },
      weekday_label: {
        ...defaultStyles.weekday_label,
        color: colors.textMuted,
      },
      day_label: {
        ...defaultStyles.day_label,
        color: colors.textStrong,
      },
      month_label: {
        ...defaultStyles.month_label,
        color: colors.textStrong,
      },
      year_label: {
        ...defaultStyles.year_label,
        color: colors.textStrong,
      },
      outside_label: {
        ...defaultStyles.outside_label,
        color: colors.textMuted,
        opacity: 0.6,
      },
      // Today ring — brand outline, brand text, transparent fill.
      // (The library default paints `accent` as the background — in dark
      // mode that ends up dark gray and reads as "disabled". We want a
      // visible ring on the page surface instead.)
      today: {
        ...defaultStyles.today,
        backgroundColor: 'transparent',
        borderColor: colors.primary,
        borderWidth: 1.5,
        borderRadius: radius.pill,
      },
      today_label: {
        ...defaultStyles.today_label,
        color: colors.primary,
      },
      // Selected day — primary fill, on-primary text.
      selected: {
        ...defaultStyles.selected,
        backgroundColor: colors.primary,
        borderRadius: radius.pill,
      },
      selected_label: {
        ...defaultStyles.selected_label,
        color: colors.onPrimary,
        // `as const` keeps the literal type — the library's Styles type
        // widens to `string` and would reject a plain `'600'`.
        fontWeight: '600' as const,
      },
      // Disabled (out of range) — muted.
      disabled_label: {
        ...defaultStyles.disabled_label,
        color: colors.textMuted,
        opacity: 0.45,
      },
      // Prev/Next arrows use the brand text colour so they don't look
      // like dead controls.
      button_next_image: {
        ...defaultStyles.button_next_image,
        tintColor: colors.textBody,
      },
      button_prev_image: {
        ...defaultStyles.button_prev_image,
        tintColor: colors.textBody,
      },
    }),
    [defaultStyles],
  );

  // Anchor on `value` when set AND interpretable (well-formed,
  // calendar-valid), else on `today`. The library needs *some* date to
  // render — even before a selection, the month grid still needs to know
  // which month to show.
  const anchorDate = coerceDateOut(value) ?? toLocalDate(today);

  const handleChange = (params: { date: DateType }) => {
    const picked = coerceDateOut(params.date);
    // null / uninterpretable — not a selection; no-op rather than emit
    // a fabricated or NaN date.
    if (!picked) return;
    onChange(fromLocalDate(picked));
  };

  return (
    <View style={framed ? styles.framed : null}>
      <RNCDateTimePicker
        mode="single"
        date={anchorDate}
        minDate={minDate ? toLocalDate(minDate) : undefined}
        maxDate={maxDate ? toLocalDate(maxDate) : undefined}
        onChange={handleChange}
        styles={themedStyles}
        // Always light — dark mode is out of scope today, and forcing a
        // dark calendar over our light page looks wrong.
        use12Hours={false}
        timePicker={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  framed: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.s2,
    overflow: 'hidden',
  },
});
