/**
 * App-wide key/value storage (MMKV).
 *
 * MMKV is synchronous and fast, so values like the onboarding flag can be read
 * during render without an async "loading" state. Re-use this single instance
 * across the app rather than creating new ones.
 */
import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV();
