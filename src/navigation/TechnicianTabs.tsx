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
