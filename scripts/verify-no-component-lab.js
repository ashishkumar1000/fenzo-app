/**
 * verify-no-component-lab — the 18-3 D7 release tripwire.
 *
 * The ComponentLab screen is dev-only: its require() sits inside an
 * `if (__DEV__)` branch, so Metro's release DCE removes its EXECUTION —
 * but not necessarily its module bytes from the graph history. This script
 * greps a BUILT release JS bundle for the lab's marker string and fails the
 * build if it ever appears. Run it as part of `android:build:release`,
 * after the bundle is assembled.
 *
 * Usage: bun scripts/verify-no-component-lab.js <path-to-index.android.bundle>
 *        (no arg → the conventional Metro release bundle path)
 */
const fs = require('fs');
const path = require('path');

const MARKER = 'component-lab-18-3';
const DEFAULT_BUNDLE = path.join(
  'android',
  'app',
  'build',
  'generated',
  'assets',
  'react',
  'release',
  'index.android.bundle',
);

const bundle = process.argv[2] ?? DEFAULT_BUNDLE;

if (!fs.existsSync(bundle)) {
  console.error(
    `verify-no-component-lab: bundle not found at ${bundle}\n` +
      'Pass the bundle path explicitly: bun scripts/verify-no-component-lab.js <bundle>',
  );
  process.exit(2);
}

const contents = fs.readFileSync(bundle, 'utf8');
if (contents.includes(MARKER)) {
  console.error(
    `verify-no-component-lab: FAIL — the dev-only ComponentLab marker ` +
      `"${MARKER}" appears in the RELEASE bundle (${bundle}). ` +
      'The lab import must stay inside the __DEV__ gate in RootNavigator.',
  );
  process.exit(1);
}

console.log(`verify-no-component-lab: OK — no ComponentLab bytes in ${bundle}`);
