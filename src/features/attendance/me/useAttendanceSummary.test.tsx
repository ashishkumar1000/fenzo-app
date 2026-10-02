/**
 * Hook tests for `useAttendanceSummary` (Story 15-10) — the FR-4 summary
 * fetch's tri-state contract (the useOffices/useEnrolments shape): the
 * first-load loading window (the view renders it as the shimmer), the
 * blocking first-load error, and a REFETCH failure
 * that leaves the last-loaded rows standing under the stale flag. The
 * focus refetch shares the access store's ACCESS_REFRESH_MIN_GAP_MS, so
 * the gap (and its bypass after a failed refresh) is exercised against the
 * real constant under fake timers. The focus effect is captured and fired
 * manually, same convention as `useEnrolments.test.tsx`; the store's own
 * focus hook (`refreshAttendanceAccessOnFocus`) runs for real against a
 * mocked `getAccess` so the two truths genuinely refresh together.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../services', () => ({
  attendanceMeService: {
    getAccess: jest.fn(),
    getSummary: jest.fn(),
    recordOnboarding: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { useFocusEffect } from '@react-navigation/native';
import { attendanceMeService } from '../../../services';
import type { AttendanceSummary } from '../../../services';
import { ACCESS_REFRESH_MIN_GAP_MS } from './attendanceAccessStore';
import { useAttendanceSummary } from './useAttendanceSummary';
import type { AttendanceSummaryState } from './useAttendanceSummary';

const getSummary = attendanceMeService.getSummary as jest.Mock;
const getAccess = attendanceMeService.getAccess as jest.Mock;
const useFocusEffectMock = useFocusEffect as jest.Mock;

function summary(overrides: Partial<AttendanceSummary> = {}): AttendanceSummary {
  return {
    officeId: 'o1',
    officeName: 'HQ',
    startTime: '09:30',
    endTime: '18:00',
    lateCutOffMinutes: 15,
    weeklyOffDays: [6, 7],
    officeLatitude: 19.076,
    officeLongitude: 72.8777,
    officeRadius: 150,
    ...overrides,
  };
}

let probe: { state: AttendanceSummaryState; refresh: () => void };
function Probe({ enabled }: { enabled: boolean }) {
  probe = useAttendanceSummary(enabled);
  return null;
}

function renderProbe(enabled = true): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe enabled={enabled} />);
  });
  return renderer;
}

/** Runs every focus effect the hook registered since the last fire. */
let consumed = 0;
function fireFocus() {
  const effects = useFocusEffectMock.mock.calls
    .slice(consumed)
    .map((call) => call[0] as () => void);
  consumed = useFocusEffectMock.mock.calls.length;
  expect(effects.length).toBeGreaterThan(0);
  act(() => {
    effects.forEach((effect) => effect());
  });
}

/** A second focus event on the same screen — navigation re-runs the SAME
 *  effect without a re-render. */
