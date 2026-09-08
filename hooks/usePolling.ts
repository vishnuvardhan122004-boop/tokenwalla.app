/**
 * hooks/usePolling.ts
 *
 * setInterval that only runs while the screen is actually being looked at.
 *
 * Both polls in this app used a bare setInterval, which kept firing in two
 * situations where nobody could see the result:
 *
 *   • App backgrounded. JS timers keep running on Android long after the app
 *     leaves the foreground, so a hospital dashboard left open all day was one
 *     request every 10 seconds, from a phone in someone's pocket.
 *   • Screen not focused. The hospital stack keeps the dashboard mounted
 *     behind Payments and Analytics, so it polled the queue from screens that
 *     don't show a queue.
 *
 * Coming back to the foreground fires `fn` immediately before resuming the
 * interval — the first thing you see on unlocking should be current, not up to
 * one interval stale.
 */

import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export function usePolling(fn: () => void, intervalMs: number, enabled = true) {
  // Held in a ref so an inline arrow at the call site doesn't restart the
  // interval on every render.
  const saved = useRef(fn);
  saved.current = fn;

  const focused = useIsFocused();

  useEffect(() => {
    if (!enabled || !focused) return;

    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!id) id = setInterval(() => saved.current(), intervalMs); };
    const stop  = () => { if (id) { clearInterval(id); id = null; } };

    if (AppState.currentState === 'active') start();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { saved.current(); start(); }
      else stop();
    });

    return () => { stop(); sub.remove(); };
  }, [intervalMs, enabled, focused]);
}
