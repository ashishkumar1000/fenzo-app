/**
 * OfficeMapPickerScreen — full-screen office pin placement (Story 15-4).
 *
 * Follows the validated 15-1 spike pattern: the pin is a static React
 * overlay at screen centre and the map pans under it; the settled centre
 * is read from `onRegionChangeComplete` — never a draggable native Marker
 * (spike finding: undiscoverable + janky on Fabric). The geofence Circle
 * redraws LIVE as the radius stepper changes. The map layer itself lives
 * in `PickerMapArea`, the bottom panel in `PickerBottomCard`.
 *
 * Three entry paths per the spec: pan-to-place, "Use my current location"
 * (fresh fix, permission pre-checked via useLocateMe), and address search
 * (the reused AddressPickerSheet — a resolved place only MOVES the map to
 * a starting point; the final pin position is what Confirm returns).
 *
 * Reverse geocoding (the "Pinned near:" row) fires ON SETTLE only — one
 * call per settled centre, latest-wins abort — never per frame while
 * panning. On failure or "no address here" the row falls back to the raw
 * coordinates; it never blocks Confirm.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, StyleSheet } from 'react-native';
import MapView, { type LatLng, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AddressPickerSheet from '../../addressPicker/AddressPickerSheet';
import { colors } from '../../../theme';
import { getCurrentPosition } from '../../technicianApp/geolocation';
import { placesService } from '../../../services';
import { isAbort } from '../../../utils';
import PickerBottomCard from './PickerBottomCard';
import PickerMapArea from './PickerMapArea';
import ScreenHeader from './ScreenHeader';
import { useLocateMe } from './useLocateMe';
import type { RootStackParamList } from '../../../navigation/types';

/** Bengaluru centre — the India-bounded default when there is no initial
 *  pin and no silent current-location fix. */
const DEFAULT_REGION: LatLng = { latitude: 12.9716, longitude: 77.5946 };

type Props = NativeStackScreenProps<RootStackParamList, 'OfficeMapPicker'>;

