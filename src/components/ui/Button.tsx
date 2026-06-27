/**
 * Fenzit Button — primary action control. Large, friendly, mobile-first.
 * Ported from the Fenzit Design System (web) to React Native.
 *
 * Variants: primary | secondary | ghost | danger
 * Sizes:    sm | md | lg   (md/lg meet the 44px touch-target minimum)
 *
 * Press feedback scales the button to 0.97 (matching the DS motion spec).
 */
import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, shadow, fontSize, weight, motion } from '../../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  disabled?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
};

const sizeStyles: Record<Size, { height: number; paddingHorizontal: number; fontSize: number; gap: number; radius: number }> = {
  sm: { height: 36, paddingHorizontal: 14, fontSize: fontSize.sm, gap: 6, radius: radius.sm },
  md: { height: 44, paddingHorizontal: 18, fontSize: fontSize.sm, gap: 8, radius: radius.md },
  lg: { height: 52, paddingHorizontal: 24, fontSize: fontSize.base, gap: 10, radius: radius.md },
};

const variantContainer: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.primary, borderColor: 'transparent', ...shadow.primary },
  secondary: { backgroundColor: colors.surfaceCard, borderColor: colors.borderDefault, ...shadow.xs },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  danger: { backgroundColor: colors.danger, borderColor: 'transparent' },
};

const variantText: Record<Variant, string> = {
  primary: colors.onPrimary,
  secondary: colors.textStrong,
  ghost: colors.primary,
  danger: colors.textOnColor,
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  leadingIcon = null,
  trailingIcon = null,
  onPress,
  style,
}: ButtonProps) {
  const s = sizeStyles[size];
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () =>
    Animated.timing(scale, {
      toValue: 0.97,
      duration: motion.durationFast,
      useNativeDriver: true,
    }).start();

  const pressOut = () =>
    Animated.timing(scale, {
      toValue: 1,
      duration: motion.durationFast,
      useNativeDriver: true,
    }).start();

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        fullWidth ? styles.fullWidth : styles.autoWidth,
        style,
      ]}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={disabled ? undefined : pressIn}
        onPressOut={disabled ? undefined : pressOut}
        android_ripple={{ color: 'transparent' }}
        style={[
          styles.base,
          {
            height: s.height,
            minWidth: s.height, // square minimum for icon-only buttons
            paddingHorizontal: s.paddingHorizontal,
            gap: s.gap,
            borderRadius: s.radius,
          },
          variantContainer[variant],
          disabled && styles.disabled,
        ]}>
        {leadingIcon ? <View>{leadingIcon}</View> : null}
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            { fontSize: s.fontSize, color: variantText[variant] },
          ]}>
          {children}
        </Text>
        {trailingIcon ? <View>{trailingIcon}</View> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: 'stretch' },
  autoWidth: { alignSelf: 'flex-start' },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  label: {
    fontWeight: weight.semibold,
    letterSpacing: -0.01,
    textAlign: 'center',
  },
  disabled: { opacity: 0.5 },
});
