/**
 * attendanceLocationPermission.ts — the attendance-side location permission
 * states (Story 16-3/16-4, spec D3).
 *
 * Deliberately SEPARATE from the job flow's
 * `features/technicianApp/geolocation.ts` helper (AC: attendance gets its
 * own function, NFR-12: the job flow is untouched). The states are the
 * CheckInOutButton's vocabulary — each renders its own label and its own
 * remediation, and "precise location off" (Android "Approximate only" /
 * iOS reduced accuracy) is its OWN state, never folded into "denied"
 * (addendum §C2), because the permission is technically granted there.
 *
 * Layered permission-FIRST (review finding: iOS reports reduced accuracy
 * for denied users too — reading accuracy before permission misclassifies
 * a denied user as precise-off and reaches a doomed capture).
 */
import { PermissionsAndroid, Platform } from 'react-native';
import { Linking } from 'react-native';
import {
  checkPermission,
  getAccuracyAuthorization,
  getProviderStatus,
  requestPermission,
} from 'react-native-nitro-geolocation';

/** The four states the Today button branches on. */
export type AttendanceLocationState =
  | 'granted'
  | 'denied'
  | 'preciseOff'
  | 'serviceOff';

type PermissionStatus = 'granted' | 'denied' | 'restricted' | 'undetermined';

async function androidState(): Promise<AttendanceLocationState> {
  // Services first: with the master switch off, permission checks still
  // answer granted — the button must name the REAL problem.
  try {
    const providerStatus = await getProviderStatus();
    if (providerStatus.locationServicesEnabled === false) {
      return 'serviceOff';
    }
  } catch (err) {
    // A provider-status failure must not block the permission answer.
    console.error('[attendanceLocationPermission] providerStatus failed:', err);
  }
  const fine = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  if (fine) return 'granted';
  const coarse = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  );
  // Approximate-only: the OS granted coarse but withheld fine — the user
  // must flip "precise" on; re-prompting cannot fix it.
  return coarse ? 'preciseOff' : 'denied';
}

async function iosState(): Promise<AttendanceLocationState> {
  const status = (await checkPermission()) as PermissionStatus;
  if (status === 'denied' || status === 'restricted') return 'denied';
  if (status === 'undetermined') return 'denied';
  // granted: granularity decides. 'unknown' (pre-iOS-14) cannot be
  // classified — treat as granted and let a failing capture surface the
  // truth (never block a user the OS gives no signal about).
  try {
    const accuracy = await getAccuracyAuthorization();
    return accuracy === 'reduced' ? 'preciseOff' : 'granted';
  } catch {
    return 'granted';
  }
}

/**
 * The cheap, GPS-free probe the Today screen runs on mount, on focus and
 * on every foreground return (a user coming back from Settings must never
 * stay stuck on a blocked label). Android location services being off
 * surfaces at capture time as `unavailable`; this probe answers the
 * permission dimension only.
 */
export async function resolveAttendanceLocationState(): Promise<AttendanceLocationState> {
  try {
    return Platform.OS === 'android' ? await androidState() : await iosState();
  } catch (err) {
    console.error('[attendanceLocationPermission] probe failed:', err);
    // Fail open to the safest interactive state: 'denied' renders the
    // remediation label, and tapping it re-runs the real request.
    return 'denied';
  }
}

/**
 * The remediation for a blocked state — the right flow per state (AC):
 * Android denied → the OS request dialog (fires the prompt; if the OS
 * answers NEVER_ASK_AGAIN/denied again, Settings is the only path left);
 * everything else (Android precise-off, iOS denied/restricted — iOS has NO
 * in-app re-prompt — and service-off) → the app's own Settings page.
 * Returns the resolved state after any in-app prompt so the caller can
 * re-render immediately.
 */
export async function remediateAttendanceLocation(
  state: AttendanceLocationState,
): Promise<AttendanceLocationState> {
  if (Platform.OS === 'android' && state === 'denied') {
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message:
            'Allow Fenzo to access your precise location to verify your attendance check-in.',
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        },
      );
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        return resolveAttendanceLocationState();
      }
      // DENIED / NEVER_ASK_AGAIN → the OS may never prompt again; Settings.
      await Linking.openSettings();
      return 'denied';
    } catch (err) {
      console.error('[attendanceLocationPermission] request failed:', err);
      return 'denied';
    }
  }
  if (Platform.OS === 'ios' && state === 'denied') {
    // One in-app attempt covers the never-asked case (the prompt SHOWS for
    // 'undetermined'); an already-denied user gets no dialog and falls
    // through to Settings in the same tap — never a dead tap.
    try {
      const status = (await requestPermission()) as PermissionStatus;
      if (status === 'granted') return resolveAttendanceLocationState();
    } catch (err) {
      console.error('[attendanceLocationPermission] request failed:', err);
    }
  }
  // Android re-prompt already exhausted; iOS still-denied; every
  // preciseOff/serviceOff path.
  await Linking.openSettings();
  return state;
}
