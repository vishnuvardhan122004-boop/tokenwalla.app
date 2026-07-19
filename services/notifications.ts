/**
 * services/notifications.ts
 *
 * Local notification helpers for TokenWalla.
 *
 *  Patient side
 *   • notifyBookingConfirmed()      → instant "your token is booked" alert
 *   • syncAppointmentReminders()    → schedules a reminder ~2.1 hours before each
 *                                     active appointment (and cancels reminders for
 *                                     cancelled / completed / rescheduled bookings)
 *
 *  Hospital side
 *   • notifyHospitalNewBooking()    → instant "new appointment booked" alert
 *
 * These are LOCAL notifications (no backend / push server required).
 *
 * ⚠️ Expo Go note: since SDK 53, expo-notifications' native code is NOT bundled in
 * Expo Go and logs an error just for being imported. So we LAZY-load the module and
 * short-circuit every call when running inside Expo Go — the app stays clean there,
 * and notifications work fully in a development or production build
 * (npx expo run:android / run:ios, or an EAS build).
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type * as NotificationsModule from 'expo-notifications';
import { recordNotification, setBadgeSync, type NotificationAudience } from './notificationStore';
import API from './api';

/**
 * Format a doctor's display name for a message body. Handles a missing name
 * (no stray "Dr.") and a name that already carries the "Dr." prefix
 * (no "Dr. Dr." doubling).
 */
function doctorLabel(name?: string): string {
  const n = (name ?? '').trim();
  if (!n) return 'your doctor';
  return /^dr\.?\s/i.test(n) ? n : `Dr. ${n}`;
}

// How long before the appointment to remind the patient — 2.1 hours.
const REMINDER_LEAD_MS = 2.1 * 60 * 60 * 1000; // 2h 6m

const ANDROID_CHANNEL_ID = 'appointments';

// Detect Expo Go — its runtime lacks the native notifications module.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Lazily require expo-notifications so Expo Go never touches its native side.
let _notifications: typeof NotificationsModule | null = null;
let _handlerSet = false;
function getNotifications(): typeof NotificationsModule | null {
  if (isExpoGo) return null;
  if (!_notifications) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _notifications = require('expo-notifications') as typeof NotificationsModule;
    } catch {
      return null;
    }
  }
  if (_notifications && !_handlerSet) {
    _handlerSet = true;
    // Foreground behaviour: still show a banner + play sound while the app is open.
    _notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
  return _notifications;
}

// Keep the OS app-icon badge in sync with the in-app centre's unread count.
// Registered once; a no-op in Expo Go (getNotifications() returns null there).
setBadgeSync((totalUnread) => {
  const N = getNotifications();
  if (!N) return;
  N.setBadgeCountAsync(totalUnread).catch(() => {});
});

let setupDone = false;

/**
 * Ask for permission + create the Android channel. Safe to call multiple times.
 * Returns true if notifications are permitted (always false in Expo Go).
 */
export async function ensureNotificationSetup(): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Appointment Reminders',
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#185FA5',
      });
    }

    if (!setupDone) {
      const current = await N.getPermissionsAsync();
      let status = current.status;
      if (status !== 'granted') {
        const req = await N.requestPermissionsAsync();
        status = req.status;
      }
      setupDone = true;
      return status === 'granted';
    }

    const { status } = await N.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// Avoid re-POSTing the same token+role repeatedly within a session.
let _registeredKey: string | null = null;

/**
 * Fetch this device's Expo push token and register it with the backend so the
 * server can send "your turn" (patient) / "new booking" (hospital) pushes.
 * No-op in Expo Go (no native module → can't obtain a push token) and if
 * permission isn't granted. Safe + idempotent to call on every screen mount.
 */
export async function registerPushToken(role: NotificationAudience): Promise<void> {
  const N = getNotifications();
  if (!N) return; // Expo Go / no native module — needs a dev or EAS build
  const ok = await ensureNotificationSetup();
  if (!ok) return;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    const resp = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = resp.data;
    if (!token) return;

    const key = `${role}:${token}`;
    if (_registeredKey === key) return; // already registered this session
    await API.post('/notifications/register-device/', { token, role });
    _registeredKey = key;
  } catch {
    // best-effort — never block the UI on push registration
  }
}

