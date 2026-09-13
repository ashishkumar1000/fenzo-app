import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-nitro-geolocation/compat';

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
    const result = await Geolocation.requestAuthorization('whenInUse');
    return {
      status: result === 'granted' ? 'granted' : 'denied',
      ...(result !== 'granted' && { error: PLATFORM_MESSAGES.ios.denied }),
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
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[geolocation] error:', errorMsg);

        let finalError: Error;
        if (errorMsg.includes('PERMISSION_DENIED')) {
          finalError = new Error('Location permission denied');
        } else if (errorMsg.includes('POSITION_UNAVAILABLE')) {
          finalError = new Error('Location services unavailable');
        } else if (errorMsg.includes('TIMEOUT')) {
          finalError = new Error('Location request timed out');
        } else {
          finalError = new Error('Failed to get location: ' + errorMsg);
        }
        reject(finalError);
      },
    );
  });
}
