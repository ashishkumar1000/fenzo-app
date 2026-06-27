/**
 * Select — dropdown styled to match Input. Reliable on mobile.
 * Ported from the Fenzit Design System (web) to React Native.
 *
 * React Native has no native <select>, so this opens a bottom sheet of
 * options (built from core RN only — no extra dependencies).
 * options: array of { value, label } or plain strings.
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
import { colors, radius, shadow, spacing, touch, typography } from '../../theme';

type Option = { value: string; label: string };
type RawOption = string | Option;

export type SelectProps = {
  label?: string;
  value?: string;
  onChange: (value: string) => void;
  options: RawOption[];
  placeholder?: string;
  helper?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const normalize = (o: RawOption): Option =>
  typeof o === 'string' ? { value: o, label: o } : o;

function Chevron() {
  // Simple chevron drawn with two rotated bars (no icon dependency).
  return (
    <View style={styles.chevron}>
      <View style={styles.chevronBarLeft} />
      <View style={styles.chevronBarRight} />
    </View>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  helper = '',
  disabled = false,
  style,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const opts = options.map(normalize);
  const selected = opts.find((o) => o.value === value);

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
          style={[styles.valueText, !selected && styles.placeholderText]}>
          {selected ? selected.label : placeholder}
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
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            <FlatList
              data={opts}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    style={styles.optionRow}>
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />
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

  // Chevron
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

  // Sheet
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
    maxHeight: '60%',
    ...shadow.sheet,
  },
  sheetTitle: {
    ...typography.heading,
    color: colors.textStrong,
    marginBottom: spacing.s2,
  },
  optionRow: {
    minHeight: touch.comfort,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  optionText: { ...typography.body, color: colors.textBody },
  optionTextSelected: { color: colors.primary, fontWeight: '600' },
});
