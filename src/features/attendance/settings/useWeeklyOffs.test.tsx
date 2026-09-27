/**
 * Tests for useWeeklyOffs (Story 15-6): focus refetch, error surface, save
 * re-fetch + error path, saveError lifecycle, and the refresh() action.
 * Mirrors `useOffices.test.tsx`'s latest-wins guard pattern so a slow
 * earlier refetch can't clobber a newer one.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../services', () => ({
  weeklyOffsService: {
    getDefault: jest.fn(),
    setDefault: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { useFocusEffect } from '@react-navigation/native';
import { weeklyOffsService } from '../../../services';
import type { WeeklyOffDefaultResponse } from '../../../services';
import { useWeeklyOffs } from './useWeeklyOffs';

const svc = weeklyOffsService as unknown as {
  getDefault: jest.Mock;
  setDefault: jest.Mock;
};
const useFocusEffectMock = useFocusEffect as unknown as jest.Mock;

let probe: ReturnType<typeof useWeeklyOffs>;
function Probe() {
  probe = useWeeklyOffs();
  return null;
}
function renderProbe() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe />);
  });
  return renderer;
}
function fireFocus() {
  expect(useFocusEffectMock).toHaveBeenCalled();
  const effect = useFocusEffectMock.mock.calls.at(-1)?.[0] as () => void;
  // Inside act: the effect kicks off the fetch chain, whose first state
  // write (setIsLoading) must land in the act scope or React logs a
  // not-wrapped warning for every focus.
  act(() => {
    effect();
  });
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
  jest.resetAllMocks();
});

function apiError() {
  return { status: 500, code: 'INTERNAL', message: 'boom', details: null };
}
function view(days: number[], validFrom: string) {
  return { days, validFrom, validTo: null };
}

describe('initial fetch', () => {
  it('focus fires the GET and exposes default/next/history', async () => {
    const payload = {
      default: view([7], '2026-09-27'),
      next: view([6, 7], '2026-09-28'),
      history: [
        view([7], '2026-09-27'),
        view([6, 7], '2026-09-28'),
      ],
    };
    svc.getDefault.mockResolvedValueOnce(payload);
    renderProbe();
    await focusAndFlush();

    expect(probe.defaultView).toEqual(payload.default);
    expect(probe.nextView).toEqual(payload.next);
    expect(probe.history).toEqual(payload.history);
    expect(probe.hasLoaded).toBe(true);
    expect(probe.isLoading).toBe(false);
    expect(probe.error).toBeNull();
  });

  it('surfaces an ApiError WITHOUT clearing the previous rows', async () => {
    svc.getDefault.mockResolvedValueOnce({ default: view([7], '2026-09-27'), next: null, history: [] });
    renderProbe();
    await focusAndFlush();

    const err = apiError();
    svc.getDefault.mockRejectedValueOnce(err);
    await focusAndFlush();

    expect(probe.error).toBe(err);
    expect(probe.defaultView).toEqual(view([7], '2026-09-27'));
    expect(probe.isLoading).toBe(false);
  });

  it('a FIRST-fetch rejection leaves hasLoaded=false', async () => {
    svc.getDefault.mockRejectedValueOnce(apiError());
    renderProbe();
    await focusAndFlush();

    expect(probe.error).not.toBeNull();
    expect(probe.hasLoaded).toBe(false);
    expect(probe.defaultView).toBeNull();
  });
});

describe('focus refresh', () => {
  it('every focus refetches', async () => {
    svc.getDefault.mockResolvedValue({ default: null, next: null, history: [] });
    renderProbe();
    await focusAndFlush();
    await focusAndFlush();
    await focusAndFlush();
    expect(svc.getDefault).toHaveBeenCalledTimes(3);
  });

  it('refresh() forces another GET', async () => {
    svc.getDefault.mockResolvedValue({ default: null, next: null, history: [] });
    renderProbe();
    await focusAndFlush();

    act(() => {
      probe.refresh();
    });
    await flush();

    expect(svc.getDefault).toHaveBeenCalledTimes(2);
  });
});

describe('saveDefault', () => {
  it('on success: PUT fires, the GET re-fetch canonicalises the rows, isSaving flips back, saveError stays null', async () => {
    svc.getDefault.mockResolvedValueOnce({ default: null, next: null, history: [] });
    renderProbe();
    await focusAndFlush();

    // The PUT echo and the canonical GET the save re-fetches (15-6 review
    // P5): the re-fetched GET is what the hook keeps, so a stale in-flight
    // focus GET can never overwrite what was just saved.
    const saved = {
      default: view([1, 7], '2026-09-27'),
      next: null,
      history: [view([1, 7], '2026-09-27')],
    };
    svc.setDefault.mockResolvedValueOnce(saved);
    svc.getDefault.mockResolvedValueOnce(saved);

    await act(async () => {
      await probe.saveDefault({ days: [1, 7], effectiveFrom: '2026-09-27' });
    });

    expect(svc.setDefault).toHaveBeenCalledWith({
      days: [1, 7],
      effectiveFrom: '2026-09-27',
    });
    // Focus GET + the save's own re-fetch.
    expect(svc.getDefault).toHaveBeenCalledTimes(2);
    expect(probe.defaultView).toEqual(saved.default);
    expect(probe.isSaving).toBe(false);
    expect(probe.saveError).toBeNull();
  });

  it('on success with a FAILED re-fetch, the PUT echo is seeded and the save is not masked as failed', async () => {
    svc.getDefault.mockResolvedValueOnce({ default: null, next: null, history: [] });
    renderProbe();
    await focusAndFlush();

    const saved = {
      default: view([2], '2026-09-27'),
      next: null,
      history: [view([2], '2026-09-27')],
    };
    svc.setDefault.mockResolvedValueOnce(saved);
    svc.getDefault.mockRejectedValueOnce(apiError());

    let returned: WeeklyOffDefaultResponse | null = null;
    await act(async () => {
      returned = await probe.saveDefault({ days: [2] });
    });

    // The write SUCCEEDED, so a refresh-only failure must not render the
    // screen's load-error banner ("Couldn't refresh weekly off. Showing
    // the last loaded selection."): that banner would claim the shown rows
    // are stale when they are in fact the just-saved echo. The old
    // expectation here (`error` non-null) was wrong about the requirement —
    // it pinned the post-save refetch failure as a load error. The echo is
    // now seeded under the seq guard instead (15-6 review iteration 1, the
    // P9 follow-up), and `saveError` stays null because the save worked.
    expect(returned).toEqual(saved);
    expect(probe.defaultView).toEqual(saved.default);
    expect(probe.hasLoaded).toBe(true);
    expect(probe.error).toBeNull();
    expect(probe.saveError).toBeNull();
    expect(probe.isSaving).toBe(false);
  });

  it('on failure: saveError surfaces, the hook rethrows, isSaving flips back, rows stay', async () => {
    svc.getDefault.mockResolvedValueOnce({ default: view([7], '2026-09-27'), next: null, history: [] });
    renderProbe();
    await focusAndFlush();

    const err = { status: 422, code: 'VALIDATION_ERROR', message: 'bad', details: null };
    svc.setDefault.mockRejectedValueOnce(err);

    await act(async () => {
      await expect(
        probe.saveDefault({ days: [1, 2, 3, 4, 5, 6, 7] }),
      ).rejects.toBe(err);
    });

    expect(probe.saveError).toBe(err);
    expect(probe.isSaving).toBe(false);
    // Rows are NOT cleared on a failed save — the form stays populated.
    expect(probe.defaultView).toEqual(view([7], '2026-09-27'));
  });
});

describe('latest-wins guard', () => {
  it('a slow earlier refetch does not overwrite a newer one', async () => {
    let resolveFirst!: (v: unknown) => void;
    svc.getDefault.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );
    svc.getDefault.mockResolvedValueOnce({
      default: view([2], '2026-09-27'),
      next: null,
      history: [view([2], '2026-09-27')],
    });
    renderProbe();

    fireFocus();
    fireFocus();
    await act(async () => {
      await flush();
    });
    expect(probe.defaultView).toEqual(view([2], '2026-09-27'));

    await act(async () => {
      resolveFirst({
        default: view([3], '2026-09-27'),
        next: null,
        history: [view([3], '2026-09-27')],
      });
      await flush();
    });
    // The newer rows win.
    expect(probe.defaultView).toEqual(view([2], '2026-09-27'));
  });
});
