/**
 * Type definitions for the root navigator and the nested bottom tabs.
 *
 * `RootStackParamList` is the top-level stack: the tab group plus any
 * full-screen routes pushed on top of it (e.g. Technicians).
 * `MainTabParamList` describes the four bottom-tab routes. The global
 * `RootParamList` augmentation lets `useNavigation()` infer types at every
 * call site.
 */

import type { JobScope } from '../services';

export type MainTabParamList = {
  Home: undefined;
  /**
   * One-shot scope pre-selection for the Jobs tab — Home's stat tiles
   * navigate here with `scope` (e.g. the Overdue tile → `overdue`). JobsScreen
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
  Technicians: undefined;
  NewJob: undefined;
  /** Owner/technician job detail — opened with the job's uuid. */
  JobDetail: { jobId: string };
  /** Owner-only customer profile + job history — opened with the customer's uuid. */
  CustomerDetail: { customerId: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
