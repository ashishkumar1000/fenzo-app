/**
 * Premium animated splash — seamless handoff from the native BootSplash,
 * choreographed with react-native-reanimated.
 *
 * Frame one is an exact replica of the native splash (brand-blue + white F via
 * BootSplash.useHideAnimation), then:
 *   1. The brand gradient blooms in over the solid blue.
 *   2. A glass logo card springs in (breathing glow halo, living aurora inside,
 *      top highlight + rim light).
 *   3. The F colorizes in place (native white F → colored mark, no movement).
 *   4. The "FENZIT" wordmark — built entirely in JS from rounded-rect glyphs,
 *      with the brand teal accents — reveals letter-by-letter; the E's teal bar
 *      draws in. Tagline follows.
 *   5. A shimmer sweeps the card; the scene lifts + fades into the app.
 *
 * The wordmark is drawn in JS (not an image) so each letter is independently
 * animatable. Reanimated honors the OS "reduce motion" setting automatically.
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
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
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
const RADIUS = radius['2xl'];
const HALO = Math.round(CARD * 1.75);
const BLOB = Math.round(CARD * 0.95);
const BLOB_OFFSET = (CARD - BLOB) / 2;

// ---- JS wordmark geometry ----
const WHITE = palette.gray0;
const TEAL = palette.green500;
const CAP = 38; // cap height (px)
const TH = 6; // stroke thickness
const GAP = 12; // space between letters
const E_W = 26; // E width (used by the animated accent bar)

type BarProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  rotate?: string;
};

function Bar({ x, y, w, h, color = WHITE, rotate }: BarProps) {
  return (
    <View
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: Math.min(w, h) / 2,
        backgroundColor: color,
        transform: rotate ? [{ rotate }] : undefined,
      }}
    />
  );
}

// A diagonal stroke between two points, as a rotated bar.
function diag(x1: number, y1: number, x2: number, y2: number): BarProps {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    x: (x1 + x2) / 2 - len / 2,
    y: (y1 + y2) / 2 - TH / 2,
    w: len,
    h: TH,
    rotate: `${ang}deg`,
  };
}

function AnimatedBootSplash({ onAnimationEnd }: Props) {
  const { width, height } = useWindowDimensions();

  const gradient = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);
  const whiteF = useSharedValue(1);
  const colorF = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const eMid = useSharedValue(0); // E accent bar draw
  const sceneOpacity = useSharedValue(1);
  const sceneScale = useSharedValue(1);
  // Continuous "alive" loops (sensible mid-values for the reduce-motion case).
  const pulse = useSharedValue(0.4);
  const aurora1 = useSharedValue(0.5);
  const aurora2 = useSharedValue(0.5);

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
        withTiming(1, { duration: d(440), easing: Easing.out(Easing.cubic) }),
      );
      colorF.value = withDelay(360, withTiming(1, { duration: d(360) }));
      whiteF.value = withDelay(360, withTiming(0, { duration: d(360) }));
      eMid.value = withDelay(820, withTiming(1, { duration: d(320), easing: Easing.out(Easing.cubic) }));
      shimmer.value = withDelay(
        520,
        withTiming(1, { duration: d(720), easing: Easing.inOut(Easing.quad) }),
      );

      // Looping ambient motion (breathing halo + drifting aurora).
      pulse.value = withDelay(
        480,
        withRepeat(
          withTiming(1, { duration: d(1300), easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        ),
      );
      aurora1.value = withDelay(
        480,
        withRepeat(
          withTiming(1, { duration: d(3600), easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        ),
      );
      aurora2.value = withDelay(
        480,
        withRepeat(
          withTiming(0, { duration: d(4200), easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        ),
      );

      sceneScale.value = withDelay(
        2200,
        withTiming(1.06, { duration: d(420), easing: Easing.in(Easing.cubic) }),
      );
      sceneOpacity.value = withDelay(
        2200,
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
  const haloStyle = useAnimatedStyle(() => ({
    opacity: (0.5 + 0.3 * pulse.value) * cardOpacity.value,
    transform: [{ scale: 1 + 0.07 * pulse.value }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
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
  const eMidStyle = useAnimatedStyle(() => ({ width: eMid.value * E_W }));

  const letterIn = (i: number) =>
    FadeInDown.delay(360 + i * 55)
      .duration(460)
      .easing(Easing.out(Easing.cubic))
      .withInitialValues({ transform: [{ translateY: 14 }] });

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

      {/* Breathing glow halo behind the card */}
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Animated.View style={haloStyle}>
          <Svg width={HALO} height={HALO}>
            <Defs>
              <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={palette.blue600} stopOpacity="0.5" />
                <Stop offset="0.55" stopColor={palette.blue600} stopOpacity="0.14" />
                <Stop offset="1" stopColor={palette.blue600} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width={HALO} height={HALO} fill="url(#halo)" />
          </Svg>
        </Animated.View>
      </View>

      {/* Glass logo card */}
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
            source={require('../assets/branding/logo.png')}
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

      {/* JS wordmark + tagline, just below the card */}
      <View
        pointerEvents="none"
        style={[styles.textWrap, { top: height / 2 + CARD / 2 + spacing.s6 }]}>
        <View style={styles.wordmark}>
          {/* F */}
          <Animated.View entering={letterIn(0)} style={[styles.glyph, { width: 24 }]}>
            <Bar x={0} y={0} w={TH} h={CAP} />
            <Bar x={0} y={0} w={24} h={TH} />
            <Bar x={0} y={(CAP - TH) / 2} w={17} h={TH} />
          </Animated.View>
          {/* E (three bars; middle bar is the teal accent that draws in) */}
          <Animated.View entering={letterIn(1)} style={[styles.glyph, { width: E_W }]}>
            <Bar x={0} y={0} w={E_W} h={TH} />
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  top: (CAP - TH) / 2,
                  height: TH,
                  borderRadius: TH / 2,
                  backgroundColor: TEAL,
                },
                eMidStyle,
              ]}
            />
            <Bar x={0} y={CAP - TH} w={E_W} h={TH} />
          </Animated.View>
          {/* N */}
          <Animated.View entering={letterIn(2)} style={[styles.glyph, { width: 28 }]}>
            <Bar x={0} y={0} w={TH} h={CAP} />
            <Bar {...diag(TH / 2, 0, 28 - TH / 2, CAP)} />
            <Bar x={28 - TH} y={0} w={TH} h={CAP} />
          </Animated.View>
          {/* Z */}
          <Animated.View entering={letterIn(3)} style={[styles.glyph, { width: 26 }]}>
            <Bar x={0} y={0} w={26} h={TH} />
            <Bar {...diag(23, TH, 3, CAP - TH)} />
            <Bar x={0} y={CAP - TH} w={26} h={TH} />
          </Animated.View>
          {/* I (white stem + teal tip) */}
          <Animated.View entering={letterIn(4)} style={[styles.glyph, { width: TH }]}>
            <Bar x={0} y={0} w={TH} h={CAP} />
            <Bar x={0} y={0} w={TH} h={10} color={TEAL} />
          </Animated.View>
          {/* T (white bar + stem, teal accent at top-right) */}
          <Animated.View entering={letterIn(5)} style={[styles.glyph, { width: 28, marginRight: 0 }]}>
            <Bar x={0} y={0} w={28} h={TH} />
            <Bar x={21} y={0} w={7} h={TH} color={TEAL} />
            <Bar x={(28 - TH) / 2} y={0} w={TH} h={CAP} />
          </Animated.View>
        </View>

        <View style={styles.taglineRow}>
          {['Assign.', 'Track.', 'Done.'].map((w, i) => (
            <Animated.Text
              key={w}
              entering={FadeInDown.delay(980 + i * 160)
                .duration(440)
                .easing(Easing.out(Easing.cubic))}
              style={styles.taglineWord}>
              {w}
            </Animated.Text>
          ))}
        </View>
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
  textWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    height: CAP,
  },
  glyph: {
    height: CAP,
    marginRight: GAP,
  },
  taglineRow: {
    flexDirection: 'row',
    marginTop: spacing.s5,
  },
  taglineWord: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: fontSize.sm,
    fontWeight: weight.medium,
    letterSpacing: 0.3,
    marginHorizontal: 4,
  },
});

export default AnimatedBootSplash;
