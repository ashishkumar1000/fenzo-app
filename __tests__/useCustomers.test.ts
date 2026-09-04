/**
 * The `useCustomers` shared store — story 2.2 (single customer data path).
 *
 * Same approach as useMyProfile.test.ts: module functions driven directly, read
 * back via a probe component, `../src/services` mocked. The throttle tests run
 * under fake timers pinned to a fixed epoch (time-based on `lastLoadedAt`).
 * `clear()` (exposed by the hook) resets the module-level store between tests.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../src/services', () => ({
  customerService: { listAll: jest.fn(), create: jest.fn() },
}));

import {
  loadCustomers,
  upsertCustomer,
  useCustomers,
} from '../src/features/customers/useCustomers';
import { customerService } from '../src/services';
import type { ApiCustomer } from '../src/services';

const listAll = customerService.listAll as jest.Mock;

/** A fixed epoch the fake clock starts at. */
const T0 = 1_000_000_000;
const TTL = 15_000;

const make = (overrides: Partial<ApiCustomer> = {}): ApiCustomer => ({
  id: 'c-1',
  name: 'Ravi Kumar',
  countryCode: '+91',
  phoneNumber: '9000000002',
  address: null,
  city: null,
  jobCount: 0,
  lastJobDate: null,
  ...overrides,
});

let probe: ReturnType<typeof useCustomers> | null = null;
let instance: ReactTestRenderer | null = null;

function Probe(): null {
  probe = useCustomers();
  return null;
}

async function mountProbeAt(at: number): Promise<void> {
  jest.useFakeTimers({ now: at });
  await act(async () => {
    instance = create(React.createElement(Probe));
  });
}

async function run(fn: () => unknown): Promise<void> {
  await act(async () => {
    await fn();
  });
}

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
  // Default beyond the per-test `mockResolvedValueOnce` queue: later calls in
  // a test (focus refresh, retry) resolve with a valid row instead of the
  // bare mock's `undefined`, which would corrupt the store's `customers`.
  listAll.mockResolvedValue([make()]);
});

afterEach(() => {
  jest.useRealTimers();
});

it('loads on first mount, one request for two subscribers', async () => {
  let resolve1!: (p: ApiCustomer[]) => void;
  listAll.mockImplementationOnce(
    () => new Promise<ApiCustomer[]>(res => (resolve1 = res)),
  );
  await act(async () => {
    instance = create(React.createElement(Probe));
  });
  expect(probe?.isLoading).toBe(true);
  expect(listAll).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolve1([make()]);
  });
  expect(probe?.customers).toEqual([make()]);
  expect(probe?.isLoading).toBe(false);
  expect(probe?.hasLoaded).toBe(true);
});

it('skips an unforced load within 15s of the last success, reloads after', async () => {
  listAll.mockResolvedValueOnce([make()]);
  await mountProbeAt(T0);
  expect(listAll).toHaveBeenCalledTimes(1);

  // Rapid tab switch 5s later: throttled away.
  jest.setSystemTime(T0 + 5_000);
  await run(() => loadCustomers());
  expect(listAll).toHaveBeenCalledTimes(1);

  // Past the TTL: the focus refresh runs again.
  jest.setSystemTime(T0 + TTL);
  await run(() => loadCustomers());
  expect(listAll).toHaveBeenCalledTimes(2);
});

it('force bypasses the throttle and re-stamps lastLoadedAt', async () => {
  listAll
    .mockResolvedValueOnce([make()])
    .mockResolvedValueOnce([make({ name: 'Fresh Row' })]);
  await mountProbeAt(T0);

  jest.setSystemTime(T0 + 1_000); // inside the window
  await run(() => loadCustomers({ force: true }));
  expect(listAll).toHaveBeenCalledTimes(2);
  expect(probe?.customers[0].name).toBe('Fresh Row');

  // The forced success re-stamped the window: still fresh 10s later.
  jest.setSystemTime(T0 + 11_000);
  await run(() => loadCustomers());
  expect(listAll).toHaveBeenCalledTimes(2);
});

