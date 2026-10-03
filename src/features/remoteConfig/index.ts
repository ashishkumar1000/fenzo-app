/**
 * Server-driven config UI (SPEC-server-driven-config, CAP-1/2/4): the
 * React-facing half of `services/remoteConfig.ts` — a subscription hook,
 * the forced-update gate screen, and the maintenance banner. The App root
 * composes all three; screens never touch config directly.
 */
import { useEffect, useState } from 'react';
import {
  compareVersions,
  getRemoteConfig,
  onRemoteConfigChange,
} from '../../services/remoteConfig';
import { installedAppVersion } from '../../services/clientMetadata';
import type { RemoteConfigValues } from '../../services/remoteConfig';

export type { RemoteConfigValues } from '../../services/remoteConfig';

/**
 * Live view of the effective config. Re-renders on every applied change
 * (fresh fetch or persisted last-known-good at module load — the latter
 * happened before mount, so the initial state already carries it).
 */
export function useRemoteConfig(): RemoteConfigValues {
  const [values, setValues] = useState<RemoteConfigValues>(getRemoteConfig());
  useEffect(() => onRemoteConfigChange(setValues), []);
  return values;
}

/**
 * True when the running app is older than the server's minimum — read from
 * the native build (fallback: package.json) via clientMetadata.
 */
export function isVersionUnsupported(minVersion: string): boolean {
  return compareVersions(minVersion, installedAppVersion()) > 0;
}

export { compareVersions } from '../../services/remoteConfig';
export { ForcedUpdateScreen } from './ForcedUpdateScreen';
export { MaintenanceBanner } from './MaintenanceBanner';
