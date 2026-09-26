/**
 * SPIKE 15.1 — place search + reverse geocoding for the map spike, via the
 * free OSM Nominatim endpoints (no API key, no console setup).
 *
 * This is deliberately throwaway: an Android-app-restricted Google key
 * cannot call Google's REST geocoding APIs from the client, so the real
 * Story 15.4 picker must route search/autocomplete through `fenzit-be`
 * (server-side key, rate-limited endpoint). Finding recorded in
 * MapSpikeScreen's header.
 */

export interface GeoPlace {
  name: string;
  full: string;
  latitude: number;
  longitude: number;
}

const BASE = 'https://nominatim.openstreetmap.org';
const HEADERS = { 'User-Agent': 'FenzitSpike/15.1', Accept: 'application/json' };

interface NominatimRow {
  name?: string;
  display_name: string;
  lat?: string;
  lon?: string;
}

/** null for a malformed row — callers must filter (no Null Island (0,0)). */
function toPlace(row: NominatimRow): GeoPlace | null {
  const latitude = parseFloat(row.lat ?? '');
  const longitude = parseFloat(row.lon ?? '');
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return {
    name: row.name || row.display_name.split(',')[0],
    full: row.display_name,
    latitude,
    longitude,
  };
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<GeoPlace[]> {
  const url = `${BASE}/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=5&addressdetails=1`;
  const res = await fetch(url, { headers: HEADERS, signal });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const rows = (await res.json()) as NominatimRow[];
  if (!Array.isArray(rows)) throw new Error('Unexpected search response');
  return rows.map(toPlace).filter((p): p is GeoPlace => p !== null);
}

/** Returns null when the point has no address (e.g. open water). */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<GeoPlace | null> {
  const url = `${BASE}/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2&zoom=18`;
  const res = await fetch(url, { headers: HEADERS, signal });
  if (!res.ok) throw new Error(`Reverse geocode failed (${res.status})`);
  const row = (await res.json()) as NominatimRow;
  if (!row.display_name) return null;
  const place = toPlace(row);
  return place === null ? null : { ...place, latitude, longitude };
}
