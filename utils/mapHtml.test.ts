import { mapHtml } from './mapHtml';

describe('mapHtml', () => {
  it('interpolates the starting view', () => {
    const html = mapHtml(16.3067, 80.4365, 16);
    expect(html).toContain('setView([16.3067, 80.4365], 16)');
  });

  it('never emits a non-number into executable code', () => {
    // The caller validates, but this string becomes JS — a NaN or a smuggled
    // value here would break the map or worse.
    const html = mapHtml(NaN, Infinity, NaN);
    expect(html).toContain('setView([16.5, 79.5], 6)');
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it('coerces rather than concatenates non-numeric input', () => {
    const html = mapHtml('16.5); alert(1); //' as unknown as number, 79.5, 6);
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('setView([16.5, 79.5], 6)');
  });

  it('declares the RN bridge both directions', () => {
    const html = mapHtml(16.5, 79.5, 6);
    expect(html).toContain('window.ReactNativeWebView.postMessage');
    expect(html).toContain('window.__fly');
    expect(html).toContain("type: 'move'");
  });
});
