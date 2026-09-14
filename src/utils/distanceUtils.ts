/**
 * Straight-line ("as the crow flies") distance between two lat/long pairs —
 * haversine, pure math, no React Native imports, no side effects.
 *
 * Used by the job-detail timeline caption (story 7.10) to show how far the
 * technician was from the job site at the moment they captured a GPS fix.
 * This is NOT road distance — no maps service involved, deliberately.
 */

/** Mean Earth radius in metres (IUGG mean). */
const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in metres between two lat/long pairs (degrees in). */
export function haversineMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const sinLat = Math.sin(toRad(b.latitude - a.latitude) / 2);
  const sinLon = Math.sin(toRad(b.longitude - a.longitude) / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      sinLon *
      sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Timeline chip text: "120 m away" under 1 km (rounded to the nearest
 * 10 m — a 3-metre-precise number would imply GPS precision it doesn't
 * have), "2.4 km away" at or above (1 decimal). The "approximately" is the
 * chip's ≈ icon, not the text. Rounding never produces a metre reading at
 * or above 1000 — that renders as km instead.
 */
export function formatDistance(metres: number): string {
  const roundedMetres = Math.round(metres / 10) * 10;
  if (roundedMetres < 1000) {
    return `${roundedMetres} m away`;
  }
  return `${(metres / 1000).toFixed(1)} km away`;
}
