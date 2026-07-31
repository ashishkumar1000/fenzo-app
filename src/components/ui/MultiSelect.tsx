/**
 * MultiSelect — the same bottom-sheet pattern as `Select`, but rows toggle on/off
 * instead of closing the sheet, and the field shows a summary of everything
 * picked ("2 selected") instead of one label.
 *
 * options: array of { value, label } or plain strings — same shape as Select.
 */
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, radius, shadow, spacing, touch, typography } from '../../theme';

type Option = { value: string; label: string };
type RawOption = string | Option;

export type MultiSelectProps = {
  label?: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: RawOption[];
  placeholder?: string;
  helper?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const normalize = (o: RawOption): Option =>
  typeof o === 'string' ? { value: o, label: o } : o;

function Chevron() {
  return (
    <View style={styles.chevron}>
      <View style={styles.chevronBarLeft} />
      <View style={styles.chevronBarRight} />
    </View>
  );
}

export function MultiSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  helper = '',
  disabled = false,
  style,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  // Defensive default: guards against a transient/undefined `value` (e.g. a
  // caller mid-refactor, or a Fast Refresh edge case preserving stale state)
  // instead of crashing the whole screen on `.includes` of undefined.
  const selectedValues = value ?? [];
  const opts = options.map(normalize);
  const selectedLabels = opts.filter(o => selectedValues.includes(o.value)).map(o => o.label);

  const summary =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels.length} selected`;

  const toggle = (optionValue: string) => {
    onChange(
      selectedValues.includes(optionValue)
        ? selectedValues.filter(v => v !== optionValue)
        : [...selectedValues, optionValue],
    );
  };

  return (

    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          { backgroundColor: disabled ? colors.surfaceSunken : colors.surfaceCard },
        ]}>
        <Text
          numberOfLines={1}
          style={[styles.valueText, selectedLabels.length === 0 && styles.placeholderText]}>
          {summary}
        </Text>
        <Chevron />
      </Pressable>

      {helper ? <Text style={styles.helper}>{helper}</Text> : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            <FlatList
              data={opts}
              keyExtractor={o => o.value}
              renderItem={({ item }) => {
                const isSelected = selectedValues.includes(item.value);
                return (
                  <Pressable
                    onPress={() => toggle(item.value)}
                    style={styles.optionRow}
                    accessibilityRole="checkbox"
                    accessibilityLabel={item.label}
                    accessibilityState={{ checked: isSelected }}>
                    <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                      {isSelected ? (
                        <Check size={14} color={colors.onPrimary} strokeWidth={3} />
                      ) : null}
                    </View>
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />
            <Pressable style={styles.doneButton} onPress={() => setOpen(false)}>
              <Text style={styles.doneButtonText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, width: '100%' },
  label: { ...typography.label, color: colors.textStrong },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: touch.comfort,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
  },
  valueText: { ...typography.body, color: colors.textStrong, flex: 1 },
  placeholderText: { color: colors.textMuted },
  helper: { ...typography.caption, color: colors.textMuted },

  chevron: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  chevronBarLeft: {
    position: 'absolute',
    width: 9,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textMuted,
    transform: [{ translateX: -3 }, { rotate: '45deg' }],
  },
  chevronBarRight: {
    position: 'absolute',
    width: 9,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textMuted,
    transform: [{ translateX: 3 }, { rotate: '-45deg' }],
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s8,
    paddingHorizontal: spacing.s4,
    maxHeight: '70%',
    ...shadow.sheet,
  },
  sheetTitle: {
    ...typography.heading,
    color: colors.textStrong,
    marginBottom: spacing.s2,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: touch.comfort,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: { ...typography.body, color: colors.textBody },
  optionTextSelected: { color: colors.primary, fontWeight: '600' },
  doneButton: {
    marginTop: spacing.s3,
    height: touch.comfort,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    ...typography.body,
    color: colors.onPrimary,
    fontWeight: '600',
  },
});