export default function OfficeMapPickerScreen({ navigation, route }: Props) {
  const { initialLatitude, initialLongitude, radiusM: initialRadiusM } = route.params ?? {};
  const mapRef = useRef<MapView | null>(null);

  const [pin, setPin] = useState<LatLng>(
    initialLatitude != null && initialLongitude != null
      ? { latitude: initialLatitude, longitude: initialLongitude }
      : DEFAULT_REGION,
  );
  // The settled coordinate reverse geocode fires for (latest-wins).
  const [settled, setSettled] = useState<LatLng>(pin);
  const [radiusM, setRadiusM] = useState(initialRadiusM ?? 100);
  const [isPanning, setIsPanning] = useState(false);
  // Provenance for the form's "GPS Verified" chip: true only while the pin
  // is the device's own fix. A user pan or a search result clears it.
  // animateToRegion also fires region events, so programmatic moves are
  // marked in a ref and matched on settle (epsilon ≈ 11 m) instead of
  // treating every region change as a manual pan.
  const [gpsVerified, setGpsVerified] = useState(false);
  const programmaticTargetRef = useRef<LatLng | null>(null);

  // "Pinned near:" row text; loading shows the spinner in the bottom card.
  const [addressText, setAddressText] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);

  // "Map unavailable" detection: react-native-maps 1.29.8 exposes no error
  // event, so a failed tile load is detected as "onMapLoaded never fired"
  // within the deadline — a hung/failed map then swaps to the fallback
  // panel, while locate-me and address search keep working over it.
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  useEffect(() => {
    if (mapLoaded) return;
    const timer = setTimeout(() => setMapFailed(true), 10_000);
    return () => clearTimeout(timer);
  }, [mapLoaded]);

  // Retry re-mounts the map and restarts the load deadline — a slow (not
  // failed) map gets a second chance instead of a terminal fallback panel.
  const retryMap = useCallback(() => {
    setMapLoaded(false);
    setMapFailed(false);
  }, []);

  const [searchVisible, setSearchVisible] = useState(false);

  const {
    locate,
    locating,
    errorMessage: locateError,
    canOpenSettings,
    clearError,
    openSettings,
  } = useLocateMe();

  // Silent initial fix — NO prompt: the map opens on the India default and
  // only owners who already granted location get centred on their area
  // (the locate button handles the prompting path). Only Android can check
  // permission without prompting; the whole fix is Android-only — on iOS
  // even a check-then-fix pair triggers the CoreLocation prompt at map
  // open, exactly what this path documents against.
  useEffect(() => {
    if (Platform.OS !== 'android' || initialLatitude != null) return;
    const load = async () => {
      try {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (!granted) return;
        const pos = await getCurrentPosition();
        const loc = { latitude: pos.latitude, longitude: pos.longitude };
        setPin(loc);
        setSettled(loc);
        setGpsVerified(true);
        programmaticTargetRef.current = loc;
        mapRef.current?.animateToRegion({ ...loc, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
      } catch {
        // Silent — the default region is a fine starting point.
      }
    };
    void load();
    // Params are read once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Settle-only reverse geocode, latest-wins abort (the useAddressAutosuggest
  // abort pattern). A 200 with no address → fallback text, never a throw.
  useEffect(() => {
    const ctrl = new AbortController();
    setAddressLoading(true);
    placesService
      .reverse(settled.latitude, settled.longitude, ctrl.signal)
      .then((place) => {
        const label =
          place.formattedAddress ??
          `${settled.latitude.toFixed(5)}, ${settled.longitude.toFixed(5)}`;
        setAddressText(label);
      })
      .catch((err) => {
        if (!isAbort(err, ctrl.signal)) {
          setAddressText(`${settled.latitude.toFixed(5)}, ${settled.longitude.toFixed(5)}`);
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setAddressLoading(false);
      });
    return () => ctrl.abort();
  }, [settled]);

  const onRegionChange = useCallback((region: Region) => {
    setIsPanning(true);
    setPin({ latitude: region.latitude, longitude: region.longitude });
  }, []);

  const onRegionChangeComplete = useCallback((region: Region) => {
    const centre: LatLng = { latitude: region.latitude, longitude: region.longitude };
    setPin(centre);
    setSettled(centre);
    setIsPanning(false);
    // A settle matching the last programmatic target is that move's own
    // completion, not a user pan — provenance is unchanged. Anything else
    // is a manual placement.
    const target = programmaticTargetRef.current;
    programmaticTargetRef.current = null;
    const isProgrammatic =
      target != null &&
      Math.abs(target.latitude - centre.latitude) < 1e-4 &&
      Math.abs(target.longitude - centre.longitude) < 1e-4;
    if (!isProgrammatic) setGpsVerified(false);
  }, []);

  const handleLocate = useCallback(async () => {
    clearError();
    const loc = await locate();
    if (!loc) return;
    // Pin state is set directly too, so Confirm still works if the map
    // failed to render (the "Map unavailable" fallback keeps search and
    // locate functional).
    setPin(loc);
    setSettled(loc);
    setGpsVerified(true);
    programmaticTargetRef.current = loc;
    mapRef.current?.animateToRegion({ ...loc, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
  }, [locate, clearError]);

  const handleResolvedPlace = useCallback((place: { latitude: number; longitude: number }) => {
    const loc = { latitude: place.latitude, longitude: place.longitude };
    setPin(loc);
    setSettled(loc);
    setGpsVerified(false);
    setSearchVisible(false);
    programmaticTargetRef.current = loc;
    mapRef.current?.animateToRegion({ ...loc, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
  }, []);

  const handleConfirm = useCallback(() => {
    // While a pan is in flight `settled` still holds the PREVIOUS centre —
    // the visible pin is at `pin` (updated per region event), so confirm
    // that instead. After the settle the two are identical.
    const centre = isPanning ? pin : settled;
    navigation.popTo(
      'OfficeForm',
      {
        pickedLocation: {
          latitude: centre.latitude,
          longitude: centre.longitude,
          radiusM,
          gpsVerified,
        },
      },
      { merge: true },
    );
  }, [navigation, settled, pin, isPanning, radiusM, gpsVerified]);

  const addressRow = addressLoading
    ? 'Reading address…'
    : addressText
      ? `Pinned near: ${addressText}`
      : `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Place office pin" onBack={() => navigation.goBack()} />

      <PickerMapArea
        mapRef={mapRef}
        pin={pin}
        radiusM={radiusM}
        isPanning={isPanning}
        mapFailed={mapFailed}
        locating={locating}
        onRegionChange={onRegionChange}
        onRegionChangeComplete={onRegionChangeComplete}
        onMapLoaded={() => setMapLoaded(true)}
        onRetry={retryMap}
        onOpenSearch={() => setSearchVisible(true)}
        onLocate={() => void handleLocate()}
      />

      <PickerBottomCard
        addressRow={addressRow}
        addressLoading={addressLoading}
        locateError={locateError}
        canOpenSettings={canOpenSettings}
        onOpenSettings={openSettings}
        radiusM={radiusM}
        onRadiusChange={setRadiusM}
        onConfirm={handleConfirm}
      />

      <AddressPickerSheet
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        onResolved={handleResolvedPlace}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
});
