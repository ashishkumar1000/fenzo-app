/**
 * The `useReports` shared store — stories 12-6 + 12-7 (single report data
 * path).
 *
 * Same approach as useCustomers.test.ts: module functions driven directly,
 * read back via a probe component, `../src/services` mocked at the barrel
 * (the `resetRegistry` leaf stays real — the registry join is covered by
 * reset-registry-stores.test.tsx). The throttle and polling tests run under
 * fake timers pinned to a fixed epoch. `clear()` (exposed by the hook)
 * resets the module-level store between tests.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../src/services', () => ({
  reportService: {
    listReports: jest.fn(),
    createReport: jest.fn(),
    getReportStatus: jest.fn(),
    retryReport: jest.fn(),
  },
  TECHNICIAN_JOB_ACTIVITY_TYPE: 'technician_job_activity',
}));

jest.mock('../src/utils/idempotency', () => ({
  generateIdempotencyKey: jest.fn(),
}));

import {
  clearReports,
  createReportRequest,
  loadReports,
  retryReportRequest,
  useReports,
} from '../src/features/reports/useReports';
import { generateIdempotencyKey } from '../src/utils/idempotency';
import { reportService } from '../src/services';
import type { CreateReportRequest, ReportListItem } from '../src/services';
import { FOCUS_REFRESH_TTL_MS } from '../src/constants';

const listReports = reportService.listReports as jest.Mock;
const createReport = reportService.createReport as jest.Mock;
const retryReport = reportService.retryReport as jest.Mock;
const idempotencyKey = generateIdempotencyKey as jest.Mock;

/** A fixed epoch the fake clock starts at. */
const T0 = 1_000_000_000;
const TTL = FOCUS_REFRESH_TTL_MS;
const POLL_MS = 5_000;

const makeRow = (overrides: Partial<ReportListItem> = {}): ReportListItem => ({
  id: 'r-1',
  reportType: 'technician_job_activity',
  range: { startDate: '2026-09-01', endDate: '2026-09-07' },
  technicianCount: null,
  status: 'ready',
  errorCode: null,
  createdAt: '2026-09-08T06:05:00.000Z',
  completedAt: '2026-09-08T06:06:00.000Z',
  ...overrides,
});

const page = (rows: ReportListItem[]) => ({
  data: rows,
  nextCursor: null,
  hasMore: false,
});

const body: CreateReportRequest = {
  reportType: 'technician_job_activity',
  startDate: '2026-09-01',
  endDate: '2026-09-07',
  technicianIds: null,
};

const createRes = { id: 'r-1', status: 'queued' as const, createdAt: '2026-09-08T06:05:00.000Z' };

let probe: ReturnType<typeof useReports> | null = null;
let instance: ReactTestRenderer | null = null;
let fakeTimersInstalled = false;

function Probe(): null {
  probe = useReports();
  return null;
}

async function mountProbeAt(at: number): Promise<void> {
  jest.useFakeTimers({ now: at });
  fakeTimersInstalled = true;
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
  if (instance) {
    await act(async () => {
      instance?.unmount();
    });
    instance = null;
    probe = null;
  }
  // Reset the module store UNCONDITIONALLY — the `afterEach` unmount already
  // cleared `instance`, so gating on it here would make the reset a no-op on
  // every test after the first, leaking `hasLoaded`/`lastLoadedAt`/rows (and
  // leaving unconsumed `mockResolvedValueOnce` queues) across tests.
  clearReports();
}

beforeEach(async () => {
  await resetStore();
  jest.clearAllMocks();
  // Default beyond the per-test `mockResolvedValueOnce` queue: later calls in
  // a test (post-submit refetch, retry refetch, poll) resolve with a valid
  // row instead of the bare mock's `undefined`, which would corrupt the
  // store's `reports`.
  listReports.mockResolvedValue(page([makeRow()]));
  createReport.mockResolvedValue(createRes);
  idempotencyKey.mockReturnValue('idem-key');
});

afterEach(async () => {
  if (instance) {
    await act(async () => {
      instance?.unmount();
    });
    instance = null;
    probe = null;
  }
  // Flush any armed poll interval while the fake clock is still installed,
  // so a queued row's interval cannot fire under the real clock later.
  if (fakeTimersInstalled) {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    fakeTimersInstalled = false;
  }
});

