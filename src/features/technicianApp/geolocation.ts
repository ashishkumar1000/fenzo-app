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

export const LOCATION_PERMISSION_MESSAGE = 'Allow Fenzo to access your location to verify step completion';

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

export async function getCurrentPosition(timeout: number = 15000): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const err = new Error(`Location request timed out after ${timeout}ms`);
      console.error('[geolocation] timeout:', err.message);
      reject(err);
    }, timeout);

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
      // Fresh, high-accuracy fix — never a cached one: the office pin and
      // step verification both depend on where the device actually is.
      { enableHighAccuracy: true, maximumAge: 0, timeout },
    );
  });
}
