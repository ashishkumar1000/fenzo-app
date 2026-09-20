/**
 * ReportSkeleton — animated shimmer placeholder for report list items
 * (AC 7: 3 rows, 80px height, 0.8s ease-in-out animation).
 */
import { StyleSheet, View, Animated, Easing } from 'react-native';
import { useEffect, useRef } from 'react';
import { colors, spacing } from '../../../theme';

const SKELETON_HEIGHT = 80;
const ANIMATION_DURATION = 800;
const SKELETON_ROWS = 3;

function SkeletonRow() {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.loop(
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
    ).start();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeletonRow,
        {
          opacity,
          backgroundColor: colors.borderSubtle,
        },
      ]}
    />
  );
}

export function ReportSkeleton() {
  return (
    <View style={styles.container}>
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s3,
  },
  skeletonRow: {
    height: SKELETON_HEIGHT,
    borderRadius: 8,
  },
});
