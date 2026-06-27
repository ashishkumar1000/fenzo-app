/**
 * React Native CLI configuration.
 *
 * Links custom font assets (Inter) into the iOS and Android builds.
 * After adding/changing font files in src/assets/fonts, run:
 *   npx react-native-asset
 * then rebuild the app and flip INTER_LINKED to true in src/theme/fonts.ts.
 */
module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./src/assets/fonts'],
};
