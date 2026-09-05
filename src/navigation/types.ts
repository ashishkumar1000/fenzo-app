/**
 * Type definitions for the root navigator and the nested bottom tabs.
 *
 * `RootStackParamList` is the top-level stack: the tab group plus any
 * full-screen routes pushed on top of it (e.g. Technicians).
 * `MainTabParamList` describes the four bottom-tab routes. The global
 * `RootParamList` augmentation lets `useNavigation()` infer types at every
 * call site.
 */

import type { JobScope, ResolvedPlace } from '../services';

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
  /**
   * `pendingAddress` is set by `AddressPickerScreen` on a successful resolve
   * (`navigation.navigate({ name: 'NewJob', params: { pendingAddress }, merge: true })`)
   * and consumed by `AddCustomerSheet` via this screen (Story 1.5 — reading it
   * back and clearing it is out of scope for the picker itself, per
   * `epic-1-context.md`'s `JobsScreen.tsx`-style precedent).
   */
  NewJob: { pendingAddress?: ResolvedPlace } | undefined;
  /** Owner/technician job detail — opened with the job's uuid. */
  JobDetail: { jobId: string };
  /** Owner-only customer profile + job history — opened with the customer's uuid. */
  CustomerDetail: { customerId: string };
  /** Tenant skill list management (More tab → Skills row). */
  Skills: undefined;
  /**
   * Address search (Epic 1) — pushed over whatever screen opened it.
   * `returnRouteName` names the route to navigate back to; on a successful
   * resolve, `AddressPickerScreen` calls
   * `navigation.navigate({ name: returnRouteName, params: { pendingAddress }, merge: true })`
   * so the caller finds its resolved address in its own route params.
   */
  AddressPicker: { returnRouteName: AddressPickerReturnRouteName };
};

/**
 * Route names `AddressPicker.returnRouteName` may target — i.e. routes whose
 * param type declares `pendingAddress?: ResolvedPlace` (today, `NewJob`
 * only). Deliberately an explicit union, not a type derived from
 * `RootStackParamList` via a mapped/conditional type: TypeScript's
 * structural typing means an `extends { pendingAddress?: ResolvedPlace }`
 * check is satisfied by ANY object param type, because an optional property
 * imposes no constraint when the source type omits it entirely — e.g.
 * `JobDetail: { jobId: string }` would incorrectly pass such a check even
 * though it never declares the field. Extend this union, together with the
 * corresponding param entry above, whenever another route gains
 * `pendingAddress` (Story 1.5's `CustomersScreen` wiring, etc).
 */
export type AddressPickerReturnRouteName = 'NewJob';

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
  Signature: { jobId: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
