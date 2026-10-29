/**
 * The poster screen: what a clinic puts on its wall, here on a phone. It shows the
 * provider, a QR to the production booking page, and two ways out: the poster as
 * a picture (the token and receipt share sheet, which is how a phone "prints")
 * and the plain link. App mirror of the website's /poster page (ROADMAP item 58).
 */
import React from 'react';
import { Alert, Share } from 'react-native';
import { I18nProvider } from './i18n';
import PosterModal from '../components/PosterModal';
import { shareCapturedView } from '../utils/shareCapture';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-qrcode-svg', () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  default: (p: { value: string }) => require('react').createElement('QR', { value: p.value }),
}));
jest.mock('../utils/shareCapture', () => ({ shareCapturedView: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const DOCTOR = { kind: 'doctor' as const, id: 7, name: 'Anita Rao', specialization: 'Pediatrician', hospital: 'City Care', city: 'Hindupur' };
const CENTRE = { kind: 'scan' as const, id: 3, name: 'Lotus Lab', city: 'Hindupur' };
const onClose = jest.fn();

let r: any;
const mount = async (target: typeof DOCTOR | typeof CENTRE) => {
  await act(async () => {
    r = TestRenderer.create(<I18nProvider><PosterModal target={target} onClose={onClose} /></I18nProvider>);
  });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
const qr = () => r.root.findAll((n: any) => n.type === 'QR')[0].props.value;
const press = async (re: RegExp) => {
  let p = texts(re)[0];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  await act(async () => { await p.props.onPress(); });
};
/** The pressable carrying this accessibilityLabel (the X in the header has no text). */
const pressLabel = async (label: string) => {
  const p = r.root.findAll((n: any) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  await act(async () => { p.props.onPress(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  (shareCapturedView as jest.Mock).mockResolvedValue(true);
});
afterEach(() => act(() => r.unmount()));

test('a doctor poster shows the doctor and clinic, and the QR opens the production page', async () => {
  await mount(DOCTOR);
  expect(texts(/^Dr\. Anita Rao$/)).toHaveLength(1);
  expect(texts(/Pediatrician · City Care/)).toHaveLength(1);
  expect(texts(/^Hindupur$/)).toHaveLength(1);
  expect(texts(/^Scan to book\. Skip the queue\.$/)).toHaveLength(1);
  expect(qr()).toBe('https://www.tokenwalla.com/doctor/7?src=poster');
  // The address is printed too, for a patient whose camera will not scan.
  expect(texts(/tokenwalla\.com\/doctor\/7$/)).toHaveLength(1);
});

test("a centre's poster is named as it is and points at the centre page", async () => {
  await mount(CENTRE);
  expect(texts(/^Lotus Lab$/)).toHaveLength(1);
  expect(texts(/Dr\./)).toHaveLength(0);
  expect(qr()).toBe('https://www.tokenwalla.com/scan-center/3?src=poster');
});

test('Share poster sends a picture of the poster, and says nothing when it works', async () => {
  await mount(DOCTOR);
  await press(/^Share poster$/);
  expect(shareCapturedView).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('a phone that cannot share is told so, instead of nothing happening', async () => {
  (shareCapturedView as jest.Mock).mockResolvedValue(false);
  await mount(DOCTOR);
  await press(/^Share poster$/);
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

test('a share that fails is reported, and the button comes back', async () => {
  (shareCapturedView as jest.Mock).mockRejectedValue(new Error('boom'));
  await mount(DOCTOR);
  await press(/^Share poster$/);
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  await press(/^Share poster$/);
  expect(shareCapturedView).toHaveBeenCalledTimes(2);
});

test('Share link sends the plain booking link with the doctor, never the labelled one', async () => {
  await mount(DOCTOR);
  await press(/^Share link$/);
  expect(Share.share).toHaveBeenCalledTimes(1);
  const { message } = (Share.share as jest.Mock).mock.calls[0][0];
  expect(message).toMatch(/Dr\. Anita Rao/);
  expect(message.endsWith('https://www.tokenwalla.com/doctor/7')).toBe(true);
  expect(message).not.toMatch(/src=poster/);
});

test('Close hands control back to the page', async () => {
  await mount(DOCTOR);
  await pressLabel('Close');
  expect(onClose).toHaveBeenCalledTimes(1);
});
