/**
 * Tests for the full-screen Select Skills page behind New Job's "Browse all"
 * (product feedback 2026-09-20). The `../skills` store is stubbed (its own
 * suite covers loading/error/empty); what matters here is the screen's
 * contract:
 *
 * - rows render from the catalog (name, description, circle toggle marked by
 *   `accessibilityState`), and search filters them;
 * - single-select: tapping a row replaces the pending selection;
 * - Apply is DISABLED until a row is picked, then pops back to New Job with
 *   the pending id (`popTo` + merge — React Navigation 7's plain `navigate`
 *   would push a duplicate NewJob and strand this screen in the stack);
 * - "Clear" (only enabled with a pending selection) means "this job needs no
 *   skill": it pops back immediately with `null`;
 * - the back arrow is a plain goBack that discards the pending state.
 */
jest.mock('../skills', () => {
  const store = {
    current: {
      skills: [] as Array<{ id: string; name: string; description: string; icon: string }>,
      isLoading: false,
      error: null as string | null,
      refresh: jest.fn(),
    },
  };
  return {
    __store: store,
    useSkills: () => store.current,
    SkillIcon: () => null,
  };
});

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import SelectSkillsScreen from './SelectSkillsScreen';

const MOCK_STORE = (
  jest.requireMock('../skills') as {
    __store: { current: MockSkillsState };
  } & Record<string, unknown>
).__store;

type MockSkillsState = {
  skills: Array<{ id: string; name: string; description: string; icon: string }>;
  isLoading: boolean;
  error: string | null;
  refresh: jest.Mock;
};

const SKILLS = [
  { id: 'sk-plumb', name: 'Plumbing', description: 'Pipe leaks and drains', icon: 'droplets' },
  { id: 'sk-elec', name: 'Electrical', description: 'Wiring and fittings', icon: 'cable' },
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

function renderScreen(selectedSkillId?: string | null) {
  const navigation: NavigationSpy = {
    goBack: jest.fn(),
    popTo: jest.fn(),
    navigate: jest.fn(),
  };
  const route = {
    params: selectedSkillId === undefined ? undefined : { selectedSkillId },
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <SelectSkillsScreen
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
  MOCK_STORE.current = {
    skills: SKILLS,
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  };
});

it('renders every catalog row with name and description, and the total chip', () => {
  const { root } = renderScreen();
  expect(hasText(root, '2 total')).toBe(true);
  expect(hasText(root, 'Plumbing')).toBe(true);
  expect(hasText(root, 'Pipe leaks and drains')).toBe(true);
  expect(hasText(root, 'Electrical')).toBe(true);
});

it('pre-selects the id the caller arrived with', () => {
  const { root } = renderScreen('sk-elec');
  expect(rows(root).map(r => r.props.accessibilityState)).toEqual([
    { selected: false },
    { selected: true },
  ]);
});

it('filters rows on search and shows a no-match message', () => {
  const { root } = renderScreen();
  const input = root.findAllByProps({ placeholder: 'Search skills' })[0];

  act(() => {
    input.props.onChangeText('wiring');
  });
  expect(hasText(root, 'Plumbing')).toBe(false);
  expect(hasText(root, 'Electrical')).toBe(true);

  act(() => {
    input.props.onChangeText('zzz-none');
  });
  expect(hasText(root, 'Electrical')).toBe(false);
  expect(
    root
      .findAllByType(Text)
      .some(t => nodeText(t.props.children).includes('No skills match')),
  ).toBe(true);
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
  const { root, navigation } = renderScreen('sk-elec');
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
    { selectedSkillId: 'sk-elec' },
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
    { selectedSkillId: 'sk-plumb' },
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
    { selectedSkillId: null },
    { merge: true },
  );
});

it('back arrow discards the pending selection with a plain goBack', () => {
  const { root, navigation } = renderScreen('sk-plumb');
  act(() => {
    root.findAllByProps({ accessibilityLabel: 'Go back' })[0].props.onPress();
  });
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  expect(navigation.popTo).not.toHaveBeenCalled();
});

it('shows the error with a retry while the catalog failed to load', () => {
  MOCK_STORE.current = {
    skills: [],
    isLoading: false,
    error: 'Network error',
    refresh: MOCK_STORE.current.refresh,
  };
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
  expect(MOCK_STORE.current.refresh).toHaveBeenCalled();
});
