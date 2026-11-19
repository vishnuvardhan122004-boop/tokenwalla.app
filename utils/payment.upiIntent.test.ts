/**
 * Paying with PhonePe / GPay / Paytm from the in-app Razorpay WebView. Without
 * `webview_intent: true` Razorpay hides those buttons in a WebView, and without a
 * link handler the WebView (originWhitelist ['*']) tries to load `upi://` itself.
 */
import fs from 'fs';
import path from 'path';
import { Linking } from 'react-native';
import { externalPaymentUrl, handlePaymentLink } from './payment';

describe('externalPaymentUrl', () => {
  it('leaves web pages and blank frames to the WebView', () => {
    for (const url of ['https://api.razorpay.com/v1/checkout', 'http://x.test', 'about:blank', 'data:text/html,x']) {
      expect(externalPaymentUrl(url)).toBeNull();
    }
  });

  it('hands a UPI or app link to the phone as it is', () => {
    expect(externalPaymentUrl('upi://pay?pa=a@b&am=25.37')).toBe('upi://pay?pa=a@b&am=25.37');
    expect(externalPaymentUrl('phonepe://pay?pa=a@b')).toBe('phonepe://pay?pa=a@b');
  });

  it("unwraps Android's intent:// link to the scheme it names", () => {
    expect(externalPaymentUrl('intent://pay?pa=a@b&am=25.37#Intent;scheme=upi;package=com.phonepe.app;end'))
      .toBe('upi://pay?pa=a@b&am=25.37');
  });

  it('an intent:// link with no scheme is left alone', () => {
    expect(externalPaymentUrl('intent://pay#Intent;package=x;end')).toBeNull();
  });
});

describe('handlePaymentLink', () => {
  it('opens a UPI link in the app and stops the WebView loading it', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    expect(handlePaymentLink('upi://pay?pa=a@b', jest.fn())).toBe(false);
    expect(open).toHaveBeenCalledWith('upi://pay?pa=a@b');
  });

  it('lets the WebView load a web page', () => {
    const open = jest.spyOn(Linking, 'openURL');
    open.mockClear();
    expect(handlePaymentLink('https://api.razorpay.com/', jest.fn())).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it('tells the patient when that UPI app is not installed', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No Activity found'));
    const onNoApp = jest.fn();
    handlePaymentLink('upi://pay?pa=a@b', onNoApp);
    await new Promise((r) => setImmediate(r));
    expect(onNoApp).toHaveBeenCalled();
  });
});

describe.each(['app/(patient)/payment.tsx', 'components/RescheduleModal.tsx'])('%s', (file) => {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  it('asks Razorpay for the UPI app buttons and hands their links to the phone', () => {
    expect(src).toContain('webview_intent: true');
    expect(src).toMatch(/onShouldStartLoadWithRequest=\{\(req\) => handlePaymentLink\(req\.url/);
  });
});
