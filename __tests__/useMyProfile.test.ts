/**
 * The `useMyProfile` shared store — story 1.4 (Home stats refresh).
 *
 * Tested through its exported module functions, read back via a probe
 * component mounted with react-test-renderer (same approach as useJobs.test).
 * `../src/services` is mocked so no network/MMKV is touched.
 *
 * Mounting the probe auto-loads (the hook's first-mount effect fires whenever
 * the store holds no profile and no error), so each test's first `getMe` call
 * IS the mount load. `clear()` (exposed by the hook) is the reset lever between
 * tests — the store is module-level, so it would otherwise leak across tests.
 *
 * The throttle is time-based on `lastLoadedAt` (set only on SUCCESS), so every
 * throttle/force test runs under jest fake timers pinned to a fixed epoch —
 * fully deterministic, no dependence on how long the real machine takes.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../src/services', () => ({
  usersApi: { getMe: jest.fn() },
}));

import { loadMyProfile, useMyProfile } from '../src/features/profile/useMyProfile';
import { usersApi } from '../src/services';
import type { ApiError, MyProfile } from '../src/services';

const getMe = usersApi.getMe as jest.Mock;

/** A fixed epoch the fake clock starts at — anything the code stamps with
 *  `Date.now()` under these timers is exactly this value. */
const T0 = 1_000_000_000;
const TTL = 15_000;

function makeProfile(overrides: Partial<MyProfile> = {}): MyProfile {
  return {
    id: 'u-1',
    name: 'Kumar Selvan',
    countryCode: '+91',
    phoneNumber: '9000000000',
    status: 'active',
    role: 'owner',
    tenant: {
      id: 't-1',
      companyName: 'Fenzit Services',
      gstin: null,
      address: null,
      stateCode: 'TN',
      serviceCategories: [],
      upiVpa: null,
    },
    technicians: [],
    technicianCount: 2,
    customers: { data: [], nextCursor: null, hasMore: false },
    jobs: { data: [], nextCursor: null, hasMore: false },
    jobCounts: { today: 1, upcoming: 2, overdue: 0, completed: 3, cancelled: 1 },
    ...overrides,
  };
}

const apiError = (message: string): ApiError => ({
  status: 0,
  code: 'NETWORK',
  message,
});

let probe: ReturnType<typeof useMyProfile> | null = null;
let instance: ReactTestRenderer | null = null;

function Probe(): null {
  probe = useMyProfile();
  return null;
}

/** Mounts the probe; the auto-load effect fires inside act. */
async function mountProbe(): Promise<void> {
  await act(async () => {
    instance = create(React.createElement(Probe));
  });
}

/** Starts the fake clock at `at` (epoch ms), then mounts. */
async function mountProbeAt(at: number): Promise<void> {
  jest.useFakeTimers({ now: at });
  await mountProbe();
}

async function run(fn: () => unknown): Promise<void> {
  await act(async () => {
    await fn();
  });
}

/**
 * Resets the module-level store via the hook's own `clear()`, then unmounts.
 * `clear()` restores the pre-login snapshot (no profile, loader showing), so
 * the next test's mount behaves like a first-ever load.
 */
async function resetStore(): Promise<void> {
  if (!instance) return;
  await act(async () => {
    probe?.clear();
    instance?.unmount();
  });
  instance = null;
  probe = null;
}

beforeEach(async () => {
  await resetStore();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

it('loads the profile on first mount and clears the loader (AC 4)', async () => {
  let resolve1!: (p: MyProfile) => void;
  getMe.mockImplementationOnce(
    () => new Promise<MyProfile>(res => (resolve1 = res)),
  );
  await act(async () => {
    instance = create(React.createElement(Probe));
  });

  // First-ever load in flight: the loading state shows, nothing else.
  expect(probe?.profile).toBeNull();
  expect(probe?.isLoading).toBe(true);
  expect(probe?.error).toBeNull();
  expect(getMe).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolve1(makeProfile());
  });
  expect(probe?.profile?.name).toBe('Kumar Selvan');
  expect(probe?.isLoading).toBe(false);
  expect(probe?.error).toBeNull();
});

it('skips an unforced load within 15s of the last success, reloads after (AC 1)', async () => {
  getMe.mockResolvedValueOnce(makeProfile());
  await mountProbeAt(T0);
  expect(getMe).toHaveBeenCalledTimes(1);

  // Rapid tab switch 5s later: throttled away, no second request.
  jest.setSystemTime(T0 + 5_000);
  await run(() => loadMyProfile());
  expect(getMe).toHaveBeenCalledTimes(1);

  // 20s later, past the TTL: the focus refresh runs again.
  jest.setSystemTime(T0 + 20_000);
  await run(() => loadMyProfile());
  expect(getMe).toHaveBeenCalledTimes(2);
});

it('force bypasses the throttle (AC 2 — mutations and pull-to-refresh)', async () => {
  getMe
    .mockResolvedValueOnce(makeProfile())
    .mockResolvedValueOnce(makeProfile({ name: 'Second Owner' }));
  await mountProbeAt(T0);
  expect(probe?.profile?.name).toBe('Kumar Selvan');

  jest.setSystemTime(T0 + 1_000); // well inside the throttle window
  await run(() => loadMyProfile({ force: true }));
  expect(getMe).toHaveBeenCalledTimes(2);
  expect(probe?.profile?.name).toBe('Second Owner');
  expect(probe?.isLoading).toBe(false);
});

