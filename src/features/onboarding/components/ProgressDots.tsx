/**
 * Scroll-driven progress dots. The active dot widens into a pill and brightens
 * based on the pager's horizontal scroll position.
 */
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { palette } from '../../../theme';

type Props = {
  count: number;
  scrollX: SharedValue<number>;
  width: number;
};

function Dot({
  index,
  scrollX,
  width,
}: {
  index: number;
  scrollX: SharedValue<number>;
  width: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = scrollX.value / width;
    return {
      width: interpolate(
        p,
        [index - 1, index, index + 1],
        [8, 22, 8],
        Extrapolation.CLAMP,
      ),
      opacity: interpolate(
        p,
        [index - 1, index, index + 1],
        [0.3, 1, 0.3],
        Extrapolation.CLAMP,
      ),
    };
  });

  return <Animated.View style={[styles.dot, style]} />;
}

export function ProgressDots({ count, scrollX, width }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <Dot key={i} index={i} scrollX={scrollX} width={width} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.blue600,
    marginHorizontal: 4,
  },
});
