/**
 * Tests for scripts/check-store-downgrade.js — the guard that stops a
 * commit from regressing below a build number already uploaded to the
 * stores (recorded as store-v* git tags).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkStoreDowngrade } = require('../scripts/check-store-downgrade');

const fixtureRoots = [];

function makeRepo({ version, tags = [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-downgrade-'));
  fixtureRoots.push(root);
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', version }),
  );
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@test'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: root });
  for (const tag of tags) {
    execFileSync('git', ['tag', tag], { cwd: root });
  }
  return root;
}

afterEach(() => {
  for (const root of fixtureRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  fixtureRoots.length = 0;
});

describe('checkStoreDowngrade', () => {
  it('passes with no store-v* tags yet', () => {
    const r = checkStoreDowngrade(makeRepo({ version: '1.0.0' }));
    expect(r.ok).toBe(true);
    expect(r.maxStoreBuild).toBeNull();
  });

  it('passes above the highest uploaded build', () => {
    const r = checkStoreDowngrade(
      makeRepo({ version: '1.0.1', tags: ['store-v1.0.0'] }),
    );
    expect(r.ok).toBe(true);
  });

  it('refuses the exact build number already uploaded', () => {
    const r = checkStoreDowngrade(
      makeRepo({ version: '1.0.0', tags: ['store-v1.0.0'] }),
    );
    expect(r.ok).toBe(false);
    expect(r.message).toContain('already been uploaded');
    expect(r.message).toContain('never reuse a store build number');
  });

  it('refuses a version below the highest uploaded build', () => {
    const r = checkStoreDowngrade(
      makeRepo({ version: '0.9.9', tags: ['store-v1.0.0'] }),
    );
    expect(r.ok).toBe(false);
  });

  it('picks the highest among several uploads', () => {
    const ok = checkStoreDowngrade(
      makeRepo({ version: '1.0.2', tags: ['store-v1.0.0', 'store-v1.0.1'] }),
    );
    expect(ok.ok).toBe(true);
    const low = checkStoreDowngrade(
      makeRepo({ version: '1.0.0', tags: ['store-v1.0.0', 'store-v1.0.1'] }),
    );
    expect(low.ok).toBe(false);
  });

  it('ignores non-store tags and malformed store tags', () => {
    const r = checkStoreDowngrade(
      makeRepo({ version: '1.0.0', tags: ['v1.0.0', 'store-v1.0'] }),
    );
    expect(r.ok).toBe(true);
    expect(r.maxStoreBuild).toBeNull();
  });

  it('reports an invalid package.json version', () => {
    const r = checkStoreDowngrade(makeRepo({ version: 'nope' }));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('is not MAJOR.MINOR.PATCH');
  });
});
