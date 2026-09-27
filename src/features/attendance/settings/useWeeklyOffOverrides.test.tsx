/**
 * Tests for useWeeklyOffOverrides (Story 15-6): focus refetch, error
 * surface, the save/remove actions re-fetching the list, and the
 * latest-wins guard.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../services', () => ({
  weeklyOffsService: {
    listOverrides: jest.fn(),
    setOverride: jest.fn(),
    removeOverride: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { useFocusEffect } from '@react-navigation/native';
import { weeklyOffsService } from '../../../services';
import { useWeeklyOffOverrides } from './useWeeklyOffOverrides';

const svc = weeklyOffsService as unknown as {
  listOverrides: jest.Mock;
  setOverride: jest.Mock;
  removeOverride: jest.Mock;
};
const useFocusEffectMock = useFocusEffect as unknown as jest.Mock;

let probe: ReturnType<typeof useWeeklyOffOverrides>;
function Probe() {
  probe = useWeeklyOffOverrides();
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
  jest.resetAllMocks();
});

function apiError() {
  return { status: 500, code: 'INTERNAL', message: 'boom', details: null };
}
function override(employeeId: string, name: string, days: number[]) {
  return {
    employeeId,
    employeeName: name,
    current: { days, validFrom: '2026-09-27', validTo: null },
    next: null,
  };
}

describe('initial fetch', () => {
  it('focus fires the GET and exposes the list', async () => {
    svc.listOverrides.mockResolvedValueOnce([override('e1', 'A', [5])]);
    renderProbe();
    await focusAndFlush();

    expect(probe.overrides).toHaveLength(1);
    expect(probe.overrides[0].employeeId).toBe('e1');
    expect(probe.hasLoaded).toBe(true);
    expect(probe.error).toBeNull();
  });

  it('a fetch error preserves previous rows', async () => {
    svc.listOverrides.mockResolvedValueOnce([override('e1', 'A', [5])]);
    renderProbe();
    await focusAndFlush();

    const err = apiError();
    svc.listOverrides.mockRejectedValueOnce(err);
    await focusAndFlush();

    expect(probe.error).toBe(err);
    expect(probe.overrides).toHaveLength(1);
  });
});

describe('saveOverride', () => {
  it('PUT fires with the employeeId + body, then re-fetches the list', async () => {
    svc.listOverrides.mockResolvedValueOnce([]);
    renderProbe();
    await focusAndFlush();

    const saved = override('e1', 'A', [5]);
    svc.setOverride.mockResolvedValueOnce(saved);
    const refetched = [saved];
    svc.listOverrides.mockResolvedValueOnce(refetched);

    await act(async () => {
      await probe.saveOverride('e1', { days: [5], effectiveFrom: '2026-09-27' });
    });

    expect(svc.setOverride).toHaveBeenCalledWith('e1', {
      days: [5],
      effectiveFrom: '2026-09-27',
    });
    expect(svc.listOverrides).toHaveBeenCalledTimes(2); // initial + post-save
    expect(probe.overrides).toEqual(refetched);
    expect(probe.saveError).toBeNull();
  });

  it('on failure: saveError surfaces, the hook rethrows, list stays', async () => {
    svc.listOverrides.mockResolvedValueOnce([override('e1', 'A', [5])]);
    renderProbe();
    await focusAndFlush();

    const err = { status: 404, code: 'ATTENDANCE_EMPLOYEE_NOT_FOUND', message: 'no such employee', details: null };
    svc.setOverride.mockRejectedValueOnce(err);

    await act(async () => {
      await expect(
        probe.saveOverride('ghost', { days: [5] }),
      ).rejects.toBe(err);
    });

    expect(probe.saveError).toBe(err);
    expect(probe.overrides).toEqual([override('e1', 'A', [5])]);
  });

  it('a FAILED post-save refetch never masks the successful write (best-effort revalidate)', async () => {
    // 15-6 review iteration 1 (P2): the write succeeded, so the sheet must
    // close and report success even when the revalidation GET fails — a
    // throw here would leave the sheet open and a retry would re-PUT an
    // already-persisted change.
    svc.listOverrides.mockResolvedValueOnce([]);
    renderProbe();
    await focusAndFlush();

    const saved = override('e1', 'A', [5]);
    svc.setOverride.mockResolvedValueOnce(saved);
    svc.listOverrides.mockRejectedValueOnce(apiError());

    let returned: unknown;
    await act(async () => {
      returned = await probe.saveOverride('e1', { days: [5] });
    });

    expect(returned).toEqual(saved);
    expect(probe.saveError).toBeNull();
  });
});

describe('removeOverride', () => {
  it('DELETE fires, then re-fetches the list', async () => {
    const seeded = [override('e1', 'A', [5])];
    svc.listOverrides.mockResolvedValueOnce(seeded);
    renderProbe();
    await focusAndFlush();

    svc.removeOverride.mockResolvedValueOnce(undefined);
    svc.listOverrides.mockResolvedValueOnce([]);

    await act(async () => {
      await probe.removeOverride('e1');
    });

    expect(svc.removeOverride).toHaveBeenCalledWith('e1', undefined);
    expect(probe.overrides).toEqual([]);
  });

  it('forwards the effectiveFrom query when supplied (a future-dated edit)', async () => {
    svc.listOverrides.mockResolvedValueOnce([]);
    renderProbe();
    await focusAndFlush();

    svc.removeOverride.mockResolvedValueOnce(undefined);
    svc.listOverrides.mockResolvedValueOnce([]);

    await act(async () => {
      await probe.removeOverride('e1', '2026-10-15');
    });

    expect(svc.removeOverride).toHaveBeenCalledWith('e1', '2026-10-15');
  });

  it('on failure: saveError surfaces, the hook rethrows', async () => {
    svc.listOverrides.mockResolvedValueOnce([]);
    renderProbe();
    await focusAndFlush();

    const err = { status: 404, code: 'ATTENDANCE_EMPLOYEE_NOT_FOUND', message: 'no', details: null };
    svc.removeOverride.mockRejectedValueOnce(err);

    await act(async () => {
      await expect(probe.removeOverride('ghost')).rejects.toBe(err);
    });

    expect(probe.saveError).toBe(err);
  });

  it('a FAILED post-save refetch never masks the successful delete (best-effort revalidate)', async () => {
    // A DELETE retry after a refetch failure would 404 on the
    // already-removed row — the write success must close out regardless.
    svc.listOverrides.mockResolvedValueOnce([override('e1', 'A', [5])]);
    renderProbe();
    await focusAndFlush();

    svc.removeOverride.mockResolvedValueOnce(undefined);
    svc.listOverrides.mockRejectedValueOnce(apiError());

    await act(async () => {
      await probe.removeOverride('e1');
    });

    expect(probe.saveError).toBeNull();
  });
});

describe('clearSaveError', () => {
  it('drops a held saveError (the sheet host calls it on every sheet open)', async () => {
    // 15-6 review iteration 1 (P3): the sheet is conditionally mounted, so
    // a saveError left over from a previous open must be clearable — the
    // stale error used to render in (and re-key its 409 onto) every later
    // open.
    svc.listOverrides.mockResolvedValueOnce([]);
    renderProbe();
    await focusAndFlush();

    const err = { status: 404, code: 'ATTENDANCE_EMPLOYEE_NOT_FOUND', message: 'no', details: null };
    svc.setOverride.mockRejectedValueOnce(err);
    await act(async () => {
      await expect(probe.saveOverride('ghost', { days: [5] })).rejects.toBe(err);
    });
    expect(probe.saveError).toBe(err);

    act(() => {
      probe.clearSaveError();
    });
    expect(probe.saveError).toBeNull();
  });
});

describe('latest-wins guard', () => {
  it('a slow earlier refetch does not overwrite a newer one', async () => {
    // Mirrors the sibling useHolidays / useWeeklyOffs case: the focus
    // refetch and a save-triggered refetch can overlap, and an out-of-order
    // response must never win.
    let resolveFirst!: (v: unknown) => void;
    svc.listOverrides.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );
    svc.listOverrides.mockResolvedValueOnce([override('e2', 'B', [6])]);
    renderProbe();

    fireFocus();
    fireFocus();
    await act(async () => {
      await flush();
    });
    expect(probe.overrides.map((o) => o.employeeId)).toEqual(['e2']);

    await act(async () => {
      resolveFirst([override('stale', 'Old', [5])]);
      await flush();
    });
    expect(probe.overrides.map((o) => o.employeeId)).toEqual(['e2']);
  });
});
