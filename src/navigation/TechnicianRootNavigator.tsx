/**
 * TechnicianRootNavigator — the technician side's stack, wrapping
 * `TechnicianTabs` so full-screen routes can push over the tab group
 * (mirrors the owner side's `RootNavigator` around `MainTabs`).
 *
 * `TechJobDetail` is registered as a placeholder body for now (Story 3.2
 * builds the real screen) — registering it here is what makes Today/History
 * card taps navigable from Story 3.1. `Signature` joins in Story 3.5.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TechnicianTabs from './TechnicianTabs';
import TechJobDetailScreen from '../features/technicianApp/TechJobDetailScreen';
import type { TechnicianRootStackParamList } from './types';

const Stack = createNativeStackNavigator<TechnicianRootStackParamList>();

export default function TechnicianRootNavigator() {
  return (
    <Stack.Navigator initialRouteName="TechnicianTabs">
      <Stack.Screen name="TechnicianTabs" component={TechnicianTabs} options={{ headerShown: false }} />
      <Stack.Screen name="TechJobDetail" component={TechJobDetailScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}