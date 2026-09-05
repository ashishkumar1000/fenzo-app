/**
 * Tests for useAddressAutosuggest: the below-3-char gate, the ~300ms
 * debounce, session-token reuse across autosuggest AND the terminating
 * resolve call, stale-response discarding, autosuggest-failure retry, and
 * the resolve happy/failure paths — the I/O matrix from
 * spec-1-4-frontend-address-search-screen.md.
 *
 * `placesService` is mocked at the `services` barrel, same convention as
 * `useSkills.test.tsx`. `useDebounce` runs for real, driven by fake timers —
 * `typeAndSettle` advances the clock past the debounce window and flushes
 * the resulting fetch's microtasks.
 */
jest.mock('../../services', () => ({
  placesService: {
    autosuggest: jest.fn(),
    resolve: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { placesService } from '../../services';
import { useAddressAutosuggest } from './useAddressAutosuggest';

const autosuggest = placesService.autosuggest as jest.Mock;
const resolveMock = placesService.resolve as jest.Mock;

function apiError(status: number, code: string, message: string) {
  return { status, code, message, details: null };
}

function suggestion(placeId: string, text: string) {
  return { placeId, text };
}

let probe: ReturnType<typeof useAddressAutosuggest>;
function Probe() {
  probe = useAddressAutosuggest();
  return null;
}

function renderProbe() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe />);
  });
  return renderer;
}

