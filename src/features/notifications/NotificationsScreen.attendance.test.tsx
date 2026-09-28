/**
 * NotificationsScreen attendance tap-guard tests (Story 15-10, BMAD
 * review verification-gap): the deep link is the exact line device-found
 * bug #2 lived on — a tap must mark the row read AND delegate through the
 * nested tabs route (`TechnicianTabs` → `Attendance`), and the reachability
 * guard must consult FIRST so a `none` employee's tap is a strict no-op
 * (no navigation, no badge mutation).
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../auth/useAuth', () => ({
  useAuth: () => ({ session: { role: 'technician', tenantId: 't1' } }),
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

function attendanceRow(): ApiNotification {
  return {
    id: 'n-att-1',
    jobId: null,
    eventType: 'attendance.holiday_added',
    entityType: 'attendance',
    entityId: 'h1',
    payload: { holidayName: 'Diwali', holidayDate: '2026-11-08' },
    readAt: null,
    createdAt: '2026-09-28T12:00:00Z',
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

function attendancePressables(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(Pressable).filter(p => p.props.accessibilityRole === 'button');
}

describe('the attendance card tap (device-found bug #2 regression lock)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // useFocusEffect captured but not auto-fired — the store data is what
    // drives the list under test.
    (useFocusEffect as jest.Mock).mockImplementation(() => undefined);
  });

  it('marks read and navigates via the NESTED-DELEGATE form when reachable', () => {
    isReachableMock.mockReturnValue(true);
    mockStore([attendanceRow()]);
    const { navigation, renderer } = renderScreen();

    // Query by the card's accessibilityLabel (the OfficesScreen predicate
    // idiom) — type-based findAll is brittle across the list virtualizer.
    const cardNode = renderer.root.findAll(
      n => typeof n.props?.onPress === 'function' &&
        String(n.props?.accessibilityLabel ?? '').includes('Holiday added'),
    );
    expect(cardNode.length).toBeGreaterThan(0);
    act(() => {
      cardNode[0].props.onPress();
    });

    expect(markReadMock).toHaveBeenCalledWith('n-att-1');
    // The device-found bug: a plain navigate('Attendance') from the root
    // stack is "not handled" — the delegate form is the contract.
    expect(navigation.navigate).toHaveBeenCalledWith('TechnicianTabs', {
      screen: 'Attendance',
    });
  });

  it('is a strict NO-OP when the seam says the tab does not exist', () => {
    isReachableMock.mockReturnValue(false);
    mockStore([attendanceRow()]);
    const { navigation, renderer } = renderScreen();

    const tapTarget = renderer.root.findAll(
      n => typeof n.props?.onPress === 'function' &&
        String(n.props?.accessibilityLabel ?? '').includes('Holiday added'),
    )[0];
    expect(tapTarget).toBeDefined();
    act(() => {
      tapTarget.props.onPress();
    });

    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(markReadMock).not.toHaveBeenCalled();
  });
});
