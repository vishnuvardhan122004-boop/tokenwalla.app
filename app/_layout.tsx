import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ErrorBoundary from '../components/ErrorBoundary';
import { I18nProvider } from '../services/i18n';
import { addNotificationResponseListener, ensureNotificationSetup } from '../services/notifications';

export default function RootLayout() {
  useEffect(() => {
    // Ask for notification permission + create the Android channel once at launch.
    // (No-op in Expo Go — notifications require a dev/production build.)
    ensureNotificationSetup();

    // Tapping a notification opens the relevant screen.
    const unsubscribe = addNotificationResponseListener((data) => {
      if (data?.screen === 'my-bookings') {
        router.push('/(patient)/my-bookings');
      } else if (data?.screen === 'hospital-dashboard') {
        router.push('/(hospital)/dashboard');
      }
    });

    return unsubscribe;
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
