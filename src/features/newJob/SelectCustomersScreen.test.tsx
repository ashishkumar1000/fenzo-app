/**
 * Tests for the full-screen Select Customers page behind New Job's "Browse
 * all" — the SelectSkillsScreen twin (product feedback 2026-09-20, story
 * 11-7). The `useCustomers` store hook is stubbed (its own suite covers
 * loading/error/empty; the pure helpers run for real); what matters here is
 * the screen's contract:
 *
 * - rows render from the store (name, location, phone; circle toggle marked
 *   by `accessibilityState`), and search filters them;
 * - single-select: tapping a row replaces the pending selection;
 * - Apply is DISABLED until a row is picked, then pops back to New Job with
 *   the pending id (`popTo` + merge — React Navigation 7's plain `navigate`
 *   would push a duplicate NewJob and strand this screen in the stack);
 * - "Clear" (only enabled with a pending selection) empties the pick: it
 *   pops back immediately with `null` — a job can't be submitted without a
 *   customer, so dropping it is a decision the caller must react to;
 * - the back arrow is a plain goBack that discards the pending state.
 */
jest.mock('../customers', () => ({
  ...jest.requireActual('../customers'),
  useCustomers: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { ActivityIndicator, Text } from 'react-native';
import SelectCustomersScreen from './SelectCustomersScreen';
import { useCustomers } from '../customers';

const useCustomersMock = useCustomers as jest.Mock;

type MockCustomersState = {
  customers: Array<{
    id: string;
    name: string;
    countryCode: string;
    phoneNumber: string;
    address: string | null;
    city: string | null;
    jobCount: number;
    lastJobDate: string | null;
  }>;
  isLoading: boolean;
  error: string | null;
  refresh: jest.Mock;
};

const CUSTOMERS = [
  {
    id: 'c-1',
    name: 'Ravi Kumar',
    countryCode: '+91',
    phoneNumber: '9000000001',
    address: '12 Beach Rd',
    city: 'Chennai',
    jobCount: 3,
    lastJobDate: '2026-09-19T10:00:00Z',
  },
  {
    id: 'c-2',
    name: 'Anita Sharma',
    countryCode: '+91',
    phoneNumber: '9000000002',
    address: null,
    city: null,
    jobCount: 0,
    lastJobDate: null,
  },
];

type NavigationSpy = {
  goBack: jest.Mock;
  popTo: jest.Mock;
  navigate: jest.Mock;
};

// react-test-renderer has no automatic cleanup — an unmounted-in-name-only
// screen whose FlatList layout callback is still pending otherwise keeps
// rescheduling updates after the suite tears down (act warnings, flaky
// workers). Unmount everything between tests.
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderScreen(selectedCustomerId?: string | null) {
  const navigation: NavigationSpy = {
    goBack: jest.fn(),
    popTo: jest.fn(),
    navigate: jest.fn(),
  };
  const route = {
    params: selectedCustomerId === undefined ? undefined : { selectedCustomerId },
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <SelectCustomersScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );
  });
  mountedRenderers.push(renderer);
  return { root: renderer.root, navigation };
}

afterEach(() => {
  while (mountedRenderers.length) {
    const renderer = mountedRenderers.pop();
    act(() => {
      renderer?.unmount();
    });
  }
});

/** Row Pressables — top-level nodes carry both onPress and accessibilityState
 * (nested host views get an auto-injected all-undefined accessibilityState). */
function rows(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAllByProps({ accessibilityRole: 'button' })
    .filter(
      t =>
        typeof t.props.onPress === 'function' &&
        t.props.accessibilityState !== undefined,
    );
}

/** Joins a Text node's children — JSX interpolation yields arrays. */
function nodeText(children: unknown): string {
  if (typeof children === 'string' || typeof children === 'number')
    return String(children);
  if (Array.isArray(children)) return children.map(nodeText).join('');
  return '';
}

function hasText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root
    .findAllByType(Text)
    .some(t => nodeText(t.props.children) === text);
}

/**
 * The Apply button — the only Pressable whose subtree holds the exact label.
 * Pressable renders several tree nodes with the same props; [0] is fine for
 * reading `disabled`.
 */
function applyButton(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAll(node => typeof node.props.onPress === 'function')
    .find(node =>
      node
        .findAllByType(Text)
        .some(t => t.props.children === 'Apply selection'),
    );
}

function clearButton(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByProps({ accessibilityLabel: 'Clear selection' })[0];
}

beforeEach(() => {
  useCustomersMock.mockReturnValue({
    customers: CUSTOMERS,
    isLoading: false,
    error: null,
    hasLoaded: true,
    refresh: jest.fn(),
  });
});

it('renders every store row with name, location and phone, and the total chip', () => {
  const { root } = renderScreen();
  expect(hasText(root, '2 total')).toBe(true);
  expect(hasText(root, 'Ravi Kumar')).toBe(true);
  expect(hasText(root, 'Chennai · 12 Beach Rd')).toBe(true);
  expect(hasText(root, '+91 9000000001')).toBe(true);
  // A customer with no address still renders its phone, without a location line.
  expect(hasText(root, 'Anita Sharma')).toBe(true);
  expect(hasText(root, '+91 9000000002')).toBe(true);
});

it('pre-selects the id the caller arrived with', () => {
  const { root } = renderScreen('c-2');
  expect(rows(root).map(r => r.props.accessibilityState)).toEqual([
    { selected: false },
    { selected: true },
  ]);
});

