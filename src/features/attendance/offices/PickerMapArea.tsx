/**
 * PickerMapArea — the map picker's map layer (Story 15-4): the MapView
 * (light Google style) or the "Map unavailable" fallback (with a Retry that
 * re-mounts the map and restarts its load deadline), the centre-pin
 * overlay (static React view, never a native Marker), and the floating
 * search / locate-me buttons. Locate-me and search stay functional when
 * the map fails — the fallback panel renders behind them.
 */
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, type LatLng, type Region } from 'react-native-maps';
import { Crosshair, MapPin, Search } from 'lucide-react-native';
import { Button } from '../../../components/ui';
import { colors, spacing, typography, LIGHT_MAP_STYLE } from '../../../theme';

type Props = {
  mapRef: React.RefObject<MapView | null>;
  pin: LatLng;
  radiusM: number;
  isPanning: boolean;
  mapFailed: boolean;
  locating: boolean;
  onRegionChange: (region: Region) => void;
  onRegionChangeComplete: (region: Region) => void;
  onMapLoaded: () => void;
  /** Re-mounts the map after the "Map unavailable" fallback — a slow map
   *  gets a second load deadline instead of a terminal fallback. */
  onRetry: () => void;
  onOpenSearch: () => void;
  onLocate: () => void;
};

export default function PickerMapArea({
  mapRef,
  pin,
  radiusM,
  isPanning,
  mapFailed,
  locating,
  onRegionChange,
  onRegionChangeComplete,
  onMapLoaded,
  onRetry,
  onOpenSearch,
  onLocate,
}: Props) {
  return (
    <View style={styles.mapWrap}>
      {mapFailed ? (
        <View style={styles.mapFallback}>
          <MapPin size={24} color={colors.textMuted} strokeWidth={1.5} />
          <Text style={styles.mapFallbackText}>Map unavailable</Text>
          <Text style={styles.mapFallbackHint}>
            You can still use current location or address search, then confirm.
          </Text>
          <Button
            variant="secondary"
            leadingIcon={<MapPin size={16} color={colors.primary} strokeWidth={2} />}
            onPress={onRetry}>
            Retry map
          </Button>
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider="google"
          customMapStyle={LIGHT_MAP_STYLE}
          initialRegion={{ ...pin, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          onRegionChange={onRegionChange}
          onRegionChangeComplete={onRegionChangeComplete}
          onMapLoaded={onMapLoaded}>
          <Circle
            center={pin}
            radius={radiusM}
            strokeWidth={2}
            strokeColor={colors.primary}
            // ~16% opacity fill derived from the primary token.
            fillColor={`${colors.primary}29`}
          />
        </MapView>
      )}

      {/* Centre pin — static overlay, never a native Marker. */}
      <View style={styles.pinLayer} pointerEvents="none">
        <View style={[styles.pin, isPanning && styles.pinLifted]}>
          <MapPin size={38} color={colors.primary} fill={colors.primary} strokeWidth={2} />
        </View>
      </View>

      {/* Floating controls: search on top, locate-me above the bottom card. */}
      <View style={styles.searchWrap}>
        <Button
          variant="secondary"
          leadingIcon={<Search size={16} color={colors.primary} strokeWidth={2} />}
          onPress={onOpenSearch}>
          Search address
        </Button>
      </View>
      <View style={styles.locateWrap}>
        <Button
          variant="secondary"
          loading={locating}
          leadingIcon={
            locating ? undefined : <Crosshair size={16} color={colors.primary} strokeWidth={2} />
          }
          onPress={onLocate}>
          Use my current location
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    padding: spacing.s6,
    backgroundColor: colors.surfaceCard,
  },
  mapFallbackText: {
    ...typography.heading,
    color: colors.textStrong,
  },
  mapFallbackHint: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
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
  // Half-height nudge puts the glyph's tip on the map centre (spike value).
  pin: {
    transform: [{ translateY: -22 }],
  },
  pinLifted: {
    transform: [{ translateY: -34 }],
  },
  searchWrap: {
    position: 'absolute',
    top: spacing.s3,
    left: spacing.s4,
    right: spacing.s4,
  },
  locateWrap: {
    position: 'absolute',
    bottom: spacing.s3,
    left: spacing.s4,
    right: spacing.s4,
  },
});
