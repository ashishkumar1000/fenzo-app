/**
 * OfficeLocationCard — the form's location summary row (Story 15-4).
 * Shows the picked pin (coordinates — the office stores coordinates only,
 * no address persistence) and opens the full-screen map picker. Shows the
 * field error inline when no pin has been placed.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Compass, MapPin, MapPinned } from 'lucide-react-native';
import { Badge, Button, Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { OfficeFormErrors, OfficeFormState } from './officeFormModel';

type Props = {
  form: OfficeFormState;
  errors: OfficeFormErrors;
  /** True while the pin is the device's own fix — shows "GPS Verified". */
  gpsVerified: boolean;
  /** Opens OfficeMapPicker with the current pin + radius. */
  onOpenPicker: () => void;
};

export default function OfficeLocationCard({ form, errors, gpsVerified, onOpenPicker }: Props) {
  const hasPin = form.latitude !== null && form.longitude !== null;
  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Location</Text>
          {/* Not a job state — the DS 'done' green is its positive/verified
              colour; the job-state 'progress' variant is a different token. */}
          {gpsVerified && hasPin ? <Badge status="done" size="sm">GPS Verified</Badge> : null}
        </View>

        <View style={styles.coordsPanel}>
          <View style={styles.pinChip}>
            <MapPin size={16} color={colors.textOnColor} strokeWidth={2} />
          </View>
          <View style={styles.coordsText}>
            <Text style={styles.coordsEyebrow}>Pin position</Text>
            <Text
              style={[styles.coordsValue, !hasPin && styles.coordsPlaceholder]}
              numberOfLines={1}>
              {hasPin
                ? `${form.latitude?.toFixed(5)}, ${form.longitude?.toFixed(5)}`
                : 'No pin placed yet'}
            </Text>
          </View>
          <Compass size={16} color={colors.textMuted} strokeWidth={2} />
        </View>

        {errors.location ? <Text style={styles.fieldError}>{errors.location}</Text> : null}

        <Button
          variant="secondary"
          fullWidth
          leadingIcon={<MapPinned size={16} color={colors.primary} strokeWidth={2} />}
          onPress={onOpenPicker}>
          {hasPin ? 'Adjust pin on map' : 'Place pin on map'}
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.s3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.heading,
    color: colors.textStrong,
  },
  coordsPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s3,
    borderRadius: radius.sm + 4, // inset panel between control (md) and card (lg)
    backgroundColor: colors.surfaceSunken,
  },
  pinChip: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  coordsText: {
    flex: 1,
    gap: 2,
  },
  coordsEyebrow: {
    ...typography.caption,
    color: colors.textMuted,
  },
  coordsValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textStrong,
  },
  coordsPlaceholder: {
    color: colors.textMuted,
    fontWeight: '400',
  },
  fieldError: {
    ...typography.bodySm,
    color: colors.danger,
  },
});
