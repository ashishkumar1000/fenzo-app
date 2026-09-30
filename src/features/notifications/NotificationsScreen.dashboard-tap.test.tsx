/**
 * NotificationsScreen `dashboard` tap-branch tests (Story 19-4, BMAD
 * review verification-gap): the OWNER's office-summary card
 * (`attendance.reminder_not_checked_in`) lands on the AttendanceDashboard
 * — an owner-stack route that never rides the technician tab seam — and
 * its tap marks the row read. The missing-negative rides here too: the
 * branch must BYPASS the reachability guard (a guard-consult there would
 * strand the owner's notification when the seam happens to be off).
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../auth/useAuth', () => ({
  useAuth: () => ({ session: { role: 'owner', tenantId: 't1' } }),
}));

jest.mock('./useNotifications', () => ({
  useNotifications: jest.fn(),
  loadNotifications: jest.fn(),
  loadUnreadCount: jest.fn(),
  loadMoreNotifications: jest.fn(),
  markAllNotificationsRead: jest.fn(),
  markNotificationRead: jest.fn(),
}));

jest.mock('./useJobTemplateCache', () => ({
  useJobTemplateCache: () => ({ getTemplate: () => null, updateTrigger: 0 }),
}));

jest.mock('../../services/attendanceAccessEvents', () => ({
  ...jest.requireActual('../../services/attendanceAccessEvents'),
  isAttendanceReachable: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import NotificationsScreen from './NotificationsScreen';
import { markNotificationRead } from './useNotifications';
import { isAttendanceReachable } from '../../services/attendanceAccessEvents';
import type { ApiNotification } from '../../services';

const useNotificationsMock = require('./useNotifications').useNotifications as jest.Mock;
const isReachableMock = isAttendanceReachable as jest.Mock;
const markReadMock = markNotificationRead as jest.Mock;

/** The owner's day-summary card row — the one reminder whose tap is
 *  `dashboard` (the 19-4 registry). */
function dashboardRow(): ApiNotification {
  return {
    id: 'n-dash-1',
    jobId: null,
    eventType: 'attendance.reminder_not_checked_in',
    entityType: 'attendance',
    entityId: 'o1',
    payload: { notCheckedInCount: 2, officeName: 'Andheri West' },
    readAt: null,
    createdAt: '2026-09-29T12:00:00Z',
  } as unknown as ApiNotification;
}

function mockStore(items: ApiNotification[]) {
  useNotificationsMock.mockReturnValue({
    items,
    isLoading: false,
    isLoadingMore: false,
    error: null,
    mutationError: null,
    hasLoaded: true,
    hasMore: false,
    loadUnreadCount: jest.fn(),
    refresh: jest.fn().mockResolvedValue(undefined),
    markNotificationRead,
  });
}

function renderScreen() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <NotificationsScreen
        navigation={navigation as never}
        route={{} as never}
      />,
    );
  });
  return { navigation, renderer };
}

describe('the owner dashboard tap (19-4 mirror card)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useFocusEffect as jest.Mock).mockImplementation(() => undefined);
  });

  it('marks the row read and navigates to AttendanceDashboard', () => {
    mockStore([dashboardRow()]);
    const { navigation, renderer } = renderScreen();

    const cardNode = renderer.root.findAll(
      n => typeof n.props?.onPress === 'function' &&
        String(n.props?.accessibilityLabel ?? '').includes('Not checked in'),
    );
    expect(cardNode.length).toBeGreaterThan(0);
    act(() => {
      cardNode[0].props.onPress();
    });

    expect(markReadMock).toHaveBeenCalledWith('n-dash-1');
    // The OWNER-stack route — NOT the technician tabs delegate form.
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceDashboard');
  });

  it('BYPASSES the reachability guard (the branch never consults the seam)', () => {
    // The negative: even with the seam OFF, the owner card still lands —
    // the dashboard route is registered for owners without the tab.
    isReachableMock.mockReturnValue(false);
    mockStore([dashboardRow()]);
    const { navigation, renderer } = renderScreen();

    const cardNode = renderer.root.findAll(
      n => typeof n.props?.onPress === 'function' &&
        String(n.props?.accessibilityLabel ?? '').includes('Not checked in'),
    );
    act(() => {
      cardNode[0].props.onPress();
    });

    expect(isReachableMock).not.toHaveBeenCalled();
    expect(markReadMock).toHaveBeenCalledWith('n-dash-1');
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceDashboard');
  });
});