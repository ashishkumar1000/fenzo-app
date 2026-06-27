/**
 * Switch — on/off toggle. Use for settings and quick filters.
 * Ported from the Fenzit Design System (web) to React Native.
 *
 * Wraps RN's native Switch (reliable, accessible) themed to the DS colors,
 * with an optional inline label and a 44px minimum touch row.
 */
import {
  Pressable,
  StyleSheet,
  Switch as RNSwitch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, palette, touch, typography } from '../../theme';

export type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Switch({
  value,
  onValueChange,
  label,
  disabled = false,
  style,
}: SwitchProps) {
  const control = (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: palette.gray300, true: colors.primary }}
      thumbColor={palette.gray0}
      ios_backgroundColor={palette.gray300}
    />
  );

  if (!label) {
    return <View style={style}>{control}</View>;
  }

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[styles.row, disabled && styles.disabled, style]}>
      {control}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: touch.min,
  },
  label: {
    ...typography.body,
    color: colors.textStrong,
  },
  disabled: { opacity: 0.5 },
});
