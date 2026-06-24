/**
 * Imperative navigation handle for use outside the React tree
 * (push notifications, deep links, sagas, etc.).
 *
 * Inside components, prefer `useNavigation()` from `@react-navigation/native`.
 * Always guard with `navigationRef.isReady()` — the ref is only valid once
 * `<NavigationContainer />` has mounted.
 */

import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
