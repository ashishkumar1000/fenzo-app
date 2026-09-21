/**
 * Tests for the global 401 flow in the apiClient response interceptor
 * (story 5.3): a 401 on a request that carried a token fires the registered
 * on-unauthorized handler exactly once even when several requests were in
 * flight, and clears the stored token; a 401 on the OTP/login endpoints
 * themselves (no token attached) fires nothing; the dedup re-arms after the
 * tick, so a genuinely new expiry can trigger the flow again.
 *
 * Also covers the correlation/session observability headers (story 13.2):
 * every request carries a fresh `X-Correlation-ID` and a stable
 * `X-Session-ID` (one per app launch), both v4 UUIDs.
 *
 * The token service is mocked (real one is MMKV-backed); failures are
 * injected through a custom axios adapter, so no network is involved.
 */
jest.mock('../authToken', () => {
  let token: string | null = null;
  return {
    getAuthToken: jest.fn(() => token),
    setAuthToken: jest.fn((t: string) => {
      token = t;
    }),
    clearAuthToken: jest.fn(() => {
      token = null;
    }),
  };
});

import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
import { apiClient, setOnUnauthorized } from './apiClient';
import { clearAuthToken, getAuthToken, setAuthToken } from '../authToken';

/** Adapter that rejects every request with the given status + envelope. */
function failWith(status: number, body: unknown = { error_code: 'UNAUTHORIZED' }) {
  return (config: AxiosRequestConfig) =>
    // Shaped like the AxiosError the real adapter produces — the interceptor
    // (via toApiError) only reads `error.response`, so a plain object is enough.
    Promise.reject({
      isAxiosError: true,
      config,
      response: { status, data: body },
    });
}

beforeEach(async () => {
  setOnUnauthorized(null);
  clearAuthToken();
  apiClient.defaults.adapter = failWith(401);
  // The interceptor's dedup flag (`handlingUnauthorized`) resets on a 0ms
  // timer — a timer queued by a PREVIOUS test in this file. Flushing one
  // tick here guarantees that reset has run before this test's requests,
  // so each test starts with the dedup deterministically re-armed.
  await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
});

afterEach(() => {
  setOnUnauthorized(null);
});

describe('global 401 handling (story 5.3)', () => {
  it('fires the handler once and clears the token when an authenticated request 401s', async () => {
    setAuthToken('real-token');
    const onUnauthorized = jest.fn();
    setOnUnauthorized(onUnauthorized);

    await expect(apiClient.get('/jobs')).rejects.toBeTruthy();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(clearAuthToken).toHaveBeenCalled();
  });

  it('runs the flow once even when several requests 401 at the same time', async () => {
    setAuthToken('real-token');
    const onUnauthorized = jest.fn();
    setOnUnauthorized(onUnauthorized);

    // Both rejections settle "at once" — the first flips the dedup flag, the
    // second must see it and back off.
    const results = await Promise.allSettled([
      apiClient.get('/jobs'),
      apiClient.get('/customers'),
    ]);

    expect(results.every(r => r.status === 'rejected')).toBe(true);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('never fires the handler for a login 401 (no token was attached)', async () => {
    // The login/OTP path makes its request before any token exists.
    const onUnauthorized = jest.fn();
    setOnUnauthorized(onUnauthorized);

    await expect(apiClient.post('/auth/otp/verify')).rejects.toBeTruthy();

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('re-arms after the dedup, so a later expiry triggers the flow again', async () => {
    setAuthToken('real-token');
    const onUnauthorized = jest.fn();
    setOnUnauthorized(onUnauthorized);

    await expect(apiClient.get('/jobs')).rejects.toBeTruthy();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    // The dedup resets on the next tick (setTimeout 0) — wait that tick out
    // before the fresh login, so the flag is deterministically re-armed.
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));

    // A fresh session logs in again, then expires once more — this second
    // 401 must fire the flow again.
    setAuthToken('second-session-token');
    await expect(apiClient.get('/jobs')).rejects.toBeTruthy();
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });
});

describe('correlation + session headers (story 13.2)', () => {
  // Adapter that RESOLVES every request and records the config each one
  // carried, so the tests read the headers exactly as the transport sent
  // them (the real adapter would put them on the wire).
  let seen: AxiosRequestConfig[];

  beforeEach(() => {
    seen = [];
    apiClient.defaults.adapter = config => {
      seen.push(config);
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };
  });

  // The generator is a zero-dependency ladder, but EVERY rung sets the v4
  // bits, so the output always matches the strict shape the backend's
  // 13-1 validator accepts.
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it('stamps every request with v4-shaped correlation and session ids', async () => {
    await apiClient.get('/jobs');

    expect(seen).toHaveLength(1);
    expect(String(seen[0].headers?.['X-Correlation-ID'])).toMatch(UUID_V4);
    expect(String(seen[0].headers?.['X-Session-ID'])).toMatch(UUID_V4);
  });

  it('mints a fresh correlation id per request, not one shared value', async () => {
    await Promise.all([apiClient.get('/jobs'), apiClient.get('/customers'), apiClient.get('/jobs')]);

    expect(seen).toHaveLength(3);
    const correlationIds = seen.map(c => String(c.headers?.['X-Correlation-ID']));
    expect(new Set(correlationIds).size).toBe(3);
    // Three concurrent requests each carrying their own id — the whole point
    // of per-request-config stamping instead of shared axios defaults.
  });

  it('keeps the session id stable across requests within the app sitting', async () => {
    await apiClient.get('/jobs');
    await apiClient.get('/customers');

    const sessionIds = seen.map(c => String(c.headers?.['X-Session-ID']));
    expect(sessionIds[0]).toMatch(UUID_V4);
    expect(sessionIds[0]).toBe(sessionIds[1]);
  });

  it('does NOT re-mint the session id on logout — logout ends the auth session, not the sitting', async () => {
    await apiClient.get('/jobs');
    const sessionIdBefore = String(seen[0].headers?.['X-Session-ID']);
    const correlationIdBefore = String(seen[0].headers?.['X-Correlation-ID']);

    // The forced-logout flow clears the stored token — the observability ids
    // must not reset with it: the app sitting continues across a logout.
    clearAuthToken();
    expect(getAuthToken()).toBeNull();

    await apiClient.get('/customers');
    expect(String(seen[1].headers?.['X-Session-ID'])).toBe(sessionIdBefore);
    // Same-sitting requests still get fresh per-request correlation ids.
    expect(String(seen[1].headers?.['X-Correlation-ID'])).toMatch(UUID_V4);
    expect(String(seen[1].headers?.['X-Correlation-ID'])).not.toBe(correlationIdBefore);
  });
});
