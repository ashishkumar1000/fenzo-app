/**
 * TechnicianTabs — the technician's bottom-tab group: Today, History,
 * Profile. Deliberately separate from the owner's `MainTabs` (different
 * routes entirely) rather than a variant of it — a technician never sees
 * Jobs-management, Customers, or More/Settings.
 *
 * Mounted inside `TechnicianRootNavigator` (App.tsx's native stack) as the
 * tabs screen, the same way the owner side's `MainTabs` sits inside
 * `RootNavigator` — full-screen routes (`TechJobDetail`, and later
 * `Signature`) push over the tabs from that stack.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TodayScreen, HistoryScreen, ProfileScreen } from '../features/technicianApp';
import {
  AttendanceTabScreen,
  useAttendanceAccess,
  useAttendanceAccessLifecycle,
} from '../features/attendance/me';
import { TabBar } from './TabBar';
import type { TechnicianTabParamList } from './types';

const Tab = createBottomTabNavigator<TechnicianTabParamList>();

export default function TechnicianTabs() {
  // 15-10 — the access store's boot (initial me/access fetch + notification
  // seam) and the foreground refetch live here: this component is mounted
  // for every technician session regardless of tab visibility, so a `none`
  // user's store still resolves (and stays resolved across tab flips).
  useAttendanceAccessLifecycle();
  // FR-3: the Attendance tab EXISTS only for a resolved non-`none` access
  // state (upcoming / active / history_only). `unknown` and `none` keep the
  // three-tab layout — an untracked technician sees no attendance UI
  // anywhere, and no attendance screen can flash for them while the first
  // read is in flight. The store is also the notifications screen's tap
  // guard source (via the attendanceAccessEvents seam), so a deep link can
  // never navigate to a tab that was never registered here.
  const { status, access } = useAttendanceAccess();
  const attendanceVisible =
    status === 'ready' && access !== null && access.attendanceAccess !== 'none';

  return (
    <Tab.Navigator
      tabBar={props => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarLabel: 'Today' }} />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ tabBarLabel: 'History' }}
      />
      {attendanceVisible && (
        <Tab.Screen
          name="Attendance"
          component={AttendanceTabScreen}
          options={{ tabBarLabel: 'Attendance' }}
        />
      )}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
