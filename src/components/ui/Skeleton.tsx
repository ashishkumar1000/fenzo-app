/**
 * Skeleton — the design system's animated loading placeholder (Story 19-4
 * D2, UX-DR5): `rows` shimmering blocks — the ReportSkeleton anatomy
 * MOVED VERBATIM (Story 12-6 AC 7: 3 rows, 80px, 0.8s ease-in-out loop),
 * plus the redesign's sheen: a translucent highlight bar sweeping across
 * each block (both loops per row start on mount — pure JS/RN Animated,
 * no native gradient module).
 *
 * The dashboard is its first NEW consumer ("used here first"); the monthly
 * view and the self view (19-5/19-6) reuse it, never rebuild. The old
 * report-local component is deleted — `ReportsScreen` renders `<Skeleton />`
 * unchanged in output (row count, anatomy and animation are identical).
 *
 * Rows carry the `colors.borderSubtle` block colour (never a status hue):
 * a skeleton promises "content is coming", not "content is fine".
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../theme';

const SKELETON_HEIGHT = 80;
const ANIMATION_DURATION = 800;
const SWEEP_DURATION = 1400;

function SkeletonRow({ height }: { height: number }) {
  // The block's fade pulse (the verbatim ReportSkeleton loop)…
  const opacity = useRef(new Animated.Value(0.5)).current;
  // …and the redesign's sheen: -1 → 1 maps to sweeping translateX
  // across the block's own width (percent translate keeps the sweep
  // correct at ANY block width).
  const sweep = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: ANIMATION_DURATION,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    // The loops NEVER stop on their own — an unmounted skeleton still
    // scheduling animation frames crashes the Jest worker (the suite's own
    // teardown discipline) and burns frames on a dead node.
    return () => {
      pulse.stop();
    };
  }, [opacity]);

  useEffect(() => {
    const sweepAnim = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: SWEEP_DURATION,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    sweepAnim.start();
    return () => {
      sweepAnim.stop();
    };
  }, [sweep]);

  return (
    <Animated.View
      style={[
        styles.skeletonRow,
        { height, opacity, backgroundColor: colors.borderSubtle, overflow: 'hidden' },
      ]}>
      <Animated.View
        style={StyleSheet.absoluteFill}
        pointerEvents="none">
        <Animated.View
          style={[
            styles.sheen,
            {
              backgroundColor: colors.shimmerSheen,
              transform: [
                {
                  translateX: sweep.interpolate({
                    inputRange: [-1, 1],
                    outputRange: ['-110%', '160%'],
                  }),
                },
              ],
            },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

export function Skeleton({
  rows = 3,
  height = SKELETON_HEIGHT,
}: {
  /** Pulsing blocks to render. */
  rows?: number;
  /** Row height — the dashboard composes tile-shaped placeholders
   *  (height 158, one per grid cell) from this same pulse; the default
   *  stays the 80px ReportSkeleton row the primitive moved verbatim. */
  height?: number;
}) {
  return (
    <View style={styles.container}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s3,
  },
  skeletonRow: {
    borderRadius: 8,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '55%',
    borderRadius: 8,
  },
});