async function flushMicrotasks(times = 4) {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

/** Types a query, lets the ~300ms debounce elapse, then flushes the fetch. */
async function typeAndSettle(text: string) {
  act(() => {
    probe.setQuery(text);
  });
  act(() => {
    jest.advanceTimersByTime(300);
  });
  await act(async () => {
    await flushMicrotasks();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('idle and below-threshold', () => {
  it('is idle when the query is blank', () => {
    renderProbe();
    expect(probe.phase).toBe('idle');
    expect(autosuggest).not.toHaveBeenCalled();
  });

  it('never calls autosuggest for a 1-2 char query and shows below-threshold', async () => {
    renderProbe();
    await typeAndSettle('an');
    expect(autosuggest).not.toHaveBeenCalled();
    expect(probe.phase).toBe('below-threshold');
  });
});

describe('debounce', () => {
  it('does not fire before the ~300ms window elapses', () => {
    renderProbe();
    act(() => {
      probe.setQuery('and');
    });
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(autosuggest).not.toHaveBeenCalled();
  });

  it('fires once ~300ms after the last keystroke and renders results', async () => {
    autosuggest.mockResolvedValueOnce([suggestion('p1', 'Andheri West, Mumbai')]);
    renderProbe();
    await typeAndSettle('and');
    expect(autosuggest).toHaveBeenCalledTimes(1);
    expect(probe.phase).toBe('results');
    expect(probe.suggestions).toEqual([suggestion('p1', 'Andheri West, Mumbai')]);
  });
});

describe('session token', () => {
  it('reuses the same token for every autosuggest call and the terminating resolve call', async () => {
    autosuggest.mockResolvedValue([suggestion('p1', 'Andheri West')]);
    resolveMock.mockResolvedValueOnce({
      placeId: 'p1',
      formattedAddress: 'Andheri West, Mumbai, Maharashtra 400058, India',
      city: 'Mumbai',
      pincode: '400058',
      latitude: 19.1,
      longitude: 72.8,
    });
    renderProbe();

    await typeAndSettle('and');
    await typeAndSettle('andh');
    expect(autosuggest).toHaveBeenCalledTimes(2);

    const [, firstToken] = autosuggest.mock.calls[0];
    const [, secondToken] = autosuggest.mock.calls[1];
    expect(typeof firstToken).toBe('string');
    expect(firstToken).toBe(secondToken);

    await act(async () => {
      await probe.resolvePlace('p1');
    });
    const [, resolveToken] = resolveMock.mock.calls[0];
    expect(resolveToken).toBe(firstToken);
  });
});

describe('stale response discarding', () => {
  it('only ever renders the latest query’s results, even if an older request settles late', async () => {
    let resolveFirst!: (v: unknown) => void;
    autosuggest.mockImplementationOnce(() => new Promise(res => (resolveFirst = res)));
    renderProbe();

    act(() => {
      probe.setQuery('and');
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      await flushMicrotasks();
    });
    expect(autosuggest).toHaveBeenCalledTimes(1);

    // Query changes again before the first request settles.
    autosuggest.mockResolvedValueOnce([suggestion('p2', 'Andheri East')]);
    await typeAndSettle('andheri e');
    expect(autosuggest).toHaveBeenCalledTimes(2);
    expect(probe.suggestions).toEqual([suggestion('p2', 'Andheri East')]);

    // The stale first request finally resolves — must not overwrite.
    await act(async () => {
      resolveFirst([suggestion('p1', 'Andheri West')]);
      await flushMicrotasks();
    });
    expect(probe.suggestions).toEqual([suggestion('p2', 'Andheri East')]);
    expect(probe.phase).toBe('results');
  });
});

describe('no results', () => {
  it('shows no-results when the query matches nothing', async () => {
    autosuggest.mockResolvedValueOnce([]);
    renderProbe();
    await typeAndSettle('zzz');
    expect(probe.phase).toBe('no-results');
    expect(probe.suggestions).toEqual([]);
  });
});

describe('autosuggest failure', () => {
  it('surfaces the ApiError message, and retry re-fires the same query', async () => {
    autosuggest.mockRejectedValueOnce(
      apiError(502, 'PLACES_UPSTREAM_ERROR', 'Places is unavailable right now'),
    );
    renderProbe();
    await typeAndSettle('and');
    expect(probe.phase).toBe('error');
    expect(probe.errorMessage).toBe('Places is unavailable right now');

    autosuggest.mockResolvedValueOnce([suggestion('p1', 'Andheri West')]);
    await act(async () => {
      probe.retry();
      await flushMicrotasks();
    });
    expect(autosuggest).toHaveBeenCalledTimes(2);
    expect(autosuggest.mock.calls[1][0]).toBe('and');
    expect(probe.phase).toBe('results');
  });
});

describe('resolve', () => {
  const resolved = {
    placeId: 'p1',
    formattedAddress: 'Andheri West, Mumbai, Maharashtra 400058, India',
    city: 'Mumbai',
    pincode: '400058',
    latitude: 19.1364,
    longitude: 72.8296,
  };

  it('happy path: row disabled/spinning while in flight, returns the resolved place after', async () => {
    autosuggest.mockResolvedValueOnce([suggestion('p1', 'Andheri West')]);
    resolveMock.mockResolvedValueOnce(resolved);
    renderProbe();
    await typeAndSettle('and');

    let pending!: Promise<unknown>;
    act(() => {
      pending = probe.resolvePlace('p1');
    });
    expect(probe.phase).toBe('resolving');
    expect(probe.resolvingPlaceId).toBe('p1');

    let result: unknown;
    await act(async () => {
      result = await pending;
    });
    expect(result).toEqual(resolved);
    expect(probe.resolvingPlaceId).toBeNull();
  });

  it('failure: resolve-failed banner over the still-intact list', async () => {
    autosuggest.mockResolvedValueOnce([suggestion('p1', 'Andheri West')]);
    resolveMock.mockRejectedValueOnce(
      apiError(502, 'PLACES_UPSTREAM_ERROR', 'Unable to resolve the selected address right now'),
    );
    renderProbe();
    await typeAndSettle('and');

    let result: unknown;
    await act(async () => {
      result = await probe.resolvePlace('p1');
    });
    expect(result).toBeNull();
    expect(probe.phase).toBe('resolve-failed');
    expect(probe.errorMessage).toBe('Unable to resolve the selected address right now');
    expect(probe.suggestions).toEqual([suggestion('p1', 'Andheri West')]);
    expect(probe.resolvingPlaceId).toBeNull();
  });
});
