/**
 * SPIKE — Story 15.1 (disposable, do not ship).
 *
 * Technical spike validating `react-native-maps` 1.29.8 on RN 0.87 Fabric
 * before Story 15.4 builds the real Office map picker. Re-scoped mid-spike
 * (2026-09-26): the draggable-marker interaction felt confusing and janky,
 * so this implements the delivery-app "centre-pin" pattern — the pin is a
 * static overlay at screen centre and the map pans under it — plus search,
 * locate-me and a reverse-geocoded address card.
 *
 * Validated on Google Maps (Android):
 *
 *   AC1' — pan the map, read the settled centre from
 *          `onRegionChangeComplete` (replaces the draggable `Marker`).
 *   AC2  — a `Circle`'s centre and radius redraw live as the radius
 *          changes (stepper; no lag/stale frame).
 *   AC3' — the pin visually sits at the picked coordinate after every
 *          pan (replaces `onPress` move-to-tap, which fought map pan).
 *   AC4  — if the Circle does not redraw correctly, the re-key
 *          workaround is applied and the finding recorded below.
 *
 * FINDINGS (device validation, Android physical device — Google Maps):
 *   - Maps SDK key: wired via `com.google.android.geo.API_KEY`
 *     manifestPlaceholder from `android/keystore.properties`
 *     (`FENZIT_MAPS_API_KEY`). Google rejects the key with
 *     DEVELOPER_ERROR / black tiles unless the key's project has the
 *     Maps SDK for Android enabled + billing, and (if app-restricted)
 *     the DEBUG keystore SHA-1 + `com.fenzitapp` added in Cloud Console.
 *   - Draggable `Marker`: drag works but long-press-to-lift is
 *     undiscoverable and the drag is janky on Fabric — replaced by the
 *     centre-pin pattern (AC1'/AC3').
 *   - Centre-pin pattern: pin is a React overlay (`pointerEvents: none`),
 *     never a native marker. Circle follows the pan LIVE via
 *     `onRegionChange` centre updates — smooth. Re-keying (remounting)
 *     the Circle on settle makes it flash off/on; re-key is only the
 *     escape hatch if a stale redraw ever shows up (AC4), not the norm.
 *   - Search/address: Nominatim (free, keyless) for the spike — 15.4 must
 *     route place search + reverse geocoding through `fenzit-be` with a
 *     server-side Google key (an Android-restricted client key cannot
 *     call Google's REST geocoding APIs).
 *   - Map theming: Google follows the OS dark mode; forced light here via
 *     `customMapStyle`. 15.4 should carry a tokenised light style.
 *   - iOS half (2026-09-26): wired for Google Maps — Podfile declares the
 *     `react-native-maps/Google` subspec (sets HAVE_GOOGLE_MAPS itself,
 *     pins GoogleMaps 9.4.0 + Utils 6.1.0), AppDelegate provides the key
 *     from Info.plist (`GOOGLE_MAPS_API_KEY`), screen uses `provider="google"`
 *     on both platforms. NOT yet device-validated — run `(cd ios && pod
 *     install)` on a machine with Xcode, build, and confirm the map renders
 *     (blank tiles = same key/billing story as Android).
 *
 * Delete this file, `src/screens/mapSpike/`, its route registrations in
 * `RootNavigator`/`TechnicianRootNavigator`/`types.ts`, the temporary
 * `initialRouteName`, and the TodayScreen test button once 15.4 lands.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, {
  Circle,
  Marker,
  type LatLng,
  type Region,
} from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Crosshair, MapPin } from 'lucide-react-native';

import { colors, spacing, radius, shadow, typography } from '../theme';
import { formatDistance, haversineMetres, isAbort } from '../utils';
import {
  getCurrentPosition,
  requestLocationPermission,
} from '../features/technicianApp/geolocation';
import { reverseGeocode, searchPlaces, type GeoPlace } from './mapSpike/geocoding';
import { MapSpikeSearch } from './mapSpike/MapSpikeSearch';
import { MapSpikeDetailsCard } from './mapSpike/MapSpikeDetailsCard';

/** Bengaluru centre — neutral default for the spike. */
const DEFAULT_REGION: LatLng = { latitude: 12.9716, longitude: 77.5946 };
const RADIUS_MIN_M = 50;
const RADIUS_MAX_M = 1000;
/** Light Google style — map config (Google's style JSON), not app tokens. */
const LIGHT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#F4F6F8' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5F6B7A' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#DDE3EA' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C9E4F4' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#E9EDF2' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D3E8D3' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#E4E8EE' }] },
];

