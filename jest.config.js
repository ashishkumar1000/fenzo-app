module.exports = {
  // Named directly (RN's own `react-native/jest-preset` is just a shim that
  // re-exports this package — the dependency is the real requirement).
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  // Watchman can't be relied on in sandboxed environments (its state dir sits
  // outside the repo and mkdirs fail) — use jest's own crawler instead.
  watchman: false,
  // Some deps (notably @react-navigation, react-native-reanimated) publish
  // only ESM builds under lib/module — jest must transform them, not skip
  // node_modules wholesale. react-native-image-picker publishes raw TS at
  // "main" (src/index.ts), so it needs the same treatment.
  // react-native-signature-canvas ships raw ESM (JSX) at "main".
  // @lodev09/react-native-true-sheet publishes ESM under lib/module — the
  // `/mock` subpath that jest.setup.js routes the main entry to resolves
  // inside that ESM build, so it needs a transform too.
  // react-native-url-polyfill (Story 3.3, Hermes URL polyfill for supabase-js)
  // publishes raw ESM at "main".
  // react-native-image-viewing (Story 9-1) publishes ESM under dist/.
  // react-native-nitro-geolocation (Story 7-10) publishes raw ESM at the
  // `/compat` subpath that features/technicianApp/geolocation.ts imports.
  // lucide-react-native (2026-09-26): 1.48.0 resolves its "react-native"
  // export condition to a raw-ESM .mjs build — jest must transform it, or
  // every suite that imports an icon crashes at parse. transformIgnorePatterns
  // alone is NOT enough: the RN preset's transform table covers only
  // .js/.ts/.tsx, so .mjs files match NO transformer and load raw. This extra
  // entry routes them through babel-jest.
  transform: {
    '^.+\\.mjs$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-safe-area-context|react-native-reanimated|react-native-worklets|@react-native-community/datetimepicker|react-native-image-picker|react-native-signature-canvas|react-native-webview|@lodev09|react-native-url-polyfill|react-native-image-viewing|react-native-nitro-geolocation|lucide-react-native)/)',
  ],
};
