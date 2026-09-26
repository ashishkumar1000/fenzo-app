/**
 * Tests for useOffices: the split into active/archived groups (archivedAt
 * as the discriminator), the error surface, focus ALWAYS refetching (no
 * throttle — a 15-4 review decision: the form-return path has no other
 * refresh), the latest-wins guard keeping a slow earlier refetch from
 * overwriting a newer one, and `refresh()`. `officesService` is mocked at
 * the `services` barrel, same convention as the other hooks.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../services', () => ({
  officesService: {
    list: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { useFocusEffect } from '@react-navigation/native';
import { officesService } from '../../../services';
import { useOffices } from './useOffices';

const list = officesService.list as jest.Mock;
const useFocusEffectMock = useFocusEffect as jest.Mock;

function office(id: string, archived: boolean) {
  return {
    id,
    name: `Office ${id}`,
    latitude: 19.1,
    longitude: 72.8,
    radiusM: 100,
    archivedAt: archived ? '2026-09-20T00:00:00Z' : null,
    rule: null,
    nextRule: null,
  };
}

let probe: ReturnType<typeof useOffices>;
function Probe() {
  probe = useOffices();
  return null;
}

function renderProbe() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe />);
  });
  return renderer;
}

/** Captures the effect the hook registered and runs it like a focus. */
function fireFocus() {
  expect(useFocusEffectMock).toHaveBeenCalled();
  const effect = useFocusEffectMock.mock.calls.at(-1)?.[0] as () => void;
  effect();
}

async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

async function focusAndFlush() {
  fireFocus();
  await act(async () => {
    await flush();
  });
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — an unconsumed
  // mockRejectedValueOnce would leak into the next test's first fetch.
  jest.resetAllMocks();
});

describe('list fetch and split', () => {
  it('fetches the FULL list including archived and splits the groups', async () => {
    list.mockResolvedValueOnce([office('a', false), office('b', true), office('c', false)]);
    renderProbe();

    expect(probe.isLoading).toBe(true);

    await focusAndFlush();

    expect(list).toHaveBeenCalledWith(true);
    expect(probe.offices).toHaveLength(3);
    expect(probe.activeOffices.map((o) => o.id)).toEqual(['a', 'c']);
    expect(probe.archivedOffices.map((o) => o.id)).toEqual(['b']);
    expect(probe.hasLoaded).toBe(true);
    expect(probe.error).toBeNull();
    expect(probe.isLoading).toBe(false);
  });

  it('surfaces the ApiError without clearing previous rows', async () => {
    const apiError = { status: 500, code: 'INTERNAL', message: 'boom', details: null };
    list.mockResolvedValueOnce([office('a', false)]);
    renderProbe();
    await focusAndFlush();

    list.mockRejectedValueOnce(apiError);
    await focusAndFlush();

    expect(probe.error).toBe(apiError);
    expect(probe.offices).toHaveLength(1);
    expect(probe.isLoading).toBe(false);
  });

  it('surfaces a FIRST-fetch rejection as the error state', async () => {
    const apiError = { status: 500, code: 'INTERNAL', message: 'boom', details: null };
    list.mockRejectedValueOnce(apiError);
    renderProbe();

    await focusAndFlush();

    expect(probe.error).toBe(apiError);
    expect(probe.hasLoaded).toBe(false);
    expect(probe.offices).toHaveLength(0);
    expect(probe.isLoading).toBe(false);
  });
});

describe('focus refresh', () => {
  it('every focus refetches — a form-return is never skipped', async () => {
    list.mockResolvedValue([]);
    renderProbe();

    await focusAndFlush();
    await focusAndFlush();
    await focusAndFlush();

    expect(list).toHaveBeenCalledTimes(3);
  });

  it('refresh() re-fetches on demand', async () => {
    list.mockResolvedValue([]);
    renderProbe();
    await focusAndFlush();

    act(() => {
      probe.refresh();
    });
    await flush();

    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe('latest-wins guard', () => {
  it('a slow earlier refetch never overwrites a newer one\'s rows', async () => {
    let resolveFirst!: (rows: ReturnType<typeof office>[]) => void;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    list.mockImplementationOnce(() => first);
    list.mockResolvedValueOnce([office('second', false)]);
    renderProbe();

    fireFocus();
    fireFocus();
    await act(async () => {
      await flush();
    });

    // The second fetch resolved — its rows are the current state.
    expect(probe.offices.map((o) => o.id)).toEqual(['second']);
    expect(probe.isLoading).toBe(false);

    // Only NOW the slow first fetch resolves with different rows.
    await act(async () => {
      resolveFirst([office('stale', false)]);
      await flush();
    });

    expect(probe.offices.map((o) => o.id)).toEqual(['second']);
    expect(probe.error).toBeNull();
  });

  it('a slow earlier refetch failing after a newer success stays silent', async () => {
    let rejectFirst!: (err: unknown) => void;
    const first = new Promise((_, reject) => {
      rejectFirst = reject;
    });
    list.mockImplementationOnce(() => first);
    list.mockResolvedValueOnce([office('second', false)]);
    renderProbe();

    fireFocus();
    fireFocus();
    await act(async () => {
      await flush();
    });
    expect(probe.offices).toHaveLength(1);

    await act(async () => {
      rejectFirst({ status: 500, code: 'INTERNAL', message: 'stale', details: null });
      await flush();
    });

    expect(probe.error).toBeNull();
    expect(probe.offices).toHaveLength(1);
    expect(probe.isLoading).toBe(false);
  });
});
