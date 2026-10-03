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
 */
import { Platform } from 'react-native';
import { getBuildNumber, getModel, getVersion } from 'react-native-device-info';

const OS_VERSION = String(Platform.Version);

export function clientMetadataHeaders(): Record<string, string> {
  return {
    'X-App-Version': getVersion(),
    'X-App-Build': getBuildNumber(),
    'X-Platform': Platform.OS,
    'X-OS-Version': OS_VERSION,
    'X-Device-Model': getModel(),
  };
}
