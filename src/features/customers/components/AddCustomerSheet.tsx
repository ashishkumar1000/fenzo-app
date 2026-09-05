/**
 * AddCustomerSheet — bottom-sheet form to add a customer (name + phone, plus
 * optional city, area and address). Uses the DS `Sheet` (native TrueSheet)
 * at a fixed 85% detent with a scrollable body, so the submit button stays
 * pinned and the form still reaches it on small screens with the keyboard up.
 *
 * Local form state lives here because it's tied to this form's own UX, but
 * persistence stays with the parent: `onSubmit` does the `POST /customers`
 * call and this sheet only reacts to whether that promise resolves or rejects
 * (close + reset vs. show the error and stay open).
 */
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MapPin, Phone, User, UserPlus } from 'lucide-react-native';
import { Button, Input, Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { ApiError } from '../../../services';
import { DIAL_CODE, PHONE_LENGTH } from '../constants';
import type { NewCustomerInput } from '../types';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Performs the actual save. Rejects with `ApiError` on failure. */
  onSubmit: (input: NewCustomerInput) => Promise<void>;
};

/**
 * Turns a failed `POST /customers` into copy this sheet can show directly.
 * Codes follow the endpoint's documented failures.
 */
function createErrorMessage(err: ApiError): string {
  if (err.status === 409 || err.code === 'DUPLICATE_RESOURCE') {
    return 'A customer with this phone number already exists.';
  }
  if (err.status === 422 || err.code === 'VALIDATION_ERROR') {
    return 'Check the name and phone number — one of them looks invalid.';
  }
  if (err.status === 403) {
    return 'Only the business owner can add customers.';
  }
  if (err.status === 400) {
    return 'Finish setting up your company before adding customers.';
  }
  return err.message;
}

export function AddCustomerSheet({ visible, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const canSubmit =
    name.trim().length > 0 && phone.length === PHONE_LENGTH && !submitting;

  const reset = () => {
    setName('');
    setPhone('');
    setCity('');
    setArea('');
    setAddress('');
    setSubmitError('');
  };

  const handleClose = () => {
    // Don't let a backdrop tap, the X, or the Android back button dismiss the
    // sheet mid-request: the save is already in flight, and closing now would
    // let its eventual `catch` write into a sheet the user no longer sees.
    if (submitting) return;
    reset();
    onClose();
  };

  /**
   * Any edit clears a previous submit error — the user is most likely fixing
   * exactly what the server complained about, so a stale 422 shouldn't sit
   * under the form while they do.
   */
  const editField = (setter: (value: string) => void) => (text: string) => {
    if (submitError) setSubmitError('');
    setter(text);
  };

  const handlePhoneChange = editField(text =>
    setPhone(text.replace(/[^0-9]/g, '').slice(0, PHONE_LENGTH)),
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await onSubmit({
        name: name.trim(),
        phone,
        city: city.trim(),
        area: area.trim(),
        address: address.trim(),
      });
      reset();
      onClose();
    } catch (err) {
      setSubmitError(createErrorMessage(err as ApiError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={handleClose}
      title="Add customer"
      subtitle="Saved for future bookings too"
      detents={[0.85]}
      scrollable>
      {/* Scrolls so the form still reaches the pinned submit button on small
          screens with the keyboard up (the `scrollable` sheet hands drags
          off to the native gesture). */}
      <ScrollView
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Input
          label="Customer name"
          required
          value={name}
          onChangeText={editField(setName)}
          placeholder="e.g. Ramesh Kumar"
          autoCapitalize="words"
          leadingIcon={<User size={18} color={colors.textMuted} strokeWidth={2} />}
        />

        <Input
          label="Phone number"
          required
          value={phone}
          onChangeText={handlePhoneChange}
          placeholder="98765 43210"
          keyboardType="phone-pad"
          maxLength={PHONE_LENGTH}
          leadingIcon={
            <View style={styles.dialRow}>
              <Phone size={18} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.dial}>{DIAL_CODE}</Text>
            </View>
          }
        />

        <View style={styles.row}>
          <Input
            label="City"
            value={city}
            onChangeText={editField(setCity)}
            placeholder="Mumbai"
            autoCapitalize="words"
            style={styles.rowItem}
          />
          <Input
            label="Area"
            value={area}
            onChangeText={editField(setArea)}
            placeholder="Andheri West"
            autoCapitalize="words"
            style={styles.rowItem}
          />
        </View>

        <Input
          label="Address / map location"
          value={address}
          onChangeText={editField(setAddress)}
          placeholder="Flat, building, street, landmark"
          helper="Technician can open this in Google Maps"
          leadingIcon={<MapPin size={18} color={colors.textMuted} strokeWidth={2} />}
        />
      </ScrollView>

      {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!canSubmit}
        onPress={handleSubmit}
        leadingIcon={
          <UserPlus size={20} color={colors.onPrimary} strokeWidth={2.5} />
        }>
        {submitting ? 'Saving…' : 'Add customer'}
      </Button>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.s4,
    paddingBottom: spacing.s2,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  rowItem: {
    flex: 1,
  },
  dialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dial: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  submitError: {
    ...typography.bodySm,
    color: colors.danger,
  },
});
