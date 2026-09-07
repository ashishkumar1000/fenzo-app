/**
 * Render-state tests for AddressPickerSheet: the epic's 8 states switch on
 * `useAddressAutosuggest`'s `phase`, so the hook is mocked here (its own
 * behaviour lives in `useAddressAutosuggest.test.ts`) — these assert on what
 * each phase renders, on the resolve→onResolved wiring, and on the
 * reset-on-open contract this component owns (unlike the old pushed-screen
 * version, this sheet stays mounted across opens, so it must reset itself).
 */
jest.mock('./useAddressAutosuggest', () => ({
  useAddressAutosuggest: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, ActivityIndicator, Text, TextInput } from 'react-native';
import { Button, EmptyState, InlineError, Input, Sheet } from '../../components/ui';
import { useAddressAutosuggest } from './useAddressAutosuggest';
import AddressPickerSheet from './AddressPickerSheet';
import { ManualAddressForm } from './ManualAddressForm';

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
    reset: jest.fn(),
    ...overrides,
  });
}

function renderSheet(props: Partial<Parameters<typeof AddressPickerSheet>[0]> = {}) {
  const onClose = jest.fn();
  const onResolved = jest.fn();
  const onManualAddress = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AddressPickerSheet
        visible
        onClose={onClose}
        onResolved={onResolved}
        onManualAddress={onManualAddress}
        {...props}
      />,
    );
  });
  return { root: renderer.root, renderer, onClose, onResolved, onManualAddress };
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

beforeEach(() => {
  jest.clearAllMocks();
});

it('calls reset when the sheet opens', () => {
  const reset = jest.fn();
  mockHook({ reset });

  renderSheet({ visible: true });

  expect(reset).toHaveBeenCalledTimes(1);
});

it('does not call reset while staying closed', () => {
  const reset = jest.fn();
  mockHook({ reset });

  renderSheet({ visible: false });

  expect(reset).not.toHaveBeenCalled();
});

function texts(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(Text).map(t => t.props.children);
}

it('shows an inviting prompt when idle (blank query)', () => {
  mockHook({ phase: 'idle' });
  const { root } = renderSheet();
  expect(texts(root)).toContain('Find a verified address');
});

it('shows the below-threshold hint for a 1-2 char query', () => {
  mockHook({ phase: 'below-threshold', query: 'a' });
  const { root } = renderSheet();
  expect(texts(root)).toContain('Keep typing');
});

it('dims the previous results while loading a refetch', () => {
  mockHook({
    phase: 'loading',
    query: 'and',
    suggestions: [suggestion('p1', 'Andheri West, Mumbai')],
  });
  const { root } = renderSheet();
  expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  expect(suggestionRows(root)).toHaveLength(1);
});

it('renders each suggestion as an accessible row labeled with the full address', () => {
  mockHook({
    phase: 'results',
    query: 'and',
    suggestions: [suggestion('p1', 'Andheri West, Mumbai, Maharashtra, India')],
  });
  const { root } = renderSheet();
  const row = suggestionRows(root)[0];
  expect(row.props.accessibilityLabel).toBe('Andheri West, Mumbai, Maharashtra, India');
});

it('shows EmptyState with an Enter-manually CTA that swaps in the manual form, on no results', () => {
  mockHook({ phase: 'no-results', query: 'zzz' });
  const { root, onClose } = renderSheet();
  const emptyState = root.findByType(EmptyState);
  expect(emptyState.props.ctaLabel).toBe('Enter manually');

  act(() => {
    emptyState.props.onPressCta();
  });
  // The sheet stays open — manual entry happens inside it (the caller only
  // closes after a pick, same contract as `onResolved`).
  expect(onClose).not.toHaveBeenCalled();
  expect(root.findByType(ManualAddressForm)).toBeTruthy();
});

it('shows EmptyState with a Retry CTA that re-fires the last query, on autosuggest failure', () => {
  const retry = jest.fn();
  mockHook({ phase: 'error', errorMessage: 'Network error', retry });
  const { root } = renderSheet();
  const emptyState = root.findByType(EmptyState);
  expect(emptyState.props.ctaLabel).toBe('Retry');

  act(() => {
    emptyState.props.onPressCta();
  });
  expect(retry).toHaveBeenCalledTimes(1);
});

it('disables the list while resolving, spinning only the tapped row', () => {
  mockHook({
    phase: 'resolving',
    query: 'and',
    suggestions: [suggestion('p1', 'Andheri West'), suggestion('p2', 'Andheri East')],
    resolvingPlaceId: 'p1',
  });
  const { root, onClose } = renderSheet();
  const rows = suggestionRows(root);
  expect(rows[0].props.accessibilityState).toEqual({ disabled: true, busy: true });
  expect(rows[1].props.accessibilityState).toEqual({ disabled: true, busy: false });

  // The search input is locked too, and the sheet can't be dismissed
  // (natively via `dismissible`, and its `onClose` prop is a no-op even if
  // something did fire it) — "whole sheet non-interactive" means every way
  // to change or leave the query, not just the row list.
  expect(root.findByType(Input).props.disabled).toBe(true);
  const sheet = root.findByType(Sheet);
  expect(sheet.props.dismissible).toBe(false);
  sheet.props.onClose();
  expect(onClose).not.toHaveBeenCalled();
});

