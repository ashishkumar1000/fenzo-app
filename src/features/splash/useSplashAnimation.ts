/**
 * The splash animation timeline.
 *
 * Owns every shared value and the single `animate()` sequence that drives the
 *  scene and wires it to BootSplash.useHideAnimation for a seamless handoff
 * from the native splash. Visual components consume these shared values and map
 * them to their own styles, so the timeline lives in exactly one place.
 *
 * Reanimated v4 durations are "perceptual" (actual ≈ 1.5×), hence the d() helper.
 */
import {
  Easing,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import BootSplash from 'react-native-bootsplash';

export function useSplashAnimation(onAnimationEnd: () => void) {
  const gradient = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);
  const whiteF = useSharedValue(1);
  const colorF = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const sceneOpacity = useSharedValue(1);
  const sceneScale = useSharedValue(1);
  // Continuous "alive" loops (sensible mid-values for the reduce-motion case).
  const pulse = useSharedValue(0.4);
  const aurora1 = useSharedValue(0.5);
  const aurora2 = useSharedValue(0.5);

  const { container, logo } = BootSplash.useHideAnimation({
    manifest: require('../../../assets/bootsplash/manifest.json'),
    logo: require('../../../assets/bootsplash/logo.png'),
    statusBarTranslucent: true,
    navigationBarTranslucent: false,
    animate: () => {
      const d = (ms: number) => ms / 1.5;

      gradient.value = withTiming(1, { duration: d(450) });
      cardOpacity.value = withDelay(120, withTiming(1, { duration: d(300) }));
      cardScale.value = withDelay(
        120,
        withTiming(1, { duration: d(440), easing: Easing.out(Easing.cubic) }),
      );
      colorF.value = withDelay(360, withTiming(1, { duration: d(360) }));
      whiteF.value = withDelay(360, withTiming(0, { duration: d(360) }));
      shimmer.value = withDelay(
        520,
        withTiming(1, { duration: d(720), easing: Easing.inOut(Easing.quad) }),
      );

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

  return {
    container,
    logo,
    gradient,
    cardScale,
    cardOpacity,
    whiteF,
    colorF,
    shimmer,
    sceneOpacity,
    sceneScale,
    pulse,
    aurora1,
    aurora2,
  };
}
