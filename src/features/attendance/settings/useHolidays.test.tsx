/**
 * Tests for useHolidays (Story 15-6): focus refetch, error surface, the
 * CRUD actions (create/update/remove) re-fetching the list, the impact()
 * one-shot passthrough, and the latest-wins guard.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../services', () => ({
  holidaysService: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    impact: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { useFocusEffect } from '@react-navigation/native';
import { holidaysService } from '../../../services';
import { useHolidays } from './useHolidays';

const svc = holidaysService as unknown as {
  list: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  remove: jest.Mock;
  impact: jest.Mock;
};
const useFocusEffectMock = useFocusEffect as unknown as jest.Mock;

let probe: ReturnType<typeof useHolidays>;
function Probe() {
  probe = useHolidays();
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

function holiday(id: string, date: string, name: string) {
  return { id, date, name };
}
function apiError() {
  return { status: 500, code: 'INTERNAL', message: 'boom', details: null };
}

describe('initial fetch', () => {
  it('focus fires the GET and exposes the list', async () => {
    svc.list.mockResolvedValueOnce([holiday('h1', '2026-10-02', 'Gandhi Jayanti')]);
    renderProbe();
    await focusAndFlush();

    expect(probe.holidays).toHaveLength(1);
    expect(probe.holidays[0].id).toBe('h1');
    expect(probe.hasLoaded).toBe(true);
    expect(probe.error).toBeNull();
  });

  it('a fetch error preserves previous rows', async () => {
    svc.list.mockResolvedValueOnce([holiday('h1', '2026-10-02', 'Gandhi Jayanti')]);
    renderProbe();
    await focusAndFlush();

    const err = apiError();
    svc.list.mockRejectedValueOnce(err);
    await focusAndFlush();

    expect(probe.error).toBe(err);
    expect(probe.holidays).toHaveLength(1);
  });
});

describe('create', () => {
  it('POST fires, then re-fetches the list', async () => {
    svc.list.mockResolvedValueOnce([]);
    renderProbe();
    await focusAndFlush();

    const created = holiday('h2', '2026-11-08', 'Diwali');
    svc.create.mockResolvedValueOnce(created);
    svc.list.mockResolvedValueOnce([created]);

    await act(async () => {
      await probe.create({ date: '2026-11-08', name: 'Diwali' });
    });

    expect(svc.create).toHaveBeenCalledWith({ date: '2026-11-08', name: 'Diwali' });
    expect(svc.list).toHaveBeenCalledTimes(2);
    expect(probe.holidays).toEqual([created]);
  });

  it('on failure: saveError surfaces, the hook rethrows, list stays', async () => {
    svc.list.mockResolvedValueOnce([holiday('h1', '2026-10-02', 'X')]);
    renderProbe();
    await focusAndFlush();

    const err = { status: 409, code: 'ATTENDANCE_HOLIDAY_TAKEN', message: 'taken', details: null };
    svc.create.mockRejectedValueOnce(err);

    await act(async () => {
      await expect(probe.create({ date: '2026-10-02', name: 'X' })).rejects.toBe(err);
    });

    expect(probe.saveError).toBe(err);
    expect(probe.holidays).toEqual([holiday('h1', '2026-10-02', 'X')]);
  });

  it('a FAILED post-save refetch never masks the successful create (best-effort revalidate)', async () => {
    // 15-6 review iteration 1 (P2): the write succeeded, so the sheet must
    // close and report success even when the revalidation GET fails — a
    // retry would POST an already-created holiday and 409 for real.
    svc.list.mockResolvedValueOnce([]);
    renderProbe();
    await focusAndFlush();

    const created = holiday('h2', '2026-11-08', 'Diwali');
    svc.create.mockResolvedValueOnce(created);
    svc.list.mockRejectedValueOnce(apiError());

    let returned: unknown;
    await act(async () => {
      returned = await probe.create({ date: '2026-11-08', name: 'Diwali' });
    });

    expect(returned).toEqual(created);
    expect(probe.saveError).toBeNull();
  });
});

describe('update', () => {
  it('PATCH fires with id + name-only body (date is immutable), then re-fetches', async () => {
    svc.list.mockResolvedValueOnce([holiday('h1', '2026-10-02', 'Old')]);
    renderProbe();
    await focusAndFlush();

    const updated = holiday('h1', '2026-10-02', 'New');
    svc.update.mockResolvedValueOnce(updated);
    svc.list.mockResolvedValueOnce([updated]);

    await act(async () => {
      await probe.update('h1', { name: 'New' });
    });

    expect(svc.update).toHaveBeenCalledWith('h1', { name: 'New' });
    expect(probe.holidays).toEqual([updated]);
  });
});

describe('remove', () => {
  it('DELETE fires, then re-fetches', async () => {
    const seeded = [holiday('h1', '2026-10-02', 'X')];
    svc.list.mockResolvedValueOnce(seeded);
    renderProbe();
    await focusAndFlush();

    svc.remove.mockResolvedValueOnce(undefined);
    svc.list.mockResolvedValueOnce([]);

    await act(async () => {
      await probe.remove('h1');
    });

    expect(svc.remove).toHaveBeenCalledWith('h1');
    expect(probe.holidays).toEqual([]);
  });

  it('a 404 keeps the row (the screen surfaces an inline error)', async () => {
    const seeded = [holiday('h1', '2026-10-02', 'X')];
    svc.list.mockResolvedValueOnce(seeded);
    renderProbe();
    await focusAndFlush();

    const err = { status: 404, code: 'ATTENDANCE_HOLIDAY_NOT_FOUND', message: 'gone', details: null };
    svc.remove.mockRejectedValueOnce(err);

    await act(async () => {
      await expect(probe.remove('h1')).rejects.toBe(err);
    });

    expect(probe.saveError).toBe(err);
    // The list is NOT mutated on a failed delete — the screen keeps the row.
    expect(probe.holidays).toEqual(seeded);
  });

  it('a FAILED post-save refetch never masks the successful delete (best-effort revalidate)', async () => {
    // A DELETE retry after a refetch failure would 404 on the
    // already-removed row — the write success must close out regardless.
    svc.list.mockResolvedValueOnce([holiday('h1', '2026-10-02', 'X')]);
    renderProbe();
    await focusAndFlush();

    svc.remove.mockResolvedValueOnce(undefined);
    svc.list.mockRejectedValueOnce(apiError());

    await act(async () => {
      await probe.remove('h1');
    });

    expect(probe.saveError).toBeNull();
  });
});

describe('clearSaveError', () => {
  it('drops a held saveError (the screen calls it on every sheet open)', async () => {
    // 15-6 review iteration 1 (P3): the sheet is conditionally mounted, so
    // a saveError left over from a previous open must be clearable — the
    // stale error used to render in (and re-key its 409 onto) every later
    // open, re-bricking the surface.
    svc.list.mockResolvedValueOnce([]);
    renderProbe();
    await focusAndFlush();

    const err = { status: 409, code: 'ATTENDANCE_HOLIDAY_TAKEN', message: 'taken', details: null };
    svc.create.mockRejectedValueOnce(err);
    await act(async () => {
      await expect(probe.create({ date: '2026-10-02', name: 'X' })).rejects.toBe(err);
    });
    expect(probe.saveError).toBe(err);

    act(() => {
      probe.clearSaveError();
    });
    expect(probe.saveError).toBeNull();
  });
});

describe('impact', () => {
  it('passes through to the service with the date', async () => {
    svc.list.mockResolvedValueOnce([]);
    renderProbe();
    await focusAndFlush();

    const impact = { date: '2026-10-02', affectedEmployees: [{ employeeId: 'e1', employeeName: 'A' }] };
    svc.impact.mockResolvedValueOnce(impact);

    await act(async () => {
      await probe.impact('2026-10-02');
    });

    expect(svc.impact).toHaveBeenCalledWith('2026-10-02');
  });
});

describe('latest-wins guard', () => {
  it('a slow earlier refetch does not overwrite a newer one', async () => {
    let resolveFirst!: (v: unknown) => void;
    svc.list.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );
    svc.list.mockResolvedValueOnce([holiday('second', '2026-10-02', 'S')]);
    renderProbe();

    fireFocus();
    fireFocus();
    await act(async () => {
      await flush();
    });
    expect(probe.holidays.map((h) => h.id)).toEqual(['second']);

    await act(async () => {
      resolveFirst([holiday('stale', '2026-10-02', 'X')]);
      await flush();
    });
    expect(probe.holidays.map((h) => h.id)).toEqual(['second']);
  });
});
