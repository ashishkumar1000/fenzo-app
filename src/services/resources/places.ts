/**
 * services/resources/places.ts
 * ─────────────────────────────
 * Google Places–backed address search for Add Customer (Epic 1). Two
 * endpoints, both owner-only and both requiring the same client-generated
 * `sessionToken`: one session token is minted per search session and reused
 * across every autosuggest call AND the terminating resolve call, mirroring
 * Google's own Autocomplete session-token billing model — see
 * `useAddressAutosuggest` for where that token is generated.
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `customers.ts`), not an `ApiService<T>` — these aren't CRUD resources.
 * Rejects with `ApiError` on failure, same as every other resource file.
 */
import { apiClient } from '../api/apiClient';

/** One row in the autosuggest dropdown. */
export interface PlaceSuggestion {
  placeId: string;
  text: string;
}

/**
 * `GET /places/autosuggest?q=&sessionToken=` — free-text query, scoped
 * server-side to India (not client-configurable). The backend DTO rejects an
 * empty `q` with a 422; callers gate on the 3-char minimum themselves before
 * calling (see `useAddressAutosuggest`) so that never happens in practice.
 */
async function autosuggest(
  query: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const res = await apiClient.get<{ suggestions: PlaceSuggestion[] }>(
    '/places/autosuggest',
    {
      params: { q: query, sessionToken },
      ...(signal ? { signal } : {}),
    },
  );
  // Defensive: a malformed/missing field from the backend must not crash
  // the caller's `.map()`/`.length` access — an empty result reads the same
  // as "no suggestions", which is already a handled state.
  return res.data.suggestions ?? [];
}

/**
 * A resolved address, as returned by `GET /places/resolve/:placeId`. Matches
 * the backend shape from `spec-1-2-backend-address-resolve-endpoint.md`.
 *
 * `city`/`pincode` are `null` when the resolved place has no such component
 * — never omitted or `''`. `latitude`/`longitude` are always real numbers
 * when this call resolves successfully; a place the provider can't locate
 * surfaces as a rejected `ApiError` (502 upstream), never a null-coordinate
 * success.
 */
export interface ResolvedPlace {
  placeId: string;
  formattedAddress: string;
  city: string | null;
  pincode: string | null;
  latitude: number;
  longitude: number;
}

/**
 * `GET /places/resolve/:placeId?sessionToken=` — terminates a search
 * session. Pass the SAME `sessionToken` used for every autosuggest call in
 * this session, never a fresh one.
 */
async function resolve(
  placeId: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<ResolvedPlace> {
  const res = await apiClient.get<ResolvedPlace>(
    `/places/resolve/${placeId}`,
    {
      params: { sessionToken },
      ...(signal ? { signal } : {}),
    },
  );
  return res.data;
}

export const placesService = {
  autosuggest,
  resolve,
};
