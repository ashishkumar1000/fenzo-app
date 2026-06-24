/**
 * Type definitions for the root navigator.
 *
 * Each route in `RootStackParamList` represents a screen in the stack and
 * describes the shape of its params. The global `RootParamList`
 * augmentation lets `useNavigation()` infer types at every call site.
 */

export type RootStackParamList = {
  Home: undefined;
  Details: { itemId: number; title?: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
