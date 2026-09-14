/**
 * Pins the shared axios instance's wire seams: the query-string output (the
 * jobs status filter needs repeat-style arrays — axios's default bracket
 * style is silently ignored by the backend's parser, proven live 2026-09-03)
 * and the per-request abort deadline (RN doesn't reliably honor axios's
 * `timeout` on a stalled connection, proven live 2026-09-14; the deadline
 * must abort at API_TIMEOUT and classify as TIMEOUT, not CANCELLED — an
 * abort-filtering caller would otherwise spin a loading screen forever).
 */
import { API_BASE_URL, API_TIMEOUT } from '../src/config';
import { apiClient } from '../src/services/api/apiClient';

it('serializes array params repeat-style, not bracket-style', () => {
  expect(
    apiClient.getUri({
      url: '/jobs',
      params: { status: ['scheduled', 'in_progress'] },
    }),
  ).toBe(`${API_BASE_URL}/jobs?status=scheduled&status=in_progress`);
});

it('keeps plain params and drops null, undefined and empty-array params', () => {
  expect(
    apiClient.getUri({
      url: '/jobs',
      params: { limit: 10, date: undefined, cursor: null, status: [] },
    }),
  ).toBe(`${API_BASE_URL}/jobs?limit=10`);
});

/**
 * An adapter that honors the request signal the way RN's real networking
 * stack does: when the signal aborts, the request rejects cancel-shaped
 * (ERR_CANCELED with the config attached — the shape axios's own xhr adapter
 * produces). A custom adapter is required because the deadline only works if
 * something watches the signal; a never-settling adapter would prove nothing.
 */
function signalHonoringAdapter(config: {
  signal?: AbortSignal;
}): Promise<never> {
  return new Promise((_, reject) => {
    config.signal?.addEventListener('abort', () => {
      const error = Object.assign(new Error('canceled'), {
        code: 'ERR_CANCELED',
        config,
      });
      reject(error);
    });
  });
}

describe('per-request abort deadline', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('aborts a stalled request at the deadline and classifies it TIMEOUT, not CANCELLED', async () => {
    jest.useFakeTimers();
    const request = apiClient.get('/jobs', {
      adapter: signalHonoringAdapter as never,
    });

    // The deadline hasn't fired yet — the request is still in flight.
    await jest.advanceTimersByTimeAsync(API_TIMEOUT - 1);
    let settled = false;
    request.catch(() => {}).finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    // Firing the deadline aborts and surfaces the rejection as a TIMEOUT
    // ApiError — deliberately NOT `CANCELLED`, which abort-filtering callers
    // (isAbort) ignore as the app's own doing.
    await jest.advanceTimersByTimeAsync(1);
    await expect(request).rejects.toMatchObject({
      status: 0,
      code: 'TIMEOUT',
      message: 'The request took too long. Check your connection and try again.',
    });
  });

  it('a caller-supplied abort is still CANCELLED — the deadline stamp is deadline-only', async () => {
    jest.useFakeTimers();
    const caller = new AbortController();

    const request = apiClient.get('/jobs', {
      adapter: signalHonoringAdapter as never,
      signal: caller.signal,
    });

    await actAbort(caller);
    await expect(request).rejects.toMatchObject({ status: 0, code: 'CANCELLED' });
  });

  it('a caller signal already aborted before dispatch rejects CANCELLED immediately', async () => {
    const caller = new AbortController();
    caller.abort();

    const request = apiClient.get('/jobs', {
      adapter: signalHonoringAdapter as never,
      signal: caller.signal,
    });

    await expect(request).rejects.toMatchObject({ status: 0, code: 'CANCELLED' });
  });

  it('a completed request clears its deadline — no abort fires after a response', async () => {
    jest.useFakeTimers();
    const adapter = () => Promise.resolve({ data: {}, status: 200 });

    const request = apiClient.get('/jobs', { adapter: adapter as never });
    await expect(request).resolves.toMatchObject({ status: 200 });

    // The settled request's deadline timer must be gone: advancing past the
    // deadline does not turn the settled request into a rejection (it would
    // surface as an unhandled abort from a detached controller otherwise).
    await jest.advanceTimersByTimeAsync(API_TIMEOUT + 1000);
    await expect(request).resolves.toMatchObject({ status: 200 });
  });
});

/** Aborts outside act-like microtask timing, then lets the rejection flush. */
async function actAbort(controller: AbortController): Promise<void> {
  controller.abort();
  await Promise.resolve();
}
