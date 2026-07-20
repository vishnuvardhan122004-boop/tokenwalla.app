/**
 * services/sentry.ts
 *
 * Crash / error reporting. Deliberately inert unless BOTH are true:
 *   1. a DSN is configured (app.json extra.sentryDsn or the SENTRY_DSN build env)
 *   2. we're in a real dev/production build — NOT Expo Go
 *
 * Expo Go (SDK 53+) strips native modules, so Sentry's native crash handling
 * isn't available there; we no-op to avoid noise, mirroring services/notifications.ts.
 * All calls are wrapped so telemetry setup can never crash the app itself.
 */

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { SENTRY_DSN } from '../constants/config';

// Expo Go reports 'storeClient'; dev/prod builds report 'standalone' or 'bare'.
const isExpoGo = Constants.executionEnvironment === 'storeClient';

let enabled = false;

/** Initialise Sentry once, at app launch. Safe to call when disabled. */
export function initSentry(): void {
  if (enabled) return;
  if (!SENTRY_DSN || isExpoGo) return; // disabled: no DSN, or running in Expo Go
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: __DEV__ ? 'development' : 'production',
      // Capture all errors; sample performance traces modestly to protect quota.
      tracesSampleRate: 0.2,
      enableNativeCrashHandling: true,
      // Don't spam Sentry while developing locally.
      enabled: !__DEV__,
    });
    enabled = true;
  } catch {
    // Never let telemetry setup take down the app.
  }
}

/** Report a caught error (e.g. from the ErrorBoundary). No-ops when disabled. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // ignore — reporting failures must not surface to the user
  }
}

/**
 * Wrap the root component so Sentry can attach render/navigation context.
 * Passes through untouched when Sentry isn't active.
 */
export const wrapWithSentry = Sentry.wrap;
