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
const MAX_ENTRIES = 60;

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
  if (fn && _cache) fn(_cache.reduce((a, n) => a + (n.read ? 0 : 1), 0));
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
  _badgeSync?.(items.reduce((a, n) => a + (n.read ? 0 : 1), 0));
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
  if (items.some((n) => n.id === input.id)) return;

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

  const next = [entry, ...items]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ENTRIES);
  await persist(next);
}

export async function getStoredNotifications(
  audience?: NotificationAudience,
): Promise<AppNotification[]> {
  const items = await load();
  return audience ? items.filter((n) => n.audience === audience) : items;
}

export async function markAsRead(id: string): Promise<void> {
  const items = await load();
  let changed = false;
  const next = items.map((n) => {
    if (n.id === id && !n.read) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });
  if (changed) await persist(next);
}

export async function markAllRead(audience?: NotificationAudience): Promise<void> {
  const items = await load();
  let changed = false;
  const next = items.map((n) => {
    if (!n.read && (!audience || n.audience === audience)) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });
  if (changed) await persist(next);
}

export async function removeNotification(id: string): Promise<void> {
  const items = await load();
  const next = items.filter((n) => n.id !== id);
  if (next.length !== items.length) await persist(next);
}

export async function clearNotifications(audience?: NotificationAudience): Promise<void> {
  const items = await load();
  const next = audience ? items.filter((n) => n.audience !== audience) : [];
  if (next.length !== items.length) await persist(next);
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

  const notifications = all.filter((n) => n.audience === audience);
  const unreadCount = notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);

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
