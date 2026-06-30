/**
 * Input — labeled text field with optional leading icon, helper & error text.
 * Ported from the Fenzit Design System (web) to React Native.
 *
 * Mobile-first: 48px tall, 16px text (prevents iOS zoom on web; keeps a
 * comfortable touch target on native). Focus shows a soft-blue border;
 * errors turn the border red and swap helper text for the message.
 */
import { useState, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import {colors, radius, typography, touch, spacing} from '../../theme';

export type InputProps = {
  label?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  leadingIcon?: ReactNode;
  helper?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  style?: StyleProp<ViewStyle>;
} & Pick<
  TextInputProps,
  'keyboardType' | 'autoCapitalize' | 'autoCorrect' | 'secureTextEntry' | 'maxLength' | 'onBlur' | 'onFocus'
>;

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  leadingIcon = null,
  helper = '',
  error = '',
  disabled = false,
  required = false,
  style,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const invalid = Boolean(error);

  const borderColor = invalid
    ? colors.danger
    : focused
    ? colors.borderFocus
    : colors.borderDefault;

  return (
    <View style={[styles.wrap, style]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          {
            borderColor,
            backgroundColor: disabled ? colors.surfaceSunken : colors.surfaceCard,
          },
          focused && !invalid ? styles.fieldFocused : null,
        ]}>
        {leadingIcon ? <View style={styles.leading}>{leadingIcon}</View> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          editable={!disabled}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={styles.input}
          {...rest}
        />
      </View>

      {helper || error ? (
        <Text style={[styles.helper, invalid ? styles.helperError : null]}>
          {error || helper}
        </Text>
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
  required: {
    color: colors.danger,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: touch.comfort,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  fieldFocused: {
    // Soft-blue focus emphasis (RN can't render the web's 3px ring shadow
    // cleanly inside a row, so the border carries the focus state).
    borderColor: colors.borderFocus,
  },
  leading: {
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    ...typography.body,
    color: colors.textStrong,
    marginBottom: 10,
  },
  helper: {
    ...typography.caption,
    color: colors.textMuted,
  },
  helperError: {
    color: colors.danger,
  },
});