it("the hook's refresh forces past the throttle (pull-to-refresh)", async () => {
  getMe.mockResolvedValueOnce(makeProfile());
  await mountProbeAt(T0);
  expect(typeof probe?.refresh).toBe('function');

  // 1s after the success — inside the window, so an unforced call would be
  // skipped. `refresh` (pull-to-refresh) must still fetch.
  jest.setSystemTime(T0 + 1_000);
  await run(() => probe?.refresh());
  expect(getMe).toHaveBeenCalledTimes(2);
  expect(probe?.isLoading).toBe(false);
});

it('a successful load stamps lastLoadedAt at the SUCCESS instant (Task 5)', async () => {
  getMe.mockImplementationOnce(
    () =>
      new Promise<MyProfile>(res => {
        // The clock moves while the request is in flight; the stamp must be
        // the response instant, not the request-start instant.
        jest.setSystemTime(T0 + 5_000);
        res(makeProfile());
      }),
  );
  await mountProbeAt(T0);
  expect(probe?.profile).not.toBeNull();

  // If the stamp were the request start (T0), T0 + 5s + TTL − 1 would still
  // count as fresh from the response — checking both boundaries pins which
  // instant was stamped.
  jest.setSystemTime(T0 + 5_000 + TTL - 1);
  await run(() => loadMyProfile());
  expect(getMe).toHaveBeenCalledTimes(1); // still fresh → skipped

  jest.setSystemTime(T0 + 5_000 + TTL);
  await run(() => loadMyProfile());
  expect(getMe).toHaveBeenCalledTimes(2); // window measured from the response
});

it('a forced call issues its own request instead of joining a stale in-flight one', async () => {
  // Load #1 starts with the profile absent — its response can only be
  // pre-mutation data.
  let resolve1!: (p: MyProfile) => void;
  getMe.mockImplementationOnce(
    () => new Promise<MyProfile>(res => (resolve1 = res)),
  );
  await act(async () => {
    instance = create(React.createElement(Probe));
  });

  // The forced (post-mutation) call starts a SECOND request rather than
  // joining load 1, which would resolve with pre-mutation counts.
  let resolve2!: (p: MyProfile) => void;
  getMe.mockImplementationOnce(
    () => new Promise<MyProfile>(res => (resolve2 = res)),
  );
  let forced!: Promise<void>;
  await act(async () => {
    forced = loadMyProfile({ force: true });
  });
  expect(getMe).toHaveBeenCalledTimes(2);

  // An unforced caller in the same frame still joins the OLDER request.
  await act(async () => {
    loadMyProfile();
  });
  expect(getMe).toHaveBeenCalledTimes(2);

  await act(async () => {
    resolve1(makeProfile({ name: 'Stale Owner' }));
  });
  await act(async () => {
    resolve2(makeProfile({ name: 'Fresh Owner' }));
    await forced;
  });
  // The forced response wins: the tiles show post-mutation data.
  expect(probe?.profile?.name).toBe('Fresh Owner');

  // Both settled — the freed slot must not let a third request through
  // while the forced one's data is fresh.
  await run(() => loadMyProfile());
  expect(getMe).toHaveBeenCalledTimes(2);
});

it('a clock moved backwards reads as stale, not fresh', async () => {
  getMe.mockResolvedValueOnce(makeProfile());
  await mountProbeAt(T0);
  expect(getMe).toHaveBeenCalledTimes(1);

  // NTP correction / manual change puts `now` before the last success —
  // elapsed goes negative, which must NOT suppress the refresh.
  jest.setSystemTime(T0 - 10_000);
  await run(() => loadMyProfile());
  expect(getMe).toHaveBeenCalledTimes(2);
});

it('a failed refresh retains the profile and sets error, without blanking (AC 3)', async () => {
  getMe
    .mockResolvedValueOnce(makeProfile())
    .mockRejectedValueOnce(apiError('Network down'));
  await mountProbeAt(T0);
  expect(probe?.error).toBeNull();

  await run(() => loadMyProfile({ force: true }));
  expect(probe?.profile).toEqual(makeProfile()); // stale data stays rendered
  expect(probe?.error).toBe('Network down');
  expect(probe?.isLoading).toBe(false);
});

it('a failed refresh does not refresh the throttle window (lastLoadedAt = success only)', async () => {
  getMe.mockResolvedValueOnce(makeProfile());
  await mountProbeAt(T0); // success stamps lastLoadedAt = T0

  jest.setSystemTime(T0 + 10_000);
  getMe.mockRejectedValueOnce(apiError('Network down'));
  await run(() => loadMyProfile({ force: true }));
  expect(probe?.error).toBe('Network down');

  // If the failure had stamped lastLoadedAt, T0 + 24s − 10s would still sit
  // inside the 15s window and this unforced retry would be wrongly swallowed.
  jest.setSystemTime(T0 + 24_000);
  await run(() => loadMyProfile());
  // 1 = mount load, 2 = failed forced refresh, 3 = this retry.
  expect(getMe).toHaveBeenCalledTimes(3);
});

it('a background refresh does not flip isLoading when a profile exists (AC 5)', async () => {
  getMe.mockResolvedValueOnce(makeProfile());
  await mountProbeAt(T0);
  expect(probe?.isLoading).toBe(false);

  // Hold the refresh in flight; the tiles keep rendering with no loader.
  let resolve2!: (p: MyProfile) => void;
  getMe.mockImplementationOnce(
    () => new Promise<MyProfile>(res => (resolve2 = res)),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = loadMyProfile({ force: true });
  });
  expect(probe?.isLoading).toBe(false);
  expect(probe?.profile).toEqual(makeProfile()); // not blanked mid-flight

  await act(async () => {
    resolve2(makeProfile({ name: 'Second Owner' }));
    await pending;
  });
  expect(probe?.profile?.name).toBe('Second Owner');
  expect(probe?.isLoading).toBe(false);
  expect(probe?.error).toBeNull();
});