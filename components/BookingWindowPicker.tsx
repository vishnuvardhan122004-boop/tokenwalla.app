/**
 * components/BookingWindowPicker.tsx — "Book ahead": how many days past today a
 * patient may pick on the doctor form and the test editor. The app mirror of the
 * website's BookingWindowPicker.js (ROADMAP 53 slice 4).
 *
 * '' means no limit (the column stores NULL), which is not the same as any number,
 * so it is its own first chip rather than "0". The caption spells out what patients
 * can book, in the website's words, so the chip labels can stay short.
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '../constants/colors';
import { MAX_DAYS_AHEAD } from '../utils/bookingWindow';

const CHOICES = Array.from({ length: MAX_DAYS_AHEAD }, (_, i) => i + 1);

interface Props {
  value: string;                      // '' | '1' … '6'
  onChange: (next: string) => void;
  label?: string;
}

export default function BookingWindowPicker({ value, onChange, label = 'Book ahead' }: Props) {
  const v = value.trim();
  const caption = v === ''
    ? `No limit: patients can book the next ${MAX_DAYS_AHEAD + 1} days.`
    : v === '1'
      ? 'Patients can book today and tomorrow only.'
      : `Patients can book today and the next ${v} days.`;

  const chip = (key: string, text: string, on: boolean, next: string) => (
    <TouchableOpacity
      key={key}
      style={[st.chip, on && st.chipOn]}
      onPress={() => onChange(next)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[st.chipText, on && st.chipTextOn]}>{text}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={st.wrap}>
      <Text style={st.label}>{label}</Text>
      <View style={st.chipRow}>
        {chip('none', 'No limit', v === '', '')}
        {CHOICES.map(n => chip(String(n), `${n}d`, v === String(n), String(n)))}
      </View>
      <Text style={st.caption}>{caption}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap:        { marginBottom: 6 },
  label:       { fontSize: 13, fontWeight: '700', color: Colors.gray700, marginBottom: 8 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:        { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.white },
  chipOn:      { backgroundColor: Colors.blue600, borderColor: Colors.blue600 },
  chipText:    { fontSize: 12, fontWeight: '700', color: Colors.blue700 },
  chipTextOn:  { color: Colors.white },
  caption:     { fontSize: 11.5, color: Colors.gray500, marginTop: 8, lineHeight: 16 },
});
