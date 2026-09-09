/**
 * The `useNotifications` shared store — tested through its exported module
 * functions, read back via a probe component mounted with react-test-renderer
 * (same approach as useJobs.test.ts). `../src/services` is mocked so no
 * network/MMKV is touched.
 *
 * Mounting the probe auto-loads the BADGE count (the hook's first-mount
 * effect — bell surfaces never pull the list), so each test's first
 * `unreadCount` call is the mount load; the LIST loads only when a test
 * calls `loadNotifications`.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('../src/services', () => ({
  notificationService: {
    list: jest.fn(),
    unreadCount: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  },
}));

import {
  clearNotifications,
  loadMoreNotifications,
  loadNotifications,
  loadUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  useNotifications,
} from '../src/features/notifications/useNotifications';
import { notificationService } from '../src/services';
import type { ApiNotification, Paginated } from '../src/services';

const list = notificationService.list as jest.Mock;
const unreadCount = notificationService.unreadCount as jest.Mock;
const markRead = notificationService.markRead as jest.Mock;
const markAllRead = notificationService.markAllRead as jest.Mock;

function makeNotification(id: string, overrides: Partial<ApiNotification> = {}): ApiNotification {
  return {
    id,
    jobId: `job-${id}`,
    eventType: 'on_my_way',
    payload: { job_number: 'JB-2026-0042', step: 'on_my_way', technician_name: 'Priya' },
    readAt: null,
    createdAt: '2026-09-09T09:00:00Z',
    ...overrides,
  };
}

function page(data: ApiNotification[], nextCursor: string | null): Paginated<ApiNotification> {
  return { data, nextCursor, hasMore: nextCursor !== null };
}

let probe: ReturnType<typeof useNotifications> | null = null;
function Probe(): null {
  probe = useNotifications();
  return null;
}

/** Mounts the probe; the badge-count effect fires inside act. */
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

/** ApiError-shaped rejection: `status > 0` is a definitive failure. */
const apiFailure = (status: number) =>
  Object.assign(new Error('Request failed'), { status });

beforeEach(() => {
  clearNotifications();
  jest.clearAllMocks();
  probe = null;
  unreadCount.mockResolvedValue({ unreadCount: 0 });
  list.mockResolvedValue(page([], null));
});

afterEach(() => {
  jest.useRealTimers();
});

it('first mount loads the badge count only (never the list)', async () => {
  await mountProbe();

  expect(unreadCount).toHaveBeenCalledTimes(1);
  expect(list).not.toHaveBeenCalled();
  expect(probe?.unreadCount).toBe(0);
});

it('loads the list on demand and keeps the count load separate', async () => {
  list.mockResolvedValue(page([makeNotification('a')], null));
  await mountProbe();

  await run(() => loadNotifications());

  expect(list).toHaveBeenCalledTimes(1);
  expect(probe?.items.map(n => n.id)).toEqual(['a']);
  expect(probe?.hasLoaded).toBe(true);
});

it('skips a list refetch within the focus TTL, but not when forced', async () => {
  await mountProbe();
  await run(() => loadNotifications());
  expect(list).toHaveBeenCalledTimes(1);

  await run(() => loadNotifications()); // fresh — throttled
  expect(list).toHaveBeenCalledTimes(1);

  await run(() => loadNotifications({ force: true })); // pull-to-refresh
  expect(list).toHaveBeenCalledTimes(2);
});

it('throttles the badge count separately from the list', async () => {
  await mountProbe(); // count #1
  await run(() => loadNotifications()); // list load must not refresh the count
  expect(unreadCount).toHaveBeenCalledTimes(1);

  await run(() => loadUnreadCount()); // fresh — throttled
  expect(unreadCount).toHaveBeenCalledTimes(1);

  await run(() => loadUnreadCount({ force: true })); // post-mutation / live event
  expect(unreadCount).toHaveBeenCalledTimes(2);
});

it('reloads the badge once the TTL has expired', async () => {
  jest.useFakeTimers();
  await mountProbe();
  expect(unreadCount).toHaveBeenCalledTimes(1);

  jest.setSystemTime(Date.now() + 16_000);
  await run(() => loadUnreadCount());

  expect(unreadCount).toHaveBeenCalledTimes(2);
});

it('appends the next page without duplicate ids and sends the cursor', async () => {
  list.mockResolvedValueOnce(page([makeNotification('a'), makeNotification('b')], 'cursor-1'))
      .mockResolvedValueOnce(page([makeNotification('b'), makeNotification('c')], null));
  await mountProbe();

  await run(() => loadNotifications());
  await run(() => loadMoreNotifications());

  expect(probe?.items.map(n => n.id)).toEqual(['a', 'b', 'c']);
  expect(list).toHaveBeenLastCalledWith({ cursor: 'cursor-1' });
  expect(probe?.hasMore).toBe(false);
});

