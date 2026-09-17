/**
 * Tests for scripts/verify-version-sync.js and scripts/sync-version.js —
 * run against throwaway fixture directories, never the real repo, so drift
 * cases can be simulated freely.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkVersionSync } = require('../scripts/verify-version-sync');
const { syncVersion } = require('../scripts/sync-version');

const GRADLE_IN_SYNC = [
  'android {',
  '  defaultConfig {',
  '    versionCode 10000',
  '    versionName "1.0.0"',
  '  }',
  '}',
].join('\n');

/** A build.gradle with product flavors — two of each version line. */
const GRADLE_FLAVORS = [
  'android {',
  '  flavorDimensions "env"',
  '  productFlavors {',
  '    dev {',
  '      versionCode 10000',
  '      versionName "1.0.0"',
  '    }',
  '    prod {',
  '      versionCode 10000',
  '      versionName "1.0.0"',
  '    }',
  '  }',
  '}',
].join('\n');

/** One realistic (tab-indented, interleaved settings) build configuration. */
function pbxBlock(extra) {
  return [
    '\t\tbuildSettings = {',
    '\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;',
    '\t\t\tCLANG_ENABLE_MODULES = YES;',
    '\t\t\tCURRENT_PROJECT_VERSION = 10000;',
    '\t\t\tINFOPLIST_FILE = FenzitApp/Info.plist;',
    '\t\t\tLD_RUNPATH_SEARCH_PATHS = (',
    '\t\t\t\t"$(inherited)",',
    '\t\t\t\t"@executable_path/Frameworks",',
    '\t\t\t);',
    '\t\t\tMARKETING_VERSION = 1.0.0;',
    ...extra,
    '\t\t};',
  ].join('\n');
}

const PBXPROJ_IN_SYNC = [
  '/* Debug */',
  pbxBlock(['\t\t\tSWIFT_VERSION = 5.0;']),
  '/* a comment mentioning MARKETING_VERSION = 9.9.9; must never count */',
  '/* Release */',
  pbxBlock(['\t\t\tTARGETED_DEVICE_FAMILY = "1,2";']),
].join('\n');

// Every fixture root is tracked here so afterEach can clean up — mkdtemp
// directories would otherwise leak into os.tmpdir() on every test run.
const fixtureRoots = [];

/** Build a minimal fixture repo; overrides replace whole file bodies. */
function makeFixture({ pkg, gradle, pbxproj } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-version-sync-'));
  fixtureRoots.push(root);
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.0', ...pkg }),
  );
  fs.mkdirSync(path.join(root, 'android', 'app'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'android', 'app', 'build.gradle'),
    gradle ?? GRADLE_IN_SYNC,
  );
  fs.mkdirSync(path.join(root, 'ios', 'FenzitApp.xcodeproj'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, 'ios', 'FenzitApp.xcodeproj', 'project.pbxproj'),
    pbxproj ?? PBXPROJ_IN_SYNC,
  );
  return root;
}

