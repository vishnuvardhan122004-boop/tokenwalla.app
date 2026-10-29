/**
 * "Book ahead" on the doctor form and the test editor: no limit, or today plus 1 to
 * 6 days. Blank is its own choice, not "0": the column stores NULL for "no limit".
 * The app mirror of the website's BookingWindowPicker (ROADMAP 53 slice 4).
 */
import React from 'react';
import BookingWindowPicker from '../components/BookingWindowPicker';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const onChange = jest.fn();
let r: any;
const mount = async (value: string) => {
  await act(async () => { r = TestRenderer.create(<BookingWindowPicker value={value} onChange={onChange} />); });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
const chip = (re: RegExp) => {
  let p = texts(re)[0];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  return p;
};
const press = async (re: RegExp) => { await act(async () => { chip(re).props.onPress(); }); };

beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

test('offers No limit, then 1 to 6 days, in that order', async () => {
  await mount('');
  const labels = r.root.findAll((n: any) => n.type === 'Text' && /^(No limit|\dd)$/.test(textsOf(n))).map(textsOf);
  expect(labels).toEqual(['No limit', '1d', '2d', '3d', '4d', '5d', '6d']);
});

test('blank reads as no limit and says what patients can book', async () => {
  await mount('');
  expect(texts(/^No limit: patients can book the next 7 days\.$/)).toHaveLength(1);
});

test('1 is today and tomorrow only; N is today and the next N days', async () => {
  await mount('1');
  expect(texts(/^Patients can book today and tomorrow only\.$/)).toHaveLength(1);
  await act(async () => { r.update(<BookingWindowPicker value="3" onChange={onChange} />); });
  expect(texts(/^Patients can book today and the next 3 days\.$/)).toHaveLength(1);
});

test('a chip hands its value up, and No limit hands up an empty string, not 0', async () => {
  await mount('2');
  await press(/^4d$/);
  expect(onChange).toHaveBeenLastCalledWith('4');
  await press(/^No limit$/);
  expect(onChange).toHaveBeenLastCalledWith('');
});

/** Labels of the chips marked selected. A pressable shows up as more than one node in the tree, so compare labels. */
const selectedLabels = () => [...new Set(r.root
  .findAll((n: any) => n.props?.accessibilityState?.selected === true && typeof n.props.onPress === 'function')
  .map((n: any) => textsOf(n.findAll((c: any) => c.type === 'Text')[0])))];

test('the chosen chip is marked selected, and only it', async () => {
  await mount('2');
  expect(selectedLabels()).toEqual(['2d']);
});

test('a blank value marks No limit as the chosen one', async () => {
  await mount('');
  expect(selectedLabels()).toEqual(['No limit']);
});