it('does not page without a cursor', async () => {
  await mountProbe();
  await run(() => loadNotifications()); // hasMore false, nextCursor null

  await run(() => loadMoreNotifications());
  expect(list).toHaveBeenCalledTimes(1);
});

it('marks a row read optimistically and decrements the badge', async () => {
  list.mockResolvedValue(page([makeNotification('a'), makeNotification('b')], null));
  await mountProbe();
  await run(() => loadNotifications());

  markRead.mockResolvedValue({ markedCount: 1 });
  await run(() => markNotificationRead('a'));

  expect(markRead).toHaveBeenCalledWith(['a']);
  expect(probe?.items.find(n => n.id === 'a')?.readAt).not.toBeNull();
  expect(probe?.items.find(n => n.id === 'b')?.readAt).toBeNull();
  expect(probe?.unreadCount).toBe(0); // 1 → 0
});

it('does not POST for an already-read row', async () => {
  list.mockResolvedValue(page([makeNotification('a', { readAt: '2026-09-09T10:00:00Z' })], null));
  await mountProbe();
  await run(() => loadNotifications());

  await run(() => markNotificationRead('a'));
  expect(markRead).not.toHaveBeenCalled();
});

it('rolls the optimistic mark-read back on a definitive failure', async () => {
  unreadCount.mockResolvedValue({ unreadCount: 1 }); // one unread row below
  list.mockResolvedValue(page([makeNotification('a')], null));
  await mountProbe();
  await run(() => loadNotifications());

  markRead.mockRejectedValue(apiFailure(422)); // real 4xx — POST never landed
  await run(() => markNotificationRead('a'));

  expect(probe?.items.find(n => n.id === 'a')?.readAt).toBeNull(); // restored
  expect(probe?.unreadCount).toBe(1); // restored
  expect(list).toHaveBeenCalledTimes(1); // no panic refetch
});

it('re-asks the server instead of rolling back when the outcome is unknown', async () => {
  list.mockResolvedValue(page([makeNotification('a')], null));
  await mountProbe();
  await run(() => loadNotifications());

  markRead.mockRejectedValue(apiFailure(0)); // offline/timeout — may have landed
  await run(() => markNotificationRead('a'));

  // The optimistic state is NOT rolled back blindly — the server is asked.
  expect(unreadCount).toHaveBeenCalledTimes(2); // mount + force refetch
  expect(list).toHaveBeenCalledTimes(2);
  expect(list).toHaveBeenLastCalledWith(); // force-refreshed page 1
});

it('mark-all-read clears every row and the badge, and always POSTs while rows are on screen', async () => {
  list.mockResolvedValue(
    page([makeNotification('a'), makeNotification('b', { readAt: '2026-09-09T10:00:00Z' })], null),
  );
  await mountProbe();
  await run(() => loadNotifications());

  markAllRead.mockResolvedValue({ markedCount: 1 });
  await run(() => markAllNotificationsRead());

  expect(markAllRead).toHaveBeenCalledTimes(1); // even with only one unread row
  expect(probe?.items.every(n => n.readAt !== null)).toBe(true);
  expect(probe?.unreadCount).toBe(0);
});

it('mark-all-read POSTs even when the local badge reads 0 but rows are on screen', async () => {
  // A missed live event: badge says 0, unread rows on screen.
  unreadCount.mockResolvedValue({ unreadCount: 0 });
  list.mockResolvedValue(page([makeNotification('a')], null));
  await mountProbe();
  await run(() => loadNotifications());

  markAllRead.mockResolvedValue({ markedCount: 1 });
  await run(() => markAllNotificationsRead());

  expect(markAllRead).toHaveBeenCalledTimes(1);
});

it('rolls mark-all-read back on a definitive failure', async () => {
  unreadCount.mockResolvedValue({ unreadCount: 2 }); // two unread rows below
  list.mockResolvedValue(page([makeNotification('a'), makeNotification('b')], null));
  await mountProbe();
  await run(() => loadNotifications());

  markAllRead.mockRejectedValue(apiFailure(500));
  await run(() => markAllNotificationsRead());

  expect(probe?.items.every(n => n.readAt === null)).toBe(true); // restored
  expect(probe?.unreadCount).toBe(2); // restored
});

