import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-nitro-geolocation/compat';
import { requestPermission } from 'react-native-nitro-geolocation';

export interface LocationPermissionOutcome {
  status: 'granted' | 'denied' | 'undetermined';
  error?: string;
}

export interface GeolocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export const LOCATION_PERMISSION_MESSAGE = 'Allow Fenzit to access your location to verify step completion';

const PLATFORM_MESSAGES = {
  android: {
    denied: 'Location permission denied. Go to Settings to enable location access.',
    other: 'Location permission is needed to verify step completion.',
  },
  ios: {
    denied: 'Location access was denied. Go to Settings and select "Allow While Using App".',
    other: 'Location access is needed to verify step completion.',
  },
} as const;

export async function requestLocationPermission(): Promise<LocationPermissionOutcome> {
  if (Platform.OS === 'android') {
    try {
      const status = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (status) {
        return { status: 'granted' };
      }

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: LOCATION_PERMISSION_MESSAGE,
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        },
      );

      return {
        status: granted === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied',
        ...(granted !== PermissionsAndroid.RESULTS.GRANTED && {
          error: PLATFORM_MESSAGES.android.denied,
        }),
      };
    } catch (err) {
      console.error('[geolocation] permission error:', err);
      throw err;
    }
  }

  try {
    // nitro-geolocation 1.4.x: the /compat `requestAuthorization` is
    // callback-based (the old promise + 'whenInUse' call resolved to
    // undefined and read as "denied"); use the main API instead.
    const status = await requestPermission();
    return {
      status: status === 'granted' ? 'granted' : 'denied',
      ...(status !== 'granted' && { error: PLATFORM_MESSAGES.ios.denied }),
    };
  } catch (err) {
    console.error('[geolocation] authorization error:', err);
    throw err;
  }
}

/** One native compat capture with its own timeout belt. Errors are
 *  classified into plain Errors (messages are the consumer contract). */
function attemptPosition(options: {
  enableHighAccuracy: boolean;
  maximumAge: number;
  timeout: number;
}): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const err = new Error(`Location request timed out after ${options.timeout}ms`);
      console.error('[geolocation] timeout:', err.message);
      reject(err);
    }, options.timeout);

    Geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        const { latitude, longitude, accuracy } = position.coords;

        if (latitude === undefined || longitude === undefined || accuracy === undefined) {
          const err = new Error('Invalid location data: missing coordinates');
          console.error('[geolocation]', err.message);
          reject(err);
          return;
        }

        resolve({ latitude, longitude, accuracy });
      },
      (error) => {
        clearTimeout(timeoutId);
        // The compat layer passes a plain CompatGeolocationError — { code:
        // 1|2|3, message } — NOT an Error instance: String(error) printed
        // "[object Object]" and a message-only classification never
        // matched. Log the fields, and classify on the numeric
        // geolocation-spec code (1 PERMISSION_DENIED, 2
        // POSITION_UNAVAILABLE, 3 TIMEOUT) with the string matches kept
        // for any Error-shaped input.
        const raw =
          error instanceof Error
            ? error.message
            : `${error.message} (code ${error.code})`;
        console.error('[geolocation] error:', raw);

        let finalError: Error;
        if (error.code === 1 || raw.includes('PERMISSION_DENIED')) {
          finalError = new Error('Location permission denied');
        } else if (error.code === 2 || raw.includes('POSITION_UNAVAILABLE')) {
          finalError = new Error('Location services unavailable');
        } else if (error.code === 3 || raw.includes('TIMEOUT')) {
          finalError = new Error('Location request timed out');
        } else {
          finalError = new Error('Failed to get location: ' + raw);
        }
        reject(finalError);
      },
      options,
    );
  });
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && /timed out|TIMEOUT/.test(err.message);
}

export async function getCurrentPosition(timeout: number = 15000): Promise<GeolocationCoordinates> {
  try {
    // Attempt 1 — the strict capture, unchanged shape: fresh, high
    // accuracy. Step verification and the office pin both depend on where
    // the device actually is.
    return await attemptPosition({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout,
    });
  } catch (err) {
    // Only a TIMEOUT earns the indoor fallback (user-directed, 2026-10-02
    // — offices saw every strict capture time out while Maps located
    // instantly): one retry at balanced priority accepting a fix up to
    // 15 s old. Permission and services-off failures keep their own copy.
    if (!isTimeout(err)) throw err;

    console.error('[geolocation] high-accuracy attempt timed out; retrying balanced');
    try {
      return await attemptPosition({
        enableHighAccuracy: false,
        maximumAge: 15_000,
        timeout: 25_000,
      });
    } catch (retryErr) {
      console.error('[geolocation] fallback error:', retryErr);
      throw retryErr;
    }
  }
}
