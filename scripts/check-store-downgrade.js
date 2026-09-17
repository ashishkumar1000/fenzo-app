/**
 * Store-upload history guard — refuse a version that would regress below a
 * build number the stores have already seen.
 *
 * Record every store upload by tagging the release commit:
 *   git tag store-v1.2.3
 * (TestFlight or App Store, RC or final — any upload counts.)
 *
 * This script scans those tags, computes each one's build number with the
 * same formula as verify-version-sync.js, and fails if the current
 * package.json version computes to a build number <= the highest tagged one.
 * Combined with the policy in verify-version-sync.js (every upload is a
 * SemVer bump; after a rejected upload bump the patch again), this makes
 * reusing a store build number impossible to commit by accident.
 *
 * Runs from .githooks/pre-commit after verify; also runnable by hand:
 * `bun run verify:store`. Outside a git repo, or with no store-v* tags yet,
 * it passes — there is no history to regress against.
 *
 * Exit codes: 0 = ok (or nothing to compare against), 1 = downgrade detected
 * (or package.json unreadable/invalid).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { SEMVER_RE, expectedCodeFor } = require('./verify-version-sync');

/** Highest build number tagged store-v*, or null if there are none. */
function maxStoreBuild(root) {
  let tags;
  try {
    tags = execFileSync('git', ['tag', '--list', 'store-v*'], {
      cwd: root,
      encoding: 'utf8',
    });
  } catch {
    return null; // not a git repo / git unavailable — nothing to compare
  }
  const builds = [];
  for (const tag of tags.split('\n')) {
    const semver = tag.trim().replace(/^store-v/, '').match(SEMVER_RE);
    if (semver) {
      builds.push(expectedCodeFor(...semver.slice(1).map(Number)));
    }
  }
  return builds.length > 0 ? Math.max(...builds) : null;
}

function checkStoreDowngrade(root) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch (e) {
    return {
      ok: false,
      message: `cannot read package.json: ${e.code || e.message}`,
    };
  }
  const version = pkg && pkg.version;
  const semver = typeof version === 'string' ? version.match(SEMVER_RE) : null;
  if (!semver) {
    return {
      ok: false,
      message: `package.json version "${version}" is not MAJOR.MINOR.PATCH`,
    };
  }
  const expectedCode = expectedCodeFor(...semver.slice(1).map(Number));
  const max = maxStoreBuild(root);
  if (max === null || expectedCode > max) {
    return { ok: true, version, expectedCode, maxStoreBuild: max };
  }
  return {
    ok: false,
    version,
    expectedCode,
    maxStoreBuild: max,
    message:
      `version ${version} computes build number ${expectedCode}, but build ` +
      `${max} has already been uploaded to the stores (store-v* tags) — ` +
      `bump the version (after a rejected upload, bump the patch again); ` +
      `never reuse a store build number`,
  };
}

function main() {
  const root = path.join(__dirname, '..');
  const { ok, message, version, expectedCode, maxStoreBuild: max } =
    checkStoreDowngrade(root);
  if (!ok) {
    console.error(`check-store-downgrade: ${message}`);
    process.exit(1);
  }
  console.log(
    max === null
      ? `check-store-downgrade: ${version} (build ${expectedCode}) — ` +
          `no store-v* tags yet, nothing to regress against`
      : `check-store-downgrade: ${version} (build ${expectedCode}) is ` +
          `above uploaded build ${max} — ok`,
  );
}

if (require.main === module) {
  main();
}

module.exports = { checkStoreDowngrade };
