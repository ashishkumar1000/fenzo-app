/**
 * AddCustomerScreen — full-page route for adding a customer (name + phone,
 * plus optional city, area and address).
 *
 * Previously (Story 1.5) this form lived in `AddCustomerSheet`, a native
 * bottom-sheet modal, with the address picker (`AddressPickerScreen`) pushed
 * as a full-screen route on top of it. On a physical device that combination
 * silently dismissed the open sheet — pushing a stack screen over a
 * presented native modal closes the modal on the native side even though its
 * JS `visible` state doesn't change. Making this a full page removes the
 * conflict: the address picker now opens as `AddressPickerSheet`, a modal
 * nested *within* this screen, never navigated to.
 *
 * `returnRouteName` decides what happens after a successful save:
 * - `'Customers'`: the shared `useCustomers` store already reflects the new
 *   row (via `upsertCustomer`), so a plain `goBack()` is enough — no data
 *   needs to travel back through navigation params.
 * - `'NewJob'`: the caller needs to *select* the new customer, so it travels
 *   back as `createdCustomerId` (this screen is a sibling of `NewJob` on the
 *   root stack, so the flat `navigate({ name, params, merge: true })` form
 *   works — unlike `Customers`, which is nested inside `MainTabs`).
 */
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, MapPin, Phone, User, UserPlus } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../theme';
import { customerService } from '../../services';
import type { ApiError, ResolvedPlace } from '../../services';
import { currentResetEpoch } from '../../services/resetRegistry';
import type { RootStackParamList } from '../../navigation/types';
import { AddressPickerSheet, type ManualAddressEntry } from '../addressPicker';
import { DIAL_CODE, PHONE_LENGTH } from './constants';
import { loadCustomers, upsertCustomer } from './useCustomers';
import { toCreateCustomerRequest } from './requestMapping';

/** Each leg of the address field's populate border-pulse (0→1→0, ~200ms total). */
const PULSE_LEG_MS = 100;

type Props = NativeStackScreenProps<RootStackParamList, 'AddCustomer'>;

