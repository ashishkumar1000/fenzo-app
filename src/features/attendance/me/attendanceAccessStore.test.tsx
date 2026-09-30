/**
 * Tests for the attendance access store (Story 15-10) — the module-level
 * single source of the AD-17 states:
 *  - the /users/me SEED (first load without a second round trip): a valid
 *    mirror seeds ready; an unusable mirror (owners; wrong-case value) is
 *    ignored — unknown keeps the tab hidden; the seed NEVER overrides a
 *    resolved state (me/access is the only refresher after the seed);
 *  - the refresh min-gap: the boot fetch, then every refetch path
 *    (foreground focus, the notification seam) shares one gap — rapid
 *    switches stay cheap, `force` bypasses it, concurrent callers share
 *    one in-flight fetch;
 *  - the no-flicker rule: a failed refetch leaves the last state standing
 *    (active stays active; unknown stays unknown) and is not gap-blocked,
 *    so the next trigger retries;
 *  - reachability mirroring the tab's existence for the notifications tap
 *    guard;
 *  - the 401 reset registration and the lifecycle boot's seams.
 *
 * The store has no state getter — snapshots are read through
 * `useAttendanceAccess` on a probe root (the house hook-test pattern), and
 * the events/reset seams are the REAL modules (pure), except resetRegistry
 * which is mocked to capture the registered reset (running the real
 * registry would fire every other store's teardown too).
 */
jest.mock('../../../services', () => ({
  attendanceMeService: {
    getAccess: jest.fn(),
    recordOnboarding: jest.fn(),
    getSummary: jest.fn(),
  },
}));

jest.mock('../../../services/resetRegistry', () => ({
  registerReset: jest.fn(() => jest.fn()),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { attendanceMeService } from '../../../services';
import { registerReset } from '../../../services/resetRegistry';
import {
  emitAttendanceAccessRefresh,
  isAttendanceReachable,
  resetAttendanceAccessEvents,
} from '../../../services/attendanceAccessEvents';
import type { AttendanceAccess } from '../../../services';
import {
  applyOnboardedAt,
  ensureAttendanceAccessInitialised,
  refreshAttendanceAccessOnFocus,
  resetAttendanceAccessStoreForTests,
  seedAccessFromProfile,
  useAttendanceAccess,
} from './attendanceAccessStore';
import type { AttendanceAccessStateSnapshot } from './attendanceAccessStore';

const getAccess = attendanceMeService.getAccess as jest.Mock;
const registerResetMock = registerReset as unknown as jest.Mock;

function access(overrides: Partial<AttendanceAccess> = {}): AttendanceAccess {
  return {
    attendanceEnabled: true,
    attendanceAccess: 'active',
    attendanceStartDate: null,
    enabledAt: '2026-09-28T10:00:00Z',
    onboardedAt: null,
    officeId: 'o1',
    officeName: 'HQ',
    ...overrides,
  };
}

let probe: AttendanceAccessStateSnapshot;
function Probe() {
  probe = useAttendanceAccess();
  return null;
}

function renderProbe(): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe />);
  });
  return renderer;
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

async function settle() {
  await act(async () => {
    await flush();
  });
}

/** The reset callback the store handed to the 401 registry. */
function registeredReset(): () => void {
  const call = registerResetMock.mock.calls.at(-1)?.[0];
  expect(call).toBeInstanceOf(Function);
  return call as () => void;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  resetAttendanceAccessEvents();
  // Module-level store — every test starts from the pre-boot state and
  // with the previous test's registrations torn down.
  resetAttendanceAccessStoreForTests();
});

afterEach(() => {
  resetAttendanceAccessStoreForTests();
  jest.useRealTimers();
});

