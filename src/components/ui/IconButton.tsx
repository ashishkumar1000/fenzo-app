/**
 * IconButton — square, icon-only control with a 44px touch target.
 * Ported from the Fenzit Design System (web) to React Native.
 *
 * Use for app-bar actions, list-row affordances, toolbars.
 * Variants: solid | soft | ghost   Sizes: sm | md | lg
 *
 * Press feedback scales to 0.92 (matching the DS motion spec for icon controls).
 */
import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, shadow, motion } from '../../theme';

type Variant = 'solid' | 'soft' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

export type IconButtonProps = {
  children: ReactNode;
  /** Accessibility label describing the action (required for icon-only controls). */
  label: string;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
};

const dims: Record<Size, number> = { sm: 36, md: 44, lg: 52 };

const variantStyles: Record<Variant, ViewStyle> = {
  solid: { backgroundColor: colors.primary, ...shadow.primary },
  soft: { backgroundColor: colors.primarySoft },
  ghost: { backgroundColor: 'transparent' },
};

export function IconButton({
  children,
  label,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  onPress,
  style,
}: IconButtonProps) {
  const dim = dims[size];
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) =>
    Animated.timing(scale, {
      toValue,
      duration: motion.durationFast,
      useNativeDriver: true,
    }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        onPressIn={disabled ? undefined : () => animateTo(0.92)}
        onPressOut={disabled ? undefined : () => animateTo(1)}
        android_ripple={{ color: 'transparent' }}
        style={[
          styles.base,
          { width: dim, height: dim },
          variantStyles[variant],
          disabled && styles.disabled,
        ]}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  disabled: { opacity: 0.45 },
});
