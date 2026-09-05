/**
 * Tests for the generic useDebounce hook: it holds the previous value until
 * `delayMs` elapses with no further change, and a change before that window
 * elapses restarts the wait rather than stacking up a second update.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useDebounce } from './useDebounce';

let probe: string;
function Probe({ value, delayMs }: { value: string; delayMs: number }) {
  probe = useDebounce(value, delayMs);
  return null;
}

function renderProbe(value: string, delayMs: number) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe value={value} delayMs={delayMs} />);
  });
  return renderer;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('returns the initial value immediately', () => {
  renderProbe('a', 300);
  expect(probe).toBe('a');
});

it('does not update before the delay elapses', () => {
  const renderer = renderProbe('a', 300);
  act(() => {
    renderer.update(<Probe value="ab" delayMs={300} />);
  });
  act(() => {
    jest.advanceTimersByTime(299);
  });
  expect(probe).toBe('a');
});

it('updates once the delay elapses', () => {
  const renderer = renderProbe('a', 300);
  act(() => {
    renderer.update(<Probe value="ab" delayMs={300} />);
  });
  act(() => {
    jest.advanceTimersByTime(300);
  });
  expect(probe).toBe('ab');
});

it('restarts the wait on every change, so only the value that settles ever lands', () => {
  const renderer = renderProbe('a', 300);
  act(() => {
    renderer.update(<Probe value="ab" delayMs={300} />);
  });
  act(() => {
    jest.advanceTimersByTime(200);
  });
  act(() => {
    renderer.update(<Probe value="abc" delayMs={300} />);
  });
  act(() => {
    // The first change's timer would have fired here, had it not restarted.
    jest.advanceTimersByTime(200);
  });
  expect(probe).toBe('a');
  act(() => {
    jest.advanceTimersByTime(100);
  });
  expect(probe).toBe('abc');
});
