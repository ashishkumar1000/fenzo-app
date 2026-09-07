/**
 * AddressPickerField — the "Address" field of the add-customer form as one
 * self-contained control (file split from `AddCustomerScreen`, behaviour
 * unchanged): the tap target that opens `AddressPickerSheet`, the sheet
 * itself, and the primary-tint border pulse that plays when a pick lands.
 *
 * The whole field opens the picker — the `Input` is `editable={false}` (no
 * keyboard, no direct typing) so a tap anywhere on it, not just the leading
 * icon, opens search instead of focusing.
 *
 * The screen stays in charge of form state: this component only reports a
 * pick through `onPick` and lets the caller apply `addressLine`/`city` and
 * keep (or wipe) the resolved snapshot. The snapshot lives in the caller
 * because only it knows the submit-time payload rule (see
 * `AddCustomerScreen`'s `buildRequest`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Input } from '../../../components/ui';
import { colors, radius } from '../../../theme';
import type { ResolvedPlace } from '../../../services';
import { AddressPickerSheet, type ManualAddressEntry } from '../../addressPicker';

/** Each leg of the populate border-pulse (0→1→0, ~200ms total). */
const PULSE_LEG_MS = 100;

/**
 * The 5 structured resolve fields from a resolved pick. `null` after a
 * manual entry — a hand-typed address has no `placeId` or coordinates, and
 * any previously-resolved snapshot must be wiped (otherwise "pick a place,
 * then enter manually" would send the OLD pick's snapshot alongside the NEW
 * text and the job's map pin would silently point at the abandoned place).
 */
export type PickedAddressSnapshot = {
  formattedAddress: string;
  /** A resolved place can legitimately have no pincode. */
  pincode: string | null;
  /** Coordinates are always present on a resolved pick (a place resolves
   *  to a point on the map) — that's what makes it a map pin at all. */
  latitude: number;
  longitude: number;
  placeId: string;
};

/** One pick out of the sheet — either a resolved place or a manual entry. */
export type PickedAddress = {
  /** What the screen's Address `Input` displays. */
  addressLine: string;
  /** The pick's city, or '' when the entry carried none (the caller must
   *  not wipe a city the user typed themselves in that case). */
  city: string;
  snapshot: PickedAddressSnapshot | null;
};

type Props = {
  /** The displayed address line (owned by the caller's form state). */
  value: string;
  /** Disabled while the surrounding form is submitting. */
  disabled?: boolean;
  onPick: (picked: PickedAddress) => void;
};

export function AddressPickerField({ value, disabled = false, onPick }: Props) {
  const [pickerVisible, setPickerVisible] = useState(false);

  // Soft primary-tint border pulse on the address field when a resolved
  // pick lands — 0 = no highlight (transparent ring), 1 = full tint.
  const addressPulse = useRef(new Animated.Value(0)).current;

  // A JS-driven pulse keeps rescheduling animation frames while it runs —
  // stop it on unmount so nothing is left ticking after this component is
  // gone (in Jest this surfaces as a post-teardown crash of the test worker).
  useEffect(
    () => () => {
      addressPulse.stopAnimation();
    },
    [addressPulse],
  );

  // Soft primary-tint border pulse shared by both pick paths (resolved and
  // manual) — the visual "your pick landed" feedback.
  const startPulse = useCallback(() => {
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
  }, [addressPulse]);

  const handleResolved = useCallback(
    (resolved: ResolvedPlace) => {
      onPick({
        addressLine: resolved.formattedAddress,
        // `null` city (place had none) normalises to '' — the caller treats
        // both as "don't touch the City field".
        city: resolved.city ?? '',
        snapshot: {
          formattedAddress: resolved.formattedAddress,
          pincode: resolved.pincode,
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          placeId: resolved.placeId,
        },
      });
      setPickerVisible(false);
      startPulse();
    },
    [onPick, startPulse],
  );

  /** Manual entry (no-results fallback in the picker) lands here instead of
   *  `handleResolved` — a hand-typed address has no `placeId` or
   *  coordinates, so the create payload's resolved-fields block must be
   *  omitted (see `PickedAddressSnapshot` above and the caller's submit
   *  gating on the snapshot). */
  const handleManualAddress = useCallback(
    (entry: ManualAddressEntry) => {
      onPick({
        addressLine: entry.addressLine,
        city: entry.city ?? '',
        snapshot: null,
      });
      setPickerVisible(false);
      startPulse();
    },
    [onPick, startPulse],
  );

  const addressBorderColor = addressPulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', colors.ringFocus],
  });

  return (
    <>
      {/*
        The whole field opens `AddressPickerSheet` — it's `editable={false}`
        (no keyboard, no direct typing) so a tap anywhere on it, not just
        the leading icon, opens search instead of focusing. The border
        pulse below only appears after a pick is made.
      */}
      <Pressable
        onPress={() => setPickerVisible(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Search for an address"
        accessibilityHint="Opens address search.">
        <Animated.View
          style={[styles.addressHighlight, { borderColor: addressBorderColor }]}>
          <Input
            label="Address"
            value={value}
            editable={false}
            placeholder="Tap to search for an address"
            helper="Shown to the technician on the job"
            leadingIcon={<MapPin size={18} color={colors.textMuted} strokeWidth={2} />}
          />
        </Animated.View>
      </Pressable>

      <AddressPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onResolved={handleResolved}
        onManualAddress={handleManualAddress}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Halo ring around the address `Input` — `borderColor` animates between
  // transparent (rest) and `colors.ringFocus` (populate pulse); see
  // `addressPulse` above.
  addressHighlight: {
    borderWidth: 2,
    borderRadius: radius.md + 4,
    padding: 2,
  },
});