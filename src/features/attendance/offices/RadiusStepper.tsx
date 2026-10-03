/**
 * RadiusStepper — the geofence radius control (Story 15-4). Stepper −/+
 * in 50 m steps plus quick preset chips (100/200/500 m), clamped to the
 * DB range 50–1000 (15-3 CHECKs) so a 422 can never happen in practice.
 * The value is announced to screen readers on every change ("Radius,
 * 100 metres") and the circle redraws live — no preview step (UX-DR3).
 */
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';

export const RADIUS_MIN_M = 50;
export const RADIUS_MAX_M = 1000;
const STEP_M = 50;
const PRESETS_M = [100, 200, 500] as const;

type Props = {
  radiusM: number;
  onChange: (next: number) => void;
};

export default function RadiusStepper({ radiusM, onChange }: Props) {
  const clamp = (next: number) =>
    Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, next));

  const apply = (next: number) => {
    const clamped = clamp(next);
    if (clamped === radiusM) return;
    onChange(clamped);
    // Every change is announced, per the accessibility requirement.
    AccessibilityInfo.announceForAccessibility(`Radius, ${clamped} metres`);
  };

  return (
    <View accessibilityLabel={`Radius, ${radiusM} metres`}>
      <View style={styles.stepperRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease radius"
          accessibilityState={{ disabled: radiusM <= RADIUS_MIN_M }}
          disabled={radiusM <= RADIUS_MIN_M}
          onPress={() => apply(radiusM - STEP_M)}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}>
          <Minus size={18} color={colors.textStrong} strokeWidth={2} />
        </Pressable>
        <View style={styles.readout}>
          <Text style={styles.readoutValue}>{radiusM} m</Text>
          <Text style={styles.readoutLabel}>check-in distance</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase radius"
          accessibilityState={{ disabled: radiusM >= RADIUS_MAX_M }}
          disabled={radiusM >= RADIUS_MAX_M}
          onPress={() => apply(radiusM + STEP_M)}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}>
          <Plus size={18} color={colors.textStrong} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.presetsRow}>
        {PRESETS_M.map((preset) => (
          <Pressable
            key={preset}
            accessibilityRole="button"
            accessibilityLabel={`Set radius to ${preset} metres`}
            onPress={() => apply(preset)}
            style={({ pressed }) => [
              styles.preset,
              preset === radiusM && styles.presetActive,
              pressed && styles.pressed,
            ]}>
            <Text
              style={[
                styles.presetText,
                preset === radiusM && styles.presetTextActive,
              ]}>
              {preset} m
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  readout: {
    alignItems: 'center',
    minWidth: 110,
  },
  readoutValue: {
    ...typography.heading,
    color: colors.textStrong,
  },
  readoutLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.s2,
    marginTop: spacing.s3,
  },
  preset: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.s3,
    // The 44px touch-target floor (the stepper buttons are 44×44 too).
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
  },
  presetActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  presetText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textMuted,
  },
  presetTextActive: {
    color: colors.primary,
  },
});
