/**
 * App configuration and environment setup.
 *
 * Kept as plain constants (no env-file library) since we only need a
 * dev/prod switch today. If per-environment builds (staging, multiple
 * API keys, etc.) become necessary, swap this for `react-native-config`
 * without touching any call site — everything imports from here.
 */
import { Platform } from 'react-native';

/**
 * Base URL for the Fenzit backend (NestJS).
 *
 * `localhost` only reaches your dev machine from an iOS simulator. It does
 * NOT work on:
 *   - Android emulator → needs `10.0.2.2` (emulator's alias for host machine)
 *   - A physical device (either platform) → needs your machine's LAN IP,
 *     e.g. `192.168.x.x`, with the phone on the same network
 *
 * Update `DEV_API_HOST` below when testing on Android or a physical device.
 */
const DEV_API_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const API_BASE_URL = __DEV__
  ? `http://${DEV_API_HOST}:3000/api`
  : 'https://api.fenzit.com/api';

/** Default request timeout, in milliseconds. */
export const API_TIMEOUT = 15000;

