/**
 * Tests for .githooks/pre-commit — the hook is shell, so these exercise it
 * end-to-end: a throwaway git repo in os.tmpdir(), the real scripts copied
 * in, and the hook run directly with `sh .githooks/pre-commit`.
 */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

const GRADLE = [
  'android {',
  '  defaultConfig {',
  '    versionCode 10000',
  '    versionName "1.0.0"',
  '  }',
  '}',
].join('\n');

function pbxBlock(version, code) {
  return [
    '\t\tbuildSettings = {',
    `\t\t\tCURRENT_PROJECT_VERSION = ${code};`,
    `\t\t\tMARKETING_VERSION = ${version};`,
    '\t\t};',
  ].join('\n');
}

const PBXPROJ = [
  '/* Debug */',
  pbxBlock('1.0.0', 10000),
  '/* Release */',
  pbxBlock('1.0.0', 10000),
].join('\n');

// Every fixture root is tracked here so afterEach can clean up.
const fixtureRoots = [];

function writePkg(root, version) {
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', version }),
  );
}

/** Build a committed git repo with the hook + scripts copied in. */
function makeGitRepo({ version = '1.0.0' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-hook-'));
  fixtureRoots.push(root);
  fs.mkdirSync(path.join(root, 'android', 'app'), { recursive: true });
  fs.mkdirSync(path.join(root, 'ios', 'FenzitApp.xcodeproj'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, '.githooks'), { recursive: true });
  writePkg(root, version);
  fs.writeFileSync(path.join(root, 'android', 'app', 'build.gradle'), GRADLE);
  fs.writeFileSync(
    path.join(root, 'ios', 'FenzitApp.xcodeproj', 'project.pbxproj'),
    PBXPROJ,
  );
  for (const f of [
    'verify-version-sync.js',
    'sync-version.js',
    'check-store-downgrade.js',
  ]) {
    fs.copyFileSync(
      path.join(REPO_ROOT, 'scripts', f),
      path.join(root, 'scripts', f),
    );
  }
  fs.copyFileSync(
    path.join(REPO_ROOT, '.githooks', 'pre-commit'),
    path.join(root, '.githooks', 'pre-commit'),
  );
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@test'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: root });
  return root;
}

function runHook(root, env = process.env) {
  return spawnSync('sh', ['.githooks/pre-commit'], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
}

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function readGradle(root) {
  return fs.readFileSync(
    path.join(root, 'android', 'app', 'build.gradle'),
    'utf8',
  );
}

afterEach(() => {
  for (const root of fixtureRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  fixtureRoots.length = 0;
});

describe('pre-commit hook', () => {
  it('passes when everything is already in sync', () => {
    const root = makeGitRepo();
    const r = runHook(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('already in sync at 1.0.0');
  });

  it('auto-syncs and re-stages native files for a staged version bump', () => {
    const root = makeGitRepo();
    writePkg(root, '1.0.1');
    git(root, 'add', 'package.json');
    const r = runHook(root);
    expect(r.status).toBe(0);
    // The staged (index) copies carry the new version, not just the worktree.
    const stagedGradle = git(root, 'show', ':android/app/build.gradle');
    expect(stagedGradle).toContain('versionCode 10001');
    expect(stagedGradle).toContain('versionName "1.0.1"');
    const stagedPbx = git(
      root,
      'show',
      ':ios/FenzitApp.xcodeproj/project.pbxproj',
    );
    expect(stagedPbx).toContain('MARKETING_VERSION = 1.0.1;');
    expect(stagedPbx).toContain('CURRENT_PROJECT_VERSION = 10001;');
    // And everything the hook touched is fully staged — nothing left half-done.
    const lines = git(root, 'status', '--porcelain').trim().split('\n');
    expect(lines).toEqual(
      expect.arrayContaining([
        'M  android/app/build.gradle',
        'M  ios/FenzitApp.xcodeproj/project.pbxproj',
      ]),
    );
    for (const line of lines) {
      expect(line).toMatch(/^M  /);
    }
  });

  it('refuses when package.json has unstaged changes', () => {
    const root = makeGitRepo();
    // Worktree bumped, nothing staged — the commit would take the old
    // package.json while sync works on the new one.
    writePkg(root, '1.0.1');
    const r = runHook(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('package.json has unstaged changes');
    // Nothing was rewritten.
    expect(readGradle(root)).toContain('versionCode 10000');
  });

  it('does nothing during a rebase', () => {
    const root = makeGitRepo();
    fs.mkdirSync(path.join(root, '.git', 'rebase-merge'));
    // Out-of-sync natives that sync would otherwise rewrite.
    fs.writeFileSync(
      path.join(root, 'android', 'app', 'build.gradle'),
      GRADLE.replace('versionCode 10000', 'versionCode 999'),
    );
    const r = runHook(root);
    expect(r.status).toBe(0);
    expect(readGradle(root)).toContain('versionCode 999');
  });

  it('does nothing during a cherry-pick', () => {
    const root = makeGitRepo();
    fs.writeFileSync(path.join(root, '.git', 'CHERRY_PICK_HEAD'), 'deadbeef');
    fs.writeFileSync(
      path.join(root, 'android', 'app', 'build.gradle'),
      GRADLE.replace('versionCode 10000', 'versionCode 999'),
    );
    const r = runHook(root);
    expect(r.status).toBe(0);
    expect(readGradle(root)).toContain('versionCode 999');
  });

  it('fails with a clear message when bun is missing', () => {
    const root = makeGitRepo();
    const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'no-bun-home-'));
    fixtureRoots.push(emptyHome);
    const r = runHook(root, {
      ...process.env,
      PATH: '/usr/bin:/bin',
      HOME: emptyHome,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('bun not found');
  });

  it('runs the store-downgrade guard and fails on a reused build', () => {
    const root = makeGitRepo();
    git(root, 'tag', 'store-v1.0.0');
    writePkg(root, '0.9.9'); // build 9099 < the uploaded 10000
    git(root, 'add', 'package.json');
    const r = runHook(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('never reuse a store build number');
  });
});