export default function MapSpikeScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const [pin, setPin] = useState<LatLng>(DEFAULT_REGION);
  // Settled coordinate — the address lookup fires only after the map
  // stops (a per-frame geocode call would hammer the endpoint).
  const [geocodeAt, setGeocodeAt] = useState<LatLng>(DEFAULT_REGION);
  const [radiusM, setRadiusM] = useState(200);
  const [isPanning, setIsPanning] = useState(false);
  const [showHint, setShowHint] = useState(true);

  // Locate-me + distance chip.
  const [currentLoc, setCurrentLoc] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Reverse-geocoded address for the bottom card.
  const [address, setAddress] = useState<GeoPlace | null>(null);
  // Distinguish "lookup failed" from "lookup in flight" — without it the
  // card shows the resolving placeholder forever after a network error.
  const [geoFailed, setGeoFailed] = useState(false);

  // Search bar + results overlay.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);

  // Radius control passes the new absolute value; clamp stays here as the
  // single safety net (the card's presets/stepper never exceed the bounds).
  const changeRadius = useCallback((next: number) => {
    setRadiusM(Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, next)));
  }, []);

  // Circle follows the pan LIVE — updating the centre per event (no
  // remount) is smooth; the earlier re-key-on-settle approach flashed
  // the circle off/on (finding recorded in the header).
  const onRegionChange = useCallback((region: Region) => {
    setIsPanning(true);
    setShowHint(false);
    setPin({ latitude: region.latitude, longitude: region.longitude });
  }, []);

  const onRegionChangeComplete = useCallback((region: Region) => {
    const settled: LatLng = { latitude: region.latitude, longitude: region.longitude };
    setPin(settled);
    setGeocodeAt(settled);
    setIsPanning(false);
  }, []);

  // Resolve the address under the pin after every settle.
  useEffect(() => {
    const ctrl = new AbortController();
    reverseGeocode(geocodeAt.latitude, geocodeAt.longitude, ctrl.signal)
      .then((place) => {
        setAddress(place);
        setGeoFailed(false);
      })
      .catch((err) => {
        if (!isAbort(err, ctrl.signal)) {
          setAddress(null);
          setGeoFailed(true);
        }
      });
    return () => ctrl.abort();
  }, [geocodeAt]);

  // Debounced place search (Nominatim allows ~1 req/s).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      searchPlaces(q, ctrl.signal)
        .then((rows) => setResults(rows))
        .catch((err) => {
          if (!isAbort(err, ctrl.signal)) setResults([]);
        })
        .finally(() => setSearching(false));
    }, 600);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  // Fetch current location on open WITHOUT prompting — the distance chip
  // fills in only for users who already granted location (Story 7.7).
  useEffect(() => {
    const load = async () => {
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          );
          if (!granted) return;
        }
        const pos = await getCurrentPosition();
        setCurrentLoc({ latitude: pos.latitude, longitude: pos.longitude });
      } catch {
        // Silent — the chip is optional; the button prompts when needed.
      }
    };
    void load();
  }, []);

  const handleLocate = useCallback(async () => {
    setLocating(true);
    setLocateError(null);
    try {
      const perm = await requestLocationPermission();
      if (perm.status !== 'granted') {
        setLocateError(perm.error ?? 'Location permission denied');
        return;
      }
      const pos = await getCurrentPosition();
      const loc = { latitude: pos.latitude, longitude: pos.longitude };
      setCurrentLoc(loc);
      mapRef.current?.animateToRegion(
        { ...loc, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        400,
      );
    } catch (err) {
      setLocateError(err instanceof Error ? err.message : 'Location failed');
    } finally {
      setLocating(false);
    }
  }, []);

  const handleSelectPlace = useCallback((place: GeoPlace) => {
    setQuery('');
    setResults([]);
    mapRef.current?.animateToRegion(
      {
        latitude: place.latitude,
        longitude: place.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      400,
    );
  }, []);

  const distanceLabel =
    currentLoc === null
      ? null
      : `Pin location is ${formatDistance(haversineMetres(currentLoc, pin))} from your current location`;

  // Google provider on BOTH platforms — the Podfile wires the
  // react-native-maps/Google subspec and AppDelegate provides the key.

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.s2 }]}>
        <Text style={styles.title}>Map spike — 15.1</Text>
        <Text style={styles.event} numberOfLines={1}>
          {isPanning
            ? 'picking… pan the map under the pin'
            : `pin → ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`}
        </Text>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          // Google on BOTH platforms — the Podfile wires the
          // react-native-maps/Google subspec and AppDelegate provides the key.
          provider="google"
          customMapStyle={LIGHT_MAP_STYLE}
          initialRegion={{
            ...DEFAULT_REGION,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          onRegionChange={onRegionChange}
          onRegionChangeComplete={onRegionChangeComplete}
        >
          <Circle
            center={pin}
            radius={radiusM}
            strokeWidth={2}
            strokeColor={colors.primary}
            // 30% opacity fill, derived from the primary token.
            fillColor={`${colors.primary}4D`}
          />
          {/* A dot stays behind at the real current location once the pin
              moves away from it — "where I am" (dot) vs "where the office
              is" (pin). Fixed-pixel custom view, centre-anchored: a
              metres-radius Circle shrinks to nothing on zoom-out. */}
          {currentLoc && haversineMetres(currentLoc, pin) > 15 ? (
            <Marker
              coordinate={currentLoc}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}>
              <View style={styles.dot}>
                <View style={styles.dotCore} />
              </View>
            </Marker>
          ) : null}
        </MapView>

        {/* Pin + hint overlay — never a native Marker. */}
        <View style={styles.pinLayer} pointerEvents="none">
          {showHint ? (
            <View style={styles.hintBubble}>
              <Text style={styles.hintTitle}>Pan the map to adjust location</Text>
              <Text style={styles.hintBody}>The office geofence starts here</Text>
            </View>
          ) : null}
          <View style={[styles.pinColumn, showHint && styles.pinColumnHint]}>
            <View style={[styles.pin, isPanning && styles.pinLifted]}>
              <MapPin size={38} color={colors.primary} fill={colors.primary} strokeWidth={2} />
            </View>
          </View>
        </View>

        {/* Floating search bar + results. */}
        <View style={styles.searchWrap}>
          <MapSpikeSearch
            query={query}
            searching={searching}
            results={results}
            onQueryChange={setQuery}
            onSelect={handleSelectPlace}
          />
        </View>

        {/* Locate-me pill, floating above the bottom card. */}
        <View style={styles.locateWrap} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to current location"
            style={({ pressed }) => [
              styles.locateButton,
              pressed && styles.locateButtonPressed,
            ]}
            onPress={() => void handleLocate()}>
            {locating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Crosshair size={18} color={colors.primary} strokeWidth={2} />
            )}
            <Text style={styles.locateText}>Go to current location</Text>
          </Pressable>
        </View>
      </View>

      {/* Address card + radius stepper. */}
      <MapSpikeDetailsCard
        address={address}
        geoFailed={geoFailed}
        distanceLabel={distanceLabel}
        locateError={locateError}
        radiusM={radiusM}
        onRadiusChange={changeRadius}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    paddingHorizontal: spacing.s4,
    // Top padding is applied inline — insets.top clears the status bar
    // (the title sat under the clock chip otherwise).
    paddingTop: spacing.s2,
    paddingBottom: spacing.s2,
    gap: spacing.s1,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  event: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  mapWrap: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  pinLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The glyph's tip must sit on the map centre: half-height (19) plus a
  // nudge so the pointed tail lands on centre.
  pinColumn: {
    alignItems: 'center',
    transform: [{ translateY: -22 }],
  },
  // Shifted down while the hint bubble is visible so the tip stays on centre.
  pinColumnHint: {
    transform: [{ translateY: -22 - 34 }],
  },
  pin: {},
  pinLifted: {
    transform: [{ translateY: -12 }],
  },
  hintBubble: {
    backgroundColor: colors.textStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    marginBottom: spacing.s2,
    gap: 2,
  },
  hintTitle: {
    ...typography.bodySm,
    fontWeight: '700',
    color: colors.surfaceCard,
  },
  hintBody: {
    ...typography.caption,
    color: colors.surfaceCard,
  },
  searchWrap: {
    position: 'absolute',
    top: spacing.s3,
    left: spacing.s4,
    right: spacing.s4,
  },
  locateWrap: {
    position: 'absolute',
    bottom: spacing.s4,
    left: spacing.s4,
    right: spacing.s4,
    alignItems: 'center',
  },
  // Current-location dot — solid red core with a white ring, like the
  // platform location dots, but red to stand apart from the blue pin.
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  dotCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.danger,
  },
  locateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s4,
    height: 48,
    ...shadow.sm,
  },
  locateButtonPressed: {
    opacity: 0.85,
  },
  locateText: {
    ...typography.bodySm,
    fontWeight: '700',
    color: colors.primary,
  },
});
