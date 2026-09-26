/**
 * PickerBottomCard — the map picker's bottom panel (Story 15-4): the
 * "Pinned near:" reverse-geocode row (with coordinate fallback), the
 * locate-me error + settings deep-link, the accessible radius stepper, and
 * the Confirm action that returns the FINAL pin to the form.
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import RadiusStepper from './RadiusStepper';

type Props = {
  addressRow: string;
  addressLoading: boolean;
  locateError: string | null;
  canOpenSettings: boolean;
  onOpenSettings: () => void;
  radiusM: number;
  onRadiusChange: (next: number) => void;
  onConfirm: () => void;
};

export default function PickerBottomCard({
  addressRow,
  addressLoading,
  locateError,
  canOpenSettings,
  onOpenSettings,
  radiusM,
  onRadiusChange,
  onConfirm,
}: Props) {
  return (
    <View style={styles.sheet}>
      <View style={styles.addressRow}>
        {addressLoading ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : null}
        <Text style={styles.addressText} numberOfLines={2}>
          {addressRow}
        </Text>
      </View>
      {locateError ? (
        <View style={styles.locateErrorRow}>
          <Text style={styles.locateErrorText}>{locateError}</Text>
          {canOpenSettings ? (
            <Button variant="ghost" onPress={onOpenSettings}>
              Open settings
            </Button>
          ) : null}
        </View>
      ) : null}
      <RadiusStepper radiusM={radiusM} onChange={onRadiusChange} />
      <Button fullWidth onPress={onConfirm}>
        Confirm location
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    padding: spacing.s4,
    backgroundColor: colors.surfaceCard,
    // Sheets/modals token — this card is the picker's bottom sheet panel.
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginBottom: spacing.s3,
    minHeight: 20,
  },
  addressText: {
    ...typography.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  locateErrorRow: {
    marginBottom: spacing.s3,
    gap: spacing.s1,
  },
  locateErrorText: {
    ...typography.bodySm,
    color: colors.danger,
  },
});
