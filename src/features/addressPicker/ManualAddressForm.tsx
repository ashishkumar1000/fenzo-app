/**
 * ManualAddressForm — free-text fallback inside `AddressPickerSheet` for
 * addresses Google Places can't find. Reached from the no-results state's
 * "Enter manually" CTA; lives inside the same sheet so the user never
 * leaves the picker mid-entry.
 *
 * Emits a `ManualAddressEntry` — deliberately NOT a `ResolvedPlace`: a
 * resolved place always carries a real `placeId` and coordinates (the map
 * snapshot fields), which a hand-typed address can never honestly have.
 * The caller stores only the address line and optional city; the create
 * payload's snapshot block stays omitted (see `AddCustomerScreen`'s gating
 * on `placeId`). There is deliberately no Pincode field: the structured
 * `pincode` belongs to a resolved snapshot only, and a separate input whose
 * value would be silently discarded is worse than no input — users can type
 * the pincode into the address line if they want it recorded.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { Button, Input } from '../../components/ui';
import { colors, spacing, touch, typography } from '../../theme';

export type ManualAddressEntry = {
  addressLine: string;
  city: string | null;
};

type Props = {
  /** Returns to the search UI (the hook's last phase is still intact). */
  onBack: () => void;
  /** Fires on "Use this address". The caller closes the sheet — same
   *  contract as `onResolved`. */
  onUse: (entry: ManualAddressEntry) => void;
};

export function ManualAddressForm({ onBack, onUse }: Props) {
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');

  const canUse = addressLine.trim().length > 0;

  const handleUse = () => {
    if (!canUse) return;
    // The optional city is nulled rather than sent as "" — matches the
    // request-mapping rule the rest of the app follows (store null, not '').
    onUse({
      addressLine: addressLine.trim(),
      city: city.trim() || null,
    });
  };

  return (
    <View style={styles.form}>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back to address search"
        style={styles.backButton}>
        <ArrowLeft size={18} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.backText}>Back to search</Text>
      </Pressable>

      <Input
        label="Address"
        required
        value={addressLine}
        onChangeText={setAddressLine}
        placeholder="e.g. Flat 302, Sunrise Apartments, Andheri West"
        autoCapitalize="words"
      />

      <Input
        label="City"
        value={city}
        onChangeText={setCity}
        placeholder="Mumbai"
        autoCapitalize="words"
      />

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!canUse}
        onPress={handleUse}>
        Use this address
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.s3,
    paddingBottom: spacing.s6,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    minHeight: touch.min,
    alignSelf: 'flex-start',
  },
  backText: {
    ...typography.bodyStrong,
    color: colors.textBody,
  },
});