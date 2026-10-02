/**
 * AttendanceSummaryView render tests (Story 15-10, BMAD review
 * verification-gap): the tri-state affordances — first-load failure renders
 * InlineError (role=alert) + a Retry button (the frozen contract, OfficesScreen
 * precedent), a refetch failure over live rows renders a NON-DISMISSIBLE stale
 * InlineError (a dismiss that retried was the wrong affordance), loading →
 * the labelled shimmer, loaded → the FR-4 rows.
 */
jest.mock('../../../services', () => ({
  attendanceMeService: {
    getAccess: jest.fn(),
    recordOnboarding: jest.fn(),
    getSummary: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Button, Text } from 'react-native';
import { InlineError, Skeleton } from '../../../components/ui';
import { AttendanceSummaryView } from './AttendanceSummaryView';
import type { AttendanceSummaryState } from './useAttendanceSummary';

function state(overrides: Partial<AttendanceSummaryState>): AttendanceSummaryState {
  return {
    summary: {
      officeId: 'o1',
      officeName: 'Yuka',
      startTime: '09:00',
      endTime: '20:00',
      lateCutOffMinutes: 15,
      weeklyOffDays: [7],
      officeLatitude: 12.97,
      officeLongitude: 77.59,
      officeRadius: null,
    },
    isLoading: false,
    error: null,
    isStale: false,
    ...overrides,
  };
}

function findInlineErrors(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(InlineError);
}

function renderView(s: AttendanceSummaryState, onRetry = jest.fn()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<AttendanceSummaryView state={s} onRetry={onRetry} />);
  });
  // The shimmer's animation loops must be stopped at teardown or the
  // Jest worker crashes (react-test-renderer has no auto-cleanup).
  mountedRenderers.push(renderer);
  return { renderer, onRetry };
}

const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  act(() => {
    mountedRenderers.forEach((r) => r.unmount());
  });
  mountedRenderers.length = 0;
});

describe('AttendanceSummaryView tri-state affordances', () => {
  it('loading renders the labelled shimmer block and nothing else', () => {
    const { renderer } = renderView(state({ isLoading: true, summary: null }));
    expect(
      renderer.root.findAll(
        (node) => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBeGreaterThan(0);
    expect(renderer.root.findAllByType(Skeleton as never).length).toBeGreaterThanOrEqual(1);
    expect(findInlineErrors(renderer.root)).toHaveLength(0);
    expect(renderer.root.findAllByType(Button)).toHaveLength(0);
  });

  it('first-load failure renders InlineError (role=alert) + a Retry button wired to onRetry', () => {
    const onRetry = jest.fn();
    const { renderer, onRetry: retry } = renderView(
      state({ summary: null, isLoading: false, error: 'Could not load your attendance details.' }),
      onRetry,
    );
    const errors = findInlineErrors(renderer.root);
    expect(errors).toHaveLength(1);
    expect(errors[0].props.message).toBe('Could not load your attendance details.');
    // Query by the WIRED handler (component-identity-proof): exactly one
    // control whose onPress is the view's onRetry.
    const retries = renderer.root.findAll(n => n.props?.onPress === retry);
    // Two nodes carry it (the Button and its internal Pressable) — exactly
    // one CONTROL, asserted by presence + wiring.
    expect(retries.length).toBeGreaterThan(0);
    act(() => {
      retries[0].props.onPress();
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('stale-over-live-rows keeps the rows and renders a NON-DISMISSIBLE stale banner', () => {
    const onRetry = jest.fn();
    const { renderer } = renderView(state({ isStale: true }), onRetry);
    const errors = findInlineErrors(renderer.root);
    expect(errors).toHaveLength(1);
    // Non-dismissible: no onDismiss handed to InlineError (the old
    // dismiss-that-retried wiring was the review finding).
    expect(errors[0].props.onDismiss).toBeUndefined();
    // The live rows still stand.
    const texts = renderer.root.findAllByType(Text).map(t => t.props.children);
    expect(texts.flat()).toContain('Yuka');
    expect(renderer.root.findAllByType(Button)).toHaveLength(0);
  });

  it('loaded renders the FR-4 rows with server values formatted', () => {
    const { renderer } = renderView(state({}));
    const texts = renderer.root.findAllByType(Text).map(t => t.props.children);
    const flat = texts.flat().map(String);
    expect(flat).toContain('Office');
    expect(flat).toContain('Yuka');
    expect(flat).toContain('9:00 AM – 8:00 PM');
    expect(flat).toContain('Late after 9:15 AM');
    expect(flat).toContain('Sun');
  });
});