/**
 * Register a tap-handler for notifications. Returns an unsubscribe function
 * (a no-op in Expo Go). Used by the root layout for deep-linking on tap.
 */
export function addNotificationResponseListener(
  handler: (data: Record<string, any> | undefined) => void,
): () => void {
  const N = getNotifications();
  if (!N) return () => {};
  const sub = N.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data as Record<string, any> | undefined);
  });
  return () => sub.remove();
}

/**
 * Record every notification the OS delivers into the in-app centre. This is how
 * the scheduled ~2.1h reminder (and, later, backend pushes) land in the panel —
 * they carry `appId`/`audience`/`type` in their data and are deduped by id, so
 * instant notifications already recorded directly are not double-added.
 * Returns an unsubscribe function (a no-op in Expo Go).
 */
export function addNotificationReceivedListener(): () => void {
  const N = getNotifications();
  if (!N) return () => {};
  const sub = N.addNotificationReceivedListener((notification) => {
    const req = notification.request;
    const content = req.content;
    const data = (content.data ?? {}) as Record<string, any>;
    const audience: NotificationAudience = data.audience === 'hospital' ? 'hospital' : 'patient';
    recordNotification({
      id: String(data.appId ?? req.identifier ?? Date.now()),
      title: content.title ?? 'Notification',
      body: content.body ?? '',
      audience,
      type: data.type,
      data,
    });
  });
  return () => sub.remove();
}

// ── Date helpers ────────────────────────────────────────────────────────────

/**
 * Combine a `YYYY-MM-DD` date string and a `hh:mm AM/PM` slot into a local Date.
 * Returns null if either can't be parsed.
 */
export function parseAppointmentDate(dateStr?: string, slotStr?: string): Date | null {
  if (!dateStr) return null;

  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!dm) return null;
  const year  = Number(dm[1]);
  const month = Number(dm[2]) - 1;
  const day   = Number(dm[3]);

  let hours = 9;
  let mins  = 0;
  if (slotStr) {
    const sm = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(slotStr.trim());
    if (sm) {
      hours = Number(sm[1]) % 12;
      mins  = Number(sm[2]);
      const mer = (sm[3] || '').toUpperCase();
      if (mer === 'PM') hours += 12;
    }
  }

  const d = new Date(year, month, day, hours, mins, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

// Deterministic id so a booking always maps to the same scheduled reminder,
// letting us replace / cancel it reliably.
function reminderId(bookingKey: string | number): string {
  return `appt-reminder-${String(bookingKey)}`;
}

// An "immediate" trigger. On Android it must carry the channelId so the
// notification uses our high-importance channel; on iOS `null` fires now.
function immediateTrigger(): NotificationsModule.NotificationTriggerInput {
  return Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null;
}

// ── Patient: instant booking confirmation ───────────────────────────────────

export async function notifyBookingConfirmed(opts: {
  token?: string;
  doctorName?: string;
  hospital?: string;
  date?: string;
  slot?: string;
}): Promise<void> {
  const tokenLabel = opts.token ? ` (${opts.token})` : '';
  const title = '✅ Token Booked!';
  const body =
    `Your appointment with ${doctorLabel(opts.doctorName)} is confirmed` +
    `${opts.date ? ` for ${opts.date}` : ''}${opts.slot ? ` at ${opts.slot}` : ''}.` +
    `${tokenLabel}`;
  const appId = `confirm-${opts.token ?? Date.now()}`;

  // Always record into the in-app centre (works in Expo Go too).
  await recordNotification({
    id: appId,
    title,
    body,
    audience: 'patient',
    type: 'booking_confirmed',
    data: { screen: 'my-bookings', token: opts.token },
  });

  const N = getNotifications();
  if (!N) return;
  const ok = await ensureNotificationSetup();
  if (!ok) return;

  await N.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { screen: 'my-bookings', type: 'booking_confirmed', appId, audience: 'patient' },
    },
    trigger: immediateTrigger(), // fire immediately (on the appointments channel)
  });
}

