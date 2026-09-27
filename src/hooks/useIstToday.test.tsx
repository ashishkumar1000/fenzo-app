/**
 * useIstToday — the live IST calendar day.
 *
 * The contract under test is day-boundary liveness, not the date arithmetic
 * (that is `utils/istDate.test.ts`'s job): the value advances the moment IST
 * midnight passes while the component stays mounted, advances on resume from
 * background without waiting for a tick, and does NOT change on a tick that
 * crosses no midnight.
 *
 * The mechanism: jest.setup.js pins TZ=Asia/Kolkata, so the host clock the
 * hook reads IS the IST clock here (the same pin HolidaysScreen's suite
 * relies on). The boundary pair below additionally proves the day is IST
 * by construction, not by environment: `setSystemTime` pins absolute
 * instants, and the flip is asserted across 18:30Z — IST midnight, a
 * wall-clock moment that is midnight in no other production-relevant zone,
 * so an implementation anchored to the wrong zone flips an hour (or a day)
 * away from where these assertions sit.
 */
const mockRemove = jest.fn();
let appStateListener: ((state: string) => void) | null = null;

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((_type: string, listener: (state: string) => void) => {
      appStateListener = listener;
      return { remove: mockRemove };
    }),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useIstToday } from './useIstToday';

/** 23:59:00 IST on 2026-09-27 — one minute before the day flips. */
const BEFORE_IST_MIDNIGHT = '2026-09-27T18:29:00.000Z';
/** 00:00:00 IST on 2026-09-28 — the boundary itself. */
const IST_MIDNIGHT = '2026-09-27T18:30:00.000Z';

let probe: string;
let renderCount = 0;

function Probe() {
  renderCount += 1;
  probe = useIstToday();
  return null;
}

/**
 * Every renderer is torn down in `afterEach`: a still-mounted hook leaves its
 * 60s interval pending and keeps the jest worker alive after the suite ends.
 * Emptying the list makes the teardown idempotent, so a case that has to
 * unmount mid-test (the cleanup case) can call `unmountAll()` itself.
 */
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderProbe() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe />);
  });
  mountedRenderers.push(renderer);
}

function unmountAll() {
  for (const renderer of mountedRenderers) {
    act(() => {
      renderer.unmount();
    });
  }
  mountedRenderers.length = 0;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(BEFORE_IST_MIDNIGHT));
  appStateListener = null;
  renderCount = 0;
});

afterEach(() => {
  unmountAll();
  jest.useRealTimers();
  jest.clearAllMocks();
});

it('returns the IST day on mount, in the API wire format', () => {
  renderProbe();
  // 23:59 on the 27th IST. A device-local read would give the 27th in most
  // host zones too, so this case pins the value; the boundary case below
  // pins the rule.
  expect(probe).toBe('2026-09-27');
  expect(probe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it('flips exactly at IST midnight — not at the host timezone midnight', () => {
  jest.setSystemTime(new Date('2026-09-27T18:29:59.999Z'));
  renderProbe();
  expect(probe).toBe('2026-09-27');

  // One millisecond later is 00:00:00 IST on the 28th. In a host zone at or
  // behind IST (UTC included) the device-local date here is still the 27th,
  // so this pair fails for any implementation that is not IST-anchored.
  jest.setSystemTime(new Date(IST_MIDNIGHT));
  act(() => {
    appStateListener?.('active');
  });
  expect(probe).toBe('2026-09-28');
});

it('advances past IST midnight on its own while mounted — no user action', () => {
  // The regression this hook exists for: a Holidays screen opened at 23:59
  // and left open. Previously `today` was frozen at mount, so a holiday that
  // had just become past stayed under "Upcoming" until the screen remounted.
  renderProbe();
  expect(probe).toBe('2026-09-27');

  act(() => {
    jest.advanceTimersByTime(120_000); // crosses 18:30Z = 00:00 IST
  });
  expect(probe).toBe('2026-09-28');

  // And the following day's crossing is caught too — the timer is not a
  // one-shot.
  act(() => {
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
  });
  expect(probe).toBe('2026-09-29');
});

it('leaves the value untouched on ticks that cross no midnight', () => {
  jest.setSystemTime(new Date('2026-09-27T04:30:00.000Z')); // 10:00 IST
  renderProbe();
  const mounted = renderCount;
  act(() => {
    jest.advanceTimersByTime(5 * 60_000); // five ticks, same IST day
  });
  expect(probe).toBe('2026-09-27');
  // The unchanged state is not committed, so those ticks cost no re-render.
  expect(renderCount).toBe(mounted);
});

it('re-syncs on resume from background without waiting for a tick', () => {
  renderProbe();
  // A backgrounded app stalls its timers, so the clock moves while no tick
  // fires — exactly what a night in the Owner's pocket looks like.
  jest.setSystemTime(new Date('2026-09-28T06:00:00.000Z')); // 11:30 IST
  expect(probe).toBe('2026-09-27');

  act(() => {
    appStateListener?.('active');
  });
  expect(probe).toBe('2026-09-28');
});

it('ignores backgrounding — only `active` re-syncs', () => {
  renderProbe();
  jest.setSystemTime(new Date('2026-09-28T06:00:00.000Z'));
  act(() => {
    appStateListener?.('background');
  });
  expect(probe).toBe('2026-09-27');
});

it('clears the interval and the AppState subscription on unmount', () => {
  renderProbe();
  expect(jest.getTimerCount()).toBe(1); // the 60s ticker is pending
  unmountAll();
  // Exactly one subscription removal per mount cycle — counted, not just
  // truthiness-checked, so the second cycle below can assert against it.
  expect(mockRemove).toHaveBeenCalledTimes(1);
  // The subscription's removal alone proves nothing about the interval —
  // they are separate cleanups. A leaked 60s timer keeps the jest worker
  // alive after the suite, so assert it directly.
  expect(jest.getTimerCount()).toBe(0);

  // A tick after unmount must be a no-op, not a leak or a state update on an
  // unmounted tree.
  jest.setSystemTime(new Date('2026-09-29T06:00:00.000Z'));
  expect(() => {
    act(() => {
      jest.advanceTimersByTime(5 * 60_000);
    });
  }).not.toThrow();
  expect(probe).toBe('2026-09-27');
});

it('a second mount/unmount cycle re-subscribes and cleans up again', () => {
  // Remounting is the normal screen push/pop path — each cycle must arm a
  // fresh 60s ticker and remove exactly one subscription on the way out,
  // never accumulating timers or listeners across cycles.
  renderProbe();
  expect(jest.getTimerCount()).toBe(1);
  unmountAll();
  expect(jest.getTimerCount()).toBe(0);
  expect(mockRemove).toHaveBeenCalledTimes(1);

  renderProbe();
  // A fresh ticker, not a leaked carry-over plus a new one.
  expect(jest.getTimerCount()).toBe(1);
  act(() => {
    appStateListener?.('active');
  });
  expect(probe).toBe('2026-09-27'); // still the pinned day — it works

  unmountAll();
  expect(mockRemove).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});
