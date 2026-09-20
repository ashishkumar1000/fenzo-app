/**
 * Tests for the full-screen Select Technicians page behind New Job's "Browse
 * all" — the SelectCustomersScreen twin (product feedback 2026-09-20, story
 * 11-8). The `useMyProfile` store hook is stubbed (its own suite covers
 * loading/error/empty; the pure helpers run for real); what matters here is
 * the screen's contract:
 *
 * - rows render the FULL roster from the profile store (name, skills, phone,
 *   "Matches skill" pill, "Invited" caption; circle toggle marked by
 *   `accessibilityState`), and search filters them;
 * - the caller's `skillId` is read-only context: it marks matching rows,
 *   it never filters;
 * - single-select: tapping a row replaces the pending selection;
 * - Apply is DISABLED until a row is picked, then pops back to New Job with
 *   the pending id (`popTo` + merge — React Navigation 7's plain `navigate`
 *   would push a duplicate NewJob and strand this screen in the stack);
 * - "Clear" (only enabled with a pending selection) empties the pick: it
 *   pops back immediately with `null` — a job can't be submitted without a
 *   technician, so dropping it is a decision the caller must react to;
 * - the back arrow is a plain goBack that discards the pending state.
 */
jest.mock('../profile', () => ({
  useMyProfile: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { ActivityIndicator, Text } from 'react-native';
import SelectTechniciansScreen from './SelectTechniciansScreen';
import { useMyProfile } from '../profile';

const useMyProfileMock = useMyProfile as jest.Mock;

type MockProfileState = {
  profile: { technicians: Array<Record<string, unknown>> } | null;
  isLoading: boolean;
  error: string | null;
  refresh: jest.Mock;
};

const TECHNICIANS = [
  {
    id: 't-1',
    name: 'Ravi Kumar',
    countryCode: '+91',
    phoneNumber: '9000000001',
    status: 'active',
    skills: ['Plumbing'],
    skillIds: ['s-1'],
    createdAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 't-2',
    name: 'Anita Sharma',
    countryCode: '+91',
    phoneNumber: '9000000002',
    status: 'active',
    skills: ['Electrical', 'AC repair'],
    skillIds: ['s-2', 's-3'],
    createdAt: '2026-09-02T10:00:00Z',
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

function renderScreen(
  selectedTechnicianId?: string | null,
  skillId?: string,
) {
  const navigation: NavigationSpy = {
    goBack: jest.fn(),
    popTo: jest.fn(),
    navigate: jest.fn(),
  };
  const route = {
    params:
      selectedTechnicianId === undefined && skillId === undefined
        ? undefined
        : {
            ...(selectedTechnicianId === undefined
              ? {}
              : { selectedTechnicianId }),
            ...(skillId === undefined ? {} : { skillId }),
          },
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <SelectTechniciansScreen
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
  useMyProfileMock.mockReturnValue({
    profile: { technicians: TECHNICIANS },
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  } satisfies MockProfileState as never);
});

it('renders every roster row with name, skills and phone, and the total chip', () => {
  const { root } = renderScreen();
  expect(hasText(root, '2 total')).toBe(true);
  expect(hasText(root, 'Ravi Kumar')).toBe(true);
  expect(hasText(root, 'Plumbing')).toBe(true);
  expect(hasText(root, '+91 9000000001')).toBe(true);
  expect(hasText(root, 'Anita Sharma')).toBe(true);
  expect(hasText(root, 'Electrical, AC repair')).toBe(true);
  expect(hasText(root, '+91 9000000002')).toBe(true);
});

it('pre-selects the id the caller arrived with', () => {
  const { root } = renderScreen('t-2');
  expect(rows(root).map(r => r.props.accessibilityState)).toEqual([
    { selected: false },
    { selected: true },
  ]);
});

it('marks rows that carry the caller skill without filtering by it', () => {
  // skillId is read-only context: every row stays listed, matching ones get
  // the advisory pill — the screen must never hide a technician.
  const { root } = renderScreen(undefined, 's-1');
  expect(hasText(root, '2 total')).toBe(true);
  expect(hasText(root, 'Matches skill')).toBe(true);
  expect(rows(root)).toHaveLength(2);

  // No skill handed over → no pill anywhere.
  const plain = renderScreen();
  expect(hasText(plain.root, 'Matches skill')).toBe(false);
});

it('shows the Invited caption for a technician still awaiting install', () => {
  useMyProfileMock.mockReturnValue({
    profile: {
      technicians: [
        { ...TECHNICIANS[0], status: 'invited' },
        TECHNICIANS[1],
      ],
    },
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  } satisfies MockProfileState as never);

  const { root } = renderScreen();
  expect(hasText(root, 'Invited')).toBe(true);
});

it('filters rows on search and shows a no-match message', () => {
  const { root } = renderScreen();
  const input = root.findAllByProps({ placeholder: 'Search technicians' })[0];

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
      .some(t => nodeText(t.props.children).includes('No technicians match')),
  ).toBe(true);
});

it('matches a phone-digit search', () => {
  // Same semantics as the customers picker — digits of the query against the
  // stored bare number.
  const { root } = renderScreen();
  const input = root.findAllByProps({ placeholder: 'Search technicians' })[0];

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
  const { root, navigation } = renderScreen('t-2');
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
    { selectedTechnicianId: 't-2' },
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
    { selectedTechnicianId: 't-1' },
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
    { selectedTechnicianId: null },
    { merge: true },
  );
});

it('back arrow discards the pending selection with a plain goBack', () => {
  const { root, navigation } = renderScreen('t-1');
  act(() => {
    root.findAllByProps({ accessibilityLabel: 'Go back' })[0].props.onPress();
  });
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  expect(navigation.popTo).not.toHaveBeenCalled();
});

it('shows a spinner on the first load instead of an empty list', () => {
  useMyProfileMock.mockReturnValue({
    profile: null,
    isLoading: true,
    error: null,
    refresh: jest.fn(),
  } satisfies MockProfileState as never);
  const { root } = renderScreen();

  expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  // Neither the empty-roster copy nor the search-failure copy may preempt
  // the load.
  expect(hasText(root, 'No technicians yet')).toBe(false);
  expect(hasText(root, 'No technicians match')).toBe(false);
});

it('shows the empty-roster copy when the owner has no technicians', () => {
  useMyProfileMock.mockReturnValue({
    profile: { technicians: [] },
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  } satisfies MockProfileState as never);
  const { root } = renderScreen();

  // An empty roster is a different state from a failed search — the copy
  // must not assume a query is active (and it aligns with New Job's own
  // empty copy for the same store).
  expect(
    hasText(
      root,
      'No technicians yet. A job has to be assigned to someone, so add a technician before creating one.',
    ),
  ).toBe(true);
  expect(hasText(root, 'No technicians match')).toBe(false);
});

it('shows the error with a retry while the store failed to load', () => {
  const refresh = jest.fn();
  useMyProfileMock.mockReturnValue({
    profile: null,
    isLoading: false,
    error: 'Network error',
    refresh,
  } satisfies MockProfileState as never);
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