it("the hook's refresh forces past the throttle (pull-to-refresh)", async () => {
  listAll.mockResolvedValueOnce([make()]);
  await mountProbeAt(T0);

  jest.setSystemTime(T0 + 1_000);
  await run(() => probe?.refresh());
  expect(listAll).toHaveBeenCalledTimes(2);
});

it('a failed refresh retains the rows and sets error, without blanking', async () => {
  listAll
    .mockResolvedValueOnce([make()])
    .mockRejectedValueOnce(new TypeError('Network request failed'));
  await mountProbeAt(T0);
  expect(probe?.error).toBeNull();

  await run(() => loadCustomers({ force: true }));
  expect(probe?.customers).toEqual([make()]); // stale rows stay rendered
  expect(probe?.error).toBe('Network request failed');
  expect(probe?.isLoading).toBe(false);

  // A rejection with no message at all gets the generic copy.
  listAll.mockRejectedValueOnce(undefined);
  await run(() => loadCustomers({ force: true }));
  expect(probe?.error).toBe('Something went wrong');
});

it('a failed refresh does not refresh the throttle window', async () => {
  listAll
    .mockResolvedValueOnce([make()])
    .mockRejectedValueOnce(new Error('down'));
  await mountProbeAt(T0); // success stamps lastLoadedAt = T0

  jest.setSystemTime(T0 + 10_000);
  await run(() => loadCustomers({ force: true })); // fails
  expect(probe?.error).toBe('down');

  // If the failure had stamped lastLoadedAt, this unforced retry at T0 + 24s
  // (24s − 10s = 14s inside the 15s window) would be wrongly swallowed.
  jest.setSystemTime(T0 + 24_000);
  await run(() => loadCustomers());
  // 1 = mount load, 2 = failed forced refresh, 3 = this retry.
  expect(listAll).toHaveBeenCalledTimes(3);
});

it('a forced call issues its own request; a late stale response does not overwrite it', async () => {
  // Load #1 starts pre-mutation; it settles LAST.
  let resolve1!: (p: ApiCustomer[]) => void;
  listAll.mockImplementationOnce(
    () => new Promise<ApiCustomer[]>(res => (resolve1 = res)),
  );
  await act(async () => {
    instance = create(React.createElement(Probe));
  });

  // The forced call starts a SECOND request instead of joining load #1.
  let resolve2!: (p: ApiCustomer[]) => void;
  listAll.mockImplementationOnce(
    () => new Promise<ApiCustomer[]>(res => (resolve2 = res)),
  );
  let forced!: Promise<void>;
  await act(async () => {
    forced = loadCustomers({ force: true });
  });
  expect(listAll).toHaveBeenCalledTimes(2);

  // An unforced caller in the same frame still joins the OLDER request.
  await act(async () => {
    loadCustomers();
  });
  expect(listAll).toHaveBeenCalledTimes(2);

  await act(async () => {
    resolve2([make({ name: 'Fresh Row' })]);
    await forced;
  });
  expect(probe?.customers[0].name).toBe('Fresh Row');

  // Load #1 settling late must not overwrite the newer state.
  await act(async () => {
    resolve1([make({ name: 'Stale Row' })]);
  });
  expect(probe?.customers[0].name).toBe('Fresh Row');
});

it('upsertCustomer puts the created row on top without a round trip', async () => {
  listAll.mockResolvedValueOnce([make({ id: 'c-1' })]);
  await mountProbeAt(T0);

  await act(async () => {
    upsertCustomer(make({ id: 'c-9', name: 'New Row' }));
  });
  expect(probe?.customers.map(c => c.id)).toEqual(['c-9', 'c-1']);
  expect(listAll).toHaveBeenCalledTimes(1); // no extra fetch
});