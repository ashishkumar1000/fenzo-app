/**
 * Render-state tests for SkillsScreen (story 5.1 review follow-up): the
 * first-load spinner, the AC-2 empty copy, and the load-failure EmptyState
 * with its retry CTA. The store is mocked — its own behaviour lives in
 * `useSkills.test.tsx`; `useFocusEffect` is stubbed because there is no
 * navigation container under react-test-renderer.
 */
jest.mock('./useSkills', () => ({
  useSkills: jest.fn(),
  loadSkills: jest.fn().mockResolvedValue(undefined),
  addSkill: jest.fn(),
  removeSkill: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { ActivityIndicator, Text } from 'react-native';
import { EmptyState } from '../../components/ui';
import { useSkills } from './useSkills';
import type { Skill } from '../../services';
import SkillsScreen from './SkillsScreen';

const useSkillsMock = useSkills as jest.Mock;

function skill(id: string, name: string): Skill {
  return { id, name, tenantId: 'tenant-1', createdAt: '2026-08-01T06:00:00.000Z' };
}

function mockStore(overrides: Partial<ReturnType<typeof useSkills>> = {}) {
  useSkillsMock.mockReturnValue({
    skills: [],
    count: 0,
    isLoading: false,
    error: null,
    hasLoaded: true,
    lastLoadedAt: 1,
    refresh: jest.fn(),
    clear: jest.fn(),
    ...overrides,
  });
}

const navigation = { goBack: jest.fn() } as never;

function renderScreen() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<SkillsScreen navigation={navigation} route={undefined as never} />);
  });
  return renderer.root;
}

function visibleTexts(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(Text).map(t => t.props.children);
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('shows the spinner while the first load is in flight', () => {
  mockStore({ isLoading: true, hasLoaded: false });
  const root = renderScreen();
  expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
});

it('shows the AC-2 empty copy when loaded with no skills', () => {
  mockStore();
  const root = renderScreen();
  expect(visibleTexts(root)).toContain('No skills yet — add your first');
});

it('shows the load-failure EmptyState with a working retry when nothing loaded', () => {
  const refresh = jest.fn();
  mockStore({ error: 'Network request failed', hasLoaded: false, refresh });
  const root = renderScreen();
  expect(visibleTexts(root)).toContain("Couldn't load skills");
  expect(visibleTexts(root)).toContain('Try again');

  const errorState = root.findAllByType(EmptyState).find(e => e.props.onPressCta);
  act(() => {
    errorState?.props.onPressCta();
  });
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('renders the shared store rows in store (alphabetical) order', () => {
  mockStore({ skills: [skill('s1', 'AC repair'), skill('s2', 'Brake check')], count: 2 });
  const texts = visibleTexts(renderScreen());
  expect(texts.indexOf('AC repair')).toBeLessThan(texts.indexOf('Brake check'));
});