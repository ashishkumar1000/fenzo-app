/**
 * TechnicianTabs — the technician's bottom-tab group: Today, History,
 * Profile. Deliberately separate from the owner's `MainTabs` (different
 * routes entirely) rather than a variant of it — a technician never sees
 * Jobs-management, Customers, or More/Settings.
 *
 * Mounted directly as the root of its own `NavigationContainer` in
 * `App.tsx` (no wrapping stack yet, unlike the owner side's `RootNavigator`)
 * — there are no full-screen routes to push over these tabs for a
 * technician yet. Add one here, the same way `RootNavigator` does for the
 * owner side, if that changes.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TodayScreen, HistoryScreen, ProfileScreen } from '../features/technicianApp';
import { TabBar } from './TabBar';
import type { TechnicianTabParamList } from './types';

const Tab = createBottomTabNavigator<TechnicianTabParamList>();

export default function TechnicianTabs() {
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
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