describe('seedAccessFromProfile — the /users/me mirror', () => {
  it('a valid mirror seeds the ready state (the tab exists on the first render, no second round trip)', () => {
    renderProbe();
    act(() => {
      seedAccessFromProfile({
        attendance: {
          attendanceEnabled: true,
          attendanceAccess: 'active',
          attendanceStartDate: '2026-10-01',
          onboardedAt: '2026-09-01T09:00:00Z',
        },
      });
    });

    expect(probe).toEqual({
      status: 'ready',
      access: expect.objectContaining({
        attendanceEnabled: true,
        attendanceAccess: 'active',
        attendanceStartDate: '2026-10-01',
        onboardedAt: '2026-09-01T09:00:00Z',
        // The mirror carries no rule/office truth — those stay null until
        // the summary surfaces them.
        enabledAt: null,
        officeId: null,
        officeName: null,
      }),
    });
    expect(isAttendanceReachable()).toBe(true);
    expect(getAccess).not.toHaveBeenCalled(); // seeding is free
  });

  it('a mirror with a missing enabled flag seeds it as false (strict-true)', () => {
    renderProbe();
    act(() => {
      seedAccessFromProfile({ attendance: { attendanceAccess: 'upcoming' } });
    });

    expect(probe.access?.attendanceEnabled).toBe(false);
    expect(probe.access?.attendanceAccess).toBe('upcoming');
  });

  it('a mirror WITHOUT a usable attendanceAccess is ignored — unknown keeps the tab hidden', () => {
    renderProbe();
    for (const bad of [undefined, 'ACTIVE', 'tracking', '']) {
      act(() => {
        seedAccessFromProfile({ attendance: { attendanceAccess: bad } });
      });
      expect(probe.status).toBe('unknown');
      expect(probe.access).toBeNull();
      expect(isAttendanceReachable()).toBe(false);
    }
  });

  it('a profile without the nested attendance mirror is ignored (older backend fails hidden)', () => {
    renderProbe();
    act(() => {
      seedAccessFromProfile({});
      seedAccessFromProfile({ attendance: null });
    });

    expect(probe.status).toBe('unknown');
    expect(probe.access).toBeNull();
  });

  it('a null/undefined profile is ignored', () => {
    renderProbe();
    act(() => {
      seedAccessFromProfile(null);
      seedAccessFromProfile(undefined);
    });

    expect(probe.status).toBe('unknown');
  });

  it('NEVER overrides a resolved state (me/access is the only refresher after the seed)', () => {
    renderProbe();
    act(() => {
      seedAccessFromProfile({ attendance: { attendanceAccess: 'active' } });
      seedAccessFromProfile({ attendance: { attendanceAccess: 'none' } }); // a stale mirror lands late
    });

    expect(probe.access?.attendanceAccess).toBe('active');
    expect(isAttendanceReachable()).toBe(true);
  });
});

describe('applyOnboardedAt', () => {
  it('records the intro completion locally, preserving the rest of the access', () => {
    renderProbe();
    act(() => {
      seedAccessFromProfile({ attendance: { attendanceAccess: 'active' } });
    });
    act(() => {
      applyOnboardedAt('2026-09-28T09:00:00Z');
    });

    expect(probe.status).toBe('ready');
    expect(probe.access).toEqual(
      expect.objectContaining({
        attendanceAccess: 'active',
        onboardedAt: '2026-09-28T09:00:00Z',
      }),
    );
  });

  it('a null timestamp records too (the server answers a null for a drifted payload)', () => {
    renderProbe();
    act(() => {
      seedAccessFromProfile({ attendance: { attendanceAccess: 'active', onboardedAt: '2026-09-28T09:00:00Z' } });
    });
    act(() => {
      applyOnboardedAt(null);
    });

    expect(probe.access?.onboardedAt).toBeNull();
  });

  it('is a no-op while unknown (never fabricates an access)', () => {
    renderProbe();
    act(() => {
      applyOnboardedAt('2026-09-28T09:00:00Z');
    });

    expect(probe.status).toBe('unknown');
    expect(probe.access).toBeNull();
  });
});

