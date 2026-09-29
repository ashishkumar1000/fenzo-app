/**
 * LeaveDateRow — the leave form's tappable date row (Story 17-5, spec
 * D2). Clones `DatePickerField`'s row ANATOMY (label on top, a 48px
 * bordered value row with a trailing calendar icon) but never imports it
 * — DatePickerField is an inline-calendar component, and this row pushes
 * the full-screen DatePickerScreen instead (deferred-work directive: no
 * second picker implementation). `onClear` renders the To row's "Clear"
 * affordance right of the value at a 44px target (D3).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { colors, radius, spacing, touch, typography } from '../../../theme';
import { formatLongDate } from '../../../utils';

export function LeaveDateRow(input: {
  label: string;
  value: string | null;
  placeholder?: string;
  onPress: () => void;
  disabled?: boolean;
  onClear?: () => void;
}) {
  const { label, value, placeholder, onPress, disabled, onClear } = input;
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          value
            ? `${label}: ${formatLongDate(value)}`
            : `${label}: not selected, tap to pick`
        }
        accessibilityState={{ disabled: disabled === true }}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.valueRow,
          pressed && styles.rowPressed,
        ]}>
        <Text style={[styles.value, !value ? styles.placeholder : null]}>
          {value ? formatLongDate(value) : placeholder}
        </Text>
        {onClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
            onPress={onClear}
            style={styles.clear}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
        <View style={styles.icon}>
          <CalendarDays size={20} color={colors.textMuted} strokeWidth={2} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.label,
    color: colors.textStrong,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // minHeight, not height: the value reflows (never truncates) at the
    // largest accessibility text sizes (D9 / Accessibility Floor).
    minHeight: touch.comfort,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    paddingLeft: spacing.s3,
  },
  rowPressed: {
    opacity: 0.85,
  },
  value: {
    ...typography.body,
    color: colors.textStrong,
    flex: 1,
    minWidth: 0,
  },
  placeholder: {
    color: colors.textMuted,
  },
  clear: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    ...typography.label,
    color: colors.textLink,
  },
  icon: {
    width: touch.min,
    height: touch.comfort,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