describe('list loading', () => {
  it('starts the first load on mount with an empty list', async () => {
    let resolve1!: (p: ReturnType<typeof page>) => void;
    listReports.mockImplementationOnce(
      () => new Promise<ReturnType<typeof page>>(res => (resolve1 = res)),
    );
    await act(async () => {
      instance = create(React.createElement(Probe));
    });
    expect(probe?.isLoading).toBe(true);
    expect(probe?.reports).toEqual([]);
    expect(listReports).toHaveBeenCalledTimes(1);
  });

  it('resolves into rows, stamps hasLoaded and the throttle window', async () => {
    listReports.mockResolvedValueOnce(page([makeRow({ id: 'r-2' })]));
    await mountProbeAt(T0);
    expect(probe?.reports).toEqual([makeRow({ id: 'r-2' })]);
    expect(probe?.isLoading).toBe(false);
    expect(probe?.hasLoaded).toBe(true);
  });

  it('a failed first load sets the error but still marks hasLoaded', async () => {
    listReports.mockRejectedValueOnce({
      status: 500,
      code: 'INTERNAL',
      message: 'Network request failed',
    });
    await mountProbeAt(T0);
    expect(probe?.reports).toEqual([]);
    expect(probe?.error).toBe('Network request failed');
    expect(probe?.hasLoaded).toBe(true);
    expect(probe?.isLoading).toBe(false);
  });

  it('a failed refresh retains the stale rows and explains the staleness', async () => {
    await mountProbeAt(T0);
    expect(probe?.reports).toEqual([makeRow()]);

    listReports.mockRejectedValueOnce(new TypeError('Network request failed'));
    await run(() => loadReports({ force: true }));
    expect(probe?.reports).toEqual([makeRow()]); // stale rows stay rendered
    expect(probe?.error).toBe('Network request failed');
    expect(probe?.isLoading).toBe(false);

    // A rejection with no message at all gets the generic copy.
    listReports.mockRejectedValueOnce(undefined);
    await run(() => loadReports({ force: true }));
    expect(probe?.error).toBe('Something went wrong');
  });

  it('clearReports resets the store to the pre-login state', async () => {
    await mountProbeAt(T0);
    expect(probe?.reports).toEqual([makeRow()]);

    // Every later GET hangs: after the clear the probe's auto-load effect
    // refires, and an unresolved refetch leaves the store at the exact
    // pre-login snapshot this test pins (on a real logout the gate unmounts
    // the screen before any refetch could land).
    listReports.mockImplementation(
      () => new Promise<ReturnType<typeof page>>(() => {}),
    );
    await run(() => clearReports());

    expect(probe?.reports).toEqual([]);
    expect(probe?.hasLoaded).toBe(false);
    expect(probe?.isLoading).toBe(true);
    expect(probe?.submitError).toBeNull();
    expect(probe?.retryError).toBeNull();
  });
});

describe('focus refresh throttling', () => {
  it(`skips an unforced load within ${TTL / 1000}s of the last success, reloads after`, async () => {
    await mountProbeAt(T0);
    expect(listReports).toHaveBeenCalledTimes(1);

    // Rapid tab switch 5s later: throttled away.
    jest.setSystemTime(T0 + 5_000);
    await run(() => loadReports());
    expect(listReports).toHaveBeenCalledTimes(1);

    // Past the TTL: the focus refresh runs again.
    jest.setSystemTime(T0 + TTL);
    await run(() => loadReports());
    expect(listReports).toHaveBeenCalledTimes(2);
  });

  it('force bypasses the throttle', async () => {
    await mountProbeAt(T0);

    jest.setSystemTime(T0 + 1_000); // inside the window
    await run(() => loadReports({ force: true }));
    expect(listReports).toHaveBeenCalledTimes(2);
  });
});

