/**
 * The hospital queue's "Add walk-in" form (components/WalkInForm.tsx), rendered
 * against a mocked API: it posts today's walk-in with the cleaned mobile and the
 * consent flag, and a 409 slot_full offers "Add anyway", which re-posts with the
 * override. currentSlot() mirrors the website's and is pinned case for case.
 */
import React from 'react';
import API from './api';
import WalkInForm, { currentSlot } from '../components/WalkInForm';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

// The real icon set pulls in expo-font -> expo-asset, which jest can't resolve.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('./api', () => ({
  __esModule: true,
  default: { post: jest.fn() },
  apiMessage: (_e: unknown, f: string) => f,
}));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const at = (h: number, m: number) => new Date(2026, 9, 16, h, m);
const SLOTS = ['02:00 PM', '09:00 AM', '11:00 AM'];   // unsorted on purpose

describe('currentSlot', () => {
  it('is the latest slot already started', () => {
    expect(currentSlot(SLOTS, at(11, 40))).toBe('11:00 AM');
    expect(currentSlot(SLOTS, at(15, 0))).toBe('02:00 PM');
  });
  it('is the first slot before the day starts, and blank with no slots', () => {
    expect(currentSlot(SLOTS, at(7, 0))).toBe('09:00 AM');
    expect(currentSlot([], at(10, 0))).toBe('');
  });
});

describe('WalkInForm', () => {
  const doctors = [
    { id: 7, name: 'Anita Rao', slots: ['09:00 AM'], available: true },
    { id: 8, name: 'Off Today', slots: ['09:00 AM'], available: false },
  ];
  let r: any;
  const text = () => r.root.findAll((n: any) => n.type === 'Text')
    .flatMap((n: any) => [n.props.children].flat(Infinity))
    .filter((c: unknown) => typeof c === 'string').join(' ');
  const press = (label: string) => act(async () => {
    r.root.findAll((n: any) => typeof n.props?.onPress === 'function' && n.findAll((c: any) =>
      c.type === 'Text' && [c.props.children].flat().join('').includes(label)).length > 0)[0].props.onPress();
  });
  const input = (label: string) => r.root.find((n: any) => n.props?.accessibilityLabel === label && n.props.onChangeText);

  const fill = async (onAdded = jest.fn()) => {
    await act(async () => { r = TestRenderer.create(<WalkInForm doctors={doctors} onAdded={onAdded} />); });
    await press('Add walk-in');
    await press('Dr. Anita Rao');
    await act(async () => { input('Patient name').props.onChangeText('Ravi Kumar'); });
    await act(async () => { input('Mobile').props.onChangeText('+91 98765 43210'); });
    return onAdded;
  };

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => act(() => r.unmount()));

  it('posts the walk-in with the cleaned mobile, and hides unavailable doctors', async () => {
    (API.post as jest.Mock).mockResolvedValue({ data: { token: 'TW-1', slot: '09:00 AM', patient_name: 'Ravi Kumar' } });
    const onAdded = await fill();
    expect(text()).not.toContain('Off Today');
    expect(input('Mobile').props.value).toBe('9876543210');

    await press('Give token');

    expect(API.post).toHaveBeenCalledWith('/bookings/walk-in/', {
      doctor_id: 7, slot: '09:00 AM', name: 'Ravi Kumar', mobile: '9876543210',
      whatsapp_consent: true, override_full: false,
    });
    expect(onAdded).toHaveBeenCalled();
    expect(text()).toContain('TW-1');
  });

  it('offers "Add anyway" on a full slot and re-posts with the override', async () => {
    (API.post as jest.Mock)
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { code: 'slot_full', message: '09:00 AM is full (10 of 10).' } } })
      .mockResolvedValueOnce({ data: { token: 'TW-2', slot: '09:00 AM' } });
    await fill();
    await act(async () => {
      r.root.find((n: any) => n.props?.accessibilityRole === 'checkbox' && n.props.onPress).props.onPress();
    });
    await press('Give token');
    expect(text()).toContain('is full');

    await press('Add anyway');

    expect(API.post).toHaveBeenLastCalledWith('/bookings/walk-in/', expect.objectContaining({
      override_full: true, whatsapp_consent: false,
    }));
  });

  it('renders nothing when no doctor can take walk-ins', async () => {
    await act(async () => { r = TestRenderer.create(<WalkInForm doctors={[doctors[1]]} onAdded={jest.fn()} />); });
    expect(r.toJSON()).toBeNull();
  });
});
