/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { useState } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AnimatedBootSplash } from './features/splash';
import RootNavigator from './navigation/RootNavigator';
import TechnicianTabs from './navigation/TechnicianTabs';
import { navigationRef } from './navigation/navigationRef';
import { OnboardingScreen, useOnboarding } from './features/onboarding';
import { AuthFlow, useAuth } from './features/auth';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [splashVisible, setSplashVisible] = useState(true);
  const { status: onboardingStatus, complete: completeOnboarding } = useOnboarding();
  const { status: authStatus, session, complete: completeAuth } = useAuth();

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
        <TechnicianTabs />
      </NavigationContainer>
    );
  } else {
    content = (
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
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
