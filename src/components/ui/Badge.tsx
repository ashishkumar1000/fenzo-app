/**
 * Badge — Fenzit's signature status pill. Used everywhere to convey job state.
 * Ported from the Fenzit Design System (web) to React Native.
 *
 * status: done | progress | scheduled | cancelled | neutral
 * tone:   soft (default, tinted) | solid (filled)
 * Optionally renders a leading dot.
 *
 * Status vocabulary maps 1:1 to color — Done / In Progress / Scheduled /
 * Cancelled (+ neutral/Draft). Don't invent synonyms.
 */
import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, fontSize, weight, type StatusKey } from '../../theme';

type Tone = 'soft' | 'solid';
type Size = 'sm' | 'md';

export type BadgeProps = {
  children: ReactNode;
  status?: StatusKey;
  tone?: Tone;
  dot?: boolean;
  size?: Size;
  style?: StyleProp<ViewStyle>;
};

const sizeStyles: Record<Size, { fontSize: number; paddingV: number; paddingH: number; dot: number }> = {
  sm: { fontSize: fontSize['2xs'], paddingV: 2, paddingH: 8, dot: 6 },
  md: { fontSize: fontSize.xs, paddingV: 3, paddingH: 10, dot: 7 },
};

export function Badge({
  children,
  status = 'neutral',
  tone = 'soft',
  dot = false,
  size = 'md',
  style,
}: BadgeProps) {
  const c = colors.status[status];
  const s = sizeStyles[size];
  const solid = tone === 'solid';

  const textColor = solid ? colors.textOnColor : c.fg;
  const backgroundColor = solid ? c.solid : c.bg;
  const borderColor = solid ? 'transparent' : c.border;
  const dotColor = solid ? colors.textOnColor : c.solid;

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor,
          borderColor,
          paddingVertical: s.paddingV,
          paddingHorizontal: s.paddingH,
        },
        style,
      ]}>
      {dot ? (
        <View
          style={{
            width: s.dot,
            height: s.dot,
            borderRadius: radius.pill,
            backgroundColor: dotColor,
          }}
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.label, { fontSize: s.fontSize, color: textColor }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  label: {
    fontWeight: weight.semibold,
    letterSpacing: 0.02,
  },
});
