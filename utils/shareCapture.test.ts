import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { shareCapturedView } from './shareCapture';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
const capture = captureRef as jest.Mock;
const available = Sharing.isAvailableAsync as jest.Mock;
const share = Sharing.shareAsync as jest.Mock;
const ref = { current: {} };
beforeEach(() => { jest.clearAllMocks(); available.mockResolvedValue(true); });

test('snapshots to a PNG and opens the share sheet with the title', async () => {
  capture.mockResolvedValue('file:///cache/a.png');
  expect(await shareCapturedView(ref, 'Save it')).toBe(true);
  expect(capture).toHaveBeenCalledWith(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  expect(share).toHaveBeenCalledWith('file:///cache/a.png', { mimeType: 'image/png', dialogTitle: 'Save it', UTI: 'public.png' });
});

test('a bare path gets its file:// prefix', async () => {
  capture.mockResolvedValue('/cache/a.png');
  await shareCapturedView(ref, 'x');
  expect(share.mock.calls[0][0]).toBe('file:///cache/a.png');
});

test('wholeContent asks for the scroll content, not just what is on screen', async () => {
  capture.mockResolvedValue('/cache/a.png');
  await shareCapturedView(ref, 'x', true);
  expect(capture).toHaveBeenCalledWith(ref, expect.objectContaining({ snapshotContentContainer: true }));
});

test('a device that cannot share gets false, and nothing is shared', async () => {
  capture.mockResolvedValue('/cache/a.png');
  available.mockResolvedValue(false);
  expect(await shareCapturedView(ref, 'x')).toBe(false);
  expect(share).not.toHaveBeenCalled();
});

test('a failed capture or share is thrown to the caller, who shows its own message', async () => {
  capture.mockRejectedValue(new Error('no view'));
  await expect(shareCapturedView(ref, 'x')).rejects.toThrow('no view');
  capture.mockResolvedValue('/cache/a.png');
  share.mockRejectedValue(new Error('cancelled'));
  await expect(shareCapturedView(ref, 'x')).rejects.toThrow('cancelled');
});
