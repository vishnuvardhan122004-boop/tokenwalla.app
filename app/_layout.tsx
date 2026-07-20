import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ErrorBoundary from '../components/ErrorBoundary';
import { I18nProvider } from '../services/i18n';
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  ensureNotificationSetup,
} from '../services/notifications';
import { initSentry, wrapWithSentry } from '../services/sentry';

// Initialise crash reporting as early as possible so launch-time errors are caught.
initSentry();

function RootLayout() {
  useEffect(() => {
    // Ask for notification permission + create the Android channel once at launch.
    // (No-op in Expo Go — notifications require a dev/production build.)
    ensureNotificationSetup();

    // Tapping a notification opens the relevant screen.
    const unsubTap = addNotificationResponseListener((data) => {
      if (data?.screen === 'my-bookings') {
        router.push('/(patient)/my-bookings');
      } else if (data?.screen === 'hospital-dashboard') {
        router.push('/(hospital)/dashboard');
      }
    });

    // Record every delivered notification into the in-app notification centre.
    const unsubReceived = addNotificationReceivedListener();

    return () => {
      unsubTap();
      unsubReceived();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="#F4F9FF" />
      <I18nProvider>
        <ErrorBoundary>
          <Stack screenOptions={{ headerShown: false }} />
        </ErrorBoundary>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

// Wrapped so Sentry can attach render/navigation context (pass-through when disabled).
export default wrapWithSentry(RootLayout);
