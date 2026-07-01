/**
 * Type definitions for the root navigator and the nested bottom tabs.
 *
 * `RootStackParamList` is the top-level stack: the tab group plus any
 * full-screen routes pushed on top of it (e.g. Details, Technicians).
 * `MainTabParamList` describes the four bottom-tab routes. The global
 * `RootParamList` augmentation lets `useNavigation()` infer types at every
 * call site.
 */

export type MainTabParamList = {
  Home: undefined;
  Jobs: undefined;
  Customers: undefined;
  More: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  Details: { itemId: number; title?: string };
  Technicians: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
