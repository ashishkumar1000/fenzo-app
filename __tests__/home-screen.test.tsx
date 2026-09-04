/**
 * HomeScreen — the greeting/first-run branches plus the header stat wiring.
 * The screen's whole surface comes from `GET /users/me` via `useMyProfile`;
 * the user-reported render crash (2026-09-04) happened because nothing
 * verified the payload shape this screen consumes, so this file pins the
 * contract: a profile carrying `jobCounts` must render the header stats
 * without crashing, on both first-run and normal Home.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ScrollView } from 'react-native';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => false) };

/**
 * Captured focus-effect callback — the test for the story-1.4 focus refresh
 * invokes it directly instead of simulating a tab switch.
 */
let focusEffect: (() => void) | null = null;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (effect: () => void) => {
    focusEffect = effect;
  },
}));

jest.mock('../src/features/profile', () => ({
  useMyProfile: jest.fn(),
  loadMyProfile: jest.fn(),
}));

jest.mock('../src/features/home', () => ({
  QuickActions: () => null,
}));

import HomeScreen from '../src/screens/HomeScreen';
import { loadMyProfile, useMyProfile } from '../src/features/profile';
import type { MyProfile } from '../src/services';

const useMyProfileMock = useMyProfile as jest.Mock;
const loadMyProfileMock = loadMyProfile as jest.Mock;

/** A completed-setup owner profile, exactly the shape `/users/me` returns. */
function makeProfile(overrides: Partial<MyProfile> = {}): MyProfile {
  return {
    id: 'u-1',
    name: 'Kumar Selvan',
    countryCode: '+91',
    phoneNumber: '9000000000',
    status: 'active',
    role: 'owner',
    tenant: {
      id: 't-1',
      companyName: 'Fenzit Services',
      gstin: null,
      address: null,
      stateCode: 'TN',
      serviceCategories: [],
      upiVpa: null,
    },
    technicians: [],
    technicianCount: 2,
    customers: { data: [], nextCursor: null, hasMore: false },
    jobs: { data: [], nextCursor: null, hasMore: false },
    jobCounts: { today: 1, upcoming: 2, overdue: 0, completed: 3, cancelled: 1 },
    ...overrides,
  };
}

function allText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: { children: unknown[] }) => {
    for (const child of node.children) {
      if (typeof child === 'string') parts.push(child);
      else walk(child as { children: unknown[] });
    }
  };
  walk(renderer.root as unknown as { children: unknown[] });
  return parts.join(' ');
}

async function mountScreen(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    // Navigation props are type-only surface — the hooks are mocked above.
    renderer = create(
      React.createElement(HomeScreen, {
        navigation: mockNavigation,
        route: { key: 'Home', name: 'Home' },
      } as never),
    );
  });
  return renderer;
}

afterEach(() => {
  jest.clearAllMocks();
  focusEffect = null;
});

it('renders the greeting and header stats from the jobCounts buckets', async () => {
  useMyProfileMock.mockReturnValue({
    profile: makeProfile(),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    dismissError: jest.fn(),
  });
  const renderer = await mountScreen();

  const text = allText(renderer);
  expect(text).toContain('Good morning,');
  expect(text).toContain('Fenzit Services');
  // 1+2+0+3+1 = 7 total jobs; 3 done · 1 today · 2 sched.
  expect(text).toContain('7');
  expect(text).toContain('3 done · 1 today · 2 sched.');
  expect(text).toContain('Technicians');
  expect(text).toContain('2');
});

it('treats a zero-count profile as first-run (no jobs yet)', async () => {
  useMyProfileMock.mockReturnValue({
    profile: makeProfile({
      technicianCount: 0,
      jobCounts: { today: 0, upcoming: 0, overdue: 0, completed: 0, cancelled: 0 },
    }),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    dismissError: jest.fn(),
  });
  const renderer = await mountScreen();

  const text = allText(renderer);
  expect(text).toContain('Add a technician first, then you can create and assign jobs.');
  // First-run Home still renders inside a ScrollView.
  expect(renderer.root.findAllByType(ScrollView).length).toBe(1);
});

it('shows the error view (not a crash) when the profile is absent', async () => {
  useMyProfileMock.mockReturnValue({
    profile: null,
    isLoading: false,
    error: 'Something broke',
    refresh: jest.fn(),
    dismissError: jest.fn(),
  });
  const renderer = await mountScreen();

  expect(allText(renderer)).toContain("Couldn't load your account");
});

it('refreshes the profile on focus (unforced — the store throttle decides)', async () => {
  useMyProfileMock.mockReturnValue({
    profile: makeProfile(),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    dismissError: jest.fn(),
  });
  const renderer = await mountScreen();
  expect(loadMyProfileMock).not.toHaveBeenCalled();

  // Simulate regaining focus: the hook's captured callback is what fires.
  focusEffect?.();
  expect(loadMyProfileMock).toHaveBeenCalledTimes(1);
  expect(loadMyProfileMock).toHaveBeenCalledWith(); // no { force: true }

  await act(async () => {
    renderer.unmount();
  });
});
