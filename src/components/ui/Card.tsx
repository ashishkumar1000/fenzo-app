/**
 * Card — a flexible surface holder for any content. The base unit of every
 * Fenzit list & detail view (job cards, customer cards, summary tiles).
 * Ported from the Fenzit Design System (web) to React Native.
 *
 * **Holder pattern.** Pass any React node — Views, Text, custom components,
 * fragments, or any composition — and the Card provides the surface
 * (background, border, padding, optional shadow). You compose the inside.
 *
 * @example
 * // Pass a custom view via children (most common)
 * <Card padding="md">
 *   <MyCustomView />
 * </Card>
 *
 * @example
 * // Or pass a view explicitly via the `view` prop (explicit holder style)
 * <Card view={<MyCustomView />} />
 *
 * @example
 * // Multiple children of any kind
 * <Card padding="lg" elevated={false}>
 *   <Text>Title</Text>
 *   <View>
 *     <Icon />
 *     <Text>Subtitle</Text>
 *   </View>
 * </Card>
 *
 * padding:     none | sm | md | lg (default md) — inner padding around content.
 * interactive: adds press feedback (scale 0.99) and makes the card tappable.
 * disabled:    blocks press and press feedback on an interactive card (same
 *              semantics as Pressable's `disabled`; the 0.5-opacity dimming
 *              stays the caller's job, matching Button). No effect without
 *              `interactive`.
 * elevated:    soft shadow on white (default true).
 * style:       extend container styles (backgroundColor, border, etc.).
 *
 * Accessibility props (`accessibilityLabel`, `accessibilityState`,
 * `accessibilityHint`) pass through to the underlying View or Pressable, so a
 * caller can mark a card as disabled/selected for screen readers — visual
 * greying alone conveys nothing to them.
 */
import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type AccessibilityState,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, shadow, spacing, motion } from '../../theme';

type Padding = 'none' | 'sm' | 'md' | 'lg';

export type CardProps = {
  /** Content rendered inside the Card. Accepts any React node. */
  children?: ReactNode;
  /** Alias for children — pass a view directly as a prop for explicit holder usage. */
  view?: ReactNode;
  padding?: Padding;
  interactive?: boolean;
  /** Blocks press and press feedback on an interactive card (same semantics
   * as Pressable's `disabled`; Button renders this state at opacity 0.5 —
   * match that visually in the caller's style). No effect without `interactive`. */
  disabled?: boolean;
  elevated?: boolean;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** e.g. `{ disabled: true }` for a card representing a not-yet-available feature. */
  accessibilityState?: AccessibilityState;
  /**
   * Forwarded to the underlying View/Pressable. Pressable sets no default
   * role, so interactive cards should pass `"button"` — without it, screen
   * readers announce an unlabelled control (and any `accessibilityState`
   * hangs off nothing meaningful).
   */
  accessibilityRole?: AccessibilityRole;
};

const padMap: Record<Padding, number> = {
  none: spacing.s0,
  sm: spacing.s3,
  md: spacing.s4,
  lg: spacing.s5,
};

export function Card({
  children,
  view,
  padding = 'md',
  interactive = false,
  disabled = false,
  elevated = true,
  onPress,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  accessibilityRole,
}: CardProps) {
  // `children` takes precedence; `view` is the explicit-holder alias.
  const content = children ?? view;

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
    return (
      <View
        style={containerStyle}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState}
        accessibilityRole={accessibilityRole}>
        {content}
      </View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => animateTo(0.99)}
        onPressOut={() => animateTo(1)}
        android_ripple={{ color: 'transparent' }}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState}
        accessibilityRole={accessibilityRole}
        style={containerStyle}>
        {content}
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