describe('refreshAccess — the shared min-gap', () => {
  it('the boot fetches once and a focus refetch within the gap is free', async () => {
    getAccess.mockResolvedValue(access());
    renderProbe();
    act(() => {
      ensureAttendanceAccessInitialised();
    });
    await settle();

    expect(getAccess).toHaveBeenCalledTimes(1);
    expect(probe.access?.attendanceAccess).toBe('active');

    act(() => {
      refreshAttendanceAccessOnFocus();
    });
    await settle();

    expect(getAccess).toHaveBeenCalledTimes(1); // 30s gap not elapsed
  });

  it('after the gap a focus refetch fires and its payload lands', async () => {
    getAccess.mockResolvedValueOnce(access({ attendanceAccess: 'active' }));
    getAccess.mockResolvedValue(access({ attendanceAccess: 'history_only' }));
    renderProbe();
    act(() => {
      ensureAttendanceAccessInitialised();
    });
    await settle();

    jest.setSystemTime(Date.now() + 30_001);
    act(() => {
      refreshAttendanceAccessOnFocus();
    });
    await settle();

    expect(getAccess).toHaveBeenCalledTimes(2);
    expect(probe.access?.attendanceAccess).toBe('history_only');
  });

  it('the notification seam forces a fetch that bypasses the gap', async () => {
    getAccess.mockResolvedValue(access());
    renderProbe();
    act(() => {
      ensureAttendanceAccessInitialised();
    });
    await settle();

    act(() => {
      emitAttendanceAccessRefresh();
    });
    await settle();

    expect(getAccess).toHaveBeenCalledTimes(2); // within the gap, forced anyway
  });

  it('concurrent non-forced callers share ONE in-flight fetch (a forced caller queues instead — pinned by the race test below)', async () => {
    let release!: (v: AttendanceAccess) => void;
    getAccess.mockImplementationOnce(
      () => new Promise<AttendanceAccess>((resolve) => (release = resolve)),
    );
    renderProbe();
    act(() => {
      ensureAttendanceAccessInitialised(); // forced boot fetch
      refreshAttendanceAccessOnFocus();    // non-forced → joins the in-flight GET
    });
    await act(async () => {
      release(access());
      await flush();
    });

    expect(getAccess).toHaveBeenCalledTimes(1);
    expect(probe.access?.attendanceAccess).toBe('active');
  });

  it('a failed refetch leaves the last state standing (no-flicker) — active stays active', async () => {
    renderProbe();
    act(() => {
      seedAccessFromProfile({ attendance: { attendanceAccess: 'active' } });
    });
    getAccess.mockRejectedValue({ status: 500, code: 'SERVER_ERROR' });
    act(() => {
      refreshAttendanceAccessOnFocus();
    });
    await settle();

    expect(probe.status).toBe('ready');
    expect(probe.access?.attendanceAccess).toBe('active');
    expect(isAttendanceReachable()).toBe(true);
  });

  it('a failed refetch is NOT gap-blocked — the next trigger retries immediately', async () => {
    renderProbe();
    act(() => {
      seedAccessFromProfile({ attendance: { attendanceAccess: 'active', attendanceStartDate: '2026-10-01' } });
    });
    getAccess.mockRejectedValueOnce({ status: 500 });
    act(() => {
      refreshAttendanceAccessOnFocus();
    });
    await settle();

    getAccess.mockResolvedValueOnce(access({ attendanceStartDate: '2026-11-01' }));
    act(() => {
      refreshAttendanceAccessOnFocus(); // no system-time jump — the failure must not consume the gap
    });
    await settle();

    expect(getAccess).toHaveBeenCalledTimes(2);
    expect(probe.access?.attendanceStartDate).toBe('2026-11-01');
  });

  it('a failure from unknown stays unknown (the tab stays hidden)', async () => {
    getAccess.mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' });
    renderProbe();
    act(() => {
      ensureAttendanceAccessInitialised();
    });
    await settle();

    expect(probe.status).toBe('unknown');
    expect(probe.access).toBeNull();
    expect(isAttendanceReachable()).toBe(false);
  });
});

describe('reachability mirrors the tab’s existence', () => {
  it.each([
    ['none', false],
    ['upcoming', true],
    ['active', true],
    ['history_only', true], // the tab still exists — only checking in has ended
  ])('%s → reachable %p', (state, expected) => {
    renderProbe();
    act(() => {
      seedAccessFromProfile({ attendance: { attendanceAccess: state as AttendanceAccess['attendanceAccess'] } });
    });

    expect(isAttendanceReachable()).toBe(expected);
  });

  it('unknown → not reachable (the default shut state)', () => {
    renderProbe();
    expect(isAttendanceReachable()).toBe(false);
  });
});