describe('in-flight deduplication', () => {
  it('joins the in-flight load instead of issuing a second request', async () => {
    let resolve1!: (p: ReturnType<typeof page>) => void;
    listReports.mockImplementationOnce(
      () => new Promise<ReturnType<typeof page>>(res => (resolve1 = res)),
    );
    await act(async () => {
      instance = create(React.createElement(Probe));
    });

    // The second caller gets the in-flight promise back — no new request.
    let joined!: Promise<void>;
    await act(async () => {
      joined = loadReports();
    });
    expect(listReports).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve1(page([makeRow()]));
      await joined;
    });
    expect(probe?.hasLoaded).toBe(true);
  });

  it('a forced call issues its own request; a late stale response does not overwrite it', async () => {
    // Load #1 starts pre-mutation; it settles LAST.
    let resolve1!: (p: ReturnType<typeof page>) => void;
    listReports.mockImplementationOnce(
      () => new Promise<ReturnType<typeof page>>(res => (resolve1 = res)),
    );
    await act(async () => {
      instance = create(React.createElement(Probe));
    });

    // The forced call starts a SECOND request instead of joining load #1.
    let resolve2!: (p: ReturnType<typeof page>) => void;
    listReports.mockImplementationOnce(
      () => new Promise<ReturnType<typeof page>>(res => (resolve2 = res)),
    );
    let forced!: Promise<void>;
    await act(async () => {
      forced = loadReports({ force: true });
    });
    expect(listReports).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolve2(page([makeRow({ id: 'r-2' })]));
      await forced;
    });
    expect(probe?.reports.map(r => r.id)).toEqual(['r-2']);

    // Load #1 settling late must not overwrite the newer state.
    await act(async () => {
      resolve1(page([makeRow({ id: 'stale' })]));
    });
    expect(probe?.reports.map(r => r.id)).toEqual(['r-2']);
  });
});

describe('createReportRequest', () => {
  it('posts with a FRESH key per call and force-refetches the list', async () => {
    await mountProbeAt(T0);
    expect(listReports).toHaveBeenCalledTimes(1);

    idempotencyKey
      .mockReturnValueOnce('key-1')
      .mockReturnValueOnce('key-2');

    await run(() => createReportRequest(body));
    await run(() => createReportRequest(body));

    expect(createReport).toHaveBeenNthCalledWith(1, body, 'key-1');
    expect(createReport).toHaveBeenNthCalledWith(2, body, 'key-2');
    // The post-submit refetch is forced — it lands inside the throttle window.
    expect(listReports).toHaveBeenCalledTimes(3);
  });

  it('flags isSubmitting while the POST is in flight and clears it on success', async () => {
    let resolve1!: (r: typeof createRes) => void;
    createReport.mockImplementationOnce(
      () => new Promise<typeof createRes>(res => (resolve1 = res)),
    );
    await mountProbeAt(T0);

    let submitted!: Promise<void>;
    await act(async () => {
      submitted = createReportRequest(body);
    });
    expect(probe?.isSubmitting).toBe(true);
    expect(probe?.submitError).toBeNull();

    await act(async () => {
      resolve1(createRes);
      await submitted;
    });
    expect(probe?.isSubmitting).toBe(false);
  });

  it('maps an ApiError rejection into submitError and rethrows', async () => {
    const apiErr = {
      status: 429,
      code: 'REPORT_IN_FLIGHT_LIMIT',
      message: 'You have a report generating. Wait for it to finish before creating another.',
    };
    await mountProbeAt(T0);

    createReport.mockRejectedValueOnce(apiErr);
    let caught: unknown = null;
    await run(async () => {
      await createReportRequest(body).catch(e => {
        caught = e;
      });
    });
    expect(caught).toEqual(apiErr);
    expect(probe?.submitError).toBe(
      'You have a report generating. Wait for it to finish before creating another.',
    );
    expect(probe?.isSubmitting).toBe(false);

    // A rejection with no message at all gets the generic copy.
    createReport.mockRejectedValueOnce(undefined);
    let caught2: unknown = null;
    await run(async () => {
      await createReportRequest(body).catch(e => {
        caught2 = e;
      });
    });
    expect(caught2).toBeUndefined();
    expect(probe?.submitError).toBe('Something went wrong. Try again.');
  });
});

