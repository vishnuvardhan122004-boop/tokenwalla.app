/**
 * hooks/useCurrentUser.ts
 *
 * Loads the persisted current user (AsyncStorage-backed `getUser`) into state.
 * Centralises the `getUser().then(setUser)` pattern that was duplicated across
 * patient screens.
 *
 * Generic over the user shape so callers keep their own typing
 * (e.g. `useCurrentUser<UserProfile>()`); defaults to `any` to match the
 * screens that stored the user untyped.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { getUser } from '../services/api';

export interface UseCurrentUserOptions {
  /** Re-read the user each time the screen regains focus (e.g. profile, so an
   *  edit made on another screen is reflected on return). Default: false. */
  refetchOnFocus?: boolean;
}

export function useCurrentUser<T = any>(options?: UseCurrentUserOptions) {
  const refetchOnFocus = options?.refetchOnFocus ?? false;
  const [user, setUser] = useState<T | null>(null);

  // Initial load on mount.
  useEffect(() => {
    let alive = true;
    getUser().then((u) => { if (alive) setUser(u); });
    return () => { alive = false; };
  }, []);

  // Optional reload whenever the screen regains focus.
  useFocusEffect(
    useCallback(() => {
      if (!refetchOnFocus) return;
      let alive = true;
      getUser().then((u) => { if (alive) setUser(u); });
      return () => { alive = false; };
    }, [refetchOnFocus]),
  );

  return { user, setUser };
}