it('shows an InlineError banner over an intact, still-interactive list on resolve failure', () => {
  mockHook({
    phase: 'resolve-failed',
    query: 'and',
    suggestions: [suggestion('p1', 'Andheri West')],
    errorMessage: 'Could not resolve',
  });
  const { root } = renderSheet();
  expect(root.findByType(InlineError).props.message).toBe('Could not resolve');
  expect(suggestionRows(root)[0].props.disabled).toBe(false);
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

  it('calls onResolved (not onClose) on a successful resolve — the caller closes the sheet', async () => {
    const resolvePlace = jest.fn().mockResolvedValueOnce(resolved);
    mockHook({
      query: 'and',
      phase: 'results',
      suggestions: [suggestion('p1', 'Andheri West')],
      resolvePlace,
    });
    const { root, onResolved, onClose } = renderSheet();
    const row = suggestionRows(root).find(r => r.props.testID === 'address-suggestion-p1');

    await act(async () => {
      await row?.props.onPress();
    });

    expect(resolvePlace).toHaveBeenCalledWith('p1');
    expect(onResolved).toHaveBeenCalledWith(resolved);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onResolved when the resolve fails', async () => {
    const resolvePlace = jest.fn().mockResolvedValueOnce(null);
    mockHook({
      query: 'and',
      phase: 'results',
      suggestions: [suggestion('p1', 'Andheri West')],
      resolvePlace,
    });
    const { root, onResolved } = renderSheet();
    const row = suggestionRows(root).find(r => r.props.testID === 'address-suggestion-p1');

    await act(async () => {
      await row?.props.onPress();
    });

    expect(onResolved).not.toHaveBeenCalled();
  });
});

describe('live-region announcement on entering Results', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });

  it('announces the plural count once when entering results', () => {
    mockHook({
      phase: 'results',
      query: 'and',
      suggestions: [suggestion('p1', 'A'), suggestion('p2', 'B')],
    });
    renderSheet();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      '2 address suggestions found',
    );
  });

  it('announces the singular count for exactly one suggestion', () => {
    mockHook({ phase: 'results', query: 'and', suggestions: [suggestion('p1', 'A')] });
    renderSheet();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      '1 address suggestion found',
    );
  });

  it('does not announce for phases other than results', () => {
    mockHook({ phase: 'idle' });
    renderSheet();
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });
});

describe('manual-entry mode (no-results fallback)', () => {
  /** Renders the sheet, then presses the no-results "Enter manually" CTA. */
  function openManual() {
    mockHook({ phase: 'no-results', query: 'zzz' });
    const utils = renderSheet();
    act(() => {
      utils.root.findByType(EmptyState).props.onPressCta();
    });
    return utils;
  }

  function hasSearchInput(root: ReactTestRenderer.ReactTestInstance) {
    return root
      .findAllByType(Input)
      .some(input => input.props.placeholder === 'Search address...');
  }

  it('hides the search UI and swaps the sheet chrome to the manual title', () => {
    const { root } = openManual();
    expect(hasSearchInput(root)).toBe(false);
    expect(root.findByType(Sheet).props.title).toBe('Enter address');
  });

  it('emits the entry through onManualAddress and leaves closing to the caller', () => {
    const { root, onManualAddress, onClose } = openManual();
    const addressInput = root
      .findAllByType(TextInput)
      .find(t => t.props.placeholder?.startsWith('e.g. Flat 302'));
    act(() => {
      addressInput?.props.onChangeText('12 MG Road');
    });

    const useButton = root
      .findAllByType(Button)
      .find(b => b.props.children === 'Use this address');
    act(() => {
      useButton?.props.onPress();
    });

    expect(onManualAddress).toHaveBeenCalledWith({
      addressLine: '12 MG Road',
      city: null,
    });
    // The caller closes after a pick — same contract as `onResolved`.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('"Back to search" restores the search UI with the hook state intact', () => {
    const { root } = openManual();
    act(() => {
      root.findByProps({ accessibilityLabel: 'Back to address search' }).props.onPress();
    });

    expect(root.findByType(EmptyState)).toBeTruthy();
    expect(hasSearchInput(root)).toBe(true);
  });

  it('returns to search mode when the sheet is reopened', () => {
    const { root, renderer, onClose, onResolved, onManualAddress } = openManual();
    const props = { onClose, onResolved, onManualAddress };

    act(() => {
      renderer.update(<AddressPickerSheet visible={false} {...props} />);
    });
    act(() => {
      renderer.update(<AddressPickerSheet visible {...props} />);
    });

    expect(hasSearchInput(root)).toBe(true);
  });
});
