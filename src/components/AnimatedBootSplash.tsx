/**
 * Premium animated splash — seamless handoff from the native BootSplash,
 * choreographed with react-native-reanimated.
 *
 * BootSplash.useHideAnimation renders an exact replica of the native splash
 * (brand-blue background + white F at the native size/position), so frame one
 * is identical to the OS launch surface — zero flash, zero jump. From there:
 *
 *   1. The brand gradient blooms in over the solid blue.
 *   2. A white logo card springs in behind the F.
 *   3. The F "colorizes" in place — the native white F cross-fades into the
 *      colored mark (it literally becomes the card logo, no movement).
 *   4. "Fenzit" + tagline spring up; a shimmer sweeps the card.
 *   5. The scene lifts + fades, handing off to the app.
 *
 * Reanimated honors the OS "reduce motion" setting automatically.
 * The colored F is counter-scaled against the card so it stays pinned at the
 * exact native logo size while the card grows behind it.
 */

import { StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import BootSplash from 'react-native-bootsplash';
import { palette, radius, shadow, spacing, weight, fontSize } from '../theme';

type Props = {
  onAnimationEnd: () => void;
};

const CARD = 160;
const INNER = 120; // == native logoWidth, so the colored F overlays the white F

function AnimatedBootSplash({ onAnimationEnd }: Props) {
  const { width, height } = useWindowDimensions();

  const gradient = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);
  const whiteF = useSharedValue(1);
  const colorF = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const textY = useSharedValue(16);
  const textOp = useSharedValue(0);
  const tagY = useSharedValue(16);
  const tagOp = useSharedValue(0);
  const sceneOpacity = useSharedValue(1);
  const sceneScale = useSharedValue(1);

  const { container, logo } = BootSplash.useHideAnimation({
    manifest: require('../../assets/bootsplash/manifest.json'),
    logo: require('../../assets/bootsplash/logo.png'),
    statusBarTranslucent: true,
    navigationBarTranslucent: false,
    animate: () => {
      // Reanimated v4 durations are "perceptual" (actual ≈ 1.5×); scale back.
      const d = (ms: number) => ms / 1.5;

      gradient.value = withTiming(1, { duration: d(450) });
      cardOpacity.value = withDelay(120, withTiming(1, { duration: d(300) }));
      cardScale.value = withDelay(
        120,
        withSpring(1, { damping: 13, stiffness: 150, mass: 0.9 }),
      );
      colorF.value = withDelay(360, withTiming(1, { duration: d(360) }));
      whiteF.value = withDelay(360, withTiming(0, { duration: d(360) }));
      shimmer.value = withDelay(
        520,
        withTiming(1, { duration: d(720), easing: Easing.inOut(Easing.quad) }),
      );
      textY.value = withDelay(420, withSpring(0, { damping: 15, stiffness: 140 }));
      textOp.value = withDelay(420, withTiming(1, { duration: d(340) }));
      tagY.value = withDelay(560, withSpring(0, { damping: 15, stiffness: 140 }));
      tagOp.value = withDelay(560, withTiming(1, { duration: d(360) }));

      sceneScale.value = withDelay(
        1600,
        withTiming(1.06, { duration: d(420), easing: Easing.in(Easing.cubic) }),
      );
      sceneOpacity.value = withDelay(
        1600,
        withTiming(
          0,
          { duration: d(420), easing: Easing.in(Easing.cubic) },
          finished => {
            if (finished) {
              scheduleOnRN(onAnimationEnd);
            }
          },
        ),
      );
    },
  });

  const sceneStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value,
    transform: [{ scale: sceneScale.value }],
  }));
  const gradientStyle = useAnimatedStyle(() => ({ opacity: gradient.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));
  // Counter-scale keeps the colored F pinned at the native logo size.
  const colorFStyle = useAnimatedStyle(() => ({
    opacity: colorF.value,
    transform: [{ scale: 1 / cardScale.value }],
  }));
  const whiteFStyle = useAnimatedStyle(() => ({ opacity: whiteF.value }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(shimmer.value, [0, 1], [-CARD * 0.9, CARD * 0.9]) },
      { rotate: '18deg' },
    ],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: textOp.value,
    transform: [{ translateY: textY.value }],
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagOp.value,
    transform: [{ translateY: tagY.value }],
  }));

  return (
    <Animated.View {...container} style={[container.style, styles.scene, sceneStyle]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Brand gradient + soft glow, blooming in over the solid blue */}
      <Animated.View style={[StyleSheet.absoluteFill, gradientStyle]}>
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          <Defs>
            <LinearGradient id="bg" x1="0" y1="0" x2="0.25" y2="1">
              <Stop offset="0" stopColor={palette.blue900} />
              <Stop offset="0.55" stopColor={palette.blue600} />
              <Stop offset="1" stopColor={palette.green500} />
            </LinearGradient>
            <RadialGradient id="glow" cx="50%" cy="42%" r="55%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={width} height={height} fill="url(#bg)" />
          <Rect x="0" y="0" width={width} height={height} fill="url(#glow)" />
        </Svg>
      </Animated.View>

      {/* Card centered exactly on the native logo center */}
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Animated.View style={[styles.card, shadow.lg, cardStyle]}>
          <Animated.Image
            source={require('../assets/branding/logo.png')}
            style={[styles.fLogo, colorFStyle]}
            resizeMode="contain"
          />
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

      {/* Wordmark + tagline, just below the card */}
      <View
        pointerEvents="none"
        style={[styles.textWrap, { top: height / 2 + CARD / 2 + spacing.s6 }]}>
        <Animated.Text style={[styles.wordmark, textStyle]}>Fenzit</Animated.Text>
        <Animated.Text style={[styles.tagline, tagStyle]}>
          Field management, simplified
        </Animated.Text>
      </View>

      {/* Native white F (seamless start) — cross-fades into the colored mark */}
      <Animated.Image {...logo} style={[logo.style, whiteFStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: {
    backgroundColor: palette.blue600,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: CARD,
    height: CARD,
    borderRadius: radius['2xl'],
    backgroundColor: palette.gray0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
  textWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  wordmark: {
    color: palette.gray0,
    fontSize: 30,
    fontWeight: weight.extra,
    letterSpacing: 0.5,
  },
  tagline: {
    marginTop: spacing.s2,
    color: 'rgba(255,255,255,0.82)',
    fontSize: fontSize.sm,
    fontWeight: weight.medium,
    letterSpacing: 0.3,
  },
});

export default AnimatedBootSplash;
