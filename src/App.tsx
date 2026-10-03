/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { useEffect, useState } from 'react';
import {
  AppState,
  StatusBar,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AnimatedBootSplash } from './features/splash';
import RootNavigator from './navigation/RootNavigator';
import TechnicianRootNavigator from './navigation/TechnicianRootNavigator';
import { navigationRef } from './navigation/navigationRef';
import { OnboardingScreen, useOnboarding } from './features/onboarding';
import { AuthFlow, useAuth, expireSession } from './features/auth';
import {
  ForcedUpdateScreen,
  MaintenanceBanner,
  isVersionUnsupported,
  useRemoteConfig,
} from './features/remoteConfig';
import { RealtimeBridge } from './features/notifications/RealtimeBridge';
import { refreshRemoteConfig, runAllResets, setOnUnauthorized } from './services';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [splashVisible, setSplashVisible] = useState(true);
  const { status: onboardingStatus, complete: completeOnboarding } = useOnboarding();
  const { status: authStatus, session, complete: completeAuth } = useAuth();
  const config = useRemoteConfig();
  const updateRequired = isVersionUnsupported(config.min_supported_version);

  // Server-driven config (SPEC-server-driven-config): pull on start and on
  // every foreground return (throttled inside the service — a cold start
  // always fetches). The gate/banner below re-render through the
  // useRemoteConfig change subscription, never via this effect.
  useEffect(() => {
    refreshRemoteConfig();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshRemoteConfig();
      }
    });
    return () => subscription.remove();
  }, []);

  // Global 401 handling (story 5.3): any authenticated request that comes
  // back 401 forces the user back to the login screen. Data stores reset
  // FIRST, then the auth gate flips — screens unmount into a clean world,
  // and the login screen shows the "Session expired" notice. The interceptor
  // in apiClient fires this at most once per expiry event (deduped), and
  // never for a login 401 (no token was attached).
  useEffect(() => {
    setOnUnauthorized(() => {
      runAllResets();
      expireSession();
    });
    return () => setOnUnauthorized(null);
  }, []);

  // First launch: onboarding tour → account setup → main app. The
  // force-update gate dominates the whole chain — an app older than the
  // server's minimum must not reach login or data, whatever its state.
  let content;
  if (updateRequired) {
    content = <ForcedUpdateScreen message={config.force_update_message} />;
  } else if (onboardingStatus !== 'done') {
    content = <OnboardingScreen onDone={completeOnboarding} />;
  } else if (authStatus !== 'done') {
    content = (
      <AuthFlow
        onComplete={result => {
          // Gating fields only — name/phone/company come from `GET /users/me`
          // via `useMyProfile`, so there's one authoritative copy of them.
          completeAuth({
            role: result.role,
            tenantId: result.tenantId,
          });
        }}
      />
    );
  } else if (session?.role === 'technician') {
    // Separate nav tree from the owner side — a technician never needs
    // MainTabs' Jobs/Customers/More routes or RootNavigator's Technicians stack.
    // Story 14-3: the technician branch mounts the same RealtimeBridge —
    // one bridge for both roles (the hook routes per role inside; the
    // technician's socket listens on their own topic only).
    content = (
      <NavigationContainer ref={navigationRef}>
        <TechnicianRootNavigator />
        <RealtimeBridge />
      </NavigationContainer>
    );
  } else {
    // Owner session. RealtimeBridge mounts the Realtime hook + owner banner
    // here (Story 3.3; technician branch mounts it too since Story 14-3) —
    // NEVER at App() top level: the role gate is a conditional render chain,
    // so a top-level hook would run Realtime code for unsigned users too.
    // The bridge re-checks the session internally as well.
    content = (
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
        <RealtimeBridge />
      </NavigationContainer>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {!updateRequired && <MaintenanceBanner text={config.maintenance_banner} />}

      {content}

      {splashVisible && (
        <AnimatedBootSplash onAnimationEnd={() => setSplashVisible(false)} />
      )}
    </SafeAreaProvider>
  );
}

export default App;
