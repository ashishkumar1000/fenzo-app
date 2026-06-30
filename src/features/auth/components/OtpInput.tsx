/**
 * OtpInput — N boxes backed by ONE hidden TextInput (the source of truth).
 *
 * Why a single input rather than N inputs: it lets the OS autofill drop the
 * whole code in at once (iOS Security Code AutoFill via textContentType
 * "oneTimeCode"; Android SMS Retriever via autoComplete "sms-otp"), supports
 * clipboard paste, and removes all the brittle per-box focus/back-space logic.
 * The boxes are plain Views that render the digits; tapping anywhere focuses
 * the hidden field. (Built from core RN — no extra dependency.)
 */
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {colors, radius, spacing, typography} from '../../../theme';

type Props = {
  value: string;
  onChange: (next: string) => void;
  length: number;
  autoFocus?: boolean;
  error?: boolean;
  /** Fires once the user has entered the full code. */
  onFilled?: (code: string) => void;
};

const BOX = 46;

export function OtpInput({
  value,
  onChange,
  length,
  autoFocus = true,
  error = false,
  onFilled,
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  // Guards against re-firing onFilled when its identity changes (e.g. the
  // parent's callback is recreated mid-verification) while `value` hasn't.
  const firedFor = useRef<string | null>(null);

  const focus = () => inputRef.current?.focus();

  // Fire onFilled exactly once per completed code, not on every render where
  // the callback identity happens to change.
  useEffect(() => {
    if (value.length === length && firedFor.current !== value) {
      firedFor.current = value;
      onFilled?.(value);
    }
    if (value.length < length) {
      firedFor.current = null;
    }
  }, [value, length, onFilled]);

  const handleChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, length);
    onChange(digits);
  };

  const cells = Array.from({ length }, (_, i) => i);

  return (
    <Pressable onPress={focus} style={styles.wrap}>
      {cells.map(i => {
        const char = value[i] ?? '';
        const isActive = focused && i === Math.min(value.length, length - 1);
        return (
          <View
            key={i}
            style={[
              styles.box,
              isActive ? styles.boxActive : null,
              error ? styles.boxError : null,
            ]}>
            <Text style={styles.digit}>{char}</Text>
          </View>
        );
      })}

      {/* The real input — overlaid and invisible. Captures keystrokes,
          paste, and OS autofill for every box at once. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        maxLength={length}
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        importantForAutofill="yes"
        caretHidden
        style={styles.hiddenInput}
        accessibilityLabel="One-time password"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: {
    borderColor: colors.borderFocus,
    borderWidth: 2,
  },
  boxError: {
    borderColor: colors.danger,
  },
  digit: {
    ...typography.heading,
    color: colors.textStrong,
  },
  // Invisible but present in the layout so the keyboard targets it.
  hiddenInput: {
    position: 'absolute',
    width: '100%',
    height: BOX,
    opacity: 0,
  },
});
