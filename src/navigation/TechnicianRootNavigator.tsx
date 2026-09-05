/**
 * TechnicianRootNavigator — the technician side's stack, wrapping
 * `TechnicianTabs` so full-screen routes can push over the tab group
 * (mirrors the owner side's `RootNavigator` around `MainTabs`).
 *
 * `TechJobDetail` is the job's one-screen view (Story 3.2); `Signature`
 * pushes over it for the customer-signature capture (Story 3.5).
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TechnicianTabs from './TechnicianTabs';
import TechJobDetailScreen from '../features/technicianApp/TechJobDetailScreen';
import SignatureScreen from '../features/technicianApp/SignatureScreen';
import type { TechnicianRootStackParamList } from './types';

const Stack = createNativeStackNavigator<TechnicianRootStackParamList>();

export default function TechnicianRootNavigator() {
  return (
    <Stack.Navigator initialRouteName="TechnicianTabs">
      <Stack.Screen name="TechnicianTabs" component={TechnicianTabs} options={{ headerShown: false }} />
      <Stack.Screen name="TechJobDetail" component={TechJobDetailScreen} options={{ headerShown: false }} />
      {/* 3.5 — pushed over the detail for the customer-signature capture. */}
      <Stack.Screen name="Signature" component={SignatureScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
