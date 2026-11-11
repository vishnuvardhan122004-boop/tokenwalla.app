/**
 * utils/webAlert — Alert.alert on the web, where react-native-web's own
 * implementation is an empty function. See the header in webAlert.ts.
 *
 * The shapes below are the real ones from this app's 100 alerts: 88 with no
 * buttons, 2 with one, and the rest one action against a cancel — which is the
 * shape of all three logout confirmations and of the hospital token popup.
 */
import fs from 'fs';
import path from 'path';
import { webAlert, type WebAlertButton } from './webAlert';

function fakeWindow(confirmAnswer = true) {
  const calls: { kind: 'alert' | 'confirm'; text: string }[] = [];
  return {
    calls,
    alert: (text: string) => { calls.push({ kind: 'alert', text }); },
    confirm: (text: string) => { calls.push({ kind: 'confirm', text }); return confirmAnswer; },
  };
}

describe('webAlert', () => {
  it('shows a plain message with window.alert — 88 of the 100 alerts', () => {
    const w = fakeWindow();
    webAlert(w, 'Error', 'Could not load the fee details.');
    expect(w.calls).toEqual([{ kind: 'alert', text: 'Error\n\nCould not load the fee details.' }]);
  });

  it('runs a lone acknowledge button after the user dismisses it', () => {
    const w = fakeWindow();
    const onPress = jest.fn();
    webAlert(w, 'Saved', 'Your profile has been updated.', [{ text: 'OK', onPress }]);
    expect(w.calls.map(c => c.kind)).toEqual(['alert']);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('runs a lone cancel-styled button too, rather than dropping it', () => {
    const w = fakeWindow();
    const onPress = jest.fn();
    webAlert(w, 'Token 12', 'Patient: A', [{ text: 'Close', style: 'cancel', onPress }]);
    expect(w.calls.map(c => c.kind)).toEqual(['alert']);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  describe('the logout confirmation — the bug that was reported', () => {
    // Same shape in app/(patient)/profile.tsx, app/(hospital)/dashboard.tsx
    // and app/(hospital)/Hprofile.tsx.
    const shape = (logout: jest.Mock, cancel?: jest.Mock): WebAlertButton[] => [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ];

    it('logs out when the user presses OK', () => {
      const logout = jest.fn();
      webAlert(fakeWindow(true), 'Logout', 'Are you sure?', shape(logout));
      expect(logout).toHaveBeenCalledTimes(1);
    });

    it('does NOT log out when the user presses Cancel', () => {
      const logout = jest.fn();
      const cancel = jest.fn();
      webAlert(fakeWindow(false), 'Logout', 'Are you sure?', shape(logout, cancel));
      expect(logout).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('says what OK does, because the browser only labels it "OK"', () => {
      const w = fakeWindow(false);
      webAlert(w, 'Logout', 'Are you sure?', shape(jest.fn()));
      expect(w.calls).toHaveLength(1);
      expect(w.calls[0].kind).toBe('confirm');
      expect(w.calls[0].text).toContain('Are you sure?');
      expect(w.calls[0].text).toContain('OK = Logout');
      expect(w.calls[0].text).toContain('Cancel = Cancel');
    });
  });

  it('labels a destructive action on an informational popup, so OK is not mistaken for "close"', () => {
    // app/(hospital)/dashboard.tsx showTokenDetail: reading a token's details,
    // with "Mark as No-show" as the secondary action. A bare OK/Cancel here
    // reads as "close", and marks a real patient as a no-show.
    const w = fakeWindow(false);
    const noShow = jest.fn();
    webAlert(w, 'Token 12', 'Patient: A\nSlot: 09:00 AM', [
      { text: 'Close', style: 'cancel' },
      { text: 'Mark as No-show', style: 'destructive', onPress: noShow },
    ]);
    expect(w.calls[0].text).toContain('OK = Mark as No-show');
    expect(w.calls[0].text).toContain('Cancel = Close');
    expect(noShow).not.toHaveBeenCalled();
  });

  it('runs NOTHING when there are two or more actions — OK could not say which', () => {
    const w = fakeWindow(true);
    const a = jest.fn();
    const b = jest.fn();
    webAlert(w, 'Choose', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reschedule', onPress: a },
      { text: 'Cancel booking', style: 'destructive', onPress: b },
    ]);
    expect(w.calls.map(c => c.kind)).toEqual(['alert']);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('omits an empty message rather than printing a blank paragraph', () => {
    const w = fakeWindow();
    webAlert(w, 'Copied');
    expect(w.calls[0].text).toBe('Copied');
  });
});

describe('the shim is installed before any screen renders', () => {
  it('is called at module scope in the root layout', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    expect(src).toMatch(/import \{ installWebAlert \} from '\.\.\/utils\/webAlert'/);
    // Top level, not inside a component or effect: it must be in place before
    // the first Alert.alert, which can fire during the first render.
    expect(src).toMatch(/^installWebAlert\(\);$/m);
  });
});
