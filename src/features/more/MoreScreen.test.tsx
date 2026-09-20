/**
 * MoreScreen — the tile contracts this screen owns: each tile's subtitle
 * maps the shared stores' state (notifications unread, customers count with
 * a loading state), the focus refresh calls both stores' throttled loaders,
 * and each tile navigates to its own route. The stores themselves are
 * mocked — their internals are their own tests' job.
 */
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('../auth', () => ({
  useAuth: () => ({ reset: jest.fn() }),
}));

jest.mock('../profile', () => ({
  useMyProfile: () => ({
    profile: {
      name: 'Ashish',
      role: 'owner',
      countryCode: '+91',
      phoneNumber: '9000000000',
      technicianCount: 0,
    },
    isLoading: false,
  }),
  EditNameSheet: () => null,
  formatRole: () => 'Owner',
  formatPhone: () => '+91 90000 00000',
}));

jest.mock('../notifications', () => ({
  useNotifications: jest.fn(),
  loadUnreadCount: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../customers', () => ({
  useCustomers: jest.fn(),
  loadCustomers: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services', () => ({
  runAllResets: jest.fn(),
}));

jest.mock('../../services/authToken', () => ({
  clearAuthToken: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { Alert, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useFocusEffect } from '@react-navigation/native';
import { loadCustomers, useCustomers } from '../customers';
import { loadUnreadCount, useNotifications } from '../notifications';
import { runAllResets } from '../../services';
import { clearAuthToken } from '../../services/authToken';
import MoreScreen from './MoreScreen';
import { MoreRow } from './components/MoreRow';
import { MoreTile } from './components/MoreTile';

const useNotificationsMock = useNotifications as jest.Mock;
const useCustomersMock = useCustomers as jest.Mock;
const useFocusEffectMock = useFocusEffect as jest.Mock;

function renderScreen() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <MoreScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
  });
  mounted.push(renderer);
  return renderer.root;
}

// Unmount so no store subscription or timer outlives the suite.
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
});

function subtitleTexts(root: ReactTestRenderer.ReactTestRenderer['root']): string[] {
  return root
    .findAllByType(Text)
    .map(t => t.props.children)
    .filter((c: unknown): c is string => typeof c === 'string');
}

beforeEach(() => {
  jest.clearAllMocks();
  useNotificationsMock.mockReturnValue({ unreadCount: null });
  useCustomersMock.mockReturnValue({ count: 0, hasLoaded: true });
});

describe('MoreScreen tile subtitles', () => {
  it('shows a neutral notifications subtitle until the unread count lands', () => {
    expect(subtitleTexts(renderScreen())).toContain('Job & team updates');
  });

  it('reads the unread count once the store has it', () => {
    useNotificationsMock.mockReturnValue({ unreadCount: 3 });
    expect(subtitleTexts(renderScreen())).toContain('3 unread');

    useNotificationsMock.mockReturnValue({ unreadCount: 0 });
    expect(subtitleTexts(renderScreen())).toContain('All caught up');
  });

  it('does not invite adding a customer while the customers store is still loading', () => {
    useCustomersMock.mockReturnValue({ count: 0, hasLoaded: false });
    const texts = subtitleTexts(renderScreen());
    expect(texts).toContain('People you serve');
    expect(texts).not.toContain('Add your first customer');
  });

  it('distinguishes zero customers from a still-loading store', () => {
    useCustomersMock.mockReturnValue({ count: 0, hasLoaded: true });
    expect(subtitleTexts(renderScreen())).toContain('Add your first customer');

    useCustomersMock.mockReturnValue({ count: 2, hasLoaded: true });
    expect(subtitleTexts(renderScreen())).toContain('2 customers');
  });
});

describe('MoreScreen wiring', () => {
  it('refreshes both tile stores on focus through the throttled loaders', () => {
    renderScreen();
    // The useFocusEffect callback is the refresh — invoke what focus would.
    const focusCallback = useFocusEffectMock.mock.calls.at(-1)?.[0] as () => void;
    act(() => {
      focusCallback();
    });
    expect(loadUnreadCount).toHaveBeenCalled();
    expect(loadCustomers).toHaveBeenCalled();
  });

  it('navigates each tile and row to its own route', () => {
    const root = renderScreen();
    for (const route of ['Technicians', 'Notifications']) {
      const tile = root
        .findAllByType(MoreTile)
        .find(t => t.props.title === route);
      act(() => {
        tile?.props.onPress();
      });
      expect(mockNavigate).toHaveBeenCalledWith(route);
    }

    const customersRow = root
      .findAllByType(MoreRow)
      .find(t => t.props.title === 'Customers');
    act(() => {
      customersRow?.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Customers');
  });

  it('logs out only through the confirm dialog, running the forced-logout flow', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const root = renderScreen();
    const logoutRow = root.findAllByType(MoreRow).find(t => t.props.title === 'Log out');

    // Pressing the row shows the confirm dialog — nothing resets yet.
    act(() => {
      logoutRow?.props.onPress();
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'Log out',
      expect.any(String),
      expect.any(Array),
    );
    expect(clearAuthToken).not.toHaveBeenCalled();
    expect(runAllResets).not.toHaveBeenCalled();

    // Confirming the dialog runs the same forced-logout flow as a 401.
    const confirm = alertSpy.mock.calls[0][2]!.find(b => b.text === 'Log out')!;
    act(() => {
      confirm.onPress?.();
    });
    expect(clearAuthToken).toHaveBeenCalled();
    expect(runAllResets).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});