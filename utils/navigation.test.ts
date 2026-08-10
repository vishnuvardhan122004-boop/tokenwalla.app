import type { Router } from 'expo-router';
import { safeBack } from './navigation';

const fakeRouter = (canGoBack: boolean) =>
  ({
    canGoBack: () => canGoBack,
    back: jest.fn(),
    replace: jest.fn(),
  }) as unknown as Router;

describe('safeBack', () => {
  it('goes back when there is a stack entry', () => {
    const r = fakeRouter(true);
    safeBack(r, '/(patient)/doctors');
    expect(r.back).toHaveBeenCalled();
    expect(r.replace).not.toHaveBeenCalled();
  });

  it('replaces with the fallback when the stack is empty', () => {
    // Deep link or notification tap: back() would be a silent no-op and strand
    // the user on the screen with no way out.
    const r = fakeRouter(false);
    safeBack(r, '/(patient)/doctors');
    expect(r.back).not.toHaveBeenCalled();
    expect(r.replace).toHaveBeenCalledWith('/(patient)/doctors');
  });

  it('falls back to patient home when no fallback is given', () => {
    const r = fakeRouter(false);
    safeBack(r);
    expect(r.replace).toHaveBeenCalledWith('/(patient)/home');
  });
});
