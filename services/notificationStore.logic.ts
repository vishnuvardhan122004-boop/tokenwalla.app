/**
 * services/notificationStore.logic.ts
 *
 * Pure array transforms behind the in-app notification centre — extracted from
 * notificationStore.ts so the dedup / cap / read / filter logic can be unit
 * tested without AsyncStorage or React.
 *
 * Contract: each transform returns the SAME array reference when nothing
 * changed, so the store can cheaply skip a persist/broadcast (`next !== items`).
 */

import type { AppNotification, NotificationAudience } from './notificationStore';

/** Max notifications kept in the centre (oldest are dropped past this). */
export const MAX_ENTRIES = 60;

/**
 * Insert `entry` unless an entry with the same id already exists (dedup).
 * On insert, keeps the list newest-first and capped to `max`.
 * Returns the same reference when the id was already present.
 */
export function insertNotification(
  items: AppNotification[],
  entry: AppNotification,
  max: number = MAX_ENTRIES,
): AppNotification[] {
  if (items.some((n) => n.id === entry.id)) return items;
  return [entry, ...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, max);
}

/** Mark a single notification read. Same reference if it was absent/already read. */
export function markOneRead(items: AppNotification[], id: string): AppNotification[] {
  let changed = false;
  const next = items.map((n) => {
    if (n.id === id && !n.read) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });
  return changed ? next : items;
}

/**
 * Mark all unread as read, optionally scoped to one audience.
 * Same reference if nothing was unread in scope.
 */
export function markManyRead(
  items: AppNotification[],
  audience?: NotificationAudience,
): AppNotification[] {
  let changed = false;
  const next = items.map((n) => {
    if (!n.read && (!audience || n.audience === audience)) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });
  return changed ? next : items;
}

/** Remove one notification by id. Same reference if the id was not found. */
export function removeById(items: AppNotification[], id: string): AppNotification[] {
  const next = items.filter((n) => n.id !== id);
  return next.length === items.length ? items : next;
}

/**
 * Clear notifications: all, or only those of one audience.
 * Same reference if nothing matched.
 */
export function clearByAudience(
  items: AppNotification[],
  audience?: NotificationAudience,
): AppNotification[] {
  const next = audience ? items.filter((n) => n.audience !== audience) : [];
  return next.length === items.length ? items : next;
}

/** The notifications for one audience (or all when audience is omitted). */
export function selectForAudience(
  items: AppNotification[],
  audience?: NotificationAudience,
): AppNotification[] {
  return audience ? items.filter((n) => n.audience === audience) : items;
}

/** Count unread notifications, optionally scoped to one audience. */
export function countUnread(items: AppNotification[], audience?: NotificationAudience): number {
  return items.reduce((acc, n) => {
    if (n.read) return acc;
    if (audience && n.audience !== audience) return acc;
    return acc + 1;
  }, 0);
}
