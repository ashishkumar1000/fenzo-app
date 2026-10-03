import {
  REMOTE_CONFIG_DEFAULTS,
  compareVersions,
  getRemoteConfig,
  onRemoteConfigChange,
  refreshRemoteConfig,
  resetRemoteConfigForTests,
} from './remoteConfig';

const mockBacking = new Map<string, string>();

jest.mock('./storage', () => ({
  storage: {
    getString: (key: string) => mockBacking.get(key),
    set: (key: string, value: string) => {
      mockBacking.set(key, value);
    },
  },
}));

const fetchMock = jest.fn();
const PERSISTED_KEY = 'remoteConfig.v1';

beforeEach(() => {
  mockBacking.clear();
  fetchMock.mockReset();
  (global as Record<string, unknown>).fetch = fetchMock;
  resetRemoteConfigForTests();
});

const serveConfig = (config: unknown, ok = true) => {
  fetchMock.mockResolvedValue({ ok, json: async () => ({ config }) });
};

describe('remoteConfig merge semantics', () => {
  it('boots on the shipped defaults', () => {
    expect(getRemoteConfig()).toEqual(REMOTE_CONFIG_DEFAULTS);
  });

  it('overlays the persisted last-known-good values at load', () => {
    mockBacking.set(
      PERSISTED_KEY,
      JSON.stringify({ api_timeout_ms: 45000, maintenance_banner: 'stale' }),
    );
    resetRemoteConfigForTests();

    expect(getRemoteConfig().api_timeout_ms).toBe(45000);
    expect(getRemoteConfig().maintenance_banner).toBe('stale');
    // Untouched keys keep their shipped defaults (CAP-2: partial state, full
    // behavior).
    expect(getRemoteConfig().min_supported_version).toBe(
      REMOTE_CONFIG_DEFAULTS.min_supported_version,
    );
  });

  it('applies fetched server values and persists them', async () => {
    serveConfig({
      min_supported_version: '2.0.0',
      api_timeout_ms: 45000,
      maintenance_banner: 'hello',
      brand_new_unknown_key: { nested: true },
    });

    await expect(refreshRemoteConfig(true)).resolves.toBe(true);

    expect(getRemoteConfig().min_supported_version).toBe('2.0.0');
    expect(getRemoteConfig().api_timeout_ms).toBe(45000);
    expect(getRemoteConfig().maintenance_banner).toBe('hello');
    // Unknown keys are ignored, not stored — forward compatibility.
    expect(
      Object.keys(JSON.parse(mockBacking.get(PERSISTED_KEY) ?? '{}')),
    ).not.toContain('brand_new_unknown_key');
  });

  it('ignores keys whose type does not match the contract', async () => {
    serveConfig({ api_timeout_ms: 'fast', min_supported_version: 5 });

    await expect(refreshRemoteConfig(true)).resolves.toBe(false);
    expect(getRemoteConfig()).toEqual(REMOTE_CONFIG_DEFAULTS);
  });

  it('ignores a malformed body shape', async () => {
    serveConfig('not-an-object');

    await expect(refreshRemoteConfig(true)).resolves.toBe(false);
    expect(getRemoteConfig()).toEqual(REMOTE_CONFIG_DEFAULTS);
  });
});

describe('remoteConfig failure handling (fail-open)', () => {
  it('keeps current values when the fetch throws', async () => {
    serveConfig({ maintenance_banner: 'before' });
    await refreshRemoteConfig(true);

    fetchMock.mockRejectedValue(new Error('airplane mode'));
    await expect(refreshRemoteConfig(true)).resolves.toBe(false);

    expect(getRemoteConfig().maintenance_banner).toBe('before');
  });

  it('keeps current values on a non-OK response', async () => {
    serveConfig({ maintenance_banner: 'before' });
    await refreshRemoteConfig(true);

    serveConfig({ maintenance_banner: 'after' }, false);
    await expect(refreshRemoteConfig(true)).resolves.toBe(false);

    expect(getRemoteConfig().maintenance_banner).toBe('before');
  });
});

describe('remoteConfig refresh throttle', () => {
  it('skips a foreground refetch inside the interval; force fetches', async () => {
    serveConfig({ maintenance_banner: 'x' });

    await expect(refreshRemoteConfig()).resolves.toBe(true);
    await expect(refreshRemoteConfig()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(refreshRemoteConfig(true)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('remoteConfig change listeners', () => {
  it('notifies subscribers on an applied change and stops after unsubscribe', async () => {
    const seen: string[] = [];
    const unsubscribe = onRemoteConfigChange(values => {
      seen.push(values.maintenance_banner);
    });

    serveConfig({ maintenance_banner: 'v1' });
    await refreshRemoteConfig(true);
    unsubscribe();

    serveConfig({ maintenance_banner: 'v2' });
    await refreshRemoteConfig(true);

    expect(seen).toEqual(['v1']);
  });
});

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0', '1.0.0', 0],
    ['2.0.0', '1.9.9', 1],
    ['1.10.0', '1.9.0', 1],
    ['1.0.1', '1.0.0', 1],
    ['0.9.0', '1.0.0', -1],
    ['1.0.0', '1.0.1', -1],
  ])('%s vs %s → %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});
