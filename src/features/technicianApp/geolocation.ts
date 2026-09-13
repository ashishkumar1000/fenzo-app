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
  if (Platform.OS === 'android') {
    const status = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    if (status) return { status: 'granted' };

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
  }

  const result = await Geolocation.requestAuthorization('whenInUse');
  return {
    status: result === 'granted' ? 'granted' : 'denied',
    ...(result !== 'granted' && { error: PLATFORM_MESSAGES.ios.denied }),
  };
}

export async function getCurrentPosition(timeout: number = 15000): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error('Location request timed out after ' + timeout + 'ms')),
      timeout,
    );

    Geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        const { latitude, longitude, accuracy } = position.coords;

        if (latitude === undefined || longitude === undefined || accuracy === undefined) {
          reject(new Error('Invalid location data: missing coordinates'));
          return;
        }

        resolve({
          latitude,
          longitude,
          accuracy,
        });
      },
      (error) => {
        clearTimeout(timeoutId);
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('PERMISSION_DENIED')) {
          reject(new Error('Location permission denied'));
        } else if (errorMsg.includes('POSITION_UNAVAILABLE')) {
          reject(new Error('Location services unavailable'));
        } else if (errorMsg.includes('TIMEOUT')) {
          reject(new Error('Location request timed out'));
        } else {
          reject(new Error('Failed to get location: ' + errorMsg));
        }
      },
    );
  });
}
