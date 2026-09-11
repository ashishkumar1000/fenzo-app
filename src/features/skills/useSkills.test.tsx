/**
 * Tests for the useSkills shared store's read-only path. The GET is mocked
 * at `apiClient` (not the service), so the REAL `SkillService.list()` runs —
 * proving the `{ skills: [...] }` envelope is unwrapped and the backend's
 * seed order is preserved verbatim (never re-sorted). A malformed envelope
 * surfaces as a store error, not a crash.
 *
 * Write paths were deleted in Story 5.4.
 */
jest.mock('../../services/api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { apiClient } from '../../services/api/apiClient';
import { clearSkills, loadSkills, useSkills } from './useSkills';
import type { Skill } from '../../services';

const get = apiClient.get as jest.Mock;

function apiError(status: number, code: string, message: string) {
  return { status, code, message, details: null };
}

function skill(id: string, name: string): Skill {
  return { id, name };
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
  get.mockResolvedValue({ data: { skills: [] } });
  clearSkills();
});

describe('loadSkills', () => {
  it('unwraps the { skills: [...] } envelope and preserves seed order', async () => {
    // Deliberately NOT alphabetical — the store must keep the wire order.
    get.mockResolvedValueOnce({
      data: { skills: [skill('s1', 'Wiring'), skill('s2', 'AC repair'), skill('s3', 'Drilling')] },
    });
    const renderer = renderProbe();
    await act(async () => {
      await loadSkills();
    });
    expect(get).toHaveBeenCalledWith('skills');
    expect(probe.skills.map(s => s.id)).toEqual(['s1', 's2', 's3']);
    expect(probe.hasLoaded).toBe(true);
    expect(probe.error).toBeNull();
    expect(renderer).toBeTruthy();
  });

  it('surfaces a malformed envelope as a fetch error, not as store data', async () => {
    get.mockResolvedValueOnce({ data: {} });
    renderProbe();
    await act(async () => {
      await loadSkills();
    });
    expect(probe.error).toBeTruthy();
    expect(probe.hasLoaded).toBe(true);
    expect(probe.skills).toEqual([]);
  });

  it('surfaces a fetch failure as an error message', async () => {
    get.mockRejectedValueOnce(apiError(500, 'REQUEST_ERROR', 'Something went wrong'));
    renderProbe();
    await act(async () => {
      await loadSkills();
    });
    expect(probe.error).toBe('Something went wrong');
    expect(probe.hasLoaded).toBe(true);
  });

  it('retains loaded rows on a failed refresh and sets the error', async () => {
    get.mockResolvedValueOnce({
      data: { skills: [skill('s1', 'Drilling'), skill('s2', 'Wiring')] },
    });
    renderProbe();
    await act(async () => {
      await loadSkills();
    });
    expect(probe.skills.map(s => s.name)).toEqual(['Drilling', 'Wiring']);

    // The refresh is forced past the TTL throttle, and the request fails.
    get.mockRejectedValueOnce(apiError(500, 'REQUEST_ERROR', 'Network error'));
    await act(async () => {
      await loadSkills({ force: true });
    });
    // The stale-but-real rows stay on screen behind the error — the screen
    // keeps its tiles (see NewJobScreen's failed-refresh branch) rather than
    // blanking the grid.
    expect(probe.skills.map(s => s.name)).toEqual(['Drilling', 'Wiring']);
    expect(probe.error).toBe('Network error');
    expect(probe.hasLoaded).toBe(true);
  });

  it('joins an in-flight request instead of firing a second GET', async () => {
    let resolveList!: (v: { data: { skills: Skill[] } }) => void;
    get.mockImplementationOnce(
      () => new Promise<{ data: { skills: Skill[] } }>(res => (resolveList = res)),
    );
    renderProbe();
    const first = loadSkills();
    const second = loadSkills();
    await act(async () => {
      resolveList({ data: { skills: [] } });
      await Promise.all([first, second]);
    });
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('clearSkills', () => {
  it('resets the store to the pre-login state', async () => {
    get.mockResolvedValueOnce({ data: { skills: [skill('s1', 'Drilling')] } });
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
    let resolveList!: (v: { data: { skills: Skill[] } }) => void;
    get.mockImplementationOnce(
      () => new Promise<{ data: { skills: Skill[] } }>(res => (resolveList = res)),
    );
    renderProbe();
    const pendingGet = loadSkills();

    act(() => {
      clearSkills();
    });

    // The in-flight GET settles after the clear — it must not repopulate the
    // next session's store with the previous tenant's rows.
    await act(async () => {
      resolveList({ data: { skills: [skill('s1', 'Old tenant skill')] } });
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

    expect(get).not.toHaveBeenCalled();
    expect(probe.hasLoaded).toBe(false);

    // The caller's own load still works — the opt only silences the mount
    // effect, not the store.
    get.mockResolvedValueOnce({ data: { skills: [skill('s1', 'Drilling')] } });
    await act(async () => {
      await loadSkills();
    });
    expect(probe.skills.map(s => s.name)).toEqual(['Drilling']);
    renderer.unmount();
  });

  it('still loads on mount by default (omitted opts)', async () => {
    get.mockResolvedValueOnce({ data: { skills: [] } });
    const renderer = renderProbe();
    await act(async () => {});
    expect(get).toHaveBeenCalledTimes(1);
    renderer.unmount();
  });
});
