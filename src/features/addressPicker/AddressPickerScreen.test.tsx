/**
 * Render-state tests for AddressPickerScreen: the epic's 8 states switch on
 * `useAddressAutosuggest`'s `phase`, so the hook is mocked here (its own
 * behaviour lives in `useAddressAutosuggest.test.ts`) — these assert on what
 * each phase renders, and on the resolve→navigate-back wiring.
 */
jest.mock('./useAddressAutosuggest', () => ({
  useAddressAutosuggest: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, ActivityIndicator, Text } from 'react-native';
import { EmptyState, InlineError, Input } from '../../components/ui';
import { useAddressAutosuggest } from './useAddressAutosuggest';
import AddressPickerScreen from './AddressPickerScreen';

const useAddressAutosuggestMock = useAddressAutosuggest as jest.Mock;

function suggestion(placeId: string, text: string) {
  return { placeId, text };
}

function mockHook(overrides: Partial<ReturnType<typeof useAddressAutosuggest>> = {}) {
  useAddressAutosuggestMock.mockReturnValue({
    query: '',
    setQuery: jest.fn(),
    phase: 'idle',
    suggestions: [],
    errorMessage: null,
    resolvingPlaceId: null,
    retry: jest.fn(),
    resolvePlace: jest.fn(),
    ...overrides,
  });
}

function renderScreen(returnRouteName: string = 'NewJob') {
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() };
  const route = { params: { returnRouteName } };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AddressPickerScreen navigation={navigation as never} route={route as never} />,
    );
  });
  return { root: renderer.root, renderer, navigation, route };
}

function visibleTexts(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(Text).map(t => t.props.children);
}

/**
 * Pressables that actually carry a handler (React 19 duplicate fibers
 * don't) — same quirk `findAllByType(Pressable)` hits elsewhere in this
 * repo (see `WorkflowStepper.test.tsx`), so rows are located by
 * `accessibilityRole` + `testID` instead.
 */
function suggestionRows(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAllByProps({ accessibilityRole: 'button' })
    .filter(
      p =>
        typeof p.props.testID === 'string' &&
        p.props.testID.startsWith('address-suggestion-') &&
        typeof p.props.onPress === 'function',
    );
}

