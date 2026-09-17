/**
 * Verify the app version is in sync across all four places it lives.
 *
 * Scheme: SemVer `MAJOR.MINOR.PATCH` for the user-facing version, and a
 * deterministic build number = 10000*major + 100*minor + patch (1.0.0 → 10000).
 * Minor and patch must stay under 100 (e.g. 1.0.100 would collide with 1.1.0),
 * and the computed build number must stay under the stores' 2,100,000,000 cap.
 *
 * Store-upload policy:
 *   - No manual build-number overrides and no pre-release suffixes — every
 *     upload (TestFlight or App Store) is a SemVer bump of this repo.
 *   - An RC is just the next patch version uploaded to TestFlight first;
 *     whatever passes review ships to the App Store under the same version.
 *   - Re-uploading after a rejection (same intended release): bump the patch
 *     again — never reuse a build number the stores have already seen.
 *   - After each upload, tag the release commit `git tag store-v<version>`;
 *     scripts/check-store-downgrade.js (run by the pre-commit hook) refuses
 *     any version that computes to a build number <= the highest tagged one.
 *
 * Checked locations:
 *   - package.json                       "version"          (source of truth)
 *   - android/app/build.gradle           versionName, versionCode
 *   - ios/FenzitApp.xcodeproj/project.pbxproj (Debug + Release)
 *       MARKETING_VERSION, CURRENT_PROJECT_VERSION
 *
 * Run manually or from CI: `bun run verify:version`. Runs automatically on
 * every commit via .githooks/pre-commit (installed through core.hooksPath).
 */
const fs = require('fs');
const path = require('path');

// Strict SemVer — no leading zeros (e.g. "01.0.0" is rejected, not coerced).
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const STORE_VERSIONCODE_MAX = 2100000000;

// The deterministic build number shared by Android versionCode and iOS
// CURRENT_PROJECT_VERSION — single definition, sync script reuses it.
function expectedCodeFor(major, minor, patch) {
  return 10000 * major + 100 * minor + patch;
}

/**
 * Check version sync under `root`. Returns { version, expectedCode, problems }
 * — `problems` lists every drift; empty means in sync. Pure enough to test:
 * point it at a fixture directory instead of the real repo.
 */
function checkVersionSync(root) {
  const problems = [];

  const read = rel => {
    try {
      return fs.readFileSync(path.join(root, rel), 'utf8');
    } catch (e) {
      problems.push(`cannot read ${rel}: ${e.code || e.message}`);
      return null;
    }
  };

  const pkgRaw = read('package.json');
  if (pkgRaw === null) {
    return { version: null, expectedCode: null, problems };
  }
  let pkg;
  try {
    pkg = JSON.parse(pkgRaw);
  } catch (e) {
    problems.push(`package.json is not valid JSON: ${e.message}`);
    return { version: null, expectedCode: null, problems };
  }
  const version = pkg && pkg.version;

  const semver = typeof version === 'string' ? version.match(SEMVER_RE) : null;
  if (!semver) {
    problems.push(
      `package.json version "${version}" is not MAJOR.MINOR.PATCH ` +
        `(no leading zeros)`,
    );
    return { version, expectedCode: null, problems };
  }
  const [major, minor, patch] = semver.slice(1).map(Number);
  const expectedCode = expectedCodeFor(major, minor, patch);

  if (minor >= 100 || patch >= 100) {
    problems.push(
      `${version} has minor/patch >= 100 — the versionCode formula only ` +
        `stays collision-free below that (bump major instead)`,
    );
  }
  if (expectedCode > STORE_VERSIONCODE_MAX) {
    problems.push(
      `${version} computes build number ${expectedCode} — over the stores' ` +
        `${STORE_VERSIONCODE_MAX} build-number limit`,
    );
  }

  const gradle = read('android/app/build.gradle');
  if (gradle !== null) {
    // Line-anchored (matching sync-version.js) so comment mentions never
    // match. Every occurrence is checked — product flavors put several
    // versionCode/versionName lines in one build.gradle and they must all
    // agree. A trailing comment after the value is ignored (sync preserves
    // it when rewriting), but a key that is missing entirely is reported.
    const versionNames = [
      ...gradle.matchAll(/^\s*versionName\s+"([^"\r\n]+)"/gm),
    ].map(m => m[1]);
    const versionCodes = [
      ...gradle.matchAll(/^\s*versionCode\s+(\d+)/gm),
    ].map(m => m[1]);
    if (versionNames.length === 0) {
      problems.push('no versionName line found in android/app/build.gradle');
    }
    if (versionCodes.length === 0) {
      problems.push('no versionCode line found in android/app/build.gradle');
    }
    for (const v of versionNames) {
      if (v !== version) {
        problems.push(
          `android versionName is "${v}", expected "${version}"`,
        );
      }
    }
    for (const v of versionCodes) {
      if (Number(v) !== expectedCode) {
        problems.push(
          `android versionCode is ${v}, expected ${expectedCode}`,
        );
      }
    }
  }

  const pbxproj = read('ios/FenzitApp.xcodeproj/project.pbxproj');
  if (pbxproj !== null) {
    // Line-anchored (matching sync-version.js) so comment mentions and other
    // incidental text never count, single-line-bounded so a malformed file
    // cannot produce a bogus multi-line capture. No end-of-line anchor: a
    // trailing comment is ignored, and sync preserves it when rewriting.
    const marketingVersions = [
      ...pbxproj.matchAll(/^\s*MARKETING_VERSION = ([^;\r\n]+);/gm),
    ].map(m => m[1]);
    const projectVersions = [
      ...pbxproj.matchAll(/^\s*CURRENT_PROJECT_VERSION = ([^;\r\n]+);/gm),
    ].map(m => m[1]);
    // Exactly one per build configuration (Debug + Release). A config that
    // loses the key must fail loudly here, not silently inherit and drift.
    for (const [key, found] of [
      ['MARKETING_VERSION', marketingVersions],
      ['CURRENT_PROJECT_VERSION', projectVersions],
    ]) {
      if (found.length !== 2) {
        problems.push(
          `expected ${key} in both Debug and Release ` +
            `(found ${found.length} occurrence(s) in pbxproj)`,
        );
      }
    }
    for (const v of marketingVersions) {
      if (v !== version) {
        problems.push(`iOS MARKETING_VERSION is ${v}, expected ${version}`);
      }
    }
    for (const v of projectVersions) {
      if (Number(v) !== expectedCode) {
        problems.push(
          `iOS CURRENT_PROJECT_VERSION is ${v}, expected ${expectedCode}`,
        );
      }
    }
  }

  return { version, expectedCode, problems };
}

function main() {
  const root = path.join(__dirname, '..');
  const { version, expectedCode, problems } = checkVersionSync(root);
  if (problems.length > 0) {
    console.error(
      `verify-version-sync: version out of sync` +
        `${version ? ` (package.json says ${version})` : ''}:\n` +
        problems.map(p => `  - ${p}`).join('\n'),
    );
    process.exit(1);
  }
  console.log(`verify-version-sync: ${version} (build ${expectedCode}) in sync`);
}

if (require.main === module) {
  main();
}

module.exports = {
  checkVersionSync,
  SEMVER_RE,
  expectedCodeFor,
  STORE_VERSIONCODE_MAX,
};
