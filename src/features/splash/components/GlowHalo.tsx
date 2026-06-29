/**
 * Breathing radial glow behind the logo card. Fades in with the card and
 * gently pulses (scale + opacity) on the looping `pulse` value.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { palette } from '../../../theme';
import { HALO } from '../constants';

type Props = {
  pulse: SharedValue<number>;
  cardOpacity: SharedValue<number>;
};

export function GlowHalo({ pulse, cardOpacity }: Props) {
  const style = useAnimatedStyle(() => ({
    opacity: (0.5 + 0.3 * pulse.value) * cardOpacity.value,
    transform: [{ scale: 1 + 0.07 * pulse.value }],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
      <Animated.View style={style}>
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
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
