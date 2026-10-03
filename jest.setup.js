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

// Reanimated 4's mock imports the real src, whose singleton constructor
// (reanimatedModuleInstance.native.ts) resolves the ReanimatedModule turbo
// spec via TurboModuleRegistry. In jest that resolution is not deterministic
// — in most runs it yields a truthy mock whose installTurboModule() is falsy,
// so the constructor installs reanimated's own DummyReanimatedModuleProxy and
// boots fine — but when the spec resolves falsy the constructor falls through
// to its "native part not initialized" throw and the suite dies at import.
// Mocking the spec here pins the safe path: installTurboModule() always
// returns falsy, the constructor always takes the dummy-proxy branch.
jest.mock('react-native-reanimated/src/specs', () => ({
  ReanimatedTurboModule: { installTurboModule: () => false },
}));

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

// The DS Sheet carries the system bottom inset in its pinned footer via
// useSafeAreaInsets — native inset measurement cannot run in jest. Use the
// library's own mock: real contexts preserved, native measurement replaced
// by zero insets (any SafeAreaProvider wrapper in a suite still wins).
// The mock module is ESM-transpiled — its real object sits behind `default`.
// The hooks are re-exposed as PLAIN functions, deliberately NOT the mock's
// own jest.fn wrappers: jest.resetAllMocks wipes every jest.fn
// implementation — the library mock's hooks included — so a suite that
// resets mocks and then renders a Sheet (any 19-4 dashboard or sheet-
// consumer suite) would read `undefined` insets and crash. Plain
// functions are untouched by the reset, and the context read stays live
// so a suite's own SafeAreaProvider still wins.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const mock = require('react-native-safe-area-context/src/jest/mock').default;
  const actual = jest.requireActual('react-native-safe-area-context');
  const ZERO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    ...mock,
    useSafeAreaInsets: () =>
      React.useContext(actual.SafeAreaInsetsContext) ?? ZERO_INSETS,
    useSafeAreaFrame: () =>
      React.useContext(actual.SafeAreaFrameContext) ??
      mock.initialWindowMetrics.frame,
  };
});

// react-native-nitro-geolocation boots NitroModules on import (a native
// TurboModule jest cannot load) — the `/compat` entry and the main entry
// (features/technicianApp/geolocation.ts imports both) crash every suite
// that transitively reaches App. Stub just the methods the app calls;
// suites needing to drive them override the mock locally.
jest.mock('react-native-nitro-geolocation/compat', () => ({
  __esModule: true,
  default: {
    requestAuthorization: jest.fn(),
    getCurrentPosition: jest.fn(),
  },
}));

jest.mock('react-native-nitro-geolocation', () => ({
  __esModule: true,
  requestPermission: jest.fn(async () => 'granted'),
  // Story 16-3/16-4 attendance modules import the main API's named
  // functions; incidental imports get inert stubs — suites that drive
  // capture/permission override these locally.
  getCurrentPosition: jest.fn(),
  checkPermission: jest.fn(async () => 'granted'),
  getAccuracyAuthorization: jest.fn(async () => 'full'),
  getProviderStatus: jest.fn(async () => ({
    locationServicesEnabled: true,
    backgroundModeEnabled: false,
  })),
  hasServicesEnabled: jest.fn(async () => true),
}));

// react-native-maps is a native Fabric component — it cannot boot in jest,
// and any suite that transitively imports the app tree (App.test) reaches
// the Story 15-4 map picker's `import MapView from 'react-native-maps'`,
// which dies at parse ("Cannot use import statement outside a module").
// Sub-components the app uses (Circle, Marker) render as plain Views; suites
// that need to drive the map override the mock locally.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockComponent = (props) => <View {...props} testID={props.testID} />;
  const MockMapView = React.forwardRef((props, _ref) => <View {...props} />);
  return {
    __esModule: true,
    default: MockMapView,
    Circle: MockComponent,
    Marker: MockComponent,
    Polyline: MockComponent,
    Polygon: MockComponent,
    Overlay: MockComponent,
    Callout: MockComponent,
  };
});

// react-native-device-info is a native TurboModule — jest cannot load it.
// The app only reads static build/device facts (version/build/model) for
// the X-App-* metadata headers and the remote-config gate; pin values that
// match the shipped defaults (v1.0.0) so no gate/banner triggers under
// default mocks. Suites that need a different story override locally.
jest.mock('react-native-device-info', () => ({
  __esModule: true,
  getVersion: jest.fn(() => '1.0.0'),
  getBuildNumber: jest.fn(() => '1'),
  getModel: jest.fn(() => 'Pixel 6'),
}));

// Pin the test timezone: the screens format dates with toLocaleDateString
// ('en-IN', …) on UTC timestamps, which shifts a day in behind-UTC timezones
// — assertions like "12 Aug 2026" must not depend on the host TZ. IST is the
// product's home timezone, so it is the deterministic choice for tests.
process.env.TZ = 'Asia/Kolkata';
