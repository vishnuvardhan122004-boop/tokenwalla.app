import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Wires Android's hardware back button to the same destination as the screen's
 * own back button.
 *
 * Without this, the patient screens hidden from the tab bar (`href: null`) fall
 * through to the bottom-tab navigator's default `backBehavior: 'firstRoute'`
 * and jump to Home from anywhere — skipping the screen the patient actually
 * came from. The hospital and auth stacks have the opposite problem: they are
 * usually entered with replace(), so the stack is empty and back exits the app.
 *
 * Only the focused screen listens, and the handler returns true to stop the
 * navigator applying its own behaviour afterwards.
 *
 * Pass a handler that does nothing to swallow back entirely (e.g. while a
 * payment is in flight).
 */
export function useAndroidBack(onBack: () => void) {
  // Held in a ref so an inline arrow at the call site doesn't resubscribe on
  // every render.
  const handler = useRef(onBack);
  handler.current = onBack;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handler.current();
        return true;
      });
      return () => sub.remove();
    }, []),
  );
}
