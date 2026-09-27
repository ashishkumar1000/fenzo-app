/**
 * DatePickerField — read-only "tap to open a calendar" date input.
 *
 * Visually mirrors `Input`'s labeled-field shape (label on top, value row
 * with trailing calendar icon, helper/error below) so a form that mixes
 * text and date inputs reads as one grid. The calendar below the field
 * is the shared `Calendar` DS primitive.
 *
 * Why not an editable `Input`:
 *  - Users mistype dates. A wrong digit is silent until the BE rejects
 *    with a 422 or 409 — and on a 409 the user has no idea what they
 *    typed. A native picker can't misfire.
 *
 * Empty value renders the placeholder (or the shared-formatted `today`)
 * in muted copy. Tap-anywhere on the row toggles the calendar — the whole
 * row is the hit target, matching how `Input` reads touch.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { colors, radius, spacing, typography, touch } from '../../theme';
import { formatLongDate } from '../../utils';
import { Calendar } from './Calendar';

export type DatePickerFieldProps = {
  label?: string;
  /** YYYY-MM-DD. Empty = no selection (shows the placeholder). */
  value: string;
  /** Today's YYYY-MM-DD. Anchors the calendar's month view and is the
   *  formatted fallback label when the value is empty and no placeholder
   *  is given. NOT a min-date — pass `minDate` explicitly (past dates are
   *  allowed on some forms, so the call site owns the floor). */
  today: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Inline error — flips border to red and replaces helper copy. */
  error?: string;
  /** Helper copy shown only when there's no error. */
  helper?: string;
  /** Optional floor / ceiling (YYYY-MM-DD). Past dates are allowed on the
   *  holiday form, so the call site controls this. */
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
};

export function DatePickerField({
  label,
  value,
  today,
  onChange,
  placeholder,
  error,
  helper,
  minDate,
  maxDate,
  disabled = false,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const invalid = Boolean(error);

  const borderColor = invalid ? colors.danger : colors.borderDefault;
  // Empty + no placeholder → the shared formatter's `today`, never the
  // raw machine date (15-6 review).
  const displayValue = value
    ? formatLongDate(value)
    : (placeholder ?? formatLongDate(today));

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          value
            ? `${label ?? 'Date'}: ${formatLongDate(value)}`
            : `${label ?? 'Date'}: not selected, tap to pick`
        }
        accessibilityState={{ disabled }}
        onPress={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={({ pressed }) => [
          styles.field,
          {
            borderColor,
            backgroundColor: disabled
              ? colors.surfaceSunken
              : colors.surfaceCard,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <Text
          style={[styles.value, !value ? styles.valuePlaceholder : null]}
          numberOfLines={1}>
          {displayValue}
        </Text>
        <View style={styles.icon}>
          <CalendarDays
            size={20}
            color={colors.textMuted}
            strokeWidth={2}
          />
        </View>
      </Pressable>

      {helper || error ? (
        <Text style={[styles.helper, invalid ? styles.helperError : null]}>
          {error || helper}
        </Text>
      ) : null}

      {open ? (
        <View style={styles.calendarWrap}>
          <Calendar
            value={value}
            today={today}
            minDate={minDate}
            maxDate={maxDate}
            // The library auto-commits on day-press — same behaviour on
            // both Android and iOS. Once the user picks a date, close
            // the inline calendar so the field collapses back to its
            // single-row state; tapping the field again re-opens it.
            onChange={(next) => {
              onChange(next);
              setOpen(false);
            }}
            framed={false}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    width: '100%',
  },
  label: {
    ...typography.label,
    color: colors.textStrong,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    height: touch.comfort,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  value: {
    ...typography.body,
    color: colors.textStrong,
    flex: 1,
    minWidth: 0,
  },
  valuePlaceholder: {
    color: colors.textMuted,
  },
  icon: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helper: {
    ...typography.caption,
    color: colors.textMuted,
  },
  helperError: {
    color: colors.danger,
  },
  calendarWrap: {
    marginTop: spacing.s2,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
});
