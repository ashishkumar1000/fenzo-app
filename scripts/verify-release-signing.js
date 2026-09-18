/**
 * Verify every release APK is signed with the Fenzit release key, not the
 * debug key.
 *
 * The Gradle signing config deliberately falls back to the debug keystore
 * when android/keystore.properties is missing — so a deleted, renamed or
 * ignored-by-accident file would produce debug-signed "release" APKs that
 * look identical by name alone. This check is the second line of defence:
 * it fails if any APK in the release output directory is not signed with
 * the release cert.
 *
 * Run automatically by `bun run android:build:release` after the build.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RELEASE_CERT_CN = 'CN=Fenzit Technology';
const APK_DIR = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'release',
);

function findApksigner() {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(process.env.HOME || '', 'Library', 'Android', 'sdk');
  const buildToolsDir = path.join(sdk, 'build-tools');
  if (!fs.existsSync(buildToolsDir)) {
    throw new Error(
      `build-tools not found under ${sdk} — set ANDROID_HOME to your SDK`,
    );
  }
  const versions = fs
    .readdirSync(buildToolsDir)
    .filter((v) => fs.existsSync(path.join(buildToolsDir, v, 'apksigner')))
    .sort()
    .reverse();
  if (versions.length === 0) {
    throw new Error('apksigner not found in any build-tools version');
  }
  return path.join(buildToolsDir, versions[0], 'apksigner');
}

const apks = fs.existsSync(APK_DIR)
  ? fs.readdirSync(APK_DIR).filter((f) => f.endsWith('.apk')).sort()
  : [];
if (apks.length === 0) {
  console.error(
    `verify-release-signing: no APKs found in ${APK_DIR}\n` +
      'Run the release build first (bun run android:build:release).',
  );
  process.exit(1);
}

let apksigner;
try {
  apksigner = findApksigner();
} catch (e) {
  console.error(`verify-release-signing: ${e.message}`);
  process.exit(1);
}

let failed = false;
for (const apk of apks) {
  try {
    const out = execFileSync(
      apksigner,
      ['verify', '--print-certs', path.join(APK_DIR, apk)],
      { encoding: 'utf8' },
    );
    if (out.includes(RELEASE_CERT_CN)) {
      console.log(
        `verify-release-signing: OK — ${apk} signed with ${RELEASE_CERT_CN}`,
      );
    } else {
      console.error(
        `verify-release-signing: FAILED — ${apk} is NOT signed with ` +
          `${RELEASE_CERT_CN}. It is likely debug-signed (fallback path). ` +
          'DO NOT distribute.',
      );
      failed = true;
    }
  } catch (e) {
    console.error(`verify-release-signing: FAILED — ${apk}: ${e.message}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);