/**
 * A single onboarding page: a gradient icon medallion above a title + body.
 * Both groups animate (parallax scale / fade / rise) from the pager scroll
 * position, so the content "settles" as each page reaches center.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import {
  palette,
  radius,
  shadow,
  spacing,
  typography,
  fontSize,
  weight,
  leading,
} from '../../../theme';
import type { Slide } from '../data';

const MED = 132; // medallion size

type Props = {
  slide: Slide;
  index: number;
  scrollX: SharedValue<number>;
  width: number;
};

export function OnboardingSlide({ slide, index, scrollX, width }: Props) {
  const iconStyle = useAnimatedStyle(() => {
    const p = scrollX.value / width;
    return {
      opacity: interpolate(
        p,
        [index - 0.7, index, index + 0.7],
        [0, 1, 0],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          scale: interpolate(
            p,
            [index - 1, index, index + 1],
            [0.6, 1, 0.6],
            Extrapolation.CLAMP,
          ),
        },
        {
          translateY: interpolate(
            p,
            [index - 1, index, index + 1],
            [36, 0, 36],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const textStyle = useAnimatedStyle(() => {
    const p = scrollX.value / width;
    return {
      opacity: interpolate(
        p,
        [index - 0.5, index, index + 0.5],
        [0, 1, 0],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateY: interpolate(
            p,
            [index - 1, index, index + 1],
            [24, 0, 24],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const gid = `med-${slide.key}`;

  return (
    <View style={[styles.slide, { width }]}>
      <Animated.View
        style={[styles.medallion, shadow.lg, { backgroundColor: slide.from }, iconStyle]}>
        <Svg style={StyleSheet.absoluteFill} width={MED} height={MED}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={slide.from} />
              <Stop offset="1" stopColor={slide.to} />
            </LinearGradient>
          </Defs>
          <Rect width={MED} height={MED} rx={radius['2xl']} fill={`url(#${gid})`} />
        </Svg>
        <slide.Icon size={58} color={palette.gray0} strokeWidth={2} />
      </Animated.View>

      <Animated.View style={[styles.textBlock, textStyle]}>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s6,
  },
  medallion: {
    width: MED,
    height: MED,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s8,
  },
  textBlock: {
    alignItems: 'center',
  },
  title: {
    ...typography.title,
    color: palette.gray900,
    textAlign: 'center',
    marginBottom: spacing.s3,
  },
  body: {
    fontSize: fontSize.base,
    fontWeight: weight.regular,
    lineHeight: Math.round(fontSize.base * leading.relaxed),
    color: palette.gray700,
    textAlign: 'center',
    maxWidth: 320,
  },
});