// ── Patient: ~2.1h-before reminder ──────────────────────────────────────────

/**
 * Schedule a single reminder ~2.1h before the appointment. Replaces any existing
 * reminder for the same booking. No-op (and cancels a stale reminder) if the
 * reminder time is already in the past.
 */
export async function scheduleAppointmentReminder(booking: {
  id?: string | number;
  token?: string;
  doctor_name?: string;
  hospital_name?: string;
  date?: string;
  slot?: string;
}): Promise<void> {
  const N = getNotifications();
  if (!N) return;

  // Prefer token as the key so the confirmation screen (which only knows the
  // token) and the bookings list (which knows both) schedule the SAME reminder.
  const key = booking.token ?? booking.id;
  if (key == null) return;

  const apptTime = parseAppointmentDate(booking.date, booking.slot);
  if (!apptTime) return;

  const fireAt = new Date(apptTime.getTime() - REMINDER_LEAD_MS);

  // Always clear the previous reminder for this booking first.
  await cancelAppointmentReminder(key);

  // Only schedule if the reminder is still in the future.
  if (fireAt.getTime() <= Date.now() + 5000) return;

  const ok = await ensureNotificationSetup();
  if (!ok) return;

  await N.scheduleNotificationAsync({
    identifier: reminderId(key),
    content: {
      title: '⏰ Upcoming Appointment',
      body:
        `You have an appointment with ${doctorLabel(booking.doctor_name)}` +
        `${booking.slot ? ` at ${booking.slot}` : ''} in about 2 hours. ` +
        `Need a change? Tap to reschedule or cancel.`,
      // Recorded into the in-app centre by the received-listener when it fires
      // (deduped via appId), so it appears in the panel at the right time.
      data: {
        screen: 'my-bookings',
        type: 'appointment_reminder',
        token: booking.token,
        appId: `reminder-${key}`,
        audience: 'patient',
      },
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
  });
}

export async function cancelAppointmentReminder(bookingKey: string | number): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(reminderId(bookingKey));
  } catch {
    // no-op — nothing scheduled
  }
}

/**
 * Reconcile all scheduled reminders against the current booking list.
 * Active (waiting / in_progress) bookings get a reminder; everything else
 * (cancelled, completed) has its reminder cleared.
 */
export async function syncAppointmentReminders(
  bookings: {
    id?: string | number;
    token?: string;
    status?: string;
    doctor_name?: string;
    hospital_name?: string;
    date?: string;
    slot?: string;
  }[],
): Promise<void> {
  if (isExpoGo || !Array.isArray(bookings)) return;
  for (const b of bookings) {
    const key = b.token ?? b.id;
    if (key == null) continue;
    if (b.status === 'waiting' || b.status === 'in_progress') {
      await scheduleAppointmentReminder(b);
    } else {
      await cancelAppointmentReminder(key);
    }
  }
}

// ── Hospital: instant new-booking alert ─────────────────────────────────────

export async function notifyHospitalNewBooking(opts: {
  patientName?: string;
  doctorName?: string;
  slot?: string;
  token?: string;
}): Promise<void> {
  const title = '🔔 New Appointment Booked';
  const body =
    `${opts.patientName || 'A patient'} booked` +
    `${opts.doctorName ? ` ${doctorLabel(opts.doctorName)}` : ' an appointment'}` +
    `${opts.slot ? ` at ${opts.slot}` : ''}.` +
    `${opts.token ? ` Token ${opts.token}.` : ''}`;
  const appId = `newbooking-${opts.token ?? Date.now()}`;

  await recordNotification({
    id: appId,
    title,
    body,
    audience: 'hospital',
    type: 'new_booking',
    data: { screen: 'hospital-dashboard', token: opts.token },
  });

  const N = getNotifications();
  if (!N) return;
  const ok = await ensureNotificationSetup();
  if (!ok) return;

  await N.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { screen: 'hospital-dashboard', type: 'new_booking', appId, audience: 'hospital' },
    },
    trigger: immediateTrigger(),
  });
}
