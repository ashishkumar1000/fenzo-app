/**
 * Tests for the useSkills shared store (story 5.1): alphabetical insert on
 * add, optimistic delete with rollback on failure, a 404 delete that stays
 * removed (the skill is already gone server-side), and the 409 duplicate
 * rejection surfacing to the caller so the sheet can keep itself open.
 * Mutations and `clearSkills` also invalidate in-flight/stale GETs, so a
 * late response can never overwrite or resurrect newer state.
 *
 * The skills service is mocked at the `services` barrel — the store only
 * ever talks to `skillService.list/create/remove`.
 */
jest.mock('../../services', () => ({
  skillService: {
    list: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { skillService } from '../../services';
import { clearSkills, loadSkills, removeSkill, addSkill, useSkills } from './useSkills';
import type { Skill } from '../../services';

const list = skillService.list as jest.Mock;
const createSkill = skillService.create as jest.Mock;
const remove = skillService.remove as jest.Mock;

function apiError(status: number, code: string, message: string) {
  return { status, code, message, details: null };
}

function skill(id: string, name: string): Skill {
  return { id, name, tenantId: 'tenant-1', createdAt: '2026-08-01T06:00:00.000Z' };
}

// The hook is the only public reader of the store state, so tests probe it
// through a component — same shape a screen would consume.
let probe: ReturnType<typeof useSkills>;
function Probe() {
  probe = useSkills();
  return null;
}

function renderProbe() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe />);
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearSkills();
});

describe('loadSkills', () => {
  it('fetches the list and marks hasLoaded', async () => {
    list.mockResolvedValueOnce([skill('s1', 'Drilling')]);
    const renderer = renderProbe();
    await act(async () => {
      await loadSkills();
    });
    expect(probe.skills.map(s => s.name)).toEqual(['Drilling']);
    expect(probe.hasLoaded).toBe(true);
    expect(probe.error).toBeNull();
    expect(renderer).toBeTruthy();
  });

  it('joins an in-flight request instead of firing a second GET', async () => {
    let resolveList!: (v: Skill[]) => void;
    list.mockImplementationOnce(() => new Promise<Skill[]>(res => (resolveList = res)));
    renderProbe();
    const first = loadSkills();
    const second = loadSkills();
    await act(async () => {
      resolveList([]);
      await Promise.all([first, second]);
    });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('surfaces a fetch failure as an error message', async () => {
    list.mockRejectedValueOnce(apiError(500, 'REQUEST_ERROR', 'Something went wrong'));
    renderProbe();
    await act(async () => {
      await loadSkills();
    });
    expect(probe.error).toBe('Something went wrong');
    expect(probe.hasLoaded).toBe(true);
  });
});

describe('addSkill', () => {
  it('inserts the created skill alphabetically (case-insensitive)', async () => {
    list.mockResolvedValueOnce([skill('s2', 'drilling'), skill('s1', 'Wiring')]);
    renderProbe();
    await act(async () => {
      await loadSkills();
    });

    const created = skill('s3', 'AC repair');
    createSkill.mockResolvedValueOnce(created);
    await act(async () => {
      await addSkill('AC repair');
    });

    expect(createSkill).toHaveBeenCalledWith({ name: 'AC repair' });
    expect(probe.skills.map(s => s.name)).toEqual(['AC repair', 'drilling', 'Wiring']);
  });

  it('rethrows the ApiError so the sheet can show the 409 copy and stay open', async () => {
    const dup = apiError(409, 'DUPLICATE_RESOURCE', 'A skill with this name already exists for your company');
    createSkill.mockRejectedValueOnce(dup);
    let caught: unknown;
    await act(async () => {
      caught = await addSkill('AC repair').catch(e => e);
    });
    expect(caught).toBe(dup);
    expect(probe.skills).toEqual([]);
  });

  it('does not let a GET that started before addSkill overwrite the mutation', async () => {
    // A GET hangs in flight while the user adds a skill.
    let resolveList!: (v: Skill[]) => void;
    list.mockImplementationOnce(() => new Promise<Skill[]>(res => (resolveList = res)));
    renderProbe();
    const pendingGet = loadSkills();

    createSkill.mockResolvedValueOnce(skill('s3', 'AC repair'));
    await act(async () => {
      await addSkill('AC repair');
    });

    // The stale, pre-mutation GET settles after the mutation.
    await act(async () => {
      resolveList([skill('s1', 'Drilling')]);
      await pendingGet;
    });
    expect(probe.skills.map(s => s.name)).toContain('AC repair');
  });
});

describe('removeSkill', () => {
  it('removes the row optimistically and restores it when the DELETE fails', async () => {
    list.mockResolvedValueOnce([skill('s1', 'Drilling'), skill('s2', 'Wiring')]);
    renderProbe();
    await act(async () => {
      await loadSkills();
    });

    // The DELETE mock must be queued before removeSkill is called — the
    // service call is invoked synchronously before the first await.
    remove.mockRejectedValueOnce(apiError(500, 'REQUEST_ERROR', 'Network error'));

    // Capture the optimistic state before the request settles. `act` flushes
    // the synchronous store write that happens before the first await.
    let pending!: Promise<void>;
    act(() => {
      pending = removeSkill('s1');
    });
    expect(probe.skills.map(s => s.id)).toEqual(['s2']);

    let rejected: unknown;
    await act(async () => {
      rejected = await pending.catch(e => e);
    });
    expect(rejected).toBeTruthy();
    // Restored in sorted position.
    expect(probe.skills.map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('does not resurrect a row deleted concurrently when a delete fails', async () => {
    list.mockResolvedValueOnce([skill('s1', 'Drilling'), skill('s2', 'Wiring')]);
    renderProbe();
    await act(async () => {
      await loadSkills();
    });

    remove.mockRejectedValueOnce(apiError(500, 'REQUEST_ERROR', 'Network error'));

    let pending!: Promise<unknown>;
    act(() => {
      // The rejection is handled immediately — it settles while the
      // concurrent delete below is awaited, before the final assertion.
      pending = removeSkill('s1').catch(e => e);
    });

    // While s1's DELETE is in flight, another row is deleted successfully.
    await act(async () => {
      await removeSkill('s2');
    });

    let rejected: unknown;
    await act(async () => {
      rejected = await pending;
    });
    expect(rejected).toBeTruthy();
    // s1 is restored (the delete really failed), s2 stays gone.
    expect(probe.skills.map(s => s.id)).toEqual(['s1']);
  });

  it('leaves the skill removed when the server answers 404 (already gone)', async () => {
    list.mockResolvedValueOnce([skill('s1', 'Drilling'), skill('s2', 'Wiring')]);
    renderProbe();
    await act(async () => {
      await loadSkills();
    });

    remove.mockRejectedValueOnce(apiError(404, 'NOT_FOUND', 'Skill not found'));
    let rejected: unknown;
    await act(async () => {
      rejected = await removeSkill('s1').catch(e => e);
    });
    expect(rejected).toBeUndefined();
    expect(probe.skills.map(s => s.id)).toEqual(['s2']);
  });
});

describe('clearSkills', () => {
  it('resets the store to the pre-login state', async () => {
    list.mockResolvedValueOnce([skill('s1', 'Drilling')]);
    renderProbe();
    await act(async () => {
      await loadSkills();
    });
    act(() => {
      clearSkills();
    });
    expect(probe.skills).toEqual([]);
    expect(probe.hasLoaded).toBe(false);
    expect(probe.lastLoadedAt).toBeNull();
  });

  it('ignores a GET response that lands after clearSkills (logout race)', async () => {
    let resolveList!: (v: Skill[]) => void;
    list.mockImplementationOnce(() => new Promise<Skill[]>(res => (resolveList = res)));
    renderProbe();
    const pendingGet = loadSkills();

    act(() => {
      clearSkills();
    });

    // The in-flight GET settles after the clear — it must not repopulate the
    // next session's store with the previous tenant's rows.
    await act(async () => {
      resolveList([skill('s1', 'Old tenant skill')]);
      await pendingGet;
    });
    expect(probe.skills).toEqual([]);
    expect(probe.hasLoaded).toBe(false);
  });
});

describe('autoLoad opt', () => {
  // Subscribers that stay mounted while hidden (AddTechnicianSheet) pass
  // `autoLoad: false` and load on their own open effect instead — rendering
  // them must not fire the first-mount GET.
  function HiddenProbe() {
    probe = useSkills({ autoLoad: false });
    return null;
  }

  it('does not fire the first-mount GET when autoLoad is false', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<HiddenProbe />);
    });

    expect(list).not.toHaveBeenCalled();
    expect(probe.hasLoaded).toBe(false);

    // The caller's own load still works — the opt only silences the mount
    // effect, not the store.
    list.mockResolvedValueOnce([skill('s1', 'Drilling')]);
    await act(async () => {
      await loadSkills();
    });
    expect(probe.skills.map(s => s.name)).toEqual(['Drilling']);
    renderer.unmount();
  });

  it('still loads on mount by default (omitted opts)', async () => {
    list.mockResolvedValueOnce([]);
    const renderer = renderProbe();
    await act(async () => {});
    expect(list).toHaveBeenCalledTimes(1);
    renderer.unmount();
  });
});
