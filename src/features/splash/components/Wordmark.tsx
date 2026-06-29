/**
 * The "FENZIT" wordmark, drawn entirely in JS from rounded-rect glyphs (with
 * rotated bars for the N/Z diagonals) so each letter animates independently.
 * White letters with the brand teal accents (E middle bar, I tip, T corner).
 *
 * Reveal: each letter fades + rises on a smooth ease-out stagger; the E's teal
 * bar then draws in left-to-right. Reanimated honors "reduce motion".
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { palette } from '../../../theme';

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

const letterIn = (i: number) =>
  FadeInDown.delay(360 + i * 55)
    .duration(460)
    .easing(Easing.out(Easing.cubic))
    .withInitialValues({ transform: [{ translateY: 14 }] });

export function Wordmark() {
  const eMid = useSharedValue(0);

  useEffect(() => {
    eMid.value = withDelay(
      820,
      withTiming(1, { duration: 320 / 1.5, easing: Easing.out(Easing.cubic) }),
    );
  }, [eMid]);

  const eMidStyle = useAnimatedStyle(() => ({ width: eMid.value * E_W }));

  return (
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
      <Animated.View
        entering={letterIn(5)}
        style={[styles.glyph, { width: 28, marginRight: 0 }]}>
        <Bar x={0} y={0} w={28} h={TH} />
        <Bar x={21} y={0} w={7} h={TH} color={TEAL} />
        <Bar x={(28 - TH) / 2} y={0} w={TH} h={CAP} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    height: CAP,
  },
  glyph: {
    height: CAP,
    marginRight: GAP,
  },
});
