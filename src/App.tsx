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
import { navigationRef } from './navigation/navigationRef';
import { OnboardingScreen, useOnboarding } from './features/onboarding';
import { AuthFlow, useAuth } from './features/auth';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [splashVisible, setSplashVisible] = useState(true);
  const { status: onboardingStatus, complete: completeOnboarding } = useOnboarding();
  const { status: authStatus, complete: completeAuth } = useAuth();

  // First launch: onboarding tour → account setup → main app.
  let content;
  if (onboardingStatus !== 'done') {
    content = <OnboardingScreen onDone={completeOnboarding} />;
  } else if (authStatus !== 'done') {
    content = (
      <AuthFlow
        onComplete={result => {
          // TODO: persist `result` (phone + business profile) once a session
          // store / authService exists. For now only the local gate flips.
          completeAuth();
        }}
      />
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
