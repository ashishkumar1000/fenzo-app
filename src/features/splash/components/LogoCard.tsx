/**
 * The glass logo card: gradient fill, top highlight, rim light, a living
 * dual-blob aurora, the colored F mark, and a shimmer sweep.
 *
 * The colored F is counter-scaled against the card so it stays pinned at the
 * exact native logo size while the card grows behind it.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { palette, shadow } from '../../../theme';
import { BLOB, BLOB_OFFSET, CARD, INNER, RADIUS } from '../constants';

type Props = {
  cardScale: SharedValue<number>;
  cardOpacity: SharedValue<number>;
  colorF: SharedValue<number>;
  shimmer: SharedValue<number>;
  aurora1: SharedValue<number>;
  aurora2: SharedValue<number>;
};

export function LogoCard({
  cardScale,
  cardOpacity,
  colorF,
  shimmer,
  aurora1,
  aurora2,
}: Props) {
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));
  const colorFStyle = useAnimatedStyle(() => ({
    opacity: colorF.value,
    transform: [{ scale: 1 / cardScale.value }],
  }));
  const blob1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(aurora1.value, [0, 1], [-16, 16]) },
      { translateY: interpolate(aurora1.value, [0, 1], [12, -14]) },
    ],
  }));
  const blob2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(aurora2.value, [0, 1], [14, -18]) },
      { translateY: interpolate(aurora2.value, [0, 1], [-12, 14]) },
    ],
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(shimmer.value, [0, 1], [-CARD * 0.9, CARD * 0.9]) },
      { rotate: '18deg' },
    ],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
      <Animated.View style={[styles.card, shadow.lg, cardStyle]}>
        {/* Gradient fill + top highlight + rim light */}
        <Svg style={StyleSheet.absoluteFill} width={CARD} height={CARD}>
          <Defs>
            <LinearGradient id="cardFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={palette.gray0} />
              <Stop offset="1" stopColor={palette.blue50} />
            </LinearGradient>
            <RadialGradient id="cardHi" cx="50%" cy="16%" r="62%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
            <LinearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
              <Stop offset="1" stopColor={palette.blue600} stopOpacity="0.18" />
            </LinearGradient>
          </Defs>
          <Rect width={CARD} height={CARD} rx={RADIUS} fill="url(#cardFill)" />
          <Rect width={CARD} height={CARD} rx={RADIUS} fill="url(#cardHi)" />
          <Rect
            x={0.75}
            y={0.75}
            width={CARD - 1.5}
            height={CARD - 1.5}
            rx={RADIUS - 0.75}
            fill="none"
            stroke="url(#rim)"
            strokeWidth={1.5}
          />
        </Svg>

        {/* Living aurora behind the F (clipped by the card) */}
        <Animated.View style={[styles.blob, blob1Style]}>
          <Svg width={BLOB} height={BLOB}>
            <Defs>
              <RadialGradient id="a1" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={palette.blue600} stopOpacity="0.18" />
                <Stop offset="1" stopColor={palette.blue600} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width={BLOB} height={BLOB} fill="url(#a1)" />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.blob, blob2Style]}>
          <Svg width={BLOB} height={BLOB}>
            <Defs>
              <RadialGradient id="a2" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={palette.green500} stopOpacity="0.16" />
                <Stop offset="1" stopColor={palette.green500} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width={BLOB} height={BLOB} fill="url(#a2)" />
          </Svg>
        </Animated.View>

        <Animated.Image
          source={require('../../../assets/branding/logo.png')}
          style={[styles.fLogo, colorFStyle]}
          resizeMode="contain"
        />

        {/* Shimmer sweep */}
        <Animated.View style={[styles.shimmer, shimmerStyle]} pointerEvents="none">
          <Svg width={CARD * 0.5} height={CARD * 1.9}>
            <Defs>
              <LinearGradient id="sh" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.5" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={CARD * 0.5} height={CARD * 1.9} fill="url(#sh)" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: CARD,
    height: CARD,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    left: BLOB_OFFSET,
    top: BLOB_OFFSET,
  },
  fLogo: {
    width: INNER,
    height: INNER,
  },
  shimmer: {
    position: 'absolute',
    top: -CARD * 0.45,
    left: 0,
  },
});