it('ignores a list response that lands after clearNotifications (logout race)', async () => {
  let release!: () => void;
  list.mockImplementationOnce(
    () =>
      new Promise<Paginated<ApiNotification>>(res => {
        release = () => res(page([makeNotification('a')], null));
      }),
  );
  await mountProbe();
  // Kick the list load off but DON'T await it — its promise only settles
  // when `release` fires below (awaiting it here would deadlock the test).
  await run(() => {
    void loadNotifications();
    return Promise.resolve();
  });

  ReactTestRenderer.act(() => {
    clearNotifications(); // logout while the GET is still in flight
  });
  release(); // the request settles *after* the reset
  await run(() => Promise.resolve());

  expect(probe?.items).toEqual([]); // the late response was ignored
  expect(probe?.hasLoaded).toBe(false);
  expect(probe?.isLoading).toBe(true); // back to the pre-login state
  expect(probe?.unreadCount).toBeNull();
});

it('keeps prior rows and records the error when a load fails', async () => {
  list.mockResolvedValueOnce(page([makeNotification('a')], null))
      .mockRejectedValueOnce(apiFailure(500));
  await mountProbe();
  await run(() => loadNotifications());
  await run(() => loadNotifications({ force: true })); // failing refresh

  expect(probe?.items.map(n => n.id)).toEqual(['a']); // rows stay on screen
  expect(probe?.error).toBe('Request failed');
});

it('badge failures are silent (log-only), keeping the last value', async () => {
  unreadCount.mockRejectedValueOnce(apiFailure(0)); // mount load fails
  await mountProbe();

  expect(probe?.unreadCount).toBeNull(); // no value yet — no fake 0
  expect(probe?.error).toBeNull(); // never an on-screen error
});

// --- Review patches (2026-09-09 code review) ----------------------------------

it('a forced refresh during an in-flight page-2 load refetches page 1 (no shared slot)', async () => {
  list.mockResolvedValueOnce(page([makeNotification('a')], 'cursor-1'));
  await mountProbe();
  await run(() => loadNotifications());

  // Page 2 hangs in flight; the user pulls to refresh meanwhile.
  let releasePage2!: () => void;
  list.mockImplementationOnce(
    () =>
      new Promise<Paginated<ApiNotification>>(res => {
        releasePage2 = () => res(page([makeNotification('b')], null));
      }),
  );
  await run(() => {
    void loadMoreNotifications();
    return Promise.resolve();
  });
  expect(list).toHaveBeenCalledTimes(2);

  // The pull-to-refresh must NOT join page 2's promise — it asked for page 1.
  list.mockResolvedValueOnce(page([makeNotification('a2')], null));
  await run(() => loadNotifications({ force: true }));
  expect(list).toHaveBeenCalledTimes(3);
  expect(probe?.items.map(n => n.id)).toEqual(['a2']);

  // The stale page-2 response must not append itself after the refresh.
  releasePage2();
  await run(() => Promise.resolve());
  expect(probe?.items.map(n => n.id)).toEqual(['a2']);
});

it('a load requested right after clearNotifications fires a fresh GET (in-flight slot dropped)', async () => {
  let release!: () => void;
  list.mockImplementationOnce(
    () =>
      new Promise<Paginated<ApiNotification>>(res => {
        release = () => res(page([makeNotification('a')], null));
      }),
  );
  await mountProbe();
  await run(() => {
    void loadNotifications();
    return Promise.resolve();
  });
  expect(list).toHaveBeenCalledTimes(1);

  // Logout while the GET hangs — the next load must not join that
  // gen-discarded request, or it would never fire at all.
  ReactTestRenderer.act(() => {
    clearNotifications();
  });
  list.mockResolvedValueOnce(page([makeNotification('a')], null));
  await run(() => loadNotifications());
  expect(list).toHaveBeenCalledTimes(2);

  release(); // the pre-reset response lands — it must stay discarded
  await run(() => Promise.resolve());
  expect(probe?.items.map(n => n.id)).toEqual(['a']);
});

it('force-refetches the badge after a SUCCESSFUL mark-read (spec: after any mutation)', async () => {
  list.mockResolvedValue(page([makeNotification('a')], null));
  await mountProbe();
  await run(() => loadNotifications());
  expect(unreadCount).toHaveBeenCalledTimes(1); // the mount load only

  markRead.mockResolvedValue({ markedCount: 1 });
  await run(() => markNotificationRead('a'));

  expect(unreadCount).toHaveBeenCalledTimes(2); // the post-success re-ask
  expect(unreadCount).toHaveBeenLastCalledWith();
});

it('records a mutation error for the screen banner, cleared by the next attempt', async () => {
  list.mockResolvedValue(page([makeNotification('a')], null));
  await mountProbe();
  await run(() => loadNotifications());

  markRead.mockRejectedValue(apiFailure(422));
  await run(() => markNotificationRead('a'));
  expect(probe?.mutationError).toBe('Request failed');
  expect(probe?.items.find(n => n.id === 'a')?.readAt).toBeNull(); // rolled back

  markRead.mockResolvedValue({ markedCount: 1 });
  await run(() => markNotificationRead('a'));
  expect(probe?.mutationError).toBeNull();
});
