/**
 * Tests for the global 401 flow in the apiClient response interceptor
 * (story 5.3): a 401 on a request that carried a token fires the registered
 * on-unauthorized handler exactly once even when several requests were in
 * flight, and clears the stored token; a 401 on the OTP/login endpoints
 * themselves (no token attached) fires nothing; the dedup re-arms after the
 * tick, so a genuinely new expiry can trigger the flow again.
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
import { clearAuthToken, setAuthToken } from '../authToken';

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
