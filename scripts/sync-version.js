/**
 * Sync the app version everywhere FROM package.json — the single source of
 * truth. Change the version in package.json, and this rewrites:
 *
 *   - android/app/build.gradle           versionName, versionCode
 *   - ios/FenzitApp.xcodeproj/project.pbxproj
 *       MARKETING_VERSION, CURRENT_PROJECT_VERSION (Debug + Release)
 *
 * Wired into .githooks/pre-commit, so the moment a package.json version
 * change is committed, the native files are corrected in the same commit
 * (the hook re-stages them). Also runnable by hand: `bun run sync:version`.
 *
 * Exit codes: 0 = success (in sync, or rewrote files), 1 = cannot sync —
 * invalid/missing version, unreadable native file, or a version key that has
 * gone missing from a native file. Sync refuses rather than guessing, and
 * validates the same bounds as verify (minor/patch < 100, store build-number
 * cap) BEFORE touching any file, so a bad version never leaves a half-synced
 * tree.
 */
const fs = require('fs');
const path = require('path');
const {
  SEMVER_RE,
  expectedCodeFor,
  STORE_VERSIONCODE_MAX,
} = require('./verify-version-sync');

const GRADLE_PATH = ['android', 'app', 'build.gradle'];
const PBXPROJ_PATH = ['ios', 'FenzitApp.xcodeproj', 'project.pbxproj'];

function syncVersion(root) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const version = pkg && pkg.version;
  const semver = typeof version === 'string' ? version.match(SEMVER_RE) : null;
  if (!semver) {
    throw new Error(
      `package.json version "${version}" is not MAJOR.MINOR.PATCH — ` +
        `fix it before syncing`,
    );
  }
  const [major, minor, patch] = semver.slice(1).map(Number);
  if (minor >= 100 || patch >= 100) {
    throw new Error(
      `${version} has minor/patch >= 100 — the versionCode formula only ` +
        `stays collision-free below that (bump major instead)`,
    );
  }
  const expectedCode = expectedCodeFor(major, minor, patch);
  if (expectedCode > STORE_VERSIONCODE_MAX) {
    throw new Error(
      `${version} computes build number ${expectedCode} — over the stores' ` +
        `${STORE_VERSIONCODE_MAX} build-number limit`,
    );
  }

  const changes = new Set();

  // Rewrite `<key> <old>` → `<key> <new>` preserving leading indentation.
  // Anchored to line starts so comments never match; single-line-bounded so
  // a malformed file can never trigger a destructive multi-line rewrite; /g
  // so product flavors (several versionCode/versionName lines) are all
  // synced; and no end-of-line anchor, so a trailing comment after the value
  // survives the rewrite instead of deadlocking sync against verify (verify
  // ignores such comments when reading).
  const rewrite = (rel, key, re, replacement) => {
    const file = path.join(root, ...rel);
    let before;
    try {
      before = fs.readFileSync(file, 'utf8');
    } catch (e) {
      throw new Error(`cannot read ${rel.join('/')}: ${e.code || e.message}`);
    }
    if (!re.test(before)) {
      throw new Error(
        `no ${key} line found in ${rel.join('/')} — sync cannot re-add ` +
          `lost keys; restore it by hand or from git`,
      );
    }
    const after = before.replace(re, replacement);
    if (after !== before) {
      fs.writeFileSync(file, after);
      changes.add(rel.join('/'));
    }
  };

  rewrite(
    GRADLE_PATH,
    'versionCode',
    /^(\s*)versionCode\s+\d+/gm,
    `$1versionCode ${expectedCode}`,
  );
  rewrite(
    GRADLE_PATH,
    'versionName',
    /^(\s*)versionName\s+"[^"\r\n]*"/gm,
    `$1versionName "${version}"`,
  );
  rewrite(
    PBXPROJ_PATH,
    'CURRENT_PROJECT_VERSION',
    /^(\s*)CURRENT_PROJECT_VERSION = \d+;/gm,
    `$1CURRENT_PROJECT_VERSION = ${expectedCode};`,
  );
  rewrite(
    PBXPROJ_PATH,
    'MARKETING_VERSION',
    /^(\s*)MARKETING_VERSION = [^;\r\n]+;/gm,
    `$1MARKETING_VERSION = ${version};`,
  );

  return { version, expectedCode, changes: [...changes] };
}

function main() {
  const root = path.join(__dirname, '..');
  try {
    const { version, expectedCode, changes } = syncVersion(root);
    if (changes.length === 0) {
      console.log(
        `sync-version: already in sync at ${version} (build ${expectedCode})`,
      );
      process.exit(0);
    }
    for (const file of changes) {
      console.log(`sync-version: rewrote ${file} → ${version}`);
    }
    process.exit(0);
  } catch (e) {
    console.error(`sync-version: ${e.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { syncVersion };