it('filters rows on search and shows a no-match message', () => {
  const { root } = renderScreen();
  const input = root.findAllByProps({ placeholder: 'Search customers' })[0];

  act(() => {
    input.props.onChangeText('anita');
  });
  expect(hasText(root, 'Ravi Kumar')).toBe(false);
  expect(hasText(root, 'Anita Sharma')).toBe(true);

  act(() => {
    input.props.onChangeText('zzz-none');
  });
  expect(hasText(root, 'Anita Sharma')).toBe(false);
  expect(
    root
      .findAllByType(Text)
      .some(t => nodeText(t.props.children).includes('No customers match')),
  ).toBe(true);
});

it('matches a phone-digit search', () => {
  // Same semantics as the Customers tab — digits of the query against the
  // stored bare number.
  const { root } = renderScreen();
  const input = root.findAllByProps({ placeholder: 'Search customers' })[0];

  act(() => {
    input.props.onChangeText('9000000002');
  });
  expect(hasText(root, 'Anita Sharma')).toBe(true);
  expect(hasText(root, 'Ravi Kumar')).toBe(false);
});

it('replaces the pending selection when another row is tapped (single-select)', () => {
  const { root } = renderScreen();
  act(() => {
    rows(root)[0].props.onPress();
  });
  act(() => {
    rows(root)[1].props.onPress();
  });
  expect(rows(root).map(r => r.props.accessibilityState)).toEqual([
    { selected: false },
    { selected: true },
  ]);
});

it('keeps the selection when the already-selected row is tapped again', () => {
  // Re-tapping the current pick must stay a plain id set — the screen holds
  // the pending id, so Apply still returns exactly what was selected.
  const { root, navigation } = renderScreen('c-2');
  act(() => {
    rows(root)[1].props.onPress();
  });
  expect(rows(root).map(r => r.props.accessibilityState)).toEqual([
    { selected: false },
    { selected: true },
  ]);

  act(() => {
    applyButton(root)?.props.onPress();
  });
  expect(navigation.popTo).toHaveBeenCalledWith(
    'NewJob',
    { selectedCustomerId: 'c-2' },
    { merge: true },
  );
});

it('starts with Apply disabled while nothing is pending', () => {
  const { root } = renderScreen();
  // Calling onPress directly would bypass Pressable's disabled gating — the
  // disabled flag itself is the contract under test here.
  expect(applyButton(root)?.props.disabled).toBe(true);
});

it('enables Apply once a row is picked and pops back with the pending id', () => {
  const { root, navigation } = renderScreen();
  act(() => {
    rows(root)[0].props.onPress();
  });
  expect(applyButton(root)?.props.disabled).toBe(false);

  act(() => {
    applyButton(root)?.props.onPress();
  });
  // popTo, not navigate — v7's navigate pushes a duplicate NewJob.
  expect(navigation.popTo).toHaveBeenCalledWith(
    'NewJob',
    { selectedCustomerId: 'c-1' },
    { merge: true },
  );
  expect(navigation.goBack).not.toHaveBeenCalled();
});

it('keeps Clear disabled until a selection exists, then pops back with null', () => {
  const { root, navigation } = renderScreen();
  expect(clearButton(root).props.disabled).toBe(true);

  act(() => {
    rows(root)[1].props.onPress();
  });
  expect(clearButton(root).props.disabled).toBe(false);

  act(() => {
    clearButton(root).props.onPress();
  });
  expect(navigation.popTo).toHaveBeenCalledWith(
    'NewJob',
    { selectedCustomerId: null },
    { merge: true },
  );
});

it('back arrow discards the pending selection with a plain goBack', () => {
  const { root, navigation } = renderScreen('c-1');
  act(() => {
    root.findAllByProps({ accessibilityLabel: 'Go back' })[0].props.onPress();
  });
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  expect(navigation.popTo).not.toHaveBeenCalled();
});

it('shows a spinner on the first load instead of an empty list', () => {
  useCustomersMock.mockReturnValue({
    customers: [],
    isLoading: true,
    error: null,
    hasLoaded: false,
    refresh: jest.fn(),
  });
  const { root } = renderScreen();

  expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  // Neither the empty-book copy nor the search-failure copy may preempt
  // the load.
  expect(hasText(root, 'No customers yet')).toBe(false);
  expect(hasText(root, 'No customers match')).toBe(false);
});

it('shows the empty-address-book copy when the owner has no customers', () => {
  useCustomersMock.mockReturnValue({
    customers: [],
    isLoading: false,
    error: null,
    hasLoaded: true,
    refresh: jest.fn(),
  });
  const { root } = renderScreen();

  // An empty book is a different state from a failed search — the copy must
  // not assume a query is active.
  expect(
    hasText(root, 'No customers yet. Add your first customer to create a job.'),
  ).toBe(true);
  expect(hasText(root, 'No customers match')).toBe(false);
});

it('shows the error with a retry while the store failed to load', () => {
  const refresh = jest.fn();
  useCustomersMock.mockReturnValue({
    customers: [],
    isLoading: false,
    error: 'Network error',
    hasLoaded: true,
    refresh,
  });
  const { root } = renderScreen();

  expect(hasText(root, 'Network error')).toBe(true);
  // DS Button exposes no accessibilityRole — match on the label instead.
  const retry = root
    .findAll(node => typeof node.props.onPress === 'function')
    .find(node =>
      node.findAllByType(Text).some(t => t.props.children === 'Try again'),
    );
  act(() => {
    retry?.props.onPress();
  });
  expect(refresh).toHaveBeenCalled();
});
