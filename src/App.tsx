/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { useEffect, useState } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AnimatedBootSplash } from './features/splash';
import RootNavigator from './navigation/RootNavigator';
import TechnicianRootNavigator from './navigation/TechnicianRootNavigator';
import { navigationRef } from './navigation/navigationRef';
import { OnboardingScreen, useOnboarding } from './features/onboarding';
import { AuthFlow, useAuth, expireSession } from './features/auth';
import { OwnerRealtimeBridge } from './features/notifications/OwnerRealtimeBridge';
import { runAllResets, setOnUnauthorized } from './services';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [splashVisible, setSplashVisible] = useState(true);
  const { status: onboardingStatus, complete: completeOnboarding } = useOnboarding();
  const { status: authStatus, session, complete: completeAuth } = useAuth();

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

  // First launch: onboarding tour → account setup → main app.
  let content;
  if (onboardingStatus !== 'done') {
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
    content = (
      <NavigationContainer ref={navigationRef}>
        <TechnicianRootNavigator />
      </NavigationContainer>
    );
  } else {
    // Owner session. OwnerRealtimeBridge mounts the Realtime hook + banner
    // here (Story 3.3) — NEVER at App() top level: the role gate is a
    // conditional render chain, so a top-level hook would open a socket for
    // technicians too. The bridge re-checks the role internally as well.
    content = (
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
        <OwnerRealtimeBridge />
      </NavigationContainer>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {content}

      {splashVisible && (
        <AnimatedBootSplash onAnimationEnd={() => setSplashVisible(false)} />
      )}
    </SafeAreaProvider>
  );
}

export default App;
