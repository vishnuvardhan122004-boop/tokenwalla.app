/**
 * hooks/useOtpCooldown.ts
 *
 * Mirror the server's 60s OTP cooldown in the UI.
 *
 * `/auth/otp/request/` refuses a second send to the same number inside 60
 * seconds (users.auth_views.RequestOTPView), and every OTP button in this app
 * was disabled only while its own request was in flight — about 200ms. So the
 * button came back live immediately, the 429 rendered as an ordinary error
 * message, and anyone who kept tapping landed a real SMS the moment each
 * cooldown lapsed: one text per minute, for as long as they kept tapping.
 *
 * Seen live on the website on 2026-10-03 — 5 SMS to one number in 4 minutes
 * with 13 requests 429'd in between. The backend caps all held (the per-number
 * 10/day ceiling would have stopped it at ten), but the recipient's phone
 * still rang every minute and the person tapping had no way to know why. The
 * app had the same gap at nine send sites, and ships on the store cycle, so a
 * phone keeps the behaviour until it updates.
 *
 * Keep the default at 60 to match the server — a shorter one just puts the
 * 429 back.
 */

import { useEffect, useState } from 'react';

export function useOtpCooldown(seconds = 60): [number, () => void] {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  return [left, () => setLeft(seconds)];
}

/**
 * True when an OTP-request error is the server's own cooldown talking.
 *
 * Worth starting the countdown on: a 429 means the server is already
 * refusing, so the next tap can only produce another one. The call sites
 * catch `unknown`, and three different error shapes are in use across them
 * (apiMessage, isAxiosError, a bare cast), so the status check lives here
 * once rather than nine times.
 */
export const isCooldown429 = (e: unknown): boolean =>
  (e as { response?: { status?: number } })?.response?.status === 429;
