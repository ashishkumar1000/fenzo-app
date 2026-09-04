import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabs from './MainTabs';
import { TechniciansScreen } from '../features/technicians';
import { NewJobScreen } from '../features/newJob';
import { JobDetailScreen } from '../features/jobDetail';
import { CustomerDetailScreen } from '../features/customerDetail';
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
    <Stack.Navigator initialRouteName="MainTabs">
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
        name="JobDetail"
        component={JobDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CustomerDetail"
        component={CustomerDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
