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
import type { PickedOfficeLocation } from '../types/office';

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
  /**
   * Story 15-10 — the technician's own attendance surfaces. The tab is
   * REGISTERED conditionally: `TechnicianTabs` mounts it only while the
   * access store resolves `attendanceAccess !== 'none'` (FR-3: no
   * attendance UI anywhere for `none`), so this route legitimately may not
   * exist at runtime — deep links must tap-guard through the access seam.
   */
  Attendance: undefined;
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
  NewJob: {
    createdCustomerId?: string;
    selectedSkillId?: string | null;
    selectedCustomerId?: string | null;
    selectedTechnicianId?: string | null;
  } | undefined;
  /**
   * Full-screen skill browser behind New Job's "Browse all" link. Opens with
   * the currently picked skill (if any); Apply navigates back to `NewJob`
   * with `selectedSkillId` — a string to pick it, `null` after "Clear", and
   * `undefined` (param absent) when the caller should change nothing.
   */
  SelectSkills: { selectedSkillId?: string | null } | undefined;
  /**
   * Full-screen customer browser behind New Job's "Browse all" link — the
   * skill picker's twin. Opens with the currently picked customer (if any);
   * Apply navigates back to `NewJob` with `selectedCustomerId` — a string to
   * pick it, `null` after "Clear", and `undefined` (param absent) when the
   * caller should change nothing.
   */
  SelectCustomers: { selectedCustomerId?: string | null } | undefined;
  /**
   * Full-screen technician browser behind New Job's "Browse all" link —
   * also reused as the employee picker in the weekly-off override sheet
   * (Story 15-6). Opens with the currently assigned technician (if any)
   * plus the job's `skillId` (read-only: it marks rows whose `skillIds`
   * include it, it never filters). Apply navigates back to `returnTo`
   * (default `'NewJob'`) with `selectedTechnicianId` — a string to pick
   * it, `null` after "Clear", and `undefined` (param absent) when the
   * caller should change nothing.
   */
  SelectTechnicians: {
    selectedTechnicianId?: string | null;
    skillId?: string;
    /**
     * Route to `popTo` on Apply/Clear — narrowed to the two screens that
     * actually push this picker (15-6 review iteration 1: a
     * `keyof RootStackParamList` admitted ~20 routes while the runtime
     * allowlist takes 2). Defaults to `'NewJob'` for the new-job flow; the
     * weekly-off override sheet passes `'AttendanceWeeklyOff'`. Must be a
     * route already in the stack (the caller pushes the picker on top of
     * itself).
     */
    returnTo?: 'NewJob' | 'AttendanceWeeklyOff';
    /**
     * Offer only ACTIVE employees (15-6 review iteration 1): the override
     * flow sets `activeOnly: true` so an invited (never-activated)
     * employee cannot be picked and then silently dropped when the
     * capture effect cannot resolve the id. The new-job flow omits it and
     * sees the full roster, exactly as today.
     */
    activeOnly?: boolean;
  } | undefined;
  /** Owner/technician job detail — opened with the job's uuid. */
  JobDetail: { jobId: string };
  /**
   * Notification history (bell tap) — no params. Shared screen, rendered in
   * BOTH stacks since Story 14-3: registered in `RootStackParamList`
   * (owner) and `TechnicianRootStackParamList` (technician); role
   * differences are only what a tap leads to.
   */
  Notifications: undefined;
  /**
   * Owner-only PDF reports (story 12-6): request form + live history list.
   * Opened from the Account tab's Reports row — no params.
   */
  Reports: undefined;
  /** Owner-only customer profile + job history — opened with the customer's uuid. */
  CustomerDetail: { customerId: string };
  /**
   * Full-page "Add customer" form, pushed from either `CustomersScreen` or
   * `NewJobScreen`. `returnRouteName` decides post-save behavior — see
   * `AddCustomerScreen`'s file doc.
   */
  AddCustomer: { returnRouteName: AddCustomerReturnRouteName };
  /**
   * Owner's attendance offices (Story 15-4, FR-5) — opened from the More
   * tab's "Offices" row. No params.
   */
  AttendanceOffices: undefined;
  /**
   * Add/edit an attendance office. `officeId` present = edit mode. The map
   * picker returns its confirmed pin via navigate-back-with-params
   * (`pickedLocation`, the SelectSkills pattern) — a search result only
   * moves the map; the final pin position is what the save carries.
   */
  OfficeForm: {
    officeId?: string;
    pickedLocation?: PickedOfficeLocation;
  } | undefined;
  /**
   * Full-screen office map picker behind the form's location row. Opens
   * with the office's current pin (if any) and the radius to start from.
   * The params object itself is optional (the form always supplies one) —
   * `radiusM` is required WITHIN it, and the picker falls back to 100 m
   * if it is ever absent.
   */
  OfficeMapPicker: {
    initialLatitude?: number;
    initialLongitude?: number;
    radiusM: number;
  } | undefined;
  /**
   * Story 15-6 — Attendance Home shim (the owner entry into all
   * attendance settings). Two tiles (Offices + Settings); future stories
   * replace this with a real dashboard.
   */
  AttendanceHome: undefined;
  /** Story 15-6 — Attendance Settings landing (Weekly off + Holidays). */
  AttendanceSettings: undefined;
  /** Story 15-9 — the Team enrolment roster (start dates, offices &
   *  tracking per employee), entered from the Attendance settings tile.
   *  `pickedDate`/`context` arrive merged from the full-screen DatePicker
   *  (navigate-back-with-params, the SelectTechniciansScreen pattern);
   *  read once and clear. */
  AttendanceEnrolments: {
    pickedDate?: string | null;
    context?: string | null;
  } | undefined;
  /** Story 15-9 — full-screen date selection (user-directed: a calendar
   *  PAGE, not an inline modal — inline calendars collide with pinned
   *  sheet footers). Day tap pops back to `returnTo` merging
   *  { pickedDate, context }; the opener owns what the date means. */
  DatePicker: {
    title: string;
    value: string | null;
    today: string;
    minDate?: string;
    maxDate?: string;
    returnTo: 'AttendanceEnrolments';
    context: string;
  };
  /** Story 15-6 — tenant-default weekly-off screen + per-employee overrides.
   *  `selectedTechnicianId` is set by `SelectTechniciansScreen` via
   *  navigate-back-with-params (the new-job picker pattern) when the owner
   *  picks an employee for the override flow. Read once on focus + cleared
   *  so a stale pick can't re-fire. */
  AttendanceWeeklyOff: { selectedTechnicianId?: string | null } | undefined;
  /** Story 15-6 — holidays list + add/edit sheet. */
  AttendanceHolidays: undefined;
  /**
   * Story 15-8 — the first-run attendance setup wizard. AttendanceHome's
   * focus gate `replace`es here until setup completes; the wizard itself
   * never redirects into itself (completion/already-completed bounce back
   * to AttendanceHome via replace — exactly one of the two routes is ever
   * on the stack). Steps are component state inside the screen, not
   * navigator routes; editing pushes the existing attendance routes.
   */
  AttendanceSetupWizard: undefined;
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
  /**
   * Nested-navigation delegation (Story 15-10): deep links from the
   * root-stack Notifications screen must use
   * `navigate('TechnicianTabs', { screen: 'Attendance' })` — a plain
   * `navigate('Attendance')` from the root stack is NOT handled (the tab
   * route lives one navigator down; device-found). Params optional so
   * plain `navigate('TechnicianTabs')` call sites keep typechecking.
   */
  TechnicianTabs: { screen: keyof TechnicianTabParamList } | undefined;
  TechJobDetail: { jobId: string };
  /** Registered in Story 3.5 — the type is declared now so nav params are stable. */
  Signature: { jobId: string; stepKey: string; steps: WorkflowTemplateStep[] };
  /** Registered in Story 7.7 — location capture flow. */
  LocationCapture: { jobId: string; stepKey: string; signatureRef?: string };
  /**
   * Story 14-3 — the shared notifications screen, rendered in the technician
   * stack behind the Today header bell. Same component as the owner's; deep
   * links route per role (job cards → TechJobDetail here).
   */
  Notifications: undefined;
  /**
   * Story 15-10 — the FR-4 first-entry intro, pushed OVER the tabs from
   * the Attendance tab's intro gate (active/upcoming + never onboarded).
   */
  AttendanceIntro: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