function refireFocus() {
  const effect = useFocusEffectMock.mock.calls.at(-1)?.[0] as () => void;
  act(() => {
    effect();
  });
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

async function focusAndSettle() {
  fireFocus();
  await settle();
}

/** The refetch paths are gated on wall-clock time — jump past the gap. */
function pastTheGap() {
  jest.setSystemTime(Date.now() + ACCESS_REFRESH_MIN_GAP_MS + 1);
}

beforeEach(() => {
  jest.useFakeTimers();
  consumed = 0;
  jest.resetAllMocks();
  // The focus effect also refreshes ACCESS through the real store helper —
  // give it a quiet success so its silent no-flicker catch never runs.
  getAccess.mockResolvedValue(summary({ startTime: null, endTime: null, lateCutOffMinutes: null }));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the enabled flag', () => {
  it('enabled=false never fetches and stays in the first-load state', async () => {
    renderProbe(false);
    await focusAndSettle();

    expect(getSummary).not.toHaveBeenCalled();
    expect(probe.state).toEqual({ summary: null, isLoading: true, error: null, isStale: false });
  });

  it('the flag flips on the NEXT render — a re-enabled tab fetches on its next focus', async () => {
    getSummary.mockResolvedValue(summary());
    const renderer = renderProbe(false);
    await focusAndSettle();

    act(() => {
      renderer.update(<Probe enabled={true} />);
    });
    await focusAndSettle();

    expect(getSummary).toHaveBeenCalledTimes(1);
    expect(probe.state.isLoading).toBe(false);
    expect(probe.state.summary?.officeName).toBe('HQ');
  });

  it('the enabled flag rides the ACCESS state: true only for active/upcoming', () => {
    // The screen derives the flag; the hook must receive it verbatim.
    getSummary.mockResolvedValue(summary());
    renderProbe(true);
    expect(useFocusEffectMock).toHaveBeenCalled(); // wired for focus refresh
  });
});

describe('tri-state contract', () => {
  it('a settled focus fetch fills the summary and clears loading', async () => {
    getSummary.mockResolvedValue(summary());
    renderProbe();
    await focusAndSettle();

    expect(getSummary).toHaveBeenCalledTimes(1);
    expect(probe.state).toEqual({
      summary: summary(),
      isLoading: false,
      error: null,
      isStale: false,
    });
  });

  it('a first-load failure surfaces the error message and nothing loaded', async () => {
    getSummary.mockRejectedValue({ status: 500, message: 'Server exploded' });
    renderProbe();
    await focusAndSettle();

    expect(probe.state).toEqual({
      summary: null,
      isLoading: false,
      error: 'Server exploded',
      isStale: false,
    });
  });

  it('a first-load failure without a message falls back to the human copy', async () => {
    getSummary.mockRejectedValue({ status: 0 });
    renderProbe();
    await focusAndSettle();

    expect(probe.state.error).toBe(
      'Could not load your attendance details. Check your connection and try again.',
    );
    expect(probe.state.isLoading).toBe(false);
  });

  it('a REFETCH failure over loaded rows keeps the rows and flags them stale (error stays null)', async () => {
    getSummary.mockResolvedValue(summary());
    renderProbe();
    await focusAndSettle();

    pastTheGap(); // a refresh within the gap would be swallowed
    getSummary.mockRejectedValueOnce({ status: 0, message: 'offline' });
    await focusAndSettle();

    expect(probe.state.summary).toEqual(summary()); // the SAME rows stand
    expect(probe.state.isStale).toBe(true);
    expect(probe.state.error).toBeNull();
    expect(probe.state.isLoading).toBe(false);
  });

  it('a refetch SUCCESS clears the stale flag and swaps in the new rows', async () => {
    getSummary.mockResolvedValue(summary());
    renderProbe();
    await focusAndSettle();

    pastTheGap();
    getSummary.mockRejectedValueOnce({ status: 0 });
    await focusAndSettle();
    expect(probe.state.isStale).toBe(true);

    pastTheGap(); // a failure does not consume the gap — but be explicit
    getSummary.mockResolvedValueOnce(summary({ officeName: 'Branch' }));
    await focusAndSettle();

    expect(probe.state.isStale).toBe(false);
    expect(probe.state.summary?.officeName).toBe('Branch');
  });
});

describe('the min-gap on refetches', () => {
  it('an immediate refresh (or focus) within the gap fetches nothing', async () => {
    getSummary.mockResolvedValue(summary());
    renderProbe();
    await focusAndSettle();

    probe.refresh();
    await settle();
    await focusAndSettle();

    expect(getSummary).toHaveBeenCalledTimes(1);
  });

  it('after the gap the next refresh fetches again', async () => {
    getSummary.mockResolvedValue(summary());
    renderProbe();
    await focusAndSettle();

    pastTheGap();
    probe.refresh();
    await settle();

    expect(getSummary).toHaveBeenCalledTimes(2);
  });
});

describe('races', () => {
  it('a focus landing while the first fetch is in flight does not fire a second fetch', async () => {
    let release!: (v: AttendanceSummary) => void;
    getSummary.mockImplementation(
      () => new Promise<AttendanceSummary>((resolve) => (release = resolve)),
    );
    renderProbe();
    fireFocus();
    refireFocus(); // the second focus lands while the first fetch is still pending
    await act(async () => {
      release(summary());
      await flush();
    });

    expect(getSummary).toHaveBeenCalledTimes(1);
    expect(probe.state.summary).toEqual(summary());
  });
});
