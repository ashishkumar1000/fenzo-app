/**
 * Fenzit onboarding — a 3-page benefit tour (Assign → Track → Done).
 *
 * Best-practice choices: one idea per screen, benefit-led copy, a Skip on every
 * screen, progress dots for orientation, and a clear single CTA that becomes
 * "Get started" on the last page. Pages animate from the scroll position.
 */
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { ArrowRight } from 'lucide-react-native';
import { Button } from '../../components/ui';
import { colors, fontSize, palette, spacing, weight } from '../../theme';
import { SLIDES } from './data';
import { OnboardingSlide } from './components/OnboardingSlide';
import { ProgressDots } from './components/ProgressDots';

type Props = {
  onDone: () => void;
};

export default function OnboardingScreen({ onDone }: Props) {
  const { width } = useWindowDimensions();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);

  const onScroll = useAnimatedScrollHandler(event => {
    scrollX.value = event.contentOffset.x;
  });

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const isLast = index === SLIDES.length - 1;

  const handleNext = () => {
    if (isLast) {
      onDone();
    } else {
      scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button">
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumEnd}>
        {SLIDES.map((slide, i) => (
          <OnboardingSlide
            key={slide.key}
            slide={slide}
            index={i}
            scrollX={scrollX}
            width={width}
          />
        ))}
      </Animated.ScrollView>

      <View style={styles.footer}>
        <ProgressDots count={SLIDES.length} scrollX={scrollX} width={width} />
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleNext}
          trailingIcon={
            isLast ? undefined : (
              <ArrowRight size={20} color={colors.onPrimary} strokeWidth={2.5} />
            )
          }
          style={styles.cta}>
          {isLast ? 'Get started' : 'Next'}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing.s5,
  },
  skip: {
    color: palette.gray500,
    fontSize: fontSize.sm,
    fontWeight: weight.medium,
  },
  footer: {
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s5,
    gap: spacing.s5,
  },
  cta: {
    marginTop: spacing.s2,
  },
});
