/**
 * clientMetadata.ts — the X-App-* request headers (server-driven-config
 * spec, CAP-3): every API request identifies the app build, platform, OS
 * version, and device model so fenzit-be can log, triage, and target
 * config by client attributes.
 *
 * Values are read once at module load — none of them change during a run.
 * Deliberately NO persistent device identifiers (IMEI/advertising id):
 * informational headers only, and the server never requires them (old
 * clients and plain curl keep working).
 *
 * Fail-open (spec constraint): device-info is a native module — if it is
 * ever missing (a linking regression, a managed-engineering edge) every
 * accessor here degrades to a build-time or static fallback instead of
 * throwing, so the app boots and the gate/banner render even then. Proven
 * live 2026-10-04: a stale autolinking manifest shipped a bundle whose
 * RNDeviceInfo was null; the unhardened version crashed at boot.
 */
import { Platform } from 'react-native';
import {
  getBuildNumber,
  getModel,
  getVersion,
} from 'react-native-device-info';
import pkg from '../../package.json';

const OS_VERSION = String(Platform.Version);

/** package.json is the version source of truth (scripts/sync-version.js
 * keeps the native files in sync FROM it), so it is the fallback when the
 * native side cannot answer. */
const PKG_VERSION: string = pkg.version;
const PKG_BUILD = '0';

function safely(read: () => string, fallback: string): string {
  try {
    const value = read();
    return value || fallback;
  } catch {
    return fallback;
  }
}

/** The installed app version — native when available, package.json otherwise. */
export function installedAppVersion(): string {
  return safely(getVersion, PKG_VERSION);
}

/** The native build number, or '0' when unavailable. */
export function installedAppBuild(): string {
  return safely(getBuildNumber, PKG_BUILD);
}

/** The device model, or 'unknown' when unavailable. */
export function deviceModel(): string {
  return safely(getModel, 'unknown');
}

export function clientMetadataHeaders(): Record<string, string> {
  return {
    'X-App-Version': installedAppVersion(),
    'X-App-Build': installedAppBuild(),
    'X-Platform': Platform.OS,
    'X-OS-Version': OS_VERSION,
    'X-Device-Model': deviceModel(),
  };
}
