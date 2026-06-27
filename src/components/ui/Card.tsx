/**
 * Card — white surface container with soft elevation. The base unit of every
 * Fenzit list & detail view (job cards, customer cards, summary tiles).
 * Ported from the Fenzit Design System (web) to React Native.
 *
 * padding:     none | sm | md | lg
 * interactive: adds press feedback (scale 0.99) and makes the card tappable.
 * elevated:    soft shadow on white (default true).
 */
import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, shadow, spacing, motion } from '../../theme';

type Padding = 'none' | 'sm' | 'md' | 'lg';

export type CardProps = {
  children: ReactNode;
  padding?: Padding;
  interactive?: boolean;
  elevated?: boolean;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
};

const padMap: Record<Padding, number> = {
  none: spacing.s0,
  sm: spacing.s3,
  md: spacing.s4,
  lg: spacing.s5,
};

export function Card({
  children,
  padding = 'md',
  interactive = false,
  elevated = true,
  onPress,
  style,
}: CardProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) =>
    Animated.timing(scale, {
      toValue,
      duration: motion.durationFast,
      useNativeDriver: true,
    }).start();

  const containerStyle: StyleProp<ViewStyle> = [
    styles.base,
    { padding: padMap[padding] },
    elevated ? shadow.sm : null,
    style,
  ];

  if (!interactive) {
    return <View style={containerStyle}>{children}</View>;
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animateTo(0.99)}
        onPressOut={() => animateTo(1)}
        android_ripple={{ color: 'transparent' }}
        style={containerStyle}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
  },
});
