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
        shouldSetBadge: false,
      }),
    });
  }
  return _notifications;
}

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
  const N = getNotifications();
  if (!N) return;
  const ok = await ensureNotificationSetup();
  if (!ok) return;

  const tokenLabel = opts.token ? ` (${opts.token})` : '';
  await N.scheduleNotificationAsync({
    content: {
      title: '✅ Token Booked!',
      body:
        `Your appointment with Dr. ${opts.doctorName ?? ''} is confirmed` +
        `${opts.date ? ` for ${opts.date}` : ''}${opts.slot ? ` at ${opts.slot}` : ''}.` +
        `${tokenLabel}`,
      data: { screen: 'my-bookings', type: 'booking_confirmed' },
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
        `You have an appointment with Dr. ${booking.doctor_name ?? ''}` +
        `${booking.slot ? ` at ${booking.slot}` : ''} in about 2 hours. ` +
        `Need a change? Tap to reschedule or cancel.`,
      data: { screen: 'my-bookings', type: 'appointment_reminder', token: booking.token },
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
  const N = getNotifications();
  if (!N) return;
  const ok = await ensureNotificationSetup();
  if (!ok) return;

  await N.scheduleNotificationAsync({
    content: {
      title: '🔔 New Appointment Booked',
      body:
        `${opts.patientName || 'A patient'} booked` +
        `${opts.doctorName ? ` Dr. ${opts.doctorName}` : ' an appointment'}` +
        `${opts.slot ? ` at ${opts.slot}` : ''}.` +
        `${opts.token ? ` Token ${opts.token}.` : ''}`,
      data: { screen: 'hospital-dashboard', type: 'new_booking' },
    },
    trigger: immediateTrigger(),
  });
}
