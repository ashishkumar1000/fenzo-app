/**
 * realtimeToken — the exchange/cache contract executed against the real
 * module (review gap fix, 2026-09-09): fresh-cache short-circuit, margin
 * re-exchange, unparsable expiresAt → null, failure → null, concurrent
 * callers sharing one exchange, and the global 401 reset dropping the
 * cache. Same mocked-I/O style as the rest of the repo's suites — no real
 * network in jest.
 */
import { apiClient } from './api/apiClient';
import { getAuthToken } from './authToken';
import { registerReset } from './resetRegistry';
import { clearRealtimeToken, getRealtimeToken } from './realtimeToken';

jest.mock('./api/apiClient', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('./authToken', () => ({
  getAuthToken: jest.fn(),
  clearAuthToken: jest.fn(),
}));
jest.mock('./resetRegistry', () => ({ registerReset: jest.fn(() => jest.fn()) }));

const apiGetMock = apiClient.get as jest.Mock;
const getAuthTokenMock = getAuthToken as jest.Mock;
const registerResetMock = registerReset as jest.Mock;

// Snapshot the module-level 401-reset callback ONCE at import time (the
// module registered its clearRealtimeToken when it loaded) — afterEach's
// clearAllMocks wipes registerReset's call history, so test-time lookups
// would find nothing.
const runModuleReset = registerResetMock.mock.calls[0]?.[0] as (() => void) | undefined;

/** Fixed "now" — 11:00 UTC; the exchange mints an expiry one hour out. */
const NOW = new Date('2026-09-09T11:00:00Z');
const EXPIRES_AT = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
const GOOD_RESPONSE = { data: { token: 'realtime-jwt', expiresAt: EXPIRES_AT } };

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  getAuthTokenMock.mockReturnValue('login-jwt');
  apiGetMock.mockResolvedValue(GOOD_RESPONSE);
  clearRealtimeToken();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('getRealtimeToken', () => {
  it('returns null without a login token and never exchanges', async () => {
    getAuthTokenMock.mockReturnValue(null);

    await expect(getRealtimeToken()).resolves.toBeNull();
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it('exchanges once and serves repeat calls from the cache', async () => {
    await expect(getRealtimeToken()).resolves.toBe('realtime-jwt');
    await expect(getRealtimeToken()).resolves.toBe('realtime-jwt');

    expect(apiGetMock).toHaveBeenCalledTimes(1);
  });

  it('re-exchanges once the cache enters the 60s refresh margin', async () => {
    await getRealtimeToken();
    expect(apiGetMock).toHaveBeenCalledTimes(1);

    // 30s before expiry — inside REFRESH_MARGIN_MS, so the next call is a
    // fresh exchange even though the cached copy is still technically valid.
    jest.setSystemTime(new Date(NOW.getTime() + 59.5 * 60 * 1000));
    await expect(getRealtimeToken()).resolves.toBe('realtime-jwt');

    expect(apiGetMock).toHaveBeenCalledTimes(2);
  });

  it('resolves null on an unparsable expiresAt and does not cache it', async () => {
    apiGetMock.mockResolvedValue({ data: { token: 'realtime-jwt', expiresAt: 'not-a-date' } });

    await expect(getRealtimeToken()).resolves.toBeNull();

    // No cache poisoning — the next call exchanges again.
    apiGetMock.mockResolvedValue(GOOD_RESPONSE);
    await expect(getRealtimeToken()).resolves.toBe('realtime-jwt');
    expect(apiGetMock).toHaveBeenCalledTimes(2);
  });

  it('resolves null on a failed exchange and does not cache the failure', async () => {
    apiGetMock.mockRejectedValue(new Error('network down'));

    await expect(getRealtimeToken()).resolves.toBeNull();

    apiGetMock.mockResolvedValue(GOOD_RESPONSE);
    await expect(getRealtimeToken()).resolves.toBe('realtime-jwt');
    expect(apiGetMock).toHaveBeenCalledTimes(2);
  });

  it('concurrent callers share a single in-flight exchange', async () => {
    let resolveGet!: (v: typeof GOOD_RESPONSE) => void;
    apiGetMock.mockReturnValue(
      new Promise<typeof GOOD_RESPONSE>(resolve => {
        resolveGet = resolve;
      }),
    );

    const first = getRealtimeToken();
    const second = getRealtimeToken();
    await Promise.resolve();
    expect(apiGetMock).toHaveBeenCalledTimes(1);

    resolveGet(GOOD_RESPONSE);
    await expect(first).resolves.toBe('realtime-jwt');
    await expect(second).resolves.toBe('realtime-jwt');
  });

  it('drops the cache when the global 401 reset runs', async () => {
    await getRealtimeToken();
    expect(apiGetMock).toHaveBeenCalledTimes(1);

    runModuleReset?.();

    await expect(getRealtimeToken()).resolves.toBe('realtime-jwt');
    expect(apiGetMock).toHaveBeenCalledTimes(2);
  });
});