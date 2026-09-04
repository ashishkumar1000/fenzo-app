/**
 * The `useTechnicianJobs` shared store — tested through its exported module
 * functions, read back via a probe component mounted with react-test-renderer
 * (same approach as useJobs.test.ts). `../../services` is mocked so no
 * network/MMKV is touched.
 *
 * The store has NO auto-load effects — the screens' focus effects own the
 * fetch triggers — so every test loads explicitly. `mountAndLoad()` mounts
 * the probe and settles both page-1 loads (Today unfiltered, History with
 * the pinned statuses) so each test starts from a loaded store. Call counts
 * are filtered per query: Today sends no `status`, History does.
 * `clearTechnicianJobs()` between tests resets the module state and
 * invalidates in-flight responses.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('../src/services', () => ({
  jobService: { list: jest.fn() },
}));

import {
  clearTechnicianJobs,
  loadHistory,
  loadMoreHistory,
  loadToday,
  upsertTechnicianJob,
  useTechnicianJobs,
} from '../src/features/technicianApp/useTechnicianJobs';
import { jobService } from '../src/services';
import type { ApiJob, Paginated } from '../src/services';

const list = jobService.list as jest.Mock;

function makeJob(id: string, overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id,
    jobNumber: `JB-2026-${id}`,
    tenantId: 't1',
    customerId: `c-${id}`,
    technicianId: `tech-${id}`,
    serviceLocation: 'Chennai',
    serviceType: 'plumbing',
    scheduledStart: '2026-09-04T04:30:00.000Z',
    scheduledEnd: null,
    status: 'scheduled',
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    description: null,
    notesForTechnician: null,
    createdAt: '2026-09-03T09:00:00Z',
    updatedAt: '2026-09-03T09:00:00Z',
    completedAt: null,
    ...overrides,
  };
}

function page(jobs: ApiJob[], nextCursor: string | null): Paginated<ApiJob> {
  return { data: jobs, nextCursor, hasMore: nextCursor !== null };
}

let probe: ReturnType<typeof useTechnicianJobs> | null = null;
function Probe(): null {
  probe = useTechnicianJobs();
  return null;
}

function mountProbe(): void {
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(React.createElement(Probe));
  });
}

/**
 * Mounts the probe AND settles both page-1 loads (Today + History), the way
 * a screen's first focus effect would. Mocks must be queued before calling.
 */
async function mountAndLoad(): Promise<void> {
  mountProbe();
  await run(() => Promise.all([loadToday(), loadHistory()]));
}

async function run(fn: () => Promise<unknown>): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await fn();
  });
}

/** A synchronous store call, flushed through act so the probe re-renders. */
function apply(fn: () => void): void {
  ReactTestRenderer.act(() => {
    fn();
  });
}

const isHistory = (q?: { status?: string[] }) => Boolean(q?.status);
const todayCalls = () => list.mock.calls.filter(([q]) => !isHistory(q)).length;
const historyCalls = () => list.mock.calls.filter(([q]) => isHistory(q)).length;

beforeEach(() => {
  list.mockReset();
  clearTechnicianJobs();
});

describe('loadToday', () => {
  it('calls GET /jobs with no params (server scopes to the caller)', async () => {
    list.mockResolvedValue(page([makeJob('j1')], null));
    mountProbe();
    await run(() => loadToday());
    expect(list).toHaveBeenCalledWith({});
    expect(probe?.today.map(j => j.id)).toEqual(['j1']);
    expect(probe?.hasLoadedToday).toBe(true);
  });

  it('throttles a repeat load within the TTL, but force bypasses it', async () => {
    list.mockResolvedValue(page([], null));
    mountProbe();
    await run(() => loadToday());
    expect(todayCalls()).toBe(1);
    await run(() => loadToday()); // throttled — no second call
    expect(todayCalls()).toBe(1);
    await run(() => loadToday({ force: true }));
    expect(todayCalls()).toBe(2);
  });

  it('queues a forced refresh behind the in-flight load instead of joining it', async () => {
    let resolveList!: (p: Paginated<ApiJob>) => void;
    list.mockReturnValue(new Promise<Paginated<ApiJob>>(resolve => (resolveList = resolve)));

    mountProbe();
    const first = loadToday(); // load 1 in flight
    const queued = loadToday({ force: true }); // queues behind it
    resolveList(page([makeJob('j1')], null));

    // The queue re-issues the load after the first settles → second call.
    await run(() => Promise.all([first, queued]));
    expect(todayCalls()).toBe(2);
    expect(probe?.today.map(j => j.id)).toEqual(['j1']);
  });
});

describe('loadHistory', () => {
  it('pins scope=history and the history statuses on page 1', async () => {
    // Without `scope: 'history'` the server defaults to the today window and
    // day-filters scheduled_start — past jobs could never render.
    list.mockResolvedValue(page([makeJob('h1', { status: 'completed' })], 'cur-1'));
    mountProbe();
    await run(() => loadHistory());
    expect(list).toHaveBeenCalledWith({
      scope: 'history',
      status: ['completed', 'cancelled'],
      cursor: undefined,
    });
    expect(probe?.history.map(j => j.id)).toEqual(['h1']);
    expect(probe?.historyCursor).toBe('cur-1');
    expect(probe?.historyHasMore).toBe(true);
  });

  it('throttles a repeat load within the TTL, but force bypasses it', async () => {
    list.mockResolvedValue(page([], null));
    mountProbe();
    await run(() => loadHistory());
    expect(historyCalls()).toBe(1);
    await run(() => loadHistory()); // throttled — no second call
    expect(historyCalls()).toBe(1);
    await run(() => loadHistory({ force: true }));
    expect(historyCalls()).toBe(2);
  });
});

