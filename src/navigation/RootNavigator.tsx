import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabs from './MainTabs';
import { TechniciansScreen } from '../features/technicians';
import {
  NewJobScreen,
  SelectCustomersScreen,
  SelectSkillsScreen,
  SelectTechniciansScreen,
} from '../features/newJob';
import { JobDetailScreen } from '../features/jobDetail';
import { NotificationsScreen } from '../features/notifications';
import { ReportsScreen } from '../features/reports';
import { CustomerDetailScreen } from '../features/customerDetail';
import { AddCustomerScreen } from '../features/customers';
import MapSpikeScreen from '../screens/MapSpikeScreen'; // SPIKE 15.1 — delete with the story
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * The single source of truth for top-level navigation routes.
 * `MainTabs` holds the four bottom-tab screens (Home, Jobs, Customers, More).
 * Full-screen routes that should cover the tab bar (e.g. Technicians)
 * go here, as siblings of MainTabs.
 */
export default function RootNavigator() {
  return (
    // SPIKE 15.1: reachable from Today's map-spike button; remove the
    // registration with the story (15.4).
    <Stack.Navigator initialRouteName="MainTabs">
      <Stack.Screen
        name="MapSpike"
        component={MapSpikeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Technicians"
        component={TechniciansScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="NewJob"
        component={NewJobScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SelectSkills"
        component={SelectSkillsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SelectCustomers"
        component={SelectCustomersScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SelectTechnicians"
        component={SelectTechniciansScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="JobDetail"
        component={JobDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CustomerDetail"
        component={CustomerDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddCustomer"
        component={AddCustomerScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
