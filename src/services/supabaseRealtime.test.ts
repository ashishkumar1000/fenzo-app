/**
 * supabaseRealtime — the private-channel contract executed against the real
 * module (review gap fix, 2026-09-09): the exact topic format Story 3.1's
 * RLS policy parses, the `private: true` channel config, the client options
 * (supabase auth bypassed, exchanged-token `accessToken` callback that maps
 * a null exchange to `''` — never the login JWT), and the removeChannel
 * teardown. The supabase-js constructor is stubbed; the polyfill
 * side-effects are no-ops under node (both globals already exist).
 */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config';
import { getRealtimeToken } from './realtimeToken';
import {
  getOwnerChannel,
  ownerNotificationsTopic,
  teardownOwnerChannel,
} from './supabaseRealtime';

jest.mock('@supabase/supabase-js', () => {
  const client = {
    channel: jest.fn(() => ({ on: jest.fn(), subscribe: jest.fn() })),
    removeChannel: jest.fn(() => Promise.resolve()),
  };
  return { createClient: jest.fn(() => client), __client: client };
});
jest.mock('./realtimeToken', () => ({ getRealtimeToken: jest.fn() }));

const { __client: clientStub } = jest.requireMock('@supabase/supabase-js') as {
  __client: { channel: jest.Mock; removeChannel: jest.Mock };
};
const createClientMock = createClient as jest.Mock;
const getRealtimeTokenMock = getRealtimeToken as jest.Mock;

// Snapshot the singleton's construction ONCE at import time — the
// constructor ran when the module loaded, and afterEach's clearAllMocks
// wipes call history between tests.
const [clientUrl, clientKey, clientOptions] = (createClientMock.mock.calls[0] ??
  []) as unknown as [string, string, { auth: unknown; accessToken: () => Promise<string> }];

afterEach(() => jest.clearAllMocks());

describe('client construction', () => {
  it('builds the singleton from the config keys with supabase auth bypassed', () => {
    expect(clientUrl).toBe(SUPABASE_URL);
    expect(clientKey).toBe(SUPABASE_PUBLISHABLE_KEY);
    expect(clientOptions.auth).toEqual({ persistSession: false, autoRefreshToken: false });
    expect(typeof clientOptions.accessToken).toBe('function');
  });

  it('the accessToken callback returns the EXCHANGED token, never the login JWT', async () => {
    const { accessToken } = clientOptions;

    getRealtimeTokenMock.mockResolvedValue('exchanged-realtime-jwt');
    await expect(accessToken()).resolves.toBe('exchanged-realtime-jwt');
    expect(getRealtimeTokenMock).toHaveBeenCalled();

    // A null exchange (logged out / failed fetch) maps to '' — an empty
    // join credential that fails into the log-only subscribe path, never a
    // fallback to the login JWT.
    getRealtimeTokenMock.mockResolvedValue(null);
    await expect(accessToken()).resolves.toBe('');
  });
});

describe('topic + channel factory', () => {
  it('derives the exact private topic Story 3.1 broadcasts on', () => {
    expect(ownerNotificationsTopic('abc-123')).toBe('user:abc-123:notifications');
  });

  it('creates the channel as private — that is what triggers server-side RLS', () => {
    const channel = getOwnerChannel('abc-123');

    expect(clientStub.channel).toHaveBeenCalledWith('user:abc-123:notifications', {
      config: { private: true },
    });
    expect(channel).toBeDefined();
  });
});

describe('teardownOwnerChannel', () => {
  it('removes the channel from the client', () => {
    const channel = { on: jest.fn(), subscribe: jest.fn() };
    teardownOwnerChannel(channel as never);

    expect(clientStub.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('swallows a removeChannel rejection (silent-degradation contract)', async () => {
    clientStub.removeChannel.mockRejectedValueOnce(new Error('socket already closed'));
    const channel = { on: jest.fn(), subscribe: jest.fn() };

    expect(() => teardownOwnerChannel(channel as never)).not.toThrow();
    // Let the rejected promise's .catch run — no unhandled rejection.
    await Promise.resolve();
    await Promise.resolve();
  });
});