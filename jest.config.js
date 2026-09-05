module.exports = {
  // Named directly (RN's own `react-native/jest-preset` is just a shim that
  // re-exports this package — the dependency is the real requirement).
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  // Some deps (notably @react-navigation, react-native-reanimated) publish
  // only ESM builds under lib/module — jest must transform them, not skip
  // node_modules wholesale. react-native-image-picker publishes raw TS at
  // "main" (src/index.ts), so it needs the same treatment.
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-safe-area-context|react-native-reanimated|react-native-worklets|@react-native-community/datetimepicker|react-native-image-picker)/)',
  ],
};
