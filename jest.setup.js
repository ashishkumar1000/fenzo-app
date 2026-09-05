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

// The signature pad renders a real WebView (native TurboModule) — it cannot
// boot in jest. Every suite that transitively imports SignatureScreen gets a
// fake pad whose props/ref mirror the library's contract (onOK/onBegin/
// onEmpty, readSignature/clearSignature; clear routes to the onClear prop —
// the real library never fires onEmpty on clear); the pad's own suite mocks
// it too and drives the callbacks directly.
jest.mock('react-native-signature-canvas', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        readSignature: () => props.onOK?.('data:image/png;base64,MOCK'),
        clearSignature: () => props.onClear?.(),
      }));
      return null;
    }),
  };
});

// TrueSheet is a native TurboModule/Fabric component — it cannot boot in
// jest. The library ships its own mock (a plain View that records
// present/dismiss calls on the ref); route the real entry to it globally.
jest.mock('@lodev09/react-native-true-sheet', () =>
  require('@lodev09/react-native-true-sheet/mock'),
);

// Pin the test timezone: the screens format dates with toLocaleDateString
// ('en-IN', …) on UTC timestamps, which shifts a day in behind-UTC timezones
// — assertions like "12 Aug 2026" must not depend on the host TZ. IST is the
// product's home timezone, so it is the deterministic choice for tests.
process.env.TZ = 'Asia/Kolkata';
