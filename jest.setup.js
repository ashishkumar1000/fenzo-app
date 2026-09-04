/**
 * Jest setup. Reanimated's worklets native module can't boot in jest —
 * swap in the library's own mock for every test that transitively imports it.
 *
 * Order matters: reanimated 4's own mock imports the real reanimated source,
 * which imports react-native-worklets — so worklets must be mocked too, or
 * its native module stub crashes on import (loadUnpackersWithCode).
 */
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// Reanimated's initializer calls setCSSEventHandler on import, but the JS
// implementation reanimated picks in jest throws on it. Noop the one method
// rather than pulling in react-native-web for the full web build.
jest.mock('react-native-reanimated/src/css/native/proxy', () => ({
  ...jest.requireActual('react-native-reanimated/src/css/native/proxy'),
  setCSSEventHandler: () => {},
}));

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Pin the test timezone: the screens format dates with toLocaleDateString
// ('en-IN', …) on UTC timestamps, which shifts a day in behind-UTC timezones
// — assertions like "12 Aug 2026" must not depend on the host TZ. IST is the
// product's home timezone, so it is the deterministic choice for tests.
process.env.TZ = 'Asia/Kolkata';
