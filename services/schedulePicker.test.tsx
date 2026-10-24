/**
 * The day chips and time-slot grid shared by the doctor form, ScanEditorModal and
 * ScanBulkEdit (they had three copies). Each form keeps its own headings and its
 * own wording for "nothing chosen", passed in as `note`.
 */
import React from 'react';
import { Text } from 'react-native';
import { DayPicker, SlotPicker } from '../components/SchedulePicker';
import { DEFAULT_SLOTS } from '../constants/slots';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let r: any;
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
const press = async (re: RegExp) => {
  let p = texts(re)[0];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  await act(async () => { p.props.onPress(); });
};
const mount = async (el: React.ReactElement) => { await act(async () => { r = TestRenderer.create(el); }); };
afterEach(() => act(() => r.unmount()));

describe('DayPicker', () => {
  test('a tapped day is kept in week order, whatever order they were tapped in', async () => {
    const onChange = jest.fn();
    await mount(<DayPicker days={['Wed']} onChange={onChange} />);
    await press(/^Monday$/);
    expect(onChange).toHaveBeenLastCalledWith(['Mon', 'Wed']);
    await press(/^Wednesday$/);                                  // un-tick
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  test('Select All picks all seven, Clear All none', async () => {
    const onChange = jest.fn();
    await mount(<DayPicker days={['Mon']} onChange={onChange} />);
    await press(/^Select All$/);
    expect(onChange).toHaveBeenLastCalledWith(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    await press(/^Clear All$/);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  test('the centre forms\' wording: "All days", and no Clear All', async () => {
    await mount(<DayPicker days={[]} onChange={jest.fn()} allLabel="All days" clearable={false} />);
    expect(texts(/^All days$/)).toHaveLength(1);
    expect(texts(/^Select All$/)).toHaveLength(0);
    expect(texts(/^Clear All$/)).toHaveLength(0);
  });

  test('the note shows only while no day is chosen', async () => {
    const note = <Text>pick a day</Text>;
    await mount(<DayPicker days={[]} onChange={jest.fn()} note={note} />);
    expect(texts(/^pick a day$/)).toHaveLength(1);
    await act(async () => { r.update(<DayPicker days={['Tue']} onChange={jest.fn()} note={note} />); });
    expect(texts(/^pick a day$/)).toHaveLength(0);
  });
});

describe('SlotPicker', () => {
  test('a tapped slot is kept in clock order', async () => {
    const onChange = jest.fn();
    await mount(<SlotPicker slots={['10:00 AM']} onChange={onChange} />);
    await press(/^08:00 AM$/);
    expect(onChange).toHaveBeenLastCalledWith(['08:00 AM', '10:00 AM']);
    await press(/^10:00 AM$/);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  test('a time saved off the grid stays put when another is tapped, and sorts last', async () => {
    const onChange = jest.fn();
    await mount(<SlotPicker slots={['09:15 AM', '10:00 AM']} onChange={onChange} />);
    await press(/^08:00 AM$/);
    expect(onChange).toHaveBeenLastCalledWith(['08:00 AM', '10:00 AM', '09:15 AM']);
  });

  test('Select All is the whole grid, Clear All is empty', async () => {
    const onChange = jest.fn();
    await mount(<SlotPicker slots={[]} onChange={onChange} />);
    await press(/^Select All$/);
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_SLOTS);
    await press(/^Clear All$/);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  test('Quick hours replaces the slots; keepOffGrid carries an off-grid time through', async () => {
    const onChange = jest.fn();
    await mount(<SlotPicker slots={['10:00 AM', '09:15 AM']} onChange={onChange} />);
    r.root.findAll((n: any) => n.props?.accessibilityLabel === 'Quick hours 6 PM – 9 PM' && n.props.onPress)[0].props.onPress();
    expect(onChange).toHaveBeenLastCalledWith(['06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM']);
    await act(async () => { r.update(<SlotPicker slots={['10:00 AM', '09:15 AM']} onChange={onChange} keepOffGrid />); });
    r.root.findAll((n: any) => n.props?.accessibilityLabel === 'Quick hours 6 PM – 9 PM' && n.props.onPress)[0].props.onPress();
    expect(onChange).toHaveBeenLastCalledWith(['06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:15 AM']);
  });

  test('chips report whether they are chosen, and the note shows only while none is', async () => {
    const note = <Text>no slots</Text>;
    await mount(<SlotPicker slots={[]} onChange={jest.fn()} note={note} />);
    expect(texts(/^no slots$/)).toHaveLength(1);
    await act(async () => { r.update(<SlotPicker slots={['09:00 AM']} onChange={jest.fn()} note={note} />); });
    expect(texts(/^no slots$/)).toHaveLength(0);
    const chip = r.root.findAll((n: any) => n.props?.accessibilityState && typeof n.props.onPress === 'function'
      && textsOf(n.findAll((c: any) => c.type === 'Text')[0]) === '09:00 AM')[0];
    expect(chip.props.accessibilityState).toEqual({ selected: true });
  });
});
