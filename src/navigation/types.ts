/**
 * Type definitions for the root navigator and the nested bottom tabs.
 *
 * `RootStackParamList` is the top-level stack: the tab group plus any
 * full-screen routes pushed on top of it (e.g. Technicians).
 * `MainTabParamList` describes the four bottom-tab routes. The global
 * `RootParamList` augmentation lets `useNavigation()` infer types at every
 * call site.
 */

import type { JobScope, WorkflowTemplateStep } from '../services';

export type MainTabParamList = {
  Home: undefined;
  /**
   * One-shot scope pre-selection for the Jobs tab — Home's stat tiles
   * navigate here with `scope` (e.g. the overdue strip → `overdue`). JobsScreen
   * consumes the param and clears it (`setParams({ scope: undefined })`):
   * tab params persist across navigations, so an uncleared param would
   * re-apply on every later tab-bar focus and fight a manually picked scope.
   */
  Jobs: { scope?: JobScope } | undefined;
  Customers: undefined;
  More: undefined;
};

/** Bottom-tab routes for a signed-in technician — a separate, much smaller
 * surface than the owner's `MainTabParamList`: no Jobs/Customers management,
 * no More/settings, just their own day. */
export type TechnicianTabParamList = {
  Today: undefined;
  History: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  /**
   * `autoOpenAdd` — Home's "Add technician" quick action pushes this route
   * with the Add sheet already open, mirroring the one-tap intent (a plain
   * push would land on the list and force a second tap on "Add"). Params are
   * read once on mount, so the sheet never re-opens on later visits.
   */
  Technicians: { autoOpenAdd?: boolean } | undefined;
  /**
   * `createdCustomerId` is set by `AddCustomerScreen` on a successful save
   * when opened from here (`returnRouteName: 'NewJob'`), so this screen can
   * select the new customer in its draft. `Customers` needs no equivalent
   * param — its list reads from the shared `useCustomers` store, which
   * `AddCustomerScreen` already updates directly via `upsertCustomer`.
   */
  NewJob: { createdCustomerId?: string } | undefined;
  /** Owner/technician job detail — opened with the job's uuid. */
  JobDetail: { jobId: string };
  /** Owner-only notification history (bell tap) — no params. */
  Notifications: undefined;
  /** Owner-only customer profile + job history — opened with the customer's uuid. */
  CustomerDetail: { customerId: string };
  /**
   * Full-page "Add customer" form, pushed from either `CustomersScreen` or
   * `NewJobScreen`. `returnRouteName` decides post-save behavior — see
   * `AddCustomerScreen`'s file doc.
   */
  AddCustomer: { returnRouteName: AddCustomerReturnRouteName };
};

/**
 * Screens that can push `AddCustomer` and be returned to. `Home` is the
 * quick-action entry — its post-save behaviour is the same plain `goBack()`
 * as `Customers` (the shared store already has the new row).
 */
export type AddCustomerReturnRouteName = 'Customers' | 'NewJob' | 'Home';

/**
 * Technician full-screen routes pushed over `TechnicianTabs` by
 * `TechnicianRootNavigator`. Technician screens type navigation against THIS
 * list locally (`NativeStackScreenProps<TechnicianRootStackParamList, …>`) —
 * it is deliberately NOT merged into the global `RootParamList` augmentation
 * above, which stays the owner-side list.
 */
export type TechnicianRootStackParamList = {
  TechnicianTabs: undefined;
  TechJobDetail: { jobId: string };
  /** Registered in Story 3.5 — the type is declared now so nav params are stable. */
  Signature: { jobId: string; stepKey: string; steps: WorkflowTemplateStep[] };
  /** Registered in Story 7.7 — location capture flow. */
  LocationCapture: { jobId: string; stepKey: string; signatureRef?: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
