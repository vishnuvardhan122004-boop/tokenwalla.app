/**
 * utils/shareCapture.ts — snapshot a view to a PNG and open the share sheet. The
 * token ticket, the My Bookings ticket and the receipt all do exactly this.
 */
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { captureRef } from 'react-native-view-shot';

/**
 * Returns false when the device cannot share (the caller shows its own message);
 * throws if the capture or the share itself fails. `wholeContent` captures a
 * ScrollView's entire content rather than just what is on screen.
 */
export async function shareCapturedView(
  target: RefObject<unknown>, dialogTitle: string, wholeContent = false,
): Promise<boolean> {
  const uri = await captureRef(target as RefObject<never>, {
    format: 'png', quality: 1, result: 'tmpfile', ...(wholeContent && { snapshotContentContainer: true }),
  });
  const shareUri = uri.startsWith('file') ? uri : `file://${uri}`;
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(shareUri, { mimeType: 'image/png', dialogTitle, UTI: 'public.png' });
  return true;
}
