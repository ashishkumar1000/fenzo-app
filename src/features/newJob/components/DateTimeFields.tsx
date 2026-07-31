/**
 * DateTimeFields — the "Date" and "Time" pair, both editing one `Date`.
 *
 * Uses @react-native-community/datetimepicker, whose two platforms want
 * opposite things:
 *   Android — imperative. `DateTimePickerAndroid.open()` puts up the system
 *             dialog; nothing is rendered inline.
 *   iOS     — declarative. The picker is a view, so it goes in a small sheet
 *             with a "Done" button rather than floating over the form.
 * Hence the platform split below instead of one shared render path.
 *
 * Dates are formatted by hand, not via `toLocaleDateString`: Hermes ships
 * without full Intl on some builds, and a silent fallback to a US-style date
 * is worse than 12 lines of formatting we control.
 */
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { CalendarDays, Clock } from 'lucide-react-native';
import { Button } from '../../../components/ui';
import { colors, radius, shadow, spacing, touch, typography } from '../../../theme';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** e.g. "17 Jun 2026" */
function formatDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** e.g. "2:00 PM" */
function formatTime(d: Date): string {
  const hours = d.getHours();
  const suffix = hours < 12 ? 'AM' : 'PM';
  // 0 and 12 both display as 12.
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
}

type Mode = 'date' | 'time';

type Props = {
  value: Date;
  onChange: (next: Date) => void;
};

export function DateTimeFields({ value, onChange }: Props) {
  // iOS only — which sheet is open, if any. Android uses the system dialog.
  const [iosMode, setIosMode] = useState<Mode | null>(null);
  // Held separately so "Done" commits and a backdrop tap discards.
  const [draft, setDraft] = useState(value);

  const openAndroid = (mode: Mode) => {
    DateTimePickerAndroid.open({
      value,
      mode,
      is24Hour: false,
      minimumDate: mode === 'date' ? new Date() : undefined,
      // `onValueChange` fires only on an actual selection — dismissal goes to
      // `onDismiss`, which we don't need. The older single `onChange` callback
      // (deprecated in v9) bundled both and required an `event.type === 'set'`
      // guard to tell them apart.
      onValueChange: (_event, selected) => onChange(selected),
    });
  };

  const open = (mode: Mode) => {
    if (Platform.OS === 'android') {
      openAndroid(mode);
      return;
    }
    setDraft(value);
    setIosMode(mode);
  };

  const field = (mode: Mode, label: string) => {
    const isDate = mode === 'date';
    const Icon = isDate ? CalendarDays : Clock;

    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${isDate ? formatDate(value) : formatTime(value)}`}
          onPress={() => open(mode)}
          style={styles.field}>
          <Icon size={18} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.fieldText} numberOfLines={1}>
            {isDate ? formatDate(value) : formatTime(value)}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.row}>
      {field('date', 'Date')}
      {field('time', 'Time')}

      {/* iOS sheet. Never mounted on Android, where the dialog is imperative. */}
      {Platform.OS === 'ios' && iosMode ? (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setIosMode(null)}>
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={() => setIosMode(null)} />
            <View style={styles.sheet}>
              <DateTimePicker
                value={draft}
                mode={iosMode}
                display="spinner"
                minimumDate={iosMode === 'date' ? new Date() : undefined}
                onValueChange={(_event, selected) => setDraft(selected)}
              />
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => {
                  onChange(draft);
                  setIosMode(null);
                }}>
                Done
              </Button>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  fieldWrap: {
    flex: 1,
    gap: 6,
  },
  label: {
    ...typography.label,
    color: colors.textStrong,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: touch.comfort,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
  },
  fieldText: {
    ...typography.body,
    color: colors.textStrong,
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s8,
    gap: spacing.s3,
    ...shadow.sheet,
  },
});
