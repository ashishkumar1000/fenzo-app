/**
 * "Assign. Track. Done." — the three words reveal on beat (mirroring the
 * assign → track → done workflow), each on a smooth ease-out.
 */
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { fontSize, spacing, weight } from '../../../theme';

const WORDS = ['Assign.', 'Track.', 'Done.'];

export function Tagline() {
  return (
    <View style={styles.row}>
      {WORDS.map((word, i) => (
        <Animated.Text
          key={word}
          entering={FadeInDown.delay(980 + i * 160)
            .duration(440)
            .easing(Easing.out(Easing.cubic))}
          style={styles.word}>
          {word}
        </Animated.Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginTop: spacing.s5,
  },
  word: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: fontSize.sm,
    fontWeight: weight.medium,
    letterSpacing: 0.3,
    marginHorizontal: 4,
  },
});
