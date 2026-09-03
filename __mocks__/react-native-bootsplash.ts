/**
 * Manual jest mock for react-native-bootsplash (root __mocks__ dir is picked
 * up automatically for node_modules packages). The real module boots a
 * TurboModule that can't exist in jest. Only what the app actually consumes
 * is faked: useHideAnimation's static container/logo props and its animate
 * callback (the real hook calls it once the splash is ready to animate).
 */
import React from 'react';
import type { UseHideAnimation } from 'react-native-bootsplash';

export const hide = (): Promise<void> => Promise.resolve();
export const isVisible = (): boolean => false;

export function useHideAnimation(config: {
  animate: () => void;
}): UseHideAnimation {
  React.useEffect(() => {
    config.animate();
  }, [config.animate]);
  return {
    container: { style: {}, onLayout: () => {} },
    logo: { source: 0 },
    brand: { source: 0 },
  } as UseHideAnimation;
}

export default { hide, isVisible, useHideAnimation };