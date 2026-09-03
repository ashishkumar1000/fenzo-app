/**
 * The `useJobs` shared store — tested through its exported module functions,
 * read back via a probe component mounted with react-test-renderer (same
 * approach as App.test.tsx). `../../services` is mocked so no network/MMKV
 * is touched.
 *
 * Mounting the probe auto-loads (the hook's first-mount effect), so each
 * test's first `list` call IS the mount load.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('../src/services', () => ({
  jobService: { list: jest.fn(), create: jest.fn() },
}));

import { clearJobs, loadJobs, loadMoreJobs, upsertJob, useJobs } from '../src/features/jobs/useJobs';
import { jobService } from '../src/services';
import type { ApiJob, Paginated } from '../src/services';

const list = jobService.list as jest.Mock;

function makeJob(id: string): ApiJob {
  return {
    id,
    jobNumber: `JB-2026-${id}`,
    tenantId: 't1',
    customerId: `c-${id}`,
    technicianId: `tech-${id}`,
    serviceLocation: 'Chennai',
    serviceType: 'plumbing',
    scheduledStart: '2026-09-03T10:00:00Z',
    scheduledEnd: null,
    status: 'scheduled',
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    description: null,
    notesForTechnician: null,
    createdAt: '2026-09-03T09:00:00Z',
    updatedAt: '2026-09-03T09:00:00Z',
  };
}

function page(jobs: ApiJob[], nextCursor: string | null): Paginated<ApiJob> {
  return { data: jobs, nextCursor, hasMore: nextCursor !== null };
}

let probe: ReturnType<typeof useJobs> | null = null;
function Probe(): null {
  probe = useJobs();
  return null;
}

/** Mounts the probe; the auto-load effect fires inside act. */
async function mountProbe(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(React.createElement(Probe));
  });
}

async function run(fn: () => Promise<unknown>): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await fn();
  });
}

beforeEach(() => {
  clearJobs();
  jest.clearAllMocks();
  probe = null;
});

afterEach(() => {
  jest.useRealTimers();
});

it('de-duplicates concurrent loads into one request', async () => {
  list.mockResolvedValue(page([makeJob('a')], null));
  await mountProbe(); // auto-load #1 is in flight (or done)

  await ReactTestRenderer.act(async () => {
    await Promise.all([loadJobs(), loadJobs(), loadJobs()]);
  });

  expect(list).toHaveBeenCalledTimes(1);
});

it('skips a refetch within 15s of a success (throttle)', async () => {
  list.mockResolvedValue(page([makeJob('a')], null));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadJobs(); // same filter, fresh enough — must not hit the API again
  });

  expect(list).toHaveBeenCalledTimes(1);
});

it('bypasses the throttle when the filter changes', async () => {
  list.mockResolvedValue(page([], null));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadJobs('completed'); // a different query, not a refresh
  });

  expect(list).toHaveBeenCalledTimes(2);
  expect(list).toHaveBeenLastCalledWith({ status: ['completed'] });
});

it('bypasses the throttle when forced (pull-to-refresh)', async () => {
  list.mockResolvedValue(page([makeJob('a')], null));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadJobs('all', { force: true });
  });

  expect(list).toHaveBeenCalledTimes(2);
});

it('omits the status param for the all filter', async () => {
  list.mockResolvedValue(page([], null));
  await mountProbe();

  expect(list).toHaveBeenCalledWith({});
});

it('appends the next page without duplicate ids', async () => {
  list.mockResolvedValueOnce(page([makeJob('a'), makeJob('b')], 'cursor-1'))
      .mockResolvedValueOnce(page([makeJob('b'), makeJob('c')], null));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadMoreJobs();
  });

  expect(probe?.jobs.map(j => j.id)).toEqual(['a', 'b', 'c']);
  expect(list).toHaveBeenLastCalledWith({ cursor: 'cursor-1' });
});

it('keeps prior jobs and records the error when a load fails', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], 'cursor-1'))
      .mockRejectedValueOnce(Object.assign(new Error('Network offline')));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadMoreJobs();
  });

  expect(probe?.jobs.map(j => j.id)).toEqual(['a']); // rows stay on screen
  expect(probe?.error).toBe('Network offline');
});

it('refetches once the 15s throttle has expired', async () => {
  jest.useFakeTimers();
  list.mockResolvedValue(page([makeJob('a')], null));
  await mountProbe();
  expect(list).toHaveBeenCalledTimes(1);

  jest.setSystemTime(Date.now() + 16_000); // past the throttle window
  await run(() => loadJobs());

  expect(list).toHaveBeenCalledTimes(2);
});

it('queues a filter change behind an in-flight page fetch instead of dropping it', async () => {
  let releasePage2!: () => void;
  list.mockResolvedValueOnce(page([makeJob('a'), makeJob('b')], 'cursor-1'))
      // page 2 hangs until the test releases it
      .mockImplementationOnce(
        () =>
          new Promise<Paginated<ApiJob>>(res => {
            releasePage2 = () => res(page([makeJob('b'), makeJob('c')], null));
          }),
      );
  await mountProbe();

  await run(() => {
    void loadMoreJobs(); // page-2 fetch now in flight (hangs until released)
    return Promise.resolve();
  });
  const queued = loadJobs('completed'); // must queue, not return the page-2 promise

  expect(list).toHaveBeenCalledTimes(2); // no third request until page 2 lands

  releasePage2();
  await run(() => queued);
  expect(list).toHaveBeenCalledTimes(3);
  expect(list).toHaveBeenLastCalledWith({ status: ['completed'] });
  expect(probe?.filter).toBe('completed');
});

it('clears stale rows when a filter change fails', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], null))
      .mockRejectedValueOnce(Object.assign(new Error('boom')));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadJobs('completed');
  });

  expect(probe?.jobs).toEqual([]); // old filter's rows must not linger
  expect(probe?.filter).toBe('completed');
  expect(probe?.error).toBe('boom');
});

it('ignores a response that lands after clearJobs (logout race)', async () => {
  let release!: () => void;
  list.mockImplementationOnce(
    () =>
      new Promise<Paginated<ApiJob>>(res => {
        release = () => res(page([makeJob('a')], null));
      }),
  );
  await mountProbe();

  ReactTestRenderer.act(() => {
    clearJobs(); // logout while the GET is still in flight
  });
  release(); // the request settles *after* the reset
  await run(() => Promise.resolve());

  expect(probe?.jobs).toEqual([]); // the late response was ignored
  expect(probe?.hasLoaded).toBe(false);
  expect(probe?.isLoading).toBe(true); // back to the pre-login state
});

it('prepends a created job via upsertJob and honours the active filter', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], null)) // mount auto-load (all)
      .mockResolvedValueOnce(page([], null)); // Done filter is empty
  await mountProbe();

  ReactTestRenderer.act(() => {
    upsertJob(makeJob('z')); // all filter: anything can be prepended
  });
  expect(probe?.jobs.map(j => j.id)).toEqual(['z', 'a']);

  await ReactTestRenderer.act(async () => {
    await loadJobs('completed'); // empty Done list
  });
  ReactTestRenderer.act(() => {
    upsertJob(makeJob('z2')); // a scheduled job must not appear under Done
  });
  expect(probe?.jobs).toEqual([]);
});