/**
 * Turns a failed `POST /customers` into copy this screen can show directly.
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

export default function AddCustomerScreen({ navigation, route }: Props) {
  const { returnRouteName } = route.params;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');

  // Structured snapshot from a resolved `AddressPickerSheet` pick — kept
  // separate from `address`/`city` above so a later hand-edit of the free
  // text never clears or re-syncs it (additive backend columns; free text
  // and structured snapshot are independent fields end to end).
  const [formattedAddress, setFormattedAddress] = useState('');
  const [pincode, setPincode] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState('');

  const [addressPickerVisible, setAddressPickerVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Soft primary-tint border pulse on the address field when a resolved
  // pick lands — 0 = no highlight (transparent ring), 1 = full tint.
  const addressPulse = useRef(new Animated.Value(0)).current;

  // A JS-driven pulse keeps rescheduling animation frames while it runs —
  // stop it on unmount so nothing is left ticking after this screen is gone
  // (in Jest this surfaces as a post-teardown crash of the test worker).
  useEffect(
    () => () => {
      addressPulse.stopAnimation();
    },
    [addressPulse],
  );

  const canSubmit =
    name.trim().length > 0 && phone.length === PHONE_LENGTH && !submitting;

  // While the POST is in flight, hardware/gesture back is blocked — the old
  // Modal-based AddCustomerSheet vetoed it via `onRequestClose`; on a full
  // page only a navigation guard covers the gesture path (the header back
  // button's `disabled` does not). Without it the screen pops mid-request,
  // the resolve still lands (`upsertCustomer` + possible NewJob redirect)
  // and a retry of the same phone then 409s. The listener re-arms on every
  // `submitting` flip, so navigation is free again once the request settles.
  const bypassBackGuardRef = useRef(false);

  useEffect(() => {
    if (!submitting) return;
    return navigation.addListener('beforeRemove', e => {
      // The screen's OWN post-save navigation (goBack / navigate to NewJob)
      // dispatches while `submitting` is still true — the listener is only
      // disarmed by the next render, after React Navigation has already
      // evaluated the removal. A prevented removal is never retried, so
      // without this bypass a successful save would leave the screen open.
      if (bypassBackGuardRef.current) return;
      e.preventDefault();
    });
  }, [submitting, navigation]);

  // Soft primary-tint border pulse shared by both pick paths (resolved and
  // manual) — the visual "your pick landed" feedback.
  const startAddressPulse = () => {
    addressPulse.setValue(0);
    Animated.sequence([
      Animated.timing(addressPulse, {
        toValue: 1,
        duration: PULSE_LEG_MS,
        useNativeDriver: false, // interpolating borderColor, not transform/opacity
      }),
      Animated.timing(addressPulse, {
        toValue: 0,
        duration: PULSE_LEG_MS,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const handleAddressResolved = (resolved: ResolvedPlace) => {
    setAddress(resolved.formattedAddress);
    // `area` has no equivalent in `ResolvedPlace` and is left untouched.
    if (resolved.city) setCity(resolved.city);

    setFormattedAddress(resolved.formattedAddress);
    setPincode(resolved.pincode);
    setLatitude(resolved.latitude);
    setLongitude(resolved.longitude);
    setPlaceId(resolved.placeId);

    setAddressPickerVisible(false);
    startAddressPulse();
  };

  /**
   * Manual entry (no-results fallback in the picker) lands here instead of
   * `handleAddressResolved`: a hand-typed address has no `placeId` or
   * coordinates, so ANY previously-resolved snapshot is wiped — otherwise a
   * "pick a place, then enter manually" sequence would send the OLD pick's
   * `placeId`/coordinates alongside the NEW text and the job's map pin
   * would silently point at the abandoned place. The create payload's
   * resolved-fields block therefore stays omitted (see `handleSubmit`'s
   * gating on `placeId`).
   */
  const handleManualAddress = (entry: ManualAddressEntry) => {
    setAddress(entry.addressLine);
    // An entry without a city must not wipe one the user already typed in
    // the City field above.
    if (entry.city) setCity(entry.city);

    setFormattedAddress('');
    setPincode(null);
    setLatitude(null);
    setLongitude(null);
    setPlaceId('');

    setAddressPickerVisible(false);
    startAddressPulse();
  };

  const addressBorderColor = addressPulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', colors.ringFocus],
  });

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
    // Capture the reset epoch before the await: a concurrent request's 401
    // can tear the session down while the POST is in flight. Everything
    // after the response — store write, refresh, navigation — must then be
    // skipped (see services/resetRegistry.ts).
    const epochAtStart = currentResetEpoch();
    try {
      const created = await customerService.create(
        toCreateCustomerRequest({
          name: name.trim(),
          phone,
          city: city.trim(),
          area: area.trim(),
          address: address.trim(),
          // `placeId` only ever gets set together with the other 4 — its
          // presence is the signal that a resolve snapshot exists at all.
          // `pincode` can legitimately be absent (place had none) even when
          // a snapshot exists, so it's gated on its own.
          ...(placeId && latitude !== null && longitude !== null
            ? {
                formattedAddress,
                latitude,
                longitude,
                placeId,
                ...(pincode ? { pincode } : {}),
              }
            : {}),
        }),
      );

      // The customer was created server-side even if the session died
      // mid-flight — the next session's first load picks it up. But its
      // post-response steps belong to a session that no longer exists.
      if (currentResetEpoch() !== epochAtStart) return;

      // Pushed into the shared store directly rather than waiting on a
      // refetch: `Customers`'s list (and `NewJob`'s picker) both read this
      // same store, so this is instantly visible to whichever screen goes
      // back to it — no return-params round trip needed for `Customers`.
      upsertCustomer(created);
      // A failed refresh here is a stale-list problem, not a save failure —
      // the customer above is already created and already in the store, so
      // it must never surface as a create error via the catch below.
      await loadCustomers({ force: true }).catch(() => {});

      // This removal is our own — let the still-armed back guard through
      // (see its comment above).
      bypassBackGuardRef.current = true;
      if (returnRouteName === 'NewJob') {
        navigation.navigate({
          name: 'NewJob',
          params: { createdCustomerId: created.id },
          merge: true,
        });
      } else {
        navigation.goBack();
      }
    } catch (err) {
      setSubmitError(createErrorMessage(err as ApiError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          disabled={submitting}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textStrong} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>Add customer</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

          {/*
            The whole field opens `AddressPickerSheet` — it's `editable={false}`
            (no keyboard, no direct typing) so a tap anywhere on it, not just
            the leading icon, opens search instead of focusing. The border
            pulse below only appears after a pick is made.
          */}
          <Pressable
            onPress={() => setAddressPickerVisible(true)}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Search for an address"
            accessibilityHint="Opens address search.">
            <Animated.View
              style={[styles.addressHighlight, { borderColor: addressBorderColor }]}>
              <Input
                label="Address"
                value={address}
                editable={false}
                placeholder="Tap to search for an address"
                helper="Shown to the technician on the job"
                leadingIcon={<MapPin size={18} color={colors.textMuted} strokeWidth={2} />}
              />
            </Animated.View>
          </Pressable>
        </ScrollView>

        {/* Footer sits outside the ScrollView so "Add customer" is always
            reachable without scrolling to the bottom. */}
        <SafeAreaView edges={['bottom']} style={styles.footer}>
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
        </SafeAreaView>
      </KeyboardAvoidingView>

      <AddressPickerSheet
        visible={addressPickerVisible}
        onClose={() => setAddressPickerVisible(false)}
        onResolved={handleAddressResolved}
        onManualAddress={handleManualAddress}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    marginLeft: -spacing.s1,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  form: {
    padding: spacing.s4,
    paddingBottom: spacing.s6,
    gap: spacing.s4,
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
    // Icon-to-text gap — the `spacing.s1` convention used by other
    // icon + text rows (see `Input`'s leading icon, AttachmentGrid).
    gap: spacing.s1,
  },
  dial: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  // Halo ring around the address `Input` — `borderColor` animates between
  // transparent (rest) and `colors.ringFocus` (populate pulse); see
  // `addressPulse` above.
  addressHighlight: {
    borderWidth: 2,
    borderRadius: radius.md + 4,
    padding: 2,
  },
  footer: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    gap: spacing.s2,
    backgroundColor: colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  submitError: {
    ...typography.bodySm,
    color: colors.danger,
  },
});
