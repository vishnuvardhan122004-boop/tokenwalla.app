import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ErrorBoundary from '../components/ErrorBoundary';
import { I18nProvider } from '../services/i18n';
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  ensureNotificationSetup,
} from '../services/notifications';
import { initSentry, wrapWithSentry } from '../services/sentry';
import { checkForUpdate } from '../services/appUpdate';

// Initialise crash reporting as early as possible so launch-time errors are caught.
initSentry();

function RootLayout() {
  useEffect(() => {
    // Ask for notification permission + create the Android channel once at launch.
    // (No-op in Expo Go — notifications require a dev/production build.)
    ensureNotificationSetup();

    // Ask the backend whether this build is too old. Fails silently when
    // offline or on a backend without the endpoint, so it can't hold up launch.
    checkForUpdate();

    // …and again whenever the app comes back to the foreground. This effect
    // runs once per app PROCESS, and on Android a process survives for days —
    // so launch-only meant someone tapping the "please update" push usually saw
    // nothing at all: the app was merely resumed, never relaunched. The prompt
    // itself is rate-limited (blocking always shows, the nag has a cooldown),
    // so this cannot turn into a prompt on every app switch.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForUpdate();
    });

    // Tapping a notification opens the relevant screen.
    const unsubTap = addNotificationResponseListener((data) => {
      if (data?.screen === 'my-bookings') {
        // A "doctor unavailable" alert deep-links to the free reschedule flow.
        const params =
          data?.reschedule === 'free' && data?.bookingId
            ? { rescheduleId: String(data.bookingId) }
            : undefined;
        router.push({ pathname: '/(patient)/my-bookings', params });
      } else if (data?.screen === 'hospital-dashboard') {
        router.push('/(hospital)/dashboard');
      }
    });

    // Record every delivered notification into the in-app notification centre.
    const unsubReceived = addNotificationReceivedListener();

    return () => {
      unsubTap();
      unsubReceived();
      appStateSub.remove();
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