function backButton(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAllByProps({ accessibilityRole: 'button' })
    .find(p => p.props.accessibilityLabel === 'Go back' && typeof p.props.onPress === 'function');
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('shows nothing extra when idle (blank query)', () => {
  mockHook({ phase: 'idle' });
  const { root } = renderScreen();
  expect(suggestionRows(root)).toHaveLength(0);
  expect(root.findAllByType(EmptyState)).toHaveLength(0);
});

it('shows the below-threshold hint for a 1-2 char query', () => {
  mockHook({ query: 'an', phase: 'below-threshold' });
  const { root } = renderScreen();
  expect(visibleTexts(root)).toContain('Keep typing to search');
});

it('dims the previous results while loading a refetch', () => {
  mockHook({
    query: 'and',
    phase: 'loading',
    suggestions: [suggestion('p1', 'Andheri West, Mumbai')],
  });
  const { root } = renderScreen();
  expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  expect(visibleTexts(root)).toContain('Andheri West, Mumbai');
  // Dimmed AND non-interactive — a refetch in flight must not let the owner
  // pick a suggestion that's about to be replaced.
  expect(suggestionRows(root).every(r => r.props.disabled)).toBe(true);
});

it('renders each suggestion as an accessible row labeled with the full address', () => {
  mockHook({
    query: 'and',
    phase: 'results',
    suggestions: [
      suggestion('p1', 'Andheri West, Mumbai, Maharashtra, India'),
      suggestion('p2', 'Andheri East, Mumbai, Maharashtra, India'),
    ],
  });
  const { root } = renderScreen();
  const rows = suggestionRows(root);
  expect(rows).toHaveLength(2);
  expect(rows[0].props.accessibilityLabel).toBe('Andheri West, Mumbai, Maharashtra, India');
  expect(rows[1].props.accessibilityLabel).toBe('Andheri East, Mumbai, Maharashtra, India');
});

it('shows EmptyState with an Enter-manually CTA that goes back, on no results', () => {
  mockHook({ query: 'zzz', phase: 'no-results' });
  const { root, navigation } = renderScreen();
  const empty = root.findByType(EmptyState);
  expect(empty.props.ctaLabel).toBe('Enter manually');
  act(() => {
    empty.props.onPressCta();
  });
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

it('shows EmptyState with a Retry CTA that re-fires the last query, on autosuggest failure', () => {
  const retry = jest.fn();
  mockHook({ query: 'and', phase: 'error', errorMessage: 'Something went wrong', retry });
  const { root } = renderScreen();
  const empty = root.findByType(EmptyState);
  expect(empty.props.ctaLabel).toBe('Retry');
  expect(empty.props.description).toBe('Something went wrong');
  act(() => {
    empty.props.onPressCta();
  });
  expect(retry).toHaveBeenCalledTimes(1);
});

it('disables the whole list and header, spinning only the tapped row, while resolving', () => {
  mockHook({
    query: 'and',
    phase: 'resolving',
    suggestions: [suggestion('p1', 'Andheri West'), suggestion('p2', 'Andheri East')],
    resolvingPlaceId: 'p1',
  });
  const { root } = renderScreen();
  const rows = suggestionRows(root);
  expect(rows.every(r => r.props.disabled)).toBe(true);
  // Only the resolving row gets a spinner.
  expect(root.findAllByType(ActivityIndicator)).toHaveLength(1);

  expect(backButton(root)?.props.disabled).toBe(true);
  // The search input is locked too — "whole screen non-interactive" means
  // every way to change or leave the query, not just the row list.
  expect(root.findByType(Input).props.disabled).toBe(true);
});

it('shows an InlineError banner over an intact, still-interactive list on resolve failure', () => {
  mockHook({
    query: 'and',
    phase: 'resolve-failed',
    suggestions: [suggestion('p1', 'Andheri West')],
    errorMessage: 'Unable to resolve the selected address right now',
  });
  const { root } = renderScreen();
  const banner = root.findByType(InlineError);
  expect(banner.props.message).toBe('Unable to resolve the selected address right now');
  const rows = suggestionRows(root);
  expect(rows).toHaveLength(1);
  expect(rows[0].props.disabled).toBe(false);
});

describe('selecting a suggestion', () => {
  const resolved = {
    placeId: 'p1',
    formattedAddress: 'Andheri West, Mumbai, Maharashtra 400058, India',
    city: 'Mumbai',
    pincode: '400058',
    latitude: 19.1364,
    longitude: 72.8296,
  };

  it('navigates back to returnRouteName with pendingAddress on a successful resolve', async () => {
    const resolvePlace = jest.fn().mockResolvedValueOnce(resolved);
    mockHook({
      query: 'and',
      phase: 'results',
      suggestions: [suggestion('p1', 'Andheri West')],
      resolvePlace,
    });
    const { root, navigation } = renderScreen('NewJob');
    const row = suggestionRows(root).find(r => r.props.testID === 'address-suggestion-p1');

    await act(async () => {
      await row?.props.onPress();
    });

    expect(resolvePlace).toHaveBeenCalledWith('p1');
    expect(navigation.navigate).toHaveBeenCalledWith({
      name: 'NewJob',
      params: { pendingAddress: resolved },
      merge: true,
    });
  });

  it('does not navigate when the resolve fails', async () => {
    const resolvePlace = jest.fn().mockResolvedValueOnce(null);
    mockHook({
      query: 'and',
      phase: 'results',
      suggestions: [suggestion('p1', 'Andheri West')],
      resolvePlace,
    });
    const { root, navigation } = renderScreen('NewJob');
    const row = suggestionRows(root).find(r => r.props.testID === 'address-suggestion-p1');

    await act(async () => {
      await row?.props.onPress();
    });

    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('live-region announcement on entering Results', () => {
  let announceSpy: jest.SpyInstance;

  beforeEach(() => {
    announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    announceSpy.mockRestore();
  });

  it('announces the plural count once when entering results', () => {
    mockHook({
      query: 'and',
      phase: 'results',
      suggestions: [suggestion('p1', 'Andheri West'), suggestion('p2', 'Andheri East')],
    });
    renderScreen();
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenCalledWith('2 address suggestions found');
  });

  it('announces the singular count for exactly one suggestion', () => {
    mockHook({
      query: 'and',
      phase: 'results',
      suggestions: [suggestion('p1', 'Andheri West')],
    });
    renderScreen();
    expect(announceSpy).toHaveBeenCalledWith('1 address suggestion found');
  });

  it('does not re-fire on an identical re-render with the same suggestions.length', () => {
    mockHook({
      query: 'and',
      phase: 'results',
      suggestions: [suggestion('p1', 'Andheri West'), suggestion('p2', 'Andheri East')],
    });
    const { renderer, navigation, route } = renderScreen();
    expect(announceSpy).toHaveBeenCalledTimes(1);

    act(() => {
      renderer.update(
        <AddressPickerScreen navigation={navigation as never} route={route as never} />,
      );
    });
    expect(announceSpy).toHaveBeenCalledTimes(1);
  });

  it('does not announce for phases other than results', () => {
    mockHook({ query: 'an', phase: 'below-threshold' });
    renderScreen();
    expect(announceSpy).not.toHaveBeenCalled();
  });
});