describe('loadMoreHistory', () => {
  it('appends the next page with no duplicate ids', async () => {
    // Page 1 carries a cursor; the follow-up page terminates it.
    const historyPages = [page([makeJob('h1', { status: 'completed' })], 'cur-1'), page([], null)];
    let historyIndex = 0;
    list.mockImplementation((query?: { status?: string[] }) => {
      if (!isHistory(query)) return Promise.resolve(page([], null));
      const p = historyPages[historyIndex];
      historyIndex += 1;
      return Promise.resolve(p);
    });
    await mountAndLoad();
    await run(() => loadMoreHistory());

    expect(probe?.history.map(j => j.id)).toEqual(['h1']);
    expect(probe?.historyHasMore).toBe(false);
    expect(historyCalls()).toBe(2);
  });

  it('drops a row that moved between pages instead of duplicating it', async () => {
    const historyPages = [
      page([makeJob('h1', { status: 'completed' })], 'cur-1'),
      page([makeJob('h1', { status: 'completed' }), makeJob('h2', { status: 'cancelled' })], null),
    ];
    let historyIndex = 0;
    list.mockImplementation((query?: { status?: string[] }) => {
      if (!isHistory(query)) return Promise.resolve(page([], null));
      const p = historyPages[historyIndex];
      historyIndex += 1;
      return Promise.resolve(p);
    });
    await mountAndLoad();
    await run(() => loadMoreHistory());

    expect(probe?.history.map(j => j.id)).toEqual(['h1', 'h2']);
  });

  it('is a no-op when there is no more history', async () => {
    list.mockResolvedValue(page([makeJob('h1', { status: 'completed' })], null));
    await mountAndLoad();
    await run(() => loadMoreHistory());
    expect(historyCalls()).toBe(1);
  });
});

describe('upsertTechnicianJob', () => {
  beforeEach(() => {
    list.mockImplementation((query?: { status?: string[] }) =>
      isHistory(query)
        ? Promise.resolve(page([makeJob('h1', { status: 'completed' })], null))
        : Promise.resolve(page([makeJob('j1')], null)),
    );
  });

  it('replaces the row in whichever array holds its id', async () => {
    await mountAndLoad();

    apply(() => {
      upsertTechnicianJob(makeJob('j1', { status: 'in_progress' }));
      upsertTechnicianJob(makeJob('h1', { status: 'cancelled' }));
    });

    expect(probe?.today.map(j => j.id)).toEqual(['j1']);
    expect(probe?.today[0].status).toBe('in_progress');
    expect(probe?.history.map(j => j.id)).toEqual(['h1']);
    expect(probe?.history[0].status).toBe('cancelled');
  });

  it('does NOT move a completed job into history by hand', async () => {
    await mountAndLoad();

    apply(() => upsertTechnicianJob(makeJob('j1', { status: 'completed' })));

    // Upsert-in-place only: the next History load picks the row up server-side.
    expect(probe?.today[0].status).toBe('completed');
    // History is untouched by the upsert — it still holds exactly the rows
    // the first load fetched.
    expect(probe?.history.map(j => j.id)).toEqual(['h1']);
  });

  it('ignores a row neither array holds', async () => {
    await mountAndLoad();

    apply(() => upsertTechnicianJob(makeJob('unknown', { status: 'completed' })));

    expect(probe?.today.map(j => j.id)).toEqual(['j1']);
    expect(probe?.history.map(j => j.id)).toEqual(['h1']);
  });

  it('a load that started before an optimistic upsert does not revert it', async () => {
    // Real Epic 3 flow: the row is on screen, the user acts on it, and a
    // refresh fired just before the action is still in flight.
    await mountAndLoad();

    let resolveList!: (p: Paginated<ApiJob>) => void;
    list.mockReturnValue(new Promise<Paginated<ApiJob>>(resolve => (resolveList = resolve)));
    const loading = loadToday({ force: true }); // load 2 in flight…

    // The optimistic row write lands while the load is still away.
    apply(() => upsertTechnicianJob(makeJob('j1', { status: 'in_progress' })));

    resolveList(page([makeJob('j1', { status: 'scheduled' })], null));
    await run(() => loading);

    // The response predates the mutation — committing it would silently
    // revert the optimistic row until the next refetch.
    expect(probe?.today[0].status).toBe('in_progress');
  });
});

describe('clearTechnicianJobs', () => {
  it('resets the store and discards a late in-flight response', async () => {
    let resolveList!: (p: Paginated<ApiJob>) => void;
    list.mockReturnValue(
      new Promise<Paginated<ApiJob>>(resolve => {
        resolveList = resolve;
      }),
    );

    mountProbe();
    const loading = Promise.all([loadToday(), loadHistory()]);
    expect(probe?.hasLoadedToday).toBe(false);

    clearTechnicianJobs();
    expect(probe?.today).toHaveLength(0);
    expect(probe?.history).toHaveLength(0);

    // A response that settles after the reset must not commit.
    resolveList(page([makeJob('j1')], null));
    await run(() => loading);
    expect(probe?.today).toHaveLength(0);
    expect(probe?.history).toHaveLength(0);
    expect(probe?.hasLoadedToday).toBe(false);
  });
});