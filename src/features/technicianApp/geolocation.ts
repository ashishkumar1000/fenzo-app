import { PermissionsAndroid, Platform } from 'react-native';
import { Geolocation } from 'react-native-nitro-geolocation/compat';

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
  console.log('[LOCATION] requestLocationPermission called, platform:', Platform.OS);

  if (Platform.OS === 'android') {
    try {
      const status = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      console.log('[LOCATION] Android permission check result:', status);
      if (status) {
        console.log('[LOCATION] Android location permission already granted');
        return { status: 'granted' };
      }

      console.log('[LOCATION] Requesting Android location permission...');
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: LOCATION_PERMISSION_MESSAGE,
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        },
      );

      console.log('[LOCATION] Android permission request result:', granted);
      const result = {
        status: granted === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied',
        ...(granted !== PermissionsAndroid.RESULTS.GRANTED && {
          error: PLATFORM_MESSAGES.android.denied,
        }),
      };
      console.log('[LOCATION] Android permission outcome:', result);
      return result;
    } catch (err) {
      console.error('[LOCATION] Android permission error:', err);
      throw err;
    }
  }

  try {
    console.log('[LOCATION] Requesting iOS location authorization...');
    const result = await Geolocation.requestAuthorization('whenInUse');
    console.log('[LOCATION] iOS authorization result:', result);
    return {
      status: result === 'granted' ? 'granted' : 'denied',
      ...(result !== 'granted' && { error: PLATFORM_MESSAGES.ios.denied }),
    };
  } catch (err) {
    console.error('[LOCATION] iOS authorization error:', err);
    throw err;
  }
}

export async function getCurrentPosition(timeout: number = 15000): Promise<GeolocationCoordinates> {
  console.log('[LOCATION] getCurrentPosition called with timeout:', timeout);
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const err = new Error('Location request timed out after ' + timeout + 'ms');
      console.error('[LOCATION] Timeout waiting for location', err);
      reject(err);
    }, timeout);

    console.log('[LOCATION] Calling Geolocation.getCurrentPosition...');
    Geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        console.log('[LOCATION] Position received:', {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });

        const { latitude, longitude, accuracy } = position.coords;

        if (latitude === undefined || longitude === undefined || accuracy === undefined) {
          const err = new Error('Invalid location data: missing coordinates');
          console.error('[LOCATION]', err);
          reject(err);
          return;
        }

        const coords = {
          latitude,
          longitude,
          accuracy,
        };
        console.log('[LOCATION] Resolving with coords:', coords);
        resolve(coords);
      },
      (error) => {
        clearTimeout(timeoutId);
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[LOCATION] Geolocation error:', { originalError: errorMsg, errorObj: error });

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
        console.error('[LOCATION] Rejecting with error:', finalError.message);
        reject(finalError);
      },
    );
  });
}
