/**
 * Verify the metroDebug JS bundle has the dev API URL baked in.
 *
 * The RN gradle plugin defaults to devEnabled=false for variants outside
 * debuggableVariants; android/app/build.gradle overrides it in afterEvaluate
 * (and throws there if the bundle task disappears). This check is the second
 * line of defence that the expected local URL made it into the bundle.
 *
 * NOTE (runtime-switchable endpoint): since src/services/apiEndpoint.ts, the
 * dev URL is an unconditional module constant — Metro bakes it in regardless
 * of __DEV__, so "URL present" no longer PROVES __DEV__=true (it also passes
 * for a prod-flavoured bundle that kept the constant). It still catches the
 * common failure of the bundle carrying only the prod URL.
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
// time, so a build run with DEV_API_URL set bakes that value instead).
const CONFIG_PATH = path.join(__dirname, '..', 'src', 'config', 'index.ts');
const devUrl =
  process.env.DEV_API_URL ||
  fs
    .readFileSync(CONFIG_PATH, 'utf8')
    // Bounded window (≤200 chars) from the assignment — the value sits on
    // a continuation line, but a lazy unbounded [\s\S]*? would reach across
    // the whole file and grab a quote from some later constant.
    .match(/DEFAULT_LOCAL_API_URL[\s\S]{0,200}?'([^']+)'/)?.[1];

if (!devUrl) {
  console.error('verify-metro-debug-bundle: could not resolve DEV_API_URL');
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
if (!bundle.includes(devUrl)) {
  console.error(
    `verify-metro-debug-bundle: FAILED — dev URL ${devUrl} is missing from ` +
      'the metroDebug bundle. The bundle was likely built with __DEV__=false ' +
      '(prod API URL). Check the devEnabled override in android/app/build.gradle.',
  );
  process.exit(1);
}

console.log(`verify-metro-debug-bundle: OK — dev URL ${devUrl} present in bundle`);