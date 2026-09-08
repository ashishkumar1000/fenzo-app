/**
 * Verify the metroDebug JS bundle was baked with __DEV__=true.
 *
 * The RN gradle plugin defaults to devEnabled=false for variants outside
 * debuggableVariants; android/app/build.gradle overrides it in afterEvaluate
 * (and throws there if the bundle task disappears). This check is the second
 * line of defence: with __DEV__=true the dev API host is present in the
 * generated bundle, and Metro constant-folds it away when __DEV__=false —
 * so "host present" is a reliable signal of the right flag.
 *
 * Run automatically by `bun run android:standalone` after the build.
 */
const fs = require('fs');
const path = require('path');

const BUNDLE_PATH = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'build',
  'generated',
  'assets',
  'react',
  'metroDebug',
  'index.android.bundle',
);

// Same fallback as src/config/index.ts (Metro inlines process.env at bundle
// time, so a build run with DEV_API_HOST set bakes that value instead).
const CONFIG_PATH = path.join(__dirname, '..', 'src', 'config', 'index.ts');
const devHost =
  process.env.DEV_API_HOST ||
  fs
    .readFileSync(CONFIG_PATH, 'utf8')
    .match(/DEV_API_HOST = .*?'([^']+)'/)?.[1];

if (!devHost) {
  console.error('verify-metro-debug-bundle: could not resolve DEV_API_HOST');
  process.exit(1);
}

if (!fs.existsSync(BUNDLE_PATH)) {
  console.error(
    `verify-metro-debug-bundle: bundle not found: ${BUNDLE_PATH}\n` +
      'Run the metroDebug build first (bun run android:standalone).',
  );
  process.exit(1);
}

const bundle = fs.readFileSync(BUNDLE_PATH);
if (!bundle.includes(devHost)) {
  console.error(
    `verify-metro-debug-bundle: FAILED — dev host ${devHost} is missing from ` +
      'the metroDebug bundle. The bundle was likely built with __DEV__=false ' +
      '(prod API URL). Check the devEnabled override in android/app/build.gradle.',
  );
  process.exit(1);
}

console.log(`verify-metro-debug-bundle: OK — dev host ${devHost} present in bundle`);