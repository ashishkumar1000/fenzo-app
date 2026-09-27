/**
 * Tests for useFlashMessage (Story 15-6): the transient success-banner
 * message behind both attendance settings screens.
 *
 *  - flash() shows the message and arms the auto-dismiss timer.
 *  - The message clears itself after FLASH_MESSAGE_MS (pinned at 1500 —
 *    the spec's "auto-dismisses after ~1500ms" contract).
 *  - A second flash REPLACES the message and restarts the timer (the
 *    first timer must not clear the second message early); a repeat flash
 *    of the SAME message re-arms the timer too.
 *  - The `durationMs` param overrides the default window.
 *  - dismiss() clears immediately and cancels the pending timer.
 *  - Unmount cancels the timer — asserted with jest.getTimerCount(),
 *    which is the only way the suite can actually DETECT a leaked
 *    interval/timeout keeping the worker alive (15-6 review).
 *  - Every flash is announced via AccessibilityInfo (15-6 review
 *    iteration 1, user decision) — the banner is transient and visually
 *    inserted, so the announcement is the only way a screen-reader user
 *    hears the success.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
import {
  FLASH_MESSAGE_MS,
  useFlashMessage,
} from './useFlashMessage';

let result: ReturnType<typeof useFlashMessage>;

function Probe({ durationMs }: { durationMs?: number }) {
  result = useFlashMessage(durationMs);
  return null;
}

function renderProbe(durationMs?: number): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe durationMs={durationMs} />);
  });
  return renderer;
}

let announceSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  announceSpy = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined as never);
});

afterEach(() => {
  announceSpy.mockRestore();
  jest.useRealTimers();
});

describe('useFlashMessage', () => {
  it('pins the duration constant at 1500ms (the spec contract)', () => {
    expect(FLASH_MESSAGE_MS).toBe(1500);
  });

  it('starts with no message', () => {
    renderProbe();
    expect(result.message).toBeNull();
  });

  it('flash shows the message and auto-dismisses after the duration', () => {
    renderProbe();
    act(() => {
      result.flash('Weekly off saved');
    });
    expect(result.message).toBe('Weekly off saved');

    act(() => {
      jest.advanceTimersByTime(FLASH_MESSAGE_MS - 1);
    });
    expect(result.message).toBe('Weekly off saved');

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.message).toBeNull();
  });

  it('a second flash replaces the message and restarts the timer', () => {
    renderProbe();
    act(() => {
      result.flash('Weekly off saved');
    });
    act(() => {
      jest.advanceTimersByTime(FLASH_MESSAGE_MS - 1);
    });
    act(() => {
      result.flash('Override removed');
    });
    // The first message's timer must not clear the second message early.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.message).toBe('Override removed');

    act(() => {
      jest.advanceTimersByTime(FLASH_MESSAGE_MS);
    });
    expect(result.message).toBeNull();
  });

  it('a repeat flash of the SAME message re-arms the timer', () => {
    renderProbe();
    act(() => {
      result.flash('Weekly off saved');
    });
    act(() => {
      jest.advanceTimersByTime(FLASH_MESSAGE_MS - 1);
    });
    // Same string — the state value does not change, but the user ran a
    // second action and the banner must stay up a FULL window from now,
    // not be cleared by the first flash's almost-expired timer.
    act(() => {
      result.flash('Weekly off saved');
    });
    // t=1500: the FIRST flash's timer would have fired exactly here had
    // the re-flash not cleared it.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.message).toBe('Weekly off saved');
    // The re-armed window runs a full FLASH_MESSAGE_MS from the second
    // flash (t=1499 → fires at t=2999).
    act(() => {
      jest.advanceTimersByTime(FLASH_MESSAGE_MS - 2);
    });
    expect(result.message).toBe('Weekly off saved');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.message).toBeNull();
  });

  it('the durationMs param overrides the default window', () => {
    renderProbe(500);
    act(() => {
      result.flash('Holiday added');
    });
    act(() => {
      jest.advanceTimersByTime(499);
    });
    expect(result.message).toBe('Holiday added');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.message).toBeNull();
  });

  it('dismiss clears the message immediately and cancels the timer', () => {
    renderProbe();
    act(() => {
      result.flash('Holiday added');
    });
    act(() => {
      result.dismiss();
    });
    expect(result.message).toBeNull();

    // No pending auto-dismiss fires later to (pointlessly) clear again —
    // and crucially no timer survives to keep the worker alive.
    act(() => {
      jest.advanceTimersByTime(FLASH_MESSAGE_MS * 2);
    });
    expect(result.message).toBeNull();
  });

  it('unmount cancels the pending auto-dismiss timer (no leak)', () => {
    const before = jest.getTimerCount();
    const renderer = renderProbe();
    act(() => {
      result.flash('Weekly off saved');
    });
    // One armed timeout.
    expect(jest.getTimerCount()).toBe(before + 1);

    act(() => {
      renderer.unmount();
    });
    // The cleanup cleared it — this is the assertion that actually fails
    // when a refactor drops the unmount effect.
    expect(jest.getTimerCount()).toBe(before);
  });

  it('announces every flash through AccessibilityInfo', () => {
    renderProbe();
    act(() => {
      result.flash('Weekly off saved');
    });
    expect(announceSpy).toHaveBeenCalledWith('Weekly off saved');

    act(() => {
      result.flash('Override removed');
    });
    expect(announceSpy).toHaveBeenCalledWith('Override removed');
  });
});
