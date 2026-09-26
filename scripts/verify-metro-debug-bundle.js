/**
 * Verify the metroDebug JS bundle has the API URL baked in.
 *
 * The RN gradle plugin defaults to devEnabled=false for variants outside
 * debuggableVariants; android/app/build.gradle overrides it in afterEvaluate
 * (and throws there if the bundle task disappears). This check is the second
 * line of defence that the expected API URL made it into the bundle.
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

// Resolve the URL from src/config/index.ts (the single source of truth)
// rather than hardcoding a copy here. Only API_HOST is asserted
// contiguously: Metro does not guarantee API_HOST and API_VERSION_PREFIX
// are folded into one literal in the minified bundle (they are joined at
// runtime), so searching the joined URL can false-fail (seen 2026-09-26).
// The host alone is the thing being guarded — a dev/localhost URL baked in.
const CONFIG_PATH = path.join(__dirname, '..', 'src', 'config', 'index.ts');
const config = fs.readFileSync(CONFIG_PATH, 'utf8');
const apiUrl = config.match(/API_HOST\s*=\s*'([^']+)'/)?.[1];

if (!apiUrl) {
  console.error(
    'verify-metro-debug-bundle: could not resolve API_HOST from src/config/index.ts',
  );
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
if (!bundle.includes(apiUrl)) {
  console.error(
    `verify-metro-debug-bundle: FAILED — API URL ${apiUrl} is missing from ` +
      'the metroDebug bundle. Check the devEnabled override in android/app/build.gradle.',
  );
  process.exit(1);
}

console.log(`verify-metro-debug-bundle: OK — API URL ${apiUrl} present in bundle`);