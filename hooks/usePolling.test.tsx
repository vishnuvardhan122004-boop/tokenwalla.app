import React from 'react';
import { AppState } from 'react-native';
import { usePolling } from './usePolling';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const mockFocused = { v: true };
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused.v }));
Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ fn }: { fn: () => void }) { usePolling(fn, 10_000); return null; }

test('coming back to the screen refreshes at once, not after one interval', async () => {
  const fn = jest.fn();
  mockFocused.v = false;
  let r: any;
  await act(async () => { r = TestRenderer.create(<Probe fn={fn} />); });
  expect(fn).not.toHaveBeenCalled();           // not focused: nothing runs
  mockFocused.v = true;
  await act(async () => { r.update(<Probe fn={fn} />); });
  expect(fn).toHaveBeenCalledTimes(1);         // focused again: fresh immediately
  await act(async () => { r.unmount(); });
});
