/**
 * SPIKE 15.1 — the bottom card of the map spike: locate error, distance
 * chip ("Pin location is X away…"), reverse-geocoded address, and the
 * geofence radius control (stepper pill + preset chips; the design's
 * slider was dropped by user decision 2026-09-26). Presentational — all
 * state lives in the screen.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';

import { colors, radius, shadow, spacing, typography } from '../../theme';
import { IconButton } from '../../components/ui';
import type { GeoPlace } from './geocoding';

const RADIUS_MIN_M = 50;
const RADIUS_MAX_M = 1000;
const RADIUS_CHIPS = [50, 100, 200, 500, 1000];

/** +/− move one preset notch (50 → 100 → 200 → 500 → 1000). */
function stepRadius(current: number, direction: -1 | 1): number {
  const i = RADIUS_CHIPS.indexOf(current);
  const next = i === -1 ? 0 : Math.min(RADIUS_CHIPS.length - 1, Math.max(0, i + direction));
  return RADIUS_CHIPS[next];
}

interface Props {
  address: GeoPlace | null;
  geoFailed: boolean;
  distanceLabel: string | null;
  locateError: string | null;
  radiusM: number;
  onRadiusChange: (next: number) => void;
}

export function MapSpikeDetailsCard({
  address,
  geoFailed,
  distanceLabel,
  locateError,
  radiusM,
  onRadiusChange,
}: Props) {
  return (
    <View style={styles.card}>
      {locateError ? <Text style={styles.errorText}>{locateError}</Text> : null}
      {distanceLabel ? (
        <View style={styles.distanceChip}>
          <Text style={styles.distanceText}>{distanceLabel}</Text>
        </View>
      ) : null}
      <View style={styles.addressRow}>
        <View style={styles.addressText}>
          <Text style={styles.addressName} numberOfLines={1}>
            {address
              ? address.name
              : geoFailed
                ? 'Address unavailable'
                : 'Resolving address…'}
          </Text>
          <Text style={styles.addressFull} numberOfLines={2}>
            {address ? address.full : ' '}
          </Text>
        </View>
      </View>
      {/* Radius control — title/subtitle left, stepper pill right. */}
      <View style={styles.stepper}>
        <View style={styles.stepperCopy}>
          <Text style={styles.stepperTitle}>Geofence Radius</Text>
          <Text style={styles.stepperSubtitle}>
            Automated check-in triggers inside this boundary
          </Text>
        </View>
        <View style={styles.stepperPill}>
          <IconButton
            variant="ghost"
            size="sm"
            label="Decrease radius"
            onPress={() => onRadiusChange(stepRadius(radiusM, -1))}
            disabled={radiusM <= RADIUS_MIN_M}>
            <Minus size={20} color={colors.textStrong} strokeWidth={2} />
          </IconButton>
          <Text style={styles.radiusValue}>
            {radiusM >= 1000 ? '1 km' : `${radiusM} m`}
          </Text>
          <IconButton
            variant="ghost"
            size="sm"
            label="Increase radius"
            onPress={() => onRadiusChange(stepRadius(radiusM, +1))}
            disabled={radiusM >= RADIUS_MAX_M}>
            <Plus size={20} color={colors.textStrong} strokeWidth={2} />
          </IconButton>
        </View>
      </View>
      {/* One-tap presets — absolute values; the screen's setter clamps. */}
      <View style={styles.chipRow}>
        {RADIUS_CHIPS.map((chip) => {
          const selected = chip === radiusM;
          return (
            <Pressable
              key={chip}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onRadiusChange(chip)}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {chip >= 1000 ? '1 km' : `${chip}m`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Floating card — margins keep it off the screen edges so the chips
    // and stepper pill don't butt against the bezel.
    marginHorizontal: spacing.s4,
    marginBottom: spacing.s4,
    borderRadius: radius.lg,
    padding: spacing.s4,
    gap: spacing.s3,
    backgroundColor: colors.surfaceCard,
    ...shadow.sm,
  },
  errorText: {
    ...typography.bodySm,
    color: colors.danger,
  },
  distanceChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
  },
  distanceText: {
    ...typography.bodySm,
    color: colors.textStrong,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  addressText: {
    flex: 1,
    gap: 1,
  },
  addressName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textStrong,
  },
  addressFull: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  stepperCopy: {
    flex: 1,
    gap: 2,
  },
  stepperTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textStrong,
  },
  stepperSubtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  stepperPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfacePage,
    borderRadius: radius['2xl'],
    paddingHorizontal: spacing.s1,
    paddingVertical: spacing.s1,
  },
  radiusValue: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textStrong,
    minWidth: 64,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // 44px — the minimum touch target.
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  chipSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    ...typography.body,
    color: colors.textStrong,
  },
  chipTextSelected: {
    fontWeight: '700',
    color: colors.primary,
  },
});
