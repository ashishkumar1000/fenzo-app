/**
 * useNow — clock liveness under fake timers.
 *
 * The urgency rail's "updates as time passes" contract lives here: initial
 * value, interval tick (clamped against a busy-loop), re-sync on resume from
 * background, and cleanup on unmount.
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
import { useNow } from './useNow';

let probe: number;
function Probe({ intervalMs }: { intervalMs?: number }) {
  probe = useNow(intervalMs);
  return null;
}

function renderProbe(intervalMs?: number) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe intervalMs={intervalMs} />);
  });
  return renderer;
}

beforeEach(() => {
  jest.useFakeTimers();
  appStateListener = null;
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

it('returns the current wall clock on mount', () => {
  const before = Date.now();
  renderProbe();
  expect(probe).toBeGreaterThanOrEqual(before);
});

it('re-ticks once per interval', () => {
  const renderer = renderProbe();
  const mounted = probe;
  act(() => {
    jest.advanceTimersByTime(60_000);
  });
  expect(probe).toBe(mounted + 60_000);
  renderer.unmount();
});

it('does not tick before the interval elapses', () => {
  const renderer = renderProbe();
  const mounted = probe;
  act(() => {
    jest.advanceTimersByTime(59_000);
  });
  expect(probe).toBe(mounted);
  renderer.unmount();
});

it('re-syncs when the app returns to the foreground without waiting for a tick', () => {
  const renderer = renderProbe();
  const mounted = probe;
  act(() => {
    // Halfway to the first tick — a stalled background timer would leave
    // the clock here forever without the AppState re-sync.
    jest.advanceTimersByTime(30_000);
  });
  act(() => {
    appStateListener?.('active');
  });
  expect(probe).toBe(mounted + 30_000);
  renderer.unmount();
});

it('ignores backgrounding — only `active` re-syncs', () => {
  const renderer = renderProbe();
  const mounted = probe;
  act(() => {
    jest.advanceTimersByTime(30_000);
  });
  act(() => {
    appStateListener?.('background');
  });
  expect(probe).toBe(mounted);
  renderer.unmount();
});

it('clears the interval and the AppState subscription on unmount', () => {
  const renderer = renderProbe();
  renderer.unmount();
  expect(mockRemove).toHaveBeenCalled();
  // The unmounted hook can no longer update state — a second tick must be
  // a no-op, not a crash or a leaked timer.
  act(() => {
    jest.advanceTimersByTime(120_000);
  });
  expect(probe).toBeGreaterThan(0);
});

it('clamps a 0 or negative interval to a 1s floor instead of busy-looping', () => {
  const renderer = renderProbe(0);
  const mounted = probe;
  act(() => {
    jest.advanceTimersByTime(999);
  });
  expect(probe).toBe(mounted); // sub-second: nothing fired
  act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(probe).toBe(mounted + 1000); // clamped interval fired exactly once
  renderer.unmount();
});