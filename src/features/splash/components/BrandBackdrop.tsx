/**
 * Full-screen brand gradient + soft center glow that blooms in over the solid
 * blue base.
 */
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { palette } from '../../../theme';

type Props = {
  gradient: SharedValue<number>;
};

export function BrandBackdrop({ gradient }: Props) {
  const { width, height } = useWindowDimensions();
  const style = useAnimatedStyle(() => ({ opacity: gradient.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
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
  );
}