describe('ensureAttendanceAccessInitialised — boot + seams', () => {
  it('registers the 401 reset; running it slams the store back to unknown and unreachable', async () => {
    getAccess.mockResolvedValue(access());
    renderProbe();
    act(() => {
      seedAccessFromProfile({ attendance: { attendanceAccess: 'active' } });
    });
    act(() => {
      ensureAttendanceAccessInitialised();
    });
    await settle();
    expect(probe.status).toBe('ready');

    expect(registerResetMock).toHaveBeenCalledTimes(1);
    act(() => {
      registeredReset()();
    });

    expect(probe.status).toBe('unknown');
    expect(probe.access).toBeNull();
    expect(isAttendanceReachable()).toBe(false);

    // The reset also clears the min-gap — the next boot refetches at once.
    act(() => {
      refreshAttendanceAccessOnFocus();
    });
    await settle();
    expect(getAccess).toHaveBeenCalledTimes(2);
  });

  it('is idempotent — a second boot within the gap does not refetch', async () => {
    getAccess.mockResolvedValue(access());
    renderProbe();
    act(() => {
      ensureAttendanceAccessInitialised();
    });
    await settle();
    act(() => {
      ensureAttendanceAccessInitialised(); // e.g. the lifecycle re-mounted
    });
    await settle();

    expect(getAccess).toHaveBeenCalledTimes(1);
  });

  it('teardown unregisters the seam — an emit after reset fetches nothing', async () => {
    getAccess.mockResolvedValue(access());
    renderProbe();
    act(() => {
      ensureAttendanceAccessInitialised();
    });
    await settle();
    expect(getAccess).toHaveBeenCalledTimes(1);

    resetAttendanceAccessStoreForTests();
    act(() => {
      emitAttendanceAccessRefresh();
    });
    await settle();

    expect(getAccess).toHaveBeenCalledTimes(1);
    expect(probe.status).toBe('unknown');
    expect(isAttendanceReachable()).toBe(false);
  });
});

describe('reset + forced-join races (BMAD 15-10 review)', () => {
  it('a fetch in flight across a reset is DROPPED on arrival — it repaints nothing and never stamps the min-gap', async () => {
    let resolveFetch!: (v: AttendanceAccess) => void;
    getAccess.mockImplementationOnce(
      () => new Promise<AttendanceAccess>(res => { resolveFetch = res; }),
    );
    renderProbe();
    act(() => {
      ensureAttendanceAccessInitialised(); // fetch #1 goes out, unresolved
    });
    await settle();
    expect(getAccess).toHaveBeenCalledTimes(1);

    // 401/epoch reset while the GET is on the wire.
    act(() => {
      registeredReset()();
    });
    expect(probe.status).toBe('unknown');
    expect(isAttendanceReachable()).toBe(false);

    // The old session's 200 lands AFTER the reset — it belongs to nobody.
    resolveFetch(access({ attendanceAccess: 'active' }));
    await settle();
    expect(probe.status).toBe('unknown'); // never repaints
    expect(isAttendanceReachable()).toBe(false);

    // And it must NOT have stamped the min-gap: the next session's boot
    // fetch fires immediately instead of being throttled for 30 s.
    getAccess.mockResolvedValueOnce(access({ attendanceAccess: 'none' }));
    act(() => {
      ensureAttendanceAccessInitialised();
    });
    await settle();
    expect(getAccess).toHaveBeenCalledTimes(2);
    expect(probe.status).toBe('ready');
    expect(probe.access?.attendanceAccess).toBe('none');
    expect(isAttendanceReachable()).toBe(false);
  });

  it('a forced refresh arriving mid-flight is QUEUED, not joined — a second fetch fires after the stale one settles', async () => {
    let resolveFetch!: (v: AttendanceAccess) => void;
    getAccess
      .mockImplementationOnce(
        () => new Promise<AttendanceAccess>(res => { resolveFetch = res; }),
      )
      .mockResolvedValueOnce(access({ attendanceAccess: 'none' }));
    renderProbe();
    act(() => {
      ensureAttendanceAccessInitialised(); // fetch #1 on the wire
    });
    await settle();

    // A notification seam emit (forced) while #1 is unresolved: it must not
    // join the pre-event GET — it queues a follow-up.
    act(() => {
      emitAttendanceAccessRefresh();
    });
    expect(getAccess).toHaveBeenCalledTimes(1);

    resolveFetch(access({ attendanceAccess: 'active' }));
    await settle();
    // The queued forced fetch ran and carried the post-event truth.
    expect(getAccess).toHaveBeenCalledTimes(2);
    expect(probe.status).toBe('ready');
    expect(probe.access?.attendanceAccess).toBe('none');
  });
});
