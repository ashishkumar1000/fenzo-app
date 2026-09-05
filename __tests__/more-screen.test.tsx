/**
 * MoreScreen — the story-5.2 wiring: the "Edit name" pencil on the account
 * row must open `EditNameSheet` prefilled with the live profile name. The
 * screen was previously untested, so a broken `onPress` or a dropped sheet
 * mount would ship green. The sheet itself is mocked here (its own contract
 * is covered in `EditNameSheet.test.tsx`) — only its props are asserted.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => false) };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));

jest.mock('../src/features/auth', () => ({
  useAuth: () => ({ reset: jest.fn() }),
}));

jest.mock('../src/features/customers', () => ({
  useCustomers: () => ({ clear: jest.fn() }),
}));

jest.mock('../src/features/technicians', () => ({
  useTechnicians: () => ({ clear: jest.fn() }),
}));

jest.mock('../src/features/jobs', () => ({
  clearJobs: jest.fn(),
}));

jest.mock('../src/features/profile', () => ({
  useMyProfile: jest.fn(),
  formatPhone: jest.fn(() => '+91 90000 00000'),
  formatRole: jest.fn(() => 'Owner'),
  EditNameSheet: jest.fn(() => null),
}));

import MoreScreen from '../src/features/more/MoreScreen';
import { EditNameSheet, useMyProfile } from '../src/features/profile';
import type { MyProfile } from '../src/services';

const useMyProfileMock = useMyProfile as jest.Mock;
const EditNameSheetMock = EditNameSheet as jest.Mock;

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

/** Latest props the mocked sheet was last rendered with. */
function lastSheetProps(): { visible: boolean; currentName: string | null } {
  const calls = EditNameSheetMock.mock.calls;
  const last = calls[calls.length - 1][0] as {
    visible: boolean;
    currentName: string | null;
  };
  return last;
}

async function mountScreen(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(MoreScreen));
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('the account-row pencil opens EditNameSheet with the live profile name (story 5.2)', async () => {
  useMyProfileMock.mockReturnValue({
    profile: makeProfile(),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    dismissError: jest.fn(),
    clear: jest.fn(),
  });

  const renderer = await mountScreen();

  // The sheet is mounted closed from the start.
  expect(lastSheetProps().visible).toBe(false);

  // Press the pencil affordance on the account row.
  const pencil = renderer.root.findByProps({ accessibilityLabel: 'Edit name' });
  await act(async () => {
    pencil.props.onPress();
  });

  expect(lastSheetProps().visible).toBe(true);
  expect(lastSheetProps().currentName).toBe('Kumar Selvan');

  await act(async () => {
    renderer.unmount();
  });
});
