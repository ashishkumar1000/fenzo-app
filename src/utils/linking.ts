/**
 * Deep-link helpers for the device's phone dialer and maps app.
 *
 * Both exist because the backend stores dial codes and numbers (and address
 * parts) separately, and every screen that opens them needs the same joining
 * — the details live here rather than being repeated per screen (Story 3.2
 * reuses `openMaps`).
 *
 * Both swallow their own failures: a dead dialer or a rejected URL must not
 * throw into a caller that is merely rendering a row affordance — it logs and
 * gives up quietly instead.
 */
import { Linking, Platform } from 'react-native';

/**
 * Dials `countryCode + phoneNumber` (e.g. `+91` + `2121212121` → `tel:+912121212121`).
 *
 * Guarded by `canOpenURL`: on iOS the query itself can reject when the scheme
 * isn't available on the device, and that rejection must be silent here.
 */
export async function openTel(countryCode: string, phoneNumber: string): Promise<void> {
  // Blank either half → nothing dialable; quietly do nothing instead of
  // opening a dialer pre-filled with garbage.
  if (!countryCode.trim() || !phoneNumber.trim()) return;
  const url = `tel:${countryCode}${phoneNumber}`;
  try {
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  } catch (error) {
    console.warn('[linking] openTel failed →', error);
  }
}

/**
 * Opens the device's maps app centered on a search for `address` (plus
 * `city` when the caller has one — iOS `maps:` and Android `geo:` both take
 * the same `0,0?q=` query form, so the difference is the scheme alone).
 */
export async function openMaps(address: string, city?: string | null): Promise<void> {
  // Nothing to search (both halves blank) → nothing to open.
  if (!address.trim() && !(city && city.trim())) return;
  const prefix = Platform.select({
    ios: 'maps:0,0?q=',
    android: 'geo:0,0?q=',
    // `default` never applies on iOS/Android — a belt for a web/other build.
    default: 'maps:0,0?q=',
  });
  const query = city ? `${address}, ${city}` : address;
  const url = `${prefix}${encodeURIComponent(query)}`;
  try {
    await Linking.openURL(url);
  } catch (error) {
    console.warn('[linking] openMaps failed →', error);
  }
}