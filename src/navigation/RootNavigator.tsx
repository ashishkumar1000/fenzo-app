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
import {
  OfficesScreen,
  OfficeFormScreen,
  OfficeMapPickerScreen,
} from '../features/attendance/offices';
import { AttendanceHomeScreen } from '../features/attendance/home';
import OwnerLeaveScreen from '../features/attendance/leave/OwnerLeaveScreen';
import ApplyOnBehalfScreen from '../features/attendance/leave/ApplyOnBehalfScreen';
import {
  SettingsScreen,
  WeeklyOffScreen,
  HolidaysScreen,
} from '../features/attendance/settings';
import { SetupWizardScreen } from '../features/attendance/setup';
import RosterScreen from '../features/attendance/enrolments/RosterScreen';
import DatePickerScreen from '../features/attendance/enrolments/DatePickerScreen';
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
      {/* Story 15-4 — attendance offices (owner-only, FR-5). */}
      <Stack.Screen
        name="AttendanceOffices"
        component={OfficesScreen}
        options={{ headerShown: false }}
      />
      {/* Story 15-6 — attendance home shim + settings surface. */}
      <Stack.Screen
        name="AttendanceHome"
        component={AttendanceHomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AttendanceSettings"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AttendanceEnrolments"
        component={RosterScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DatePicker"
        component={DatePickerScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AttendanceWeeklyOff"
        component={WeeklyOffScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AttendanceHolidays"
        component={HolidaysScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="OfficeForm"
        component={OfficeFormScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="OfficeMapPicker"
        component={OfficeMapPickerScreen}
        options={{ headerShown: false }}
      />
      {/* Story 15-8 — the first-run attendance setup wizard (owner-only;
          AttendanceHome's focus gate replaces into it until completion). */}
      <Stack.Screen
        name="AttendanceSetupWizard"
        component={SetupWizardScreen}
        options={{ headerShown: false }}
      />
      {/* Story 17-6 — the owner's Leave surface (pending queue + history). */}
      <Stack.Screen
        name="OwnerLeave"
        component={OwnerLeaveScreen}
        options={{ headerShown: false }}
      />
      {/* Story 17-6 — apply on behalf (FR-16, born approved). */}
      <Stack.Screen
        name="ApplyOnBehalf"
        component={ApplyOnBehalfScreen}
        options={{ headerShown: false }}
      />
      {/* Story 18-3 — the DEV-ONLY Component lab (spec D7). The require()
          sits INSIDE the __DEV__ gate so the module (and its bytes) are
          behaviourally absent from release bundles — Metro DCE kills the
          whole branch; scripts/verify-no-component-lab.js pins the absence (android:build:release). */}
      {__DEV__ ? (
        <Stack.Screen
          name="ComponentLab"
          component={require('../features/attendance/calendar/ComponentLabScreen').default}
          options={{ headerShown: false }}
        />
      ) : null}
    </Stack.Navigator>
  );
}
