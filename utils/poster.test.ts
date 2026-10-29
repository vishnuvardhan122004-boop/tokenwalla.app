/**
 * The links a poster carries. The QR must open the PRODUCTION booking page on
 * any build (a dev or preview build included), the same page the website's
 * /poster/... prints (web ROADMAP item 58), and the label on it is only a
 * label: nothing reads `src` yet.
 */
import { posterLink, posterQrValue, posterShareText, WEB_URL } from './poster';

test('a doctor poster opens that doctor on the production site, labelled src=poster', () => {
  expect(posterQrValue('doctor', 7)).toBe('https://www.tokenwalla.com/doctor/7?src=poster');
});

test('a centre poster opens the centre page, not the doctor page', () => {
  expect(posterQrValue('scan', 3)).toBe('https://www.tokenwalla.com/scan-center/3?src=poster');
});

test('the link people share carries no label', () => {
  expect(posterLink('doctor', 7)).toBe('https://www.tokenwalla.com/doctor/7');
  expect(posterLink('scan', '12')).toBe('https://www.tokenwalla.com/scan-center/12');
  expect(WEB_URL).toBe('https://www.tokenwalla.com');
});

test('the share text names the doctor, then the clinic, the city and the link last', () => {
  const text = posterShareText(
    { kind: 'doctor', id: 7, name: 'Anita Rao', specialization: 'Pediatrician', hospital: 'City Care', city: 'Hindupur' },
    'Book your token on Tokenwalla',
  );
  expect(text).toBe([
    '👨‍⚕️ Dr. Anita Rao',
    '🩺 Pediatrician',
    '🏥 City Care',
    '📍 Hindupur',
    '',
    'Book your token on Tokenwalla https://www.tokenwalla.com/doctor/7',
  ].join('\n'));
});

test('a centre is named as it is, with no Dr. and no doctor lines', () => {
  const text = posterShareText({ kind: 'scan', id: 3, name: 'Lotus Lab', city: 'Hindupur' }, 'Book on Tokenwalla');
  expect(text).toBe(['🏥 Lotus Lab', '📍 Hindupur', '', 'Book on Tokenwalla https://www.tokenwalla.com/scan-center/3'].join('\n'));
});
