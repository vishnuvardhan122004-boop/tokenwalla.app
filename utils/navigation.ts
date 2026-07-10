import type { Router } from 'expo-router';

// Falls back to a known route instead of a silent no-op when there's
// nothing in the stack to go back to (fresh reload, deep link, etc).
export function safeBack(router: Router, fallback: string = '/(patient)/home') {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback as never);
  }
}