describe('retryReportRequest', () => {
  it('posts the retry with a fresh key and force-refetches the list', async () => {
    await mountProbeAt(T0);
    expect(listReports).toHaveBeenCalledTimes(1);
    idempotencyKey.mockReturnValueOnce('retry-key');

    await run(() => retryReportRequest('r-1'));

    expect(retryReport).toHaveBeenCalledWith('r-1', 'retry-key');
    expect(probe?.retryingId).toBeNull(); // cleared on success
    expect(probe?.retryError).toBeNull();
    // The post-retry refetch is forced — the row flips to "Queued" at once.
    expect(listReports).toHaveBeenCalledTimes(2);
  });

  it('sets retryingId while the retry POST is in flight', async () => {
    let resolve1!: (r: typeof createRes) => void;
    retryReport.mockImplementationOnce(
      () => new Promise<typeof createRes>(res => (resolve1 = res)),
    );
    await mountProbeAt(T0);

    let pending!: Promise<void>;
    await act(async () => {
      pending = retryReportRequest('r-1');
    });
    expect(probe?.retryingId).toBe('r-1');

    await act(async () => {
      resolve1(createRes);
      await pending;
    });
    expect(probe?.retryingId).toBeNull();
  });

  it('maps an ApiError rejection into retryError and rethrows', async () => {
    const apiErr = {
      status: 409,
      code: 'REPORT_NOT_RETRYABLE',
      message: 'Only a failed report can be retried',
    };
    await mountProbeAt(T0);

    retryReport.mockRejectedValueOnce(apiErr);
    let caught: unknown = null;
    await run(async () => {
      await retryReportRequest('r-1').catch(e => {
        caught = e;
      });
    });
    expect(caught).toEqual(apiErr);
    expect(probe?.retryError).toBe('Only a failed report can be retried');
    expect(probe?.retryingId).toBeNull();

    // A rejection with no message at all gets the generic copy.
    retryReport.mockRejectedValueOnce(undefined);
    await run(async () => {
      await retryReportRequest('r-1').catch(() => {});
    });
    expect(probe?.retryError).toBe('Could not retry. Try again.');
  });

  it('clears the previous retryError when the next attempt starts', async () => {
    await mountProbeAt(T0);

    retryReport.mockRejectedValueOnce(new Error('down'));
    // The store rethrows the rejection — swallow it here (the failure itself
    // is asserted via the banner below).
    await run(() => retryReportRequest('r-1').catch(() => {}));
    expect(probe?.retryError).toBe('down');

    // The second attempt starts clean — the stale banner must not outlive it.
    let resolve2!: (r: typeof createRes) => void;
    retryReport.mockImplementationOnce(
      () => new Promise<typeof createRes>(res => (resolve2 = res)),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = retryReportRequest('r-1');
    });
    expect(probe?.retryError).toBeNull();
    expect(probe?.retryingId).toBe('r-1');

    await act(async () => {
      resolve2(createRes);
      await pending;
    });
    expect(probe?.retryError).toBeNull();
  });
});

describe('polling', () => {
  it('refetches every 5s while a row is queued, not before the interval', async () => {
    listReports.mockResolvedValue(page([makeRow({ status: 'queued' })]));
    await mountProbeAt(T0);
    expect(listReports).toHaveBeenCalledTimes(1);

    // 1ms short of the cadence: no fetch yet.
    await act(async () => {
      jest.advanceTimersByTime(POLL_MS - 1);
    });
    expect(listReports).toHaveBeenCalledTimes(1);

    // The 5s cadence fires a FORCED refetch (throttle-immune by design).
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(listReports).toHaveBeenCalledTimes(2);
  });

  it('also polls while a row is generating', async () => {
    listReports.mockResolvedValue(page([makeRow({ status: 'generating' })]));
    await mountProbeAt(T0);
    expect(listReports).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(POLL_MS);
    });
    expect(listReports).toHaveBeenCalledTimes(2);
  });

  it('does not arm the poll when every row is settled', async () => {
    listReports.mockResolvedValue(page([makeRow({ status: 'ready' })]));
    await mountProbeAt(T0);
    expect(listReports).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(POLL_MS * 2);
    });
    expect(listReports).toHaveBeenCalledTimes(1);
  });
});