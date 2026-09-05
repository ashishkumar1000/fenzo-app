/**
 * Tests for the useAuth session-expiry lifecycle (story 5.3): `expireSession`
 * clears the session AND raises the in-memory expiry flag the login banner
 * reads; `complete` (a fresh login) clears the flag; `clearSessionExpired`
 * is the dismiss path and is a no-op when nothing expired. The flag is
 * in-memory only — nothing here touches persistence beyond the session key
 * itself.
 *
 * `storage` runs on the global manual MMKV mock (`__mocks__/
 * react-native-mmkv.ts`, Map-backed) — no jest.mock needed here. That mock
 * persists across tests in this file, so `beforeEach` resets the store to a
 * clean slate (no session, no expiry flag) to keep the tests order-free.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  useAuth,
  useSessionExpired,
  expireSession,
  clearSessionExpired,
} from './useAuth';

// One probe reading both halves of the store — the same shapes App.tsx's
// gate and PhoneScreen's banner consume.
let probe: ReturnType<typeof useAuth> & { expired: boolean };
function Probe() {
  const auth = useAuth();
  probe = { ...auth, expired: useSessionExpired() };
  return null;
}

beforeEach(() => {
  // Reset the module-level store, whatever the previous test left behind:
  // `expireSession` nulls the session (and drops the persisted key), and
  // `clearSessionExpired` lowers the flag — together, a clean first render.
  act(() => {
    expireSession();
    clearSessionExpired();
  });
  act(() => {
    create(<Probe />);
  });
});

describe('session expiry (story 5.3)', () => {
  it('expireSession clears the gate and raises the expiry flag', () => {
    act(() => {
      probe.complete({ role: 'owner', tenantId: 't1' });
    });
    expect(probe.status).toBe('done');
    expect(probe.expired).toBe(false);

    act(() => {
      expireSession();
    });

    expect(probe.status).toBe('pending');
    expect(probe.session).toBeNull();
    expect(probe.expired).toBe(true);
  });

  it('a fresh login clears the expiry flag', () => {
    act(() => {
      expireSession();
    });
    expect(probe.expired).toBe(true);

    act(() => {
      probe.complete({ role: 'technician', tenantId: 't2' });
    });

    expect(probe.status).toBe('done');
    expect(probe.expired).toBe(false);
  });

  it('clearSessionExpired dismisses the flag without signing anyone in', () => {
    act(() => {
      expireSession();
    });
    expect(probe.expired).toBe(true);

    act(() => {
      clearSessionExpired();
    });

    expect(probe.expired).toBe(false);
    expect(probe.status).toBe('pending'); // still at the login gate
  });

  it('clearSessionExpired is a no-op when nothing expired', () => {
    expect(probe.expired).toBe(false);

    act(() => {
      clearSessionExpired();
    });

    expect(probe.expired).toBe(false);
  });

  it('expireSession is idempotent — a second call does not lose the flag', () => {
    act(() => {
      expireSession();
      expireSession();
    });
    expect(probe.expired).toBe(true);
    expect(probe.status).toBe('pending');
  });
});