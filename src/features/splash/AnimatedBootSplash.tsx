/**
 * Premium animated splash — seamless handoff from the native BootSplash.
 *
 * This file only composes the scene; the animation timeline lives in
 * useSplashAnimation, and each visual is its own component:
 *   - BrandBackdrop  brand gradient + glow (blooms in)
 *   - GlowHalo       breathing halo behind the card
 *   - LogoCard       glass card + aurora + shimmer + colored F
 *   - Wordmark       JS-drawn FENZIT, letter-by-letter
 *   - Tagline        "Assign. Track. Done."
 * The native white F (from useHideAnimation) is rendered last and cross-fades
 * into the colored mark for a movement-free handoff.
 */
import { StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { palette, spacing } from '../../theme';
import { CARD } from './constants';
import { useSplashAnimation } from './useSplashAnimation';
import { BrandBackdrop } from './components/BrandBackdrop';
import { GlowHalo } from './components/GlowHalo';
import { LogoCard } from './components/LogoCard';
import { Wordmark } from './components/Wordmark';
import { Tagline } from './components/Tagline';

type Props = {
  onAnimationEnd: () => void;
};

function AnimatedBootSplash({ onAnimationEnd }: Props) {
  const { height } = useWindowDimensions();
  const s = useSplashAnimation(onAnimationEnd);

  const sceneStyle = useAnimatedStyle(() => ({
    opacity: s.sceneOpacity.value,
    transform: [{ scale: s.sceneScale.value }],
  }));
  const whiteFStyle = useAnimatedStyle(() => ({ opacity: s.whiteF.value }));

  return (
    <Animated.View {...s.container} style={[s.container.style, styles.scene, sceneStyle]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <BrandBackdrop gradient={s.gradient} />
      <GlowHalo pulse={s.pulse} cardOpacity={s.cardOpacity} />
      <LogoCard
        cardScale={s.cardScale}
        cardOpacity={s.cardOpacity}
        colorF={s.colorF}
        shimmer={s.shimmer}
        aurora1={s.aurora1}
        aurora2={s.aurora2}
      />

      {/* Wordmark + tagline, just below the card */}
      <View
        pointerEvents="none"
        style={[styles.textWrap, { top: height / 2 + CARD / 2 + spacing.s6 }]}>
        <Wordmark />
        <Tagline />
      </View>

      {/* Native white F (seamless start) — cross-fades into the colored mark */}
      <Animated.Image {...s.logo} style={[s.logo.style, whiteFStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: {
    backgroundColor: palette.blue600,
  },
  textWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});

export default AnimatedBootSplash;