afterEach(() => {
  for (const root of fixtureRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  fixtureRoots.length = 0;
});

function problemsFor(fixture) {
  const { problems } = checkVersionSync(makeFixture(fixture));
  return problems;
}

describe('checkVersionSync', () => {
  it('passes when all four locations agree', () => {
    expect(problemsFor()).toEqual([]);
  });

  it('computes the deterministic build number', () => {
    const { version, expectedCode } = checkVersionSync(
      makeFixture({ pkg: { version: '2.3.7' } }),
    );
    expect(expectedCode).toBe(20307);
    expect(version).toBe('2.3.7');
  });

  it('flags android drift', () => {
    const problems = problemsFor({
      gradle: GRADLE_IN_SYNC.replace('versionCode 10000', 'versionCode 10001'),
    });
    expect(problems).toEqual(
      expect.arrayContaining([expect.stringContaining('versionCode is 10001')]),
    );
    expect(problems).toHaveLength(1);
  });

  it('flags a single iOS config missing the version keys', () => {
    // One MARKETING_VERSION deleted — length !== 2 must fail loudly instead
    // of silently validating only the surviving occurrence.
    const problems = problemsFor({
      pbxproj: PBXPROJ_IN_SYNC.replace('\t\t\tMARKETING_VERSION = 1.0.0;\n', ''),
    });
    expect(problems).toEqual([
      expect.stringContaining('expected MARKETING_VERSION in both'),
    ]);
  });

  it('flags iOS MARKETING_VERSION value drift', () => {
    const problems = problemsFor({
      pbxproj: PBXPROJ_IN_SYNC.replaceAll(
        'MARKETING_VERSION = 1.0.0;',
        'MARKETING_VERSION = 1.0.1;',
      ),
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('MARKETING_VERSION is 1.0.1'),
      ]),
    );
    expect(problems).toHaveLength(2); // drift in both Debug and Release
  });

  it('flags iOS CURRENT_PROJECT_VERSION value drift', () => {
    const problems = problemsFor({
      pbxproj: PBXPROJ_IN_SYNC.replaceAll(
        'CURRENT_PROJECT_VERSION = 10000;',
        'CURRENT_PROJECT_VERSION = 1;',
      ),
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('CURRENT_PROJECT_VERSION is 1'),
      ]),
    );
    expect(problems).toHaveLength(2); // drift in both Debug and Release
  });

  it('flags android versionName drift', () => {
    const problems = problemsFor({
      gradle: GRADLE_IN_SYNC.replace('versionName "1.0.0"', 'versionName "1.0"'),
    });
    expect(problems).toEqual([
      expect.stringContaining('versionName is "1.0"'),
    ]);
  });

  it('never matches version keys mentioned inside comments', () => {
    const problems = problemsFor({
      gradle: [
        '// someone bumped versionCode 99999 in a comment',
        '// old versionName "9.9.9"',
        ...GRADLE_IN_SYNC.split('\n'),
      ].join('\n'),
    });
    expect(problems).toEqual([]);
    // Same guard on the pbxproj side — the fixture's inline comment mentions
    // MARKETING_VERSION = 9.9.9; and the in-sync pass above still passes.
  });

  it('reports a package.json without a version string', () => {
    const problems = problemsFor({ pkg: { version: undefined } });
    expect(problems).toEqual([
      expect.stringContaining('is not MAJOR.MINOR.PATCH'),
    ]);
  });

  it('reports a missing pbxproj as a clean error', () => {
    const root = makeFixture();
    fs.rmSync(path.join(root, 'ios'), { recursive: true });
    const { problems } = checkVersionSync(root);
    expect(problems).toEqual([
      expect.stringContaining('cannot read ios/FenzitApp.xcodeproj'),
    ]);
  });

  it('rejects non-SemVer and leading-zero versions', () => {
    for (const v of ['1.0', '1.0.0.0', '01.0.0', '1.0.0-beta', 'banana']) {
      const problems = problemsFor({ pkg: { version: v } });
      expect(problems).toEqual([
        expect.stringContaining('is not MAJOR.MINOR.PATCH'),
      ]);
    }
  });

  it('flags minor/patch >= 100 (versionCode collision)', () => {
    const problems = problemsFor({
      pkg: { version: '1.0.100' },
      gradle: GRADLE_IN_SYNC, // deliberately still 1.0.0 — drift reported too
      pbxproj: PBXPROJ_IN_SYNC,
    });
    expect(problems).toEqual(
      expect.arrayContaining([expect.stringContaining('>= 100')]),
    );
  });

  it('flags a build number over the stores’ 2100000000 cap', () => {
    const problems = problemsFor({
      pkg: { version: '210001.0.0' },
    });
    expect(problems).toEqual(
      expect.arrayContaining([expect.stringContaining('2100000000')]),
    );
  });

  it('reports unreadable files as clean errors, not crashes', () => {
    const root = makeFixture();
    fs.rmSync(path.join(root, 'android'), { recursive: true });
    const { problems } = checkVersionSync(root);
    expect(problems).toEqual([
      expect.stringContaining('cannot read android/app/build.gradle: ENOENT'),
    ]);
  });

  it('reports malformed package.json as a clean error', () => {
    const root = makeFixture();
    fs.writeFileSync(path.join(root, 'package.json'), '{ not json');
    const { problems } = checkVersionSync(root);
    expect(problems).toEqual([
      expect.stringContaining('package.json is not valid JSON'),
    ]);
  });

  it('checks every flavor line in build.gradle, not just the first', () => {
    const problems = problemsFor({
      gradle: GRADLE_FLAVORS.replace('versionCode 10000', 'versionCode 10001'),
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('android versionCode is 10001');
  });

  it('reports a flavor build.gradle missing versionCode entirely', () => {
    const problems = problemsFor({
      gradle: GRADLE_FLAVORS.replace(/^\s*versionCode \d+\n/gm, ''),
    });
    expect(problems).toEqual([
      expect.stringContaining('no versionCode line found'),
    ]);
  });

  it('accepts trailing comments on version lines', () => {
    const problems = problemsFor({
      gradle: GRADLE_IN_SYNC.replace(
        'versionCode 10000',
        'versionCode 10000 // bumped by CI',
      ),
      pbxproj: PBXPROJ_IN_SYNC.replace(
        'MARKETING_VERSION = 1.0.0;',
        'MARKETING_VERSION = 1.0.0; // release',
      ),
    });
    expect(problems).toEqual([]);
  });
});

describe('syncVersion', () => {
  it('rewrites every location to match package.json', () => {
    const root = makeFixture({ pkg: { version: '2.3.7' } });
    const { changes } = syncVersion(root);
    expect(changes).toHaveLength(2); // gradle + pbxproj
    const { problems, expectedCode } = checkVersionSync(root);
    expect(problems).toEqual([]);
    expect(expectedCode).toBe(20307);
  });

  it('is idempotent — second run reports nothing to rewrite', () => {
    const root = makeFixture({ pkg: { version: '1.2.3' } });
    syncVersion(root);
    const { changes } = syncVersion(root);
    expect(changes).toEqual([]);
  });

  it('refuses to sync an invalid version instead of guessing', () => {
    const root = makeFixture({ pkg: { version: 'not-a-version' } });
    expect(() => syncVersion(root)).toThrow('is not MAJOR.MINOR.PATCH');
    // And it touched nothing.
    expect(checkVersionSync(root).problems.length).toBeGreaterThan(0);
  });

  it('rejects minor/patch >= 100 before touching any file', () => {
    const root = makeFixture({ pkg: { version: '1.0.100' } });
    expect(() => syncVersion(root)).toThrow('>= 100');
    // Native files untouched — still say 1.0.0 / 10000.
    const gradle = fs.readFileSync(
      path.join(root, 'android', 'app', 'build.gradle'),
      'utf8',
    );
    expect(gradle).toContain('versionCode 10000');
  });

  it('rejects a build number over the store cap before touching any file', () => {
    const root = makeFixture({ pkg: { version: '210001.0.0' } });
    expect(() => syncVersion(root)).toThrow('2100000000');
    const gradle = fs.readFileSync(
      path.join(root, 'android', 'app', 'build.gradle'),
      'utf8',
    );
    expect(gradle).toContain('versionCode 10000');
  });

  it('refuses when a version key has been lost entirely — no silent success', () => {
    const root = makeFixture({
      pkg: { version: '1.0.1' },
      gradle: GRADLE_IN_SYNC.replace('versionCode 10000\n', ''),
    });
    expect(() => syncVersion(root)).toThrow('no versionCode line found');
  });

  it('gives a friendly error for a missing native file', () => {
    const root = makeFixture();
    fs.rmSync(path.join(root, 'ios'), { recursive: true });
    expect(() => syncVersion(root)).toThrow(
      'cannot read ios/FenzitApp.xcodeproj/project.pbxproj',
    );
  });

  it('syncs CRLF-terminated files without corrupting line endings', () => {
    const root = makeFixture({
      pkg: { version: '1.0.1' },
      gradle: GRADLE_IN_SYNC.replace(/\n/g, '\r\n'),
      pbxproj: PBXPROJ_IN_SYNC.replace(/\n/g, '\r\n'),
    });
    syncVersion(root);
    expect(checkVersionSync(root).problems).toEqual([]);
    const gradle = fs.readFileSync(
      path.join(root, 'android', 'app', 'build.gradle'),
      'utf8',
    );
    expect(gradle).toContain('versionCode 10001\r\n');
  });
  it('rewrites all four iOS occurrences, not just the first', () => {
    const root = makeFixture({ pkg: { version: '4.5.6' } });
    syncVersion(root);
    const pbxproj = fs.readFileSync(
      path.join(root, 'ios', 'FenzitApp.xcodeproj', 'project.pbxproj'),
      'utf8',
    );
    expect(
      pbxproj.match(/^\s*MARKETING_VERSION = [^;\r\n]+;(?=\r?)$/gm),
    ).toHaveLength(2);
    expect(
      pbxproj.match(/^\s*CURRENT_PROJECT_VERSION = \d+;(?=\r?)$/gm),
    ).toHaveLength(2);
    expect(checkVersionSync(root).problems).toEqual([]);
  });

  it('preserves indentation when rewriting', () => {
    const root = makeFixture({ pkg: { version: '1.2.3' } });
    syncVersion(root);
    const gradle = fs.readFileSync(
      path.join(root, 'android', 'app', 'build.gradle'),
      'utf8',
    );
    expect(gradle).toMatch(/\n {4}versionCode 10203\n/);
  });

  it('syncs every flavor line in build.gradle', () => {
    const root = makeFixture({
      pkg: { version: '1.0.1' },
      gradle: GRADLE_FLAVORS,
    });
    syncVersion(root);
    const gradle = fs.readFileSync(
      path.join(root, 'android', 'app', 'build.gradle'),
      'utf8',
    );
    expect(gradle.match(/^\s*versionCode \d+$/gm)).toEqual([
      '      versionCode 10001',
      '      versionCode 10001',
    ]);
    expect(checkVersionSync(root).problems).toEqual([]);
  });

  it('preserves trailing comments when rewriting', () => {
    const root = makeFixture({
      pkg: { version: '1.0.1' },
      gradle: GRADLE_IN_SYNC.replace(
        'versionCode 10000',
        'versionCode 10000 // bumped by CI',
      ),
      pbxproj: PBXPROJ_IN_SYNC.replace(
        'CURRENT_PROJECT_VERSION = 10000;',
        'CURRENT_PROJECT_VERSION = 10000; // debug',
      ).replace('MARKETING_VERSION = 1.0.0;', 'MARKETING_VERSION = 1.0.0; // rel'),
    });
    syncVersion(root);
    const gradle = fs.readFileSync(
      path.join(root, 'android', 'app', 'build.gradle'),
      'utf8',
    );
    expect(gradle).toContain('versionCode 10001 // bumped by CI');
    const pbxproj = fs.readFileSync(
      path.join(root, 'ios', 'FenzitApp.xcodeproj', 'project.pbxproj'),
      'utf8',
    );
    expect(pbxproj).toContain('CURRENT_PROJECT_VERSION = 10001; // debug');
    expect(pbxproj).toContain('MARKETING_VERSION = 1.0.1; // rel');
    expect(checkVersionSync(root).problems).toEqual([]);
  });
});
