/**
 * TimeField — the DS kit's one clock-time entry control (Story 18-4 §10,
 * D-TP1). The `Input`'s visual anatomy (label on top, value box, trailing
 * Clock adornment, helper/error below) rendered as a Pressable — NO
 * keyboard, ever. A typed time was the exact failure class the 18-4 device
 * walkthrough caught live ("0800" without the colon); the OS clock picker
 * makes wrong-format input impossible.
 *
 * Press → the platform's native time picker (@react-native-community/
 * datetimepicker), pre-set to the current value (or the placeholder, or
 * 09:00) anchored at a FIXED date. The picker only ever reads/writes
 * device-local hours+minutes — the zero-padded "HH:mm" string is the only
 * thing that crosses into app state, never a Date (this is a wall-clock UI
 * value, not a carried instant).
 *
 * Android opens the package's IMPERATIVE dialog (`DateTimePickerAndroid.
 * open` — the repo's established idiom, DateTimeFields/ReportRangeFields,
 * and the package's own recommendation over the declarative component).
 * iOS renders the spinner inside the DS `Sheet`: every spin commits live
 * via onValueChange; Done (or an OS swipe-dismiss → onDismiss) closes.
 * The 24-hour intent is Android-enforced (`is24Hour`); the iOS spinner
 * follows the device's locale setting. This branch is untested on device
 * (the carried iOS-validation item).
 *
 * `clearable` adds a small "Clear" action for OPTIONAL times whose empty
 * value MEANS something on the wire (18-2: omitting check-out in the write
 * clears the stored one — a filled picker field could otherwise never
 * express that).
 */
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { Clock } from 'lucide-react-native';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { colors, radius, typography, touch } from '../../theme';

export type TimeFieldProps = {
  label: string;
  /** Zero-padded 24-hour "HH:mm" — the only shape this field exchanges. */
  value: string;
  onChangeValue: (hhmm: string) => void;
  placeholder?: string;
  /** Inline error — flips the border red and replaces the helper copy. */
  error?: string;
  /** Helper copy shown only when there's no error. */
  helper?: string;
  /** Renders the "Clear" action while filled (optional times only). */
  clearable?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Zero-padded 24-hour "HH:mm" — the same shape the form gates validate. */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The picker's opening Date: the current value when it's a valid "HH:mm",
 *  else the placeholder when valid, else 09:00 — always on the FIXED
 *  anchor date, since only hours+minutes are read back. */
function anchorDate(value: string, placeholder?: string): Date {
  const hhmm = HHMM.test(value)
    ? value
    : placeholder != null && HHMM.test(placeholder)
      ? placeholder
      : '09:00';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m);
}

/** Device-local hours+minutes back to the zero-padded "HH:mm" shape. */
function formatHHMM(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function TimeField({
  label,
  value,
  onChangeValue,
  placeholder,
  error = '',
  helper = '',
  clearable = false,
  style,
}: TimeFieldProps) {
  // Only the iOS Sheet needs local state; the Android dialog manages
  // itself once `open()` is called.
  const [sheetOpen, setSheetOpen] = useState(false);
  const invalid = Boolean(error);
  const borderColor = invalid ? colors.danger : colors.borderDefault;

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value: anchorDate(value, placeholder),
      mode: 'time',
      is24Hour: true,
      onValueChange: (_event, date) => onChangeValue(formatHHMM(date)),
      onDismiss: () => {},
    });
  };

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {clearable && value !== '' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            onPress={() => onChangeValue('')}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value || placeholder || ''}`}
        accessibilityHint="Opens the time picker."
        onPress={() => (Platform.OS === 'android' ? openAndroid() : setSheetOpen(true))}
        style={({ pressed }) => [
          styles.field,
          { borderColor, opacity: pressed ? 0.85 : 1 },
        ]}>
        <Text
          style={[styles.value, value === '' ? styles.valuePlaceholder : null]}
          numberOfLines={1}>
          {value || placeholder || ''}
        </Text>
        <View style={styles.icon}>
          <Clock size={20} color={colors.textMuted} strokeWidth={2} />
        </View>
      </Pressable>

      {helper || error ? (
        <Text style={[styles.helper, invalid ? styles.helperError : null]}>
          {error || helper}
        </Text>
      ) : null}

      {Platform.OS === 'ios' ? (
        <Sheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={label}>
          <DateTimePicker
            value={anchorDate(value, placeholder)}
            mode="time"
            display="spinner"
            onValueChange={(_event, date) => onChangeValue(formatHHMM(date))}
            onDismiss={() => setSheetOpen(false)}
          />
          <Button variant="primary" fullWidth onPress={() => setSheetOpen(false)}>
            Done
          </Button>
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    ...typography.label,
    color: colors.textStrong,
  },
  clearText: {
    ...typography.label,
    color: colors.primary,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: touch.comfort,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
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
});
