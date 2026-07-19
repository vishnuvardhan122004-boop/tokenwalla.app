/**
 * services/notificationStore.ts
 *
 * In-app notification centre — a local, AsyncStorage-backed history of the
 * notifications TokenWalla shows the user, so they survive being swiped away
 * from the OS tray and power the in-app bell + list.
 *
 * This is pure JS/AsyncStorage: it works EVERYWHERE, including Expo Go (where
 * the native expo-notifications module is stripped). The OS banner and this
 * store are wired together in services/notifications.ts.
 *
 *  • Patient notifications  → audience 'patient'
 *  • Hospital notifications → audience 'hospital'
 *
 * Entries are de-duplicated by `id`, so recording the same notification twice
 * (e.g. once at fire-time and once via the OS "received" listener) is safe.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import {
  clearByAudience,
  countUnread,
  insertNotification,
  markManyRead,
  markOneRead,
  removeById,
  selectForAudience,
} from './notificationStore.logic';

export type NotificationAudience = 'patient' | 'hospital';

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  type?: string;                    // booking_confirmed | appointment_reminder | new_booking | queue_advance | ...
  audience: NotificationAudience;
  data?: Record<string, any>;
  createdAt: number;                // epoch ms
  read: boolean;
};

const STORAGE_KEY = 'tw.notifications.v1';

// In-memory cache + simple pub/sub so the bell + list stay in sync app-wide.
let _cache: AppNotification[] | null = null;
let _loading: Promise<AppNotification[]> | null = null;
const _listeners = new Set<(items: AppNotification[]) => void>();

// Optional bridge to the OS app-icon badge. services/notifications.ts registers
// this so the store never has to import the native expo-notifications module
// directly (which would break in Expo Go).
let _badgeSync: ((totalUnread: number) => void) | null = null;
export function setBadgeSync(fn: ((totalUnread: number) => void) | null): void {
  _badgeSync = fn;
  if (fn && _cache) fn(countUnread(_cache));
}

async function load(): Promise<AppNotification[]> {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as AppNotification[]) : [];
      _cache = Array.isArray(parsed) ? parsed : [];
    } catch {
      _cache = [];
    }
    _loading = null;
    return _cache;
  })();
  return _loading;
}

async function persist(items: AppNotification[]): Promise<void> {
  _cache = items;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // best-effort; the in-memory cache still reflects the change this session
  }
  _listeners.forEach((fn) => fn(items));
  _badgeSync?.(countUnread(items));
}

/**
 * Record a notification into the in-app centre. De-duplicated by `id`:
 * if an entry with the same id already exists, this is a no-op (so the OS
 * "received" listener can safely re-record something we already stored).
 */
export async function recordNotification(input: {
  id: string;
  title: string;
  body: string;
  audience: NotificationAudience;
  type?: string;
  data?: Record<string, any>;
  createdAt?: number;
}): Promise<void> {
  if (!input?.id) return;
  const items = await load();

  const entry: AppNotification = {
    id: input.id,
    title: input.title,
    body: input.body,
    type: input.type,
    audience: input.audience,
    data: input.data,
    createdAt: input.createdAt ?? Date.now(),
    read: false,
  };

  const next = insertNotification(items, entry);
  if (next !== items) await persist(next); // no-op when the id was a duplicate
}

export async function getStoredNotifications(
  audience?: NotificationAudience,
): Promise<AppNotification[]> {
  return selectForAudience(await load(), audience);
}

export async function markAsRead(id: string): Promise<void> {
  const items = await load();
  const next = markOneRead(items, id);
  if (next !== items) await persist(next);
}

export async function markAllRead(audience?: NotificationAudience): Promise<void> {
  const items = await load();
  const next = markManyRead(items, audience);
  if (next !== items) await persist(next);
}

export async function removeNotification(id: string): Promise<void> {
  const items = await load();
  const next = removeById(items, id);
  if (next !== items) await persist(next);
}

export async function clearNotifications(audience?: NotificationAudience): Promise<void> {
  const items = await load();
  const next = clearByAudience(items, audience);
  if (next !== items) await persist(next);
}

function subscribe(fn: (items: AppNotification[]) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * React hook powering both the bell (unread count) and the list screen.
 * Pass the audience for the current context ('patient' / 'hospital').
 */
export function useNotificationCenter(audience: NotificationAudience) {
  const [all, setAll] = useState<AppNotification[]>(_cache ?? []);
  const [ready, setReady] = useState<boolean>(_cache != null);

  useEffect(() => {
    let alive = true;
    load().then((items) => {
      if (alive) {
        setAll(items);
        setReady(true);
      }
    });
    const unsub = subscribe((items) => {
      if (alive) setAll(items);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const notifications = selectForAudience(all, audience);
  const unreadCount = countUnread(all, audience);

  return {
    ready,
    notifications,
    unreadCount,
    markRead: useCallback((id: string) => markAsRead(id), []),
    markAllRead: useCallback(() => markAllRead(audience), [audience]),
    remove: useCallback((id: string) => removeNotification(id), []),
    clearAll: useCallback(() => clearNotifications(audience), [audience]),
  };
}
