/**
 * TechnicianRootNavigator — the technician side's stack, wrapping
 * `TechnicianTabs` so full-screen routes can push over the tab group
 * (mirrors the owner side's `RootNavigator` around `MainTabs`).
 *
 * `TechJobDetail` is the job's one-screen view (Story 3.2); `Signature`
 * pushes over it for the customer-signature capture (Story 3.5).
 * `Notifications` is the shared inbox (Story 14-3) — same component as the
 * owner's, role-routed inside.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TechnicianTabs from './TechnicianTabs';
import TechJobDetailScreen from '../features/technicianApp/TechJobDetailScreen';
import SignatureScreen from '../features/technicianApp/SignatureScreen';
import { LocationCaptureScreen } from '../features/technicianApp/LocationCaptureScreen';
import { NotificationsScreen } from '../features/notifications';
import MapSpikeScreen from '../screens/MapSpikeScreen'; // SPIKE 15.1 — delete with the story
import type { TechnicianRootStackParamList } from './types';

const Stack = createNativeStackNavigator<TechnicianRootStackParamList>();

export default function TechnicianRootNavigator() {
  return (
    <Stack.Navigator initialRouteName="TechnicianTabs">
      <Stack.Screen name="TechnicianTabs" component={TechnicianTabs} options={{ headerShown: false }} />
      <Stack.Screen name="TechJobDetail" component={TechJobDetailScreen} options={{ headerShown: false }} />
      {/* 3.5 — pushed over the detail for the customer-signature capture. */}
      <Stack.Screen name="Signature" component={SignatureScreen} options={{ headerShown: false }} />
      {/* 7.7 — pushed over the detail for location capture. */}
      <Stack.Screen name="LocationCapture" component={LocationCaptureScreen} options={{ headerShown: false }} />
      {/* 14.3 — the shared notification inbox, behind the Today bell. */}
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
      {/* SPIKE 15.1 — temporary map screen, pushed from Today's test button. */}
      <Stack.Screen name="MapSpike" component={MapSpikeScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
