/**
 * useApiEndpoint — reactive view of the runtime-switchable API endpoint
 * (see `src/services/apiEndpoint.ts`). Re-renders the caller whenever the
 * mode (prod/local) or the local URL changes, across every subscribed
 * screen at once.
 */
import { useSyncExternalStore } from 'react';
import { getApiEndpointSnapshot, subscribeApiEndpoint } from '../../services';

export function useApiEndpoint() {
  return useSyncExternalStore(subscribeApiEndpoint, getApiEndpointSnapshot);
}