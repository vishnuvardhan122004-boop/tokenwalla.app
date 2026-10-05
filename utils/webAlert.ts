/**
 * Alert.alert, made to work on the web.
 *
 * react-native-web 0.21 implements Alert as `class Alert { static alert() {} }`
 * — an EMPTY function. So when the app runs in a browser (`expo start`, then
 * the web option), every Alert.alert in it does nothing: no dialog appears and
 * no button's onPress ever runs. All three logout buttons confirm through
 * Alert first (patient Profile, hospital dashboard, hospital Profile), so on
 * the web none of them could log anyone out — found 2026-10-05, when a
 * hospital could not log out. The same blank also swallowed every error
 * message (88 of the app's 100 alerts carry no buttons; they ARE the message).
 *
 * Installed once at startup on web only. Native platforms are untouched: on a
 * phone, Alert.alert already shows the real dialog.
 *
 * Mapping onto the browser's two primitives:
 *   - nothing to choose (no buttons, or one acknowledge button) → window.alert,
 *     then that button's onPress
 *   - one action + a cancel → window.confirm. The browser labels its buttons
 *     OK / Cancel, which throws away the meaning, so the text SAYS what OK
 *     does. Without that, OK on the hospital token-detail popup reads as
 *     "close" and marks a real patient as a no-show.
 *   - two or more actions → window.confirm cannot say which one OK means, and
 *     guessing could run a destructive one. Show the text, run nothing.
 */
import { Alert, Platform } from 'react-native';

export type WebAlertButton = {
  text?: string;
  onPress?: (value?: string) => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type BrowserDialogs = { alert: (message: string) => void; confirm: (message: string) => boolean };

export function webAlert(
  win: BrowserDialogs,
  title: string,
  message?: string,
  buttons?: WebAlertButton[],
): void {
  const body = [title, message].filter(Boolean).join('\n\n');
  const list = buttons ?? [];
  const cancel = list.find(b => b.style === 'cancel');
  const actions = list.filter(b => b.style !== 'cancel');

  if (actions.length === 0 || (actions.length === 1 && !cancel)) {
    win.alert(body);
    (actions[0] ?? cancel)?.onPress?.();
    return;
  }

  if (actions.length === 1) {
    const [action] = actions;
    const hint = `OK = ${action.text || 'OK'} · Cancel = ${cancel?.text || 'Cancel'}`;
    const chosen = win.confirm(`${body}\n\n${hint}`) ? action : cancel;
    chosen?.onPress?.();
    return;
  }

  win.alert(body);
}

export function installWebAlert(): void {
  if (Platform.OS !== 'web') return;
  const dialogs = globalThis as unknown as Partial<BrowserDialogs>;
  if (typeof dialogs.alert !== 'function' || typeof dialogs.confirm !== 'function') return;
  const win: BrowserDialogs = {
    alert: (m) => dialogs.alert!(m),
    confirm: (m) => dialogs.confirm!(m),
  };
  Alert.alert = (title, message, buttons) =>
    webAlert(win, title, message, buttons as WebAlertButton[] | undefined);
}
