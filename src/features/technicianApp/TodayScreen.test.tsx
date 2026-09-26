/**
 * TodayScreen — the technician bell's contract (Story 14-3): the header
 * bell navigates to the shared Notifications route, the unread badge
 * renders the shared store's count (hidden at 0/null, capped at 99+), and
 * focus loads both the day's jobs and the badge. The store modules are
 * mocked with plain fixtures — nothing here touches the network.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

// Story 14-3: focus loads Today AND the bell's unread count — unforced,
// both stores' TTLs decide.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]),
    useNavigation: () => mockNavigation,
  };
});

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

let mockProfile: { name: string | null } | null = { name: 'Priya' };
jest.mock('../profile', () => ({
  useMyProfile: () => ({ profile: mockProfile }),
  loadMyProfile: jest.fn(),
  firstName: (name: string | null) => (name ? name.split(' ')[0] : null),
}));

/** Swappable jobs fixture — the bell tests only need the list to be quiet. */
let mockJobsStore: {
  today: never[];
  isLoadingToday: boolean;
  errorToday: string | null;
  hasLoadedToday: boolean;
  refreshToday: () => Promise<void>;
};
const mockLoadToday = jest.fn();
jest.mock('./useTechnicianJobs', () => ({
  useTechnicianJobs: () => mockJobsStore,
  loadToday: (...args: unknown[]) => mockLoadToday(...args),
}));

let mockUnreadCount: number | null = null;
const mockLoadUnreadCount = jest.fn();
jest.mock('../notifications', () => ({
  loadUnreadCount: (...args: unknown[]) => mockLoadUnreadCount(...args),
  useNotifications: () => ({ unreadCount: mockUnreadCount }),
}));

jest.mock('../../hooks', () => ({ useNow: () => 0 }));

import TodayScreen from './TodayScreen';
import { EmptyState } from '../../components/ui';

type Renderer = ReactTestRenderer.ReactTestRenderer;

async function mountScreen(): Promise<Renderer> {
  let renderer!: Renderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(React.createElement(TodayScreen));
  });
  return renderer;
}

/** The rendered text joined — the badge pill is a Text, so it shows here. */
function renderedText(renderer: Renderer): string {
  return renderer.root.findAllByType(Text).map(t => String(t.props.children)).join('\n');
}

beforeEach(() => {
  mockJobsStore = {
    today: [],
    isLoadingToday: false,
    errorToday: null,
    hasLoadedToday: true,
    refreshToday: jest.fn().mockResolvedValue(undefined),
  };
  mockUnreadCount = null;
});

afterEach(() => {
  jest.clearAllMocks();
});

it('the bell navigates to the shared Notifications route', async () => {
  const renderer = await mountScreen();

  await act(async () => {
    renderer.root.findAllByProps({ label: 'Notifications' })[0].props.onPress();
  });
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Notifications');
});

it('focus loads today and the badge, both unforced (the stores throttle)', async () => {
  await mountScreen();
  expect(mockLoadToday).toHaveBeenCalledWith();
  expect(mockLoadUnreadCount).toHaveBeenCalledWith();
});

it('the badge hides with no unread count (0 or null) — no pill, no lie', async () => {
  mockUnreadCount = null;
  const unloaded = await mountScreen();
  expect(unloaded.root.findAllByProps({ label: 'Notifications' })[0].findAllByType(Text))
    .toHaveLength(0);

  mockUnreadCount = 0;
  const zero = await mountScreen();
  expect(zero.root.findAllByProps({ label: 'Notifications' })[0].findAllByType(Text))
    .toHaveLength(0);
});

it("the badge shows the unread count, capped at 99+ (the shared bell's own vocabulary)", async () => {
  mockUnreadCount = 3;
  const few = await mountScreen();
  expect(renderedText(few)).toContain('3');

  mockUnreadCount = 120;
  const many = await mountScreen();
  expect(renderedText(many)).toContain('99+');
});

it('an empty day still renders the empty state (the bell changes nothing else)', async () => {
  const renderer = await mountScreen();
  expect(renderer.root.findByType(EmptyState).props.title).toBe('No job assigned yet');
});
