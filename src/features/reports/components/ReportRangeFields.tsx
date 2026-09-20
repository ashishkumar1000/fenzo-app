/**
 * ReportRangeFields — the "From" / "To" date pair for the report request
 * form (story 12-6). A date-only adaptation of NewJob's `DateTimeFields`
 * (same platform split, same hand-rolled formatting): Android opens the
 * system dialog imperatively; iOS mounts a spinner sheet with a Done button.
 *
 * Constraints keep the picker itself honest so the form's validation is a
 * backstop, not the first line of defence:
 *   - To:  minimum = the chosen From, maximum = today (IST clock)
 *   - From: maximum = today (the backend rejects future dates anyway)
 */
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { Button } from '../../../components/ui';
import { colors, radius, shadow, spacing, touch, typography } from '../../../theme';
import { isoToPickerDate, pickerDateToIso } from '../reportModel';

/** e.g. "17 Jun 2026" — hand-rolled (Hermes ships without full Intl). */
function formatDate(d: Date): string {
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

type Props = {
  /** `YYYY-MM-DD` IST calendar dates (the backend's vocabulary). */
  startDate: string;
  endDate: string;
  /** "Today" on the IST clock — the picker's hard maximum. */
  todayIso: string;
  onChange: (next: { startDate?: string; endDate?: string }) => void;
};

export function ReportRangeFields({ startDate, endDate, todayIso, onChange }: Props) {
  // iOS only — which field's sheet is open. Android uses the system dialog.
  const [iosField, setIosField] = useState<'start' | 'end' | null>(null);
  // Held separately so "Done" commits and a backdrop tap discards.
  const [draft, setDraft] = useState(new Date());

  const openAndroid = (field: 'start' | 'end') => {
    const isStart = field === 'start';
    DateTimePickerAndroid.open({
      value: isoToPickerDate(isStart ? startDate : endDate),
      mode: 'date',
      minimumDate: isStart ? undefined : isoToPickerDate(startDate),
      maximumDate: isoToPickerDate(todayIso),
      onValueChange: (_event, selected) => {
        if (selected) {
          onChange(isStart ? { startDate: pickerDateToIso(selected) } : { endDate: pickerDateToIso(selected) });
        }
      },
    });
  };

  const open = (field: 'start' | 'end') => {
    if (Platform.OS === 'android') {
      openAndroid(field);
      return;
    }
    setDraft(isoToPickerDate(field === 'start' ? startDate : endDate));
    setIosField(field);
  };

  const field = (key: 'start' | 'end', value: string) => (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{key === 'start' ? 'From' : 'To'}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label2(key)}: ${value}`}
        onPress={() => open(key)}
        style={styles.field}>
        <CalendarDays size={18} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.fieldText} numberOfLines={1}>
          {formatDate(isoToPickerDate(value))}
        </Text>
      </Pressable>
    </View>
  );

  const commitIos = () => {
    if (iosField === 'start') {
      onChange({ startDate: pickerDateToIso(draft) });
    } else if (iosField === 'end') {
      onChange({ endDate: pickerDateToIso(draft) });
    }
    setIosField(null);
  };

  return (
    <View style={styles.row}>
      {field('start', startDate)}
      {field('end', endDate)}

      {/* iOS sheet. Never mounted on Android, where the dialog is imperative. */}
      {Platform.OS === 'ios' && iosField ? (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setIosField(null)}>
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={() => setIosField(null)} />
            <View style={styles.sheet}>
              <DateTimePicker
                value={draft}
                mode="date"
                display="spinner"
                minimumDate={iosField === 'end' ? isoToPickerDate(startDate) : undefined}
                maximumDate={isoToPickerDate(todayIso)}
                onValueChange={(_event, selected) => selected && setDraft(selected)}
              />
              <Button variant="primary" size="lg" fullWidth onPress={commitIos}>
                Done
              </Button>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function label2(key: 'start' | 'end'): string {
  return key === 'start' ? 'From date' : 'To date';